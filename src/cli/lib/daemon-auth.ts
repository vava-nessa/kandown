/**
 * @file Daemon API auth helpers (M5)
 * @description Generates, validates and carries the per-project auth token
 * shared between the daemon server, the web client and the TUI. The token is
 * minted at startup (32 random bytes, hex-encoded), written to the gitignored
 * `.kandown/daemon.json` and injected into the served HTML so the browser
 * reads it before its first call. The TUI reads it from `daemon.json` directly.
 *
 * 📖 **Why a header and not a cookie.** The daemon binds to `127.0.0.1`, one
 * origin per project. Browsers still share cookies across daemons when one
 * project happens to land on the previous project's port after a restart, and
 * extension or developer-tools HTTP tracing can leak cookies to other origins
 * on the same machine. A header keeps the token scoped to the page Kandown
 * itself served, no shared state with anything else.
 *
 * 📖 **Why `?token=` on the SSE route.** `EventSource` cannot set custom
 * request headers in any browser, so live-reload carries the token as a query
 * parameter. The same value travels over two transports; the server is the
 * only place that needs to accept both, and it does so in
 * `src/cli/lib/server.ts`.
 *
 * 📖 **Why `crypto.timingSafeEqual` and not `===`.** String equality
 * short-circuits on the first mismatched byte, leaking the position of the
 * wrong character through timing. `timingSafeEqual` runs in constant time for
 * equal-length buffers; both sides are fixed at 64 hex characters so the cost
 * is flat and the expected length is not a secret.
 *
 * @functions
 *  → generateToken — mint a fresh 32-byte hex token
 *  → extractToken — pull the token from an IncomingRequest (header then query)
 *  → verifyToken — constant-time compare against the expected token
 *  → selfOrigin — the daemon's own Origin string for strict CORS headers
 *
 * @exports generateToken, extractToken, verifyToken, selfOrigin, TOKEN_HEADER, TOKEN_QUERY
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

/** Header name carrying the API auth token from the web client and the TUI. */
export const TOKEN_HEADER = 'X-Kandown-Token';
/** Query parameter carrying the token on the SSE route (EventSource cannot set headers). */
export const TOKEN_QUERY = 'token';

/** 📖 32 bytes is 256 bits of entropy, hex-encoded is 64 ASCII characters. Hex
 * avoids quoting pitfalls in the served HTML and round-trips through
 * `JSON.stringify` unchanged. The token is short-lived per daemon and never
 * human-typed, so readability is not a goal. */
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/** 📖 Reads from the header first, then from `?token=`. Both transports carry
 * the same value; the header is for `fetch`, the query is for `EventSource`.
 * An empty string is treated as missing so a stray `X-Kandown-Token: ` does
 * not accidentally match. */
export function extractToken(req: IncomingMessage, url?: URL): string | null {
  const headerValue = req.headers[TOKEN_HEADER.toLowerCase()];
  const fromHeader = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof fromHeader === 'string' && fromHeader.length > 0) return fromHeader;

  const fromQuery = url?.searchParams.get(TOKEN_QUERY);
  return typeof fromQuery === 'string' && fromQuery.length > 0 ? fromQuery : null;
}

/** 📖 Constant-time compare. Returning false on length mismatch is safe because
 * the expected length is fixed at 64 hex characters and therefore not a
 * secret. The two `Buffer.from(..., 'utf8')` calls are cheap; the compared
 * slices are bounded. */
export function verifyToken(expected: string, candidate: string): boolean {
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const candidateBuffer = Buffer.from(candidate, 'utf8');
  if (expectedBuffer.length !== candidateBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, candidateBuffer);
}

/** 📖 The daemon's own Origin for strict CORS headers. The browser matches the
 * `Origin` request header against `Access-Control-Allow-Origin` exactly and
 * refuses wildcards here, so the only legitimate caller is the page served by
 * this daemon on its bound port. Using `localhost` instead of `127.0.0.1`
 * would fail cross-port because host names are also exact-match. */
export function selfOrigin(port: number): string {
  return `http://127.0.0.1:${port}`;
}
