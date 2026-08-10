/**
 * @file Daemon auth helpers unit tests
 * @description Pins the contract of token generation, extraction and
 * verification. Server-level enforcement (401 on missing token, 200 with a
 * matching token, /api/daemon exempt, strict CORS) lives in
 * `daemon-http-auth.spec.ts` because it spins up the full server.
 *
 * @see src/cli/lib/daemon-auth.ts
 */

import { describe, expect, it } from 'vitest';
import { createServer, IncomingMessage } from 'node:http';
import { extractToken, generateToken, selfOrigin, verifyToken } from '../daemon-auth';

describe('generateToken', () => {
  it('returns 64 hex characters (32 bytes)', () => {
    const token = generateToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns a different token on every call', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
  });

  it('never returns the same token across many calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i += 1) seen.add(generateToken());
    expect(seen.size).toBe(100);
  });
});

describe('verifyToken', () => {
  it('accepts an identical token', () => {
    const token = generateToken();
    expect(verifyToken(token, token)).toBe(true);
  });

  it('rejects a token of a different length', () => {
    const token = generateToken();
    expect(verifyToken(token, token.slice(0, 32))).toBe(false);
    expect(verifyToken(token, token + 'aa')).toBe(false);
  });

  it('rejects a token with a single byte flipped', () => {
    const token = generateToken();
    const wrong = token.slice(0, -1) + (token.endsWith('0') ? '1' : '0');
    expect(verifyToken(token, wrong)).toBe(false);
  });

  it('rejects an empty string', () => {
    const token = generateToken();
    expect(verifyToken(token, '')).toBe(false);
  });

  it('does not throw on garbage input', () => {
    const token = generateToken();
    expect(() => verifyToken(token, '\u0000\u0001garbage')).not.toThrow();
  });
});

describe('selfOrigin', () => {
  it('builds the daemon Origin with the exact port', () => {
    expect(selfOrigin(2050)).toBe('http://127.0.0.1:2050');
    expect(selfOrigin(8789)).toBe('http://127.0.0.1:8789');
  });
});

/** 📖 Builds an IncomingMessage-shaped stub with the headers we want to test.
 *  We do not need a real socket — `extractToken` only reads from
 *  `req.headers[TOKEN_HEADER.toLowerCase()]`. */
function stubRequest(headers: Record<string, string | string[] | undefined>, url?: URL): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

describe('extractToken', () => {
  it('reads the token from the X-Kandown-Token header', () => {
    const token = generateToken();
    const req = stubRequest({ 'x-kandown-token': token });
    expect(extractToken(req)).toBe(token);
  });

  it('reads the token from a header value that arrived as an array', () => {
    const token = generateToken();
    const req = stubRequest({ 'x-kandown-token': [token] });
    expect(extractToken(req)).toBe(token);
  });

  it('falls back to the ?token= query parameter when the header is absent', () => {
    const token = generateToken();
    const req = stubRequest({}, new URL(`http://127.0.0.1/api/events?token=${token}`));
    expect(extractToken(req, new URL(`http://127.0.0.1/api/events?token=${token}`))).toBe(token);
  });

  it('prefers the header over the query string', () => {
    const fromHeader = generateToken();
    const fromQuery = generateToken();
    const target = new URL(`http://127.0.0.1/api/events?token=${fromQuery}`);
    const req = stubRequest({ 'x-kandown-token': fromHeader });
    expect(extractToken(req, target)).toBe(fromHeader);
  });

  it('returns null when neither transport carries a token', () => {
    const req = stubRequest({}, new URL('http://127.0.0.1/api/board'));
    expect(extractToken(req, new URL('http://127.0.0.1/api/board'))).toBeNull();
  });

  it('treats an empty header as missing', () => {
    const req = stubRequest({ 'x-kandown-token': '' });
    expect(extractToken(req)).toBeNull();
  });

  it('treats an empty query parameter as missing', () => {
    const req = stubRequest({}, new URL('http://127.0.0.1/api/events?token='));
    expect(extractToken(req, new URL('http://127.0.0.1/api/events?token='))).toBeNull();
  });
});

/** 📖 `extractToken` is a pure helper; the test below is here to remember
 *  that importing `http` keeps the file aligned with the real runtime. */
describe('integration smoke', () => {
  it('can read tokens off headers from a real http server', async () => {
    const token = generateToken();
    const seen: string | null = await new Promise((resolve) => {
      const server = createServer((req, res) => {
        resolve(extractToken(req));
        res.writeHead(200);
        res.end('ok');
      });
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') return resolve(null);
        const { port } = address;
        fetch(`http://127.0.0.1:${port}/`, { headers: { 'X-Kandown-Token': token } })
          .finally(() => server.close());
      });
    });
    expect(seen).toBe(token);
  });
});
