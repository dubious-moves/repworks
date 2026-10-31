// Converts an Lc0 network (`.pb.gz`) to the ONNX model the site runs (PLAN.md §5.143), as Lc0's
// own `leela2onnx` builds it (src/neural/onnx/converter.cc at v0.32.1), for the one kind of
// network vendored: a residual tower with squeeze-and-excitation (NETWORK_SE_WITH_HEADFORMAT),
// the classical 112 input planes, an attention policy head and a win/draw/loss value head. The
// moves-left head is left out (the site doesn't use it). Weights are stored as float16 and cast to
// float32 when the session loads them (onnxruntime folds the casts), so the file is half the size
// and the arithmetic float32.
//
// Lc0 itself can't be built in a cloud container (its build runs downloaded code), so this is a
// port of the converter, checked by test/unit/core/lc0.test.ts (the policy's mass on legal moves,
// the starting position, colour symmetry, agreement with Stockfish).
//
// Usage, once (not in CI):
//   node scripts/lc0-onnx.mjs <net.pb.gz> <lc0 checkout at v0.32.1> vendor/lc0/<name>.onnx
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const [netPath, lc0, outPath] = process.argv.slice(2);
if (!netPath || !lc0 || !outPath) throw new Error('usage: node scripts/lc0-onnx.mjs <net.pb.gz> <lc0 checkout> <out.onnx>');

// --- Reading protobuf (wire format only: the fields used here) ---

/** A message's fields by number: varints as numbers, fixed32 as their 4 bytes, the rest as bytes. */
function parse(buf) {
  const fields = new Map();
  let p = 0;
  const varint = () => {
    let v = 0n;
    let shift = 0n;
    for (;;) {
      const b = buf[p++];
      v |= BigInt(b & 0x7f) << shift;
      if (!(b & 0x80)) return v;
      shift += 7n;
    }
  };
  while (p < buf.length) {
    const key = Number(varint());
    const no = key >>> 3;
    const wire = key & 7;
    let value;
    if (wire === 0) value = Number(varint());
    else if (wire === 2) {
      const n = Number(varint());
      value = buf.subarray(p, p + n);
      p += n;
    } else if (wire === 5) {
      value = buf.subarray(p, p + 4);
      p += 4;
    } else if (wire === 1) {
      value = buf.subarray(p, p + 8);
      p += 8;
    } else throw new Error(`wire type ${wire}`);
    if (!fields.has(no)) fields.set(no, []);
    fields.get(no).push(value);
  }
  return fields;
}
const one = (f, no) => f.get(no)?.[0];
const sub = (f, no) => (f.has(no) ? parse(one(f, no)) : undefined);
const float32 = (b) => new DataView(b.buffer, b.byteOffset, 4).getFloat32(0, true);

/** A `Layer`: LINEAR16, `value = min + q / 65535 * (max - min)` (utils/weights_adapter.cc). */
function layer(f) {
  if (!f) return new Float32Array(0);
  const encoding = one(f, 4) ?? 1;
  if (encoding !== 1) throw new Error(`layer encoding ${encoding}: only LINEAR16 is supported`);
  const min = float32(one(f, 1));
  const max = float32(one(f, 2));
  const params = one(f, 3);
  const n = params.length / 2;
  const view = new DataView(params.buffer, params.byteOffset, params.length);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = min + (view.getUint16(2 * i, true) / 0xffff) * (max - min);
  return out;
}

/** A `ConvBlock` with its batch norm folded in (network_legacy.cc). */
function convBlock(f) {
  const weights = layer(sub(f, 1));
  let biases = layer(sub(f, 2));
  const means = layer(sub(f, 3));
  const variances = layer(sub(f, 4));
  let gammas = layer(sub(f, 5));
  let betas = layer(sub(f, 6));
  if (!means.length) return { weights, biases };
  const outputs = means.length;
  if (!betas.length) {
    betas = new Float32Array(outputs);
    gammas = new Float32Array(outputs).fill(1);
  }
  if (!biases.length) biases = new Float32Array(outputs);
  const inputs = weights.length / outputs;
  const folded = new Float32Array(outputs);
  for (let o = 0; o < outputs; o++) {
    const g = gammas[o] / Math.sqrt(variances[o] + 1e-5);
    const mean = means[o] - biases[o];
    for (let c = 0; c < inputs; c++) weights[o * inputs + c] *= g;
    folded[o] = -g * mean + betas[o];
  }
  return { weights, biases: folded };
}

const net = parse(gunzipSync(readFileSync(netPath)));
const format = sub(sub(net, 4), 2);
const want = { 1: 1, 2: 2, 3: 4, 4: 3, 5: 2 }; // input classical, output WDL, SE with head format, attention policy, WDL value
for (const [no, v] of Object.entries(want)) if (one(format, Number(no)) !== v) throw new Error(`network format field ${no} is ${one(format, Number(no))}, not ${v}`);
if ((one(format, 7) ?? 0) !== 1) throw new Error('only Mish networks are supported');
const w = sub(net, 10);

// --- Writing ONNX (onnx.proto: the messages and fields used here) ---

const enc = new TextEncoder();
function bytes(...parts) {
  const n = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(n);
  let p = 0;
  for (const part of parts) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}
function varintBytes(v) {
  let x = BigInt.asUintN(64, BigInt(v));
  const out = [];
  do {
    let b = Number(x & 0x7fn);
    x >>= 7n;
    if (x) b |= 0x80;
    out.push(b);
  } while (x);
  return Uint8Array.from(out);
}
const tag = (no, wire) => varintBytes((no << 3) | wire);
const vField = (no, v) => bytes(tag(no, 0), varintBytes(v));
const lField = (no, b) => bytes(tag(no, 2), varintBytes(b.length), b);
const sField = (no, s) => lField(no, enc.encode(s));
const fField = (no, f) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setFloat32(0, f, true);
  return bytes(tag(no, 5), b);
};

const FLOAT = 1;
const INT32 = 6;
const INT64 = 7;
const FLOAT16 = 10;

function tensor(name, dims, type, raw) {
  return bytes(...dims.map((d) => vField(1, d)), vField(2, type), sField(8, name), lField(9, raw));
}
function attr(name, v) {
  if (typeof v === 'number' && !Number.isInteger(v)) return bytes(sField(1, name), fField(2, v), vField(20, 1));
  if (typeof v === 'number') return bytes(sField(1, name), vField(3, v), vField(20, 2));
  if (Array.isArray(v)) return bytes(sField(1, name), ...v.map((i) => vField(8, i)), vField(20, 7));
  throw new Error(`attribute ${name}`);
}
function valueInfo(name, dims) {
  const shape = bytes(...dims.map((d) => lField(1, typeof d === 'string' ? sField(2, d) : vField(1, d))));
  return bytes(sField(1, name), lField(2, lField(1, bytes(vField(1, FLOAT), lField(2, shape)))));
}

// float32 → float16 bits (round to nearest even).
const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
function half(v) {
  f32[0] = v;
  const x = u32[0];
  const sign = (x >>> 16) & 0x8000;
  const exp = (x >>> 23) & 0xff;
  let mant = x & 0x7fffff;
  if (exp === 0xff) return sign | 0x7c00 | (mant ? 0x200 : 0);
  let e = exp - 127 + 15;
  if (e >= 0x1f) return sign | 0x7c00;
  if (e <= 0) {
    if (e < -10) return sign;
    mant |= 0x800000;
    const shift = 14 - e;
    let h = mant >>> shift;
    const rem = mant & ((1 << shift) - 1);
    const halfway = 1 << (shift - 1);
    if (rem > halfway || (rem === halfway && h & 1)) h++;
    return sign | h;
  }
  let h = (e << 10) | (mant >>> 13);
  const rem = mant & 0x1fff;
  if (rem > 0x1000 || (rem === 0x1000 && h & 1)) h++;
  return sign | h;
}

const nodes = [];
const inits = [];
let counter = 0;
function node(op, inputs, attrs = {}, outputs = 1) {
  const names = Array.from({ length: outputs }, () => `t${counter++}`);
  nodes.push(bytes(...inputs.map((i) => sField(1, i)), ...names.map((o) => sField(2, o)), sField(3, `n${counter}`), sField(4, op), ...Object.entries(attrs).map(([k, v]) => lField(5, attr(k, v)))));
  return outputs === 1 ? names[0] : names;
}
/** A weight, stored as float16 and cast to float32. `transpose`: stored [out][in], used [in][out]. */
function weight(values, dims, transpose = false) {
  let v = values;
  if (transpose) {
    const [rows, cols] = dims; // used shape [in, out]; stored [out][in]
    v = new Float32Array(values.length);
    for (let i = 0; i < rows; i++) for (let o = 0; o < cols; o++) v[i * cols + o] = values[o * rows + i];
  }
  const n = dims.reduce((a, b) => a * b, 1);
  if (v.length !== n) throw new Error(`weight of ${v.length}, shape ${dims}`);
  const raw = new Uint16Array(n);
  for (let i = 0; i < n; i++) raw[i] = half(v[i]);
  const name = `w${inits.length}`;
  inits.push(tensor(name, dims, FLOAT16, new Uint8Array(raw.buffer)));
  return node('Cast', [name], { to: FLOAT });
}
function constant(values, type) {
  const name = `c${inits.length}`;
  const arr = type === INT64 ? BigInt64Array.from(values.map(BigInt)) : type === INT32 ? Int32Array.from(values) : Float32Array.from(values);
  inits.push(tensor(name, [values.length], type, new Uint8Array(arr.buffer)));
  return name;
}
const i64 = (...v) => constant(v, INT64);
const mish = (x) => node('Mul', [x, node('Tanh', [node('Softplus', [x])])]);

const inputLayer = convBlock(sub(w, 1));
const filters = inputLayer.biases.length;
function conv(block, input, inputs, outputs, size) {
  return node('Conv', [input, weight(block.weights, [outputs, inputs, size, size]), weight(block.biases, [outputs])], { pads: Array(4).fill((size - 1) / 2) });
}

let flow = mish(conv(inputLayer, 'input', 112, filters, 3));
for (const res of w.get(2) ?? []) {
  const r = parse(res);
  const c1 = mish(conv(convBlock(sub(r, 1)), flow, filters, filters, 3));
  let c2 = conv(convBlock(sub(r, 2)), c1, filters, filters, 3);
  const se = sub(r, 3);
  if (se) {
    const w1 = layer(sub(se, 1));
    const b1 = layer(sub(se, 2));
    const seFilters = b1.length;
    let s = node('ReduceMean', [c2], { axes: [2, 3], keepdims: 0 });
    s = mish(node('Add', [node('MatMul', [s, weight(w1, [filters, seFilters], true)]), weight(b1, [seFilters])]));
    s = node('Add', [node('MatMul', [s, weight(layer(sub(se, 3)), [seFilters, 2 * filters], true)]), weight(layer(sub(se, 4)), [2 * filters])]);
    s = node('Reshape', [s, i64(-1, 2 * filters, 1, 1)]);
    const [g, b] = node('Split', [s, i64(filters, filters)], { axis: 1 }, 2);
    c2 = node('Add', [node('Mul', [node('Sigmoid', [g]), c2]), b]);
  }
  flow = mish(node('Add', [c2, flow]));
}
const body = flow;

// The attention policy (converter.cc's MakeAttentionPolicy; SELU before the attention body).
const polW = layer(sub(w, 4));
const polB = layer(sub(w, 5));
const pe = polB.length;
const qB = layer(sub(w, 18));
const d = qB.length;
let p = node('Reshape', [node('Transpose', [body], { perm: [0, 2, 3, 1] }), i64(-1, filters)]);
p = node('Selu', [node('Add', [node('MatMul', [p, weight(polW, [filters, pe], true)]), weight(polB, [pe])])]);
const Q = node('Reshape', [node('Add', [node('MatMul', [p, weight(layer(sub(w, 17)), [pe, d], true)]), weight(qB, [d])]), i64(-1, 64, d)]);
const K = node('Reshape', [node('Add', [node('MatMul', [p, weight(layer(sub(w, 19)), [pe, d], true)]), weight(layer(sub(w, 20)), [d])]), i64(-1, 64, d)]);
const scale = constant([1 / Math.sqrt(d)], FLOAT);
const logits = node('Mul', [node('MatMul', [Q, node('Transpose', [K], { perm: [0, 2, 1] })]), scale]);
let prom = node('Slice', [K, i64(0, 56, 0), i64(2 ** 31 - 1, 64, d)]);
prom = node('MatMul', [prom, weight(layer(sub(w, 22)), [d, 4], true)]);
prom = node('Transpose', [prom], { perm: [0, 2, 1] });
const [prom3, prom1] = node('Split', [prom, i64(3, 1)], { axis: 1 }, 2);
prom = node('Reshape', [node('Transpose', [node('Add', [prom3, prom1])], { perm: [0, 2, 1] }), i64(-1, 1, 24)]);
let sl = node('Reshape', [node('Slice', [logits, i64(0, 48, 56), i64(2 ** 31 - 1, 56, 64)]), i64(-1, 64, 1)]);
sl = node('Reshape', [node('Concat', [sl, sl, sl], { axis: 2 }), i64(-1, 8, 24)]);
prom = node('Reshape', [node('Add', [sl, prom]), i64(-1, 3, 64)]);
const all = node('Reshape', [node('Concat', [logits, prom], { axis: 1 }), i64(-1, 67 * 64)]);
const header = readFileSync(join(lc0, 'src/neural/tables/attention_policy_map.h'), 'utf8');
const mapText = header.slice(header.indexOf('kAttnPolicyMap[] = {') + 20, header.indexOf('};', header.indexOf('kAttnPolicyMap')));
const attn = mapText.split(',').map((s) => s.trim()).filter(Boolean).map(Number);
if (attn.length !== 67 * 64) throw new Error(`the attention map has ${attn.length} entries`);
const gather = new Array(1858).fill(-1);
attn.forEach((idx, i) => idx > -1 && (gather[idx] = i));
if (gather.includes(-1)) throw new Error('the attention map misses moves');
nodes.push(bytes(sField(1, all), sField(1, constant(gather, INT32)), sField(2, 'policy'), sField(3, 'policy'), sField(4, 'Gather'), lField(5, attr('axis', 1))));

// The value head: a 1×1 convolution to 32 channels, 128, then W/D/L.
const valueBlock = convBlock(sub(w, 6));
const vc = valueBlock.biases.length;
let v = mish(conv(valueBlock, body, filters, vc, 1));
v = node('Reshape', [v, i64(-1, vc * 64)]);
v = mish(node('Add', [node('MatMul', [v, weight(layer(sub(w, 7)), [vc * 64, 128], true)]), weight(layer(sub(w, 8)), [128])]));
v = node('Add', [node('MatMul', [v, weight(layer(sub(w, 9)), [128, 3], true)]), weight(layer(sub(w, 10)), [3])]);
nodes.push(bytes(sField(1, v), sField(2, 'wdl'), sField(3, 'wdl'), sField(4, 'Softmax'), lField(5, attr('axis', 1))));

const graph = bytes(
  ...nodes.map((n) => lField(1, n)),
  sField(2, 'lc0'),
  ...inits.map((t) => lField(5, t)),
  lField(11, valueInfo('input', ['batch', 112, 8, 8])),
  lField(12, valueInfo('policy', ['batch', 1858])),
  lField(12, valueInfo('wdl', ['batch', 3])),
);
const model = bytes(vField(1, 8), lField(8, bytes(sField(1, ''), vField(2, 17))), sField(2, 'repworks lc0-onnx'), lField(7, graph));
writeFileSync(outPath, model);
console.log(`${outPath}: ${(model.length / 1e6).toFixed(1)} MB, ${(w.get(2) ?? []).length} blocks of ${filters} filters, policy embedding ${pe}, d ${d}`);
