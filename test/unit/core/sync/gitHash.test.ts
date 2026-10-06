import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gitBlobSha, sha1Hex } from '../../../../src/core/sync/gitHash.ts';
import { mulberry32 } from '../../../support/random.ts';

test("SHA-1 matches Node's on lengths around every block boundary", () => {
  const random = mulberry32(9);
  for (let len = 0; len < 300; len++) {
    const bytes = new Uint8Array(len).map(() => Math.floor(random() * 256));
    assert.equal(sha1Hex(bytes), createHash('sha1').update(bytes).digest('hex'), `length ${len}`);
  }
});

test("git's blob IDs, for ASCII and UTF-8 text", () => {
  // `printf 'hello\n' | git hash-object --stdin`
  assert.equal(gitBlobSha('hello\n'), 'ce013625030ba8dba906f756967f9e9ca394464a');
  assert.equal(gitBlobSha(''), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  const text = '1. e4 { Café, naïve: ♞ } e5 *\n';
  const bytes = Buffer.from(text, 'utf8');
  assert.equal(gitBlobSha(text), createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest('hex'));
});
