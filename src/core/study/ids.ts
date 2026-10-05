// Study, chapter and device IDs: 8 random characters from [A-Za-z0-9], like Lichess's.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const ID = /^[A-Za-z0-9]{8}$/;

/** `random` returns numbers in [0, 1): crypto-backed in the app, seeded in tests. */
export function newId(random: () => number): string {
  let id = '';
  for (let i = 0; i < 8; i++) id += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return id;
}

export function isId(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}

/** A new ID that isn't in `taken`. */
export function freshId(random: () => number, taken: ReadonlySet<string>): string {
  for (;;) {
    const id = newId(random);
    if (!taken.has(id)) return id;
  }
}
