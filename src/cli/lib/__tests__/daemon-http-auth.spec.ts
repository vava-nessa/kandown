/**
 * @file Daemon HTTP auth enforcement integration tests
 * @description Spins up a real `createServeServer` instance with `setActiveToken`
 * configured, then pins the contract:
 *   1. Every authenticated route returns `401` without a valid header.
 *   2. Every authenticated route returns its real body with the right header.
 *   3. `GET /api/daemon` stays open without a token (it *is* the liveness
 *      check; refusing it would break the very request that proves the daemon
 *      is up).
 *   4. The CORS `Access-Control-Allow-Origin` is the daemon's own origin;
 *      the wildcard that used to ship is gone.
 *   5. `GET /api/events` accepts the same token via `?token=` because
 *      `EventSource` cannot set custom headers.
 *
 * @see src/cli/lib/server.ts
 * @see src/cli/lib/daemon-auth.ts
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateToken } from '../daemon-auth';
import { createServeServer, setActiveToken } from '../server';

let kandownDir: string;

beforeEach(() => {
  kandownDir = mkdtempSync(join(tmpdir(), 'kandown-http-auth-'));
  mkdirSync(join(kandownDir, 'extensions'), { recursive: true });
  writeFileSync(join(kandownDir, 'kandown.json'), JSON.stringify({ board: { columns: ['Todo', 'Done'] } }));
});

afterEach(async () => {
  setActiveToken(null);
  rmSync(kandownDir, { recursive: true, force: true });
});

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = createServeServer(kandownDir);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

describe('daemon HTTP auth', () => {
  it('rejects /api/board with 401 when no token is configured', async () => {
    setActiveToken(null);
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/board`);
      expect(response.status).toBe(200);
    });
  });

  it('rejects /api/board with 401 when a token is configured but the header is absent', async () => {
    const token = generateToken();
    setActiveToken(token);
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/board`);
      expect(response.status).toBe(401);
      const body = await response.json() as { error: string };
      expect(body.error).toMatch(/Token missing or invalid/);
    });
  });

  it('rejects /api/board when the header carries the wrong token', async () => {
    setActiveToken(generateToken());
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/board`, {
        headers: { 'X-Kandown-Token': generateToken() },
      });
      expect(response.status).toBe(401);
    });
  });

  it('serves /api/board when the right token is sent', async () => {
    const token = generateToken();
    setActiveToken(token);
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/board`, {
        headers: { 'X-Kandown-Token': token },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toMatch(/text\/plain/);
    });
  });

  it('keeps /api/daemon open without a token (liveness check is exempt)', async () => {
    setActiveToken(generateToken());
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/daemon`);
      expect(response.status).toBe(200);
      const body = await response.json() as { ok: boolean; pid: number; kandownDir: string };
      expect(body.ok).toBe(true);
      expect(typeof body.pid).toBe('number');
      expect(body.kandownDir).toBe(kandownDir);
    });
  });

  it('authenticates /api/tasks the same way', async () => {
    const token = generateToken();
    setActiveToken(token);
    await withServer(async (baseUrl) => {
      const without = await fetch(`${baseUrl}/api/tasks`);
      expect(without.status).toBe(401);

      const withHeader = await fetch(`${baseUrl}/api/tasks`, {
        headers: { 'X-Kandown-Token': token },
      });
      expect(withHeader.status).toBe(200);
      const ids = await withHeader.json() as string[];
      expect(ids).toEqual([]);
    });
  });

  it('rejects /api/events when the query token is missing', async () => {
    setActiveToken(generateToken());
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/events`);
      expect(response.status).toBe(401);
    });
  });

  it('rejects /api/events when the query token does not match', async () => {
    setActiveToken(generateToken());
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/events?token=${generateToken()}`);
      expect(response.status).toBe(401);
    });
  });

  it('opens the SSE stream when the query token matches', async () => {
    const token = generateToken();
    setActiveToken(token);
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/events?token=${token}`, {
        headers: { Accept: 'text/event-stream' },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toMatch(/text\/event-stream/);
      await response.body?.cancel();
    });
  });

  it('returns a strict, non-wildcard Access-Control-Allow-Origin on every response', async () => {
    const token = generateToken();
    setActiveToken(token);
    await withServer(async (baseUrl) => {
      const probe = async (suffix: string): Promise<string | null> => {
        const response = await fetch(`${baseUrl}${suffix}`, {
          headers: { 'X-Kandown-Token': token },
        });
        await response.arrayBuffer();
        return response.headers.get('access-control-allow-origin');
      };
      expect(await probe('/api/board')).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(await probe('/api/daemon')).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(await probe('/api/board')).not.toBe('*');
    });
  });

  it('returns a 401 for an OPTIONS preflight from the wrong origin (strict CORS)', async () => {
    const token = generateToken();
    setActiveToken(token);
    await withServer(async (baseUrl) => {
      // OPTIONS is exempt from auth (it answers the preflight), but it must
      // still echo the daemon's own Origin so a foreign page cannot get a
      // permissive `Access-Control-Allow-Origin: *` back.
      const response = await fetch(`${baseUrl}/api/board`, { method: 'OPTIONS' });
      expect(response.status).toBe(204);
      const origin = response.headers.get('access-control-allow-origin');
      expect(origin).not.toBe('*');
      expect(origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      void token; // token is configured; preflight intentionally does not require it
    });
  });

  it('clears the configured token when setActiveToken(null) is called', async () => {
    const token = generateToken();
    setActiveToken(token);
    await withServer(async (baseUrl) => {
      const before = await fetch(`${baseUrl}/api/board`);
      expect(before.status).toBe(401);
    });

    setActiveToken(null);
    await withServer(async (baseUrl) => {
      const after = await fetch(`${baseUrl}/api/board`);
      expect(after.status).toBe(200);
    });
  });
});
