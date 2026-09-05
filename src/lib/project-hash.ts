/**
 * @file Shared project-path canonicalization and hash
 * @description One canonical identity for "this project" across every piece of
 * user-local state kandown keeps outside the repository: extension state under
 * `~/.kandown/project-state/<hash>/` and the chat session index (t308) under
 * `~/.kandown/sessions/<hash>/`. Both must resolve to the same directory for
 * the same project, so the canonicalization and the hash live here, once.
 *
 * 📖 The module is deliberately pure and browser-safe: no `node:*` imports.
 * The hash is a self-contained SHA-256 over the UTF-8 bytes of the canonical
 * path (verified byte-for-byte against `node:crypto`), and canonicalization
 * takes the platform realpath as an injectable function so Node callers pass
 * `fs.realpathSync` while the browser simply skips that step. Stored key
 * formats never change: `sha256(canonicalPath)`, first 24 hex characters.
 *
 * @functions
 *  → canonicalizeProjectPath: realpath when available, lexical fallback otherwise
 *  → projectHash: 24 hex chars of SHA-256 over the canonical path
 *  → sha256Hex: full lowercase hex SHA-256 of a UTF-8 string (pure)
 *
 * @exports canonicalizeProjectPath, RealpathFn, projectHash, sha256Hex
 * @see src/lib/extensions/state.ts: the original keying this extracts
 * @see src/cli/lib/agent/session-index.ts: the per-project session index
 */

/** 📖 Platform realpath, injected so this module stays free of `node:fs`.
 *  Node callers pass `realpathSync`; absent or throwing, canonicalization
 *  falls back to the lexical form. */
export type RealpathFn = (path: string) => string;

/** 📖 Canonical identity of a project directory: the OS realpath when the
 *  caller provides one (it resolves macOS `/tmp` style symlinks), otherwise a
 *  stable lexical normalization of the given path. The same input must always
 *  produce the same output on the same machine, because that output is the
 *  on-disk key. */
export function canonicalizeProjectPath(projectDir: string, realpath?: RealpathFn): string {
  if (realpath) {
    try {
      return realpath(projectDir);
    } catch {
      // 📖 Missing directory or unreadable link: the lexical form still keys
      // consistently, which is what extension state and the session index need.
    }
  }
  return lexicalResolve(projectDir);
}

/** 📖 24 hex characters of SHA-256 over the canonical path. Identical output
 *  to `createHash('sha256').update(canonical).digest('hex').slice(0, 24)`,
 *  the format already on disk for extension state. */
export function projectHash(canonicalProject: string): string {
  return sha256Hex(canonicalProject).slice(0, 24);
}

/** 📖 SHA-256 round constants (fractional parts of cube roots of the first 64
 *  primes), as specified by FIPS 180-4. */
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** 📖 32-bit rotate right; bitwise ops coerce to int32, which is correct
 *  two's-complement behaviour for the mixing steps below. */
function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n)));
}

/** 📖 Lowercase hex SHA-256 of a UTF-8 string, implemented on the Web Crypto
 *  primitives every runtime kandown targets already ships (TextEncoder,
 *  DataView). Pure and synchronous so callers can keep building paths without
 *  awaiting, matching the synchronous keying extension state has always used. */
export function sha256Hex(input: string): string {
  const message = new TextEncoder().encode(input);
  const bitLength = message.length * 8;
  // 📖 Pad to a whole 512-bit block: message, 0x80, zeros, then the 64-bit
  // big-endian bit length. `+8` reserves room for that length trailer.
  const paddedLength = (Math.floor((message.length + 8) / 64) + 1) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let block = 0; block < paddedLength; block += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(block + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map(part => part.toString(16).padStart(8, '0'))
    .join('');
}

/** 📖 Lexical path resolution without `node:path`: collapse duplicate
 *  separators, `.` and `..` segments exactly like `path.resolve` does for
 *  absolute POSIX paths. Windows drive paths are normalized to slash form
 *  (`C:/a/b`), which is stable on that platform even though it differs from
 *  `path.resolve`'s backslash output; kandown's own state only needs within-
 *  machine stability. Relative input is normalized as-is: every Node caller
 *  (daemon, CLI, tests) already passes absolute project roots, and the realpath
 *  branch takes precedence whenever the directory exists. */
function lexicalResolve(projectDir: string): string {
  const drive = /^[A-Za-z]:/.exec(projectDir)?.[0];
  const raw = drive ? projectDir.slice(2).replace(/\\/g, '/') : projectDir;
  const absolute = raw.startsWith('/');
  const stack: string[] = [];
  for (const segment of raw.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (stack.length > 0) stack.pop();
      continue;
    }
    stack.push(segment);
  }
  const body = stack.join('/');
  if (drive) return `${drive}/${body}`;
  return absolute ? `/${body}` : body;
}
