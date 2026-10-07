// Cuts named functions and constants out of mistake-lab's index.html and runs them in a sandbox:
// every name they use that isn't cut or declared in `state` is a no-op (the page's UI). Used by the
// fixture harnesses that record mistake-lab's own answers (see README.md).
const fs = require('fs');

function cutter(src) {
  const fn = (name) => {
    const start = src.search(new RegExp(`\\n(async )?function ${name}\\(`));
    if (start < 0) throw new Error(name);
    let i = src.indexOf('{', start), depth = 0;
    for (; i < src.length; i++) { const c = src[i]; if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) break; } }
    return src.slice(start, i + 1);
  };
  const constant = (name) => {
    const k = src.indexOf(`\nconst ${name} =`);
    if (k < 0) throw new Error(name);
    let i = src.indexOf('=', k), depth = 0;
    for (; i < src.length; i++) { const c = src[i]; if (c === '{' || c === '[') depth++; else if (c === '}' || c === ']') depth--; else if (c === ';' && depth === 0) break; }
    return src.slice(k, i + 1);
  };
  return { fn, constant };
}

/** A factory of fresh worlds: `world(globals)` gives the cut functions, `set` and `get` on the page's state. */
function sandbox(indexHtml, o) {
  const src = fs.readFileSync(indexHtml, 'utf8');
  const { fn, constant } = cutter(src);
  const code = [o.state, ...(o.constants || []).map(constant), ...o.functions.map(fn)].join('\n');
  const stub = new Proxy(function () {}, { get: (_t, k) => (k === Symbol.toPrimitive ? () => '' : k === Symbol.iterator ? undefined : stub), apply: () => stub });
  const local = new Set(['o', 'k', 'globals', 'sandbox', 'eval', 'Math', 'JSON', 'Object', 'Set', 'Map', 'Array', 'Number', 'String', 'Date', 'parseInt', 'parseFloat', 'console', 'Infinity', 'undefined', 'NaN', 'isFinite', 'Error', 'Promise', 'setTimeout', 'clearTimeout', 'Symbol', 'RegExp', 'Boolean', ...(o.globals || [])]);
  for (const m of code.matchAll(/(?:^|\n)\s*(?:var|let|const|async function|function)\s+([A-Za-z_$][\w$]*)/g)) local.add(m[1]);
  for (const m of o.state.matchAll(/([A-Za-z_$][\w$]*)\s*=/g)) local.add(m[1]);
  const box = new Proxy({}, { has: (_t, k) => typeof k === 'string' && !local.has(k), get: (_t, k) => (k === Symbol.unscopables ? undefined : stub) });
  const names = o.functions.map((n) => n).join(', ');
  return (globals = {}) =>
    new Function('sandbox', 'globals', `with (sandbox) { ${Object.keys(globals).map((g) => `var ${g} = globals.${g};`).join(' ')}\n${code}\n return { ${names},
      set(o) { for (const k in o) eval(k + ' = o[k]'); }, get(k) { return eval(k); } }; }`)(box, globals);
}

module.exports = { sandbox };
