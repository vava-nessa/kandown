/**
 * @file Shared task-content hash for optimistic concurrency
 * @description One pure `contentHash` used by every writer that guards a task
 * save against stale in-memory content. The drawer hashes the raw Markdown it
 * loaded and sends the value as the `X-Kandown-Base-Hash` header; the daemon
 * (and its Vite dev mirror) re-hash the file currently on disk and answer 409
 * when the two disagree, so a harness holding stale content can never
 * silently overwrite a human edit.
 *
 * 📖 The digest is the first 16 hex characters of a SHA-256 over the UTF-8
 * bytes of the content, implemented by reusing the pure, browser-safe
 * `sha256Hex` from project-hash (no `node:crypto`, so the same module runs in
 * the browser, the daemon and the Vite plugin). 16 characters (64 bits) is
 * far beyond collision-relevant for a per-file concurrency check while staying
 * short enough to log and to carry in a header.
 *
 * @functions
 *  → contentHash: 16 hex chars of SHA-256 over a task's raw content
 *
 * @exports contentHash
 * @see src/lib/project-hash.ts: the SHA-256 implementation this slices
 * @see src/lib/filesystem.ts: the client half (header emission, 409 result)
 * @see src/cli/lib/server.ts: the server half (409 + currentContent body)
 */

import { sha256Hex } from './project-hash';

/** 📖 Length, in hex characters, of the content digest. Kept as a named
 * constant so the server and the client cannot drift on the slice length. */
export const CONTENT_HASH_LENGTH = 16;

/** 📖 Stable digest of a task file's raw content: `sha256(content)`, first 16
 * lowercase hex characters. Pure and synchronous: identical content always
 * hashes identically on every runtime kandown targets. */
export function contentHash(content: string): string {
  return sha256Hex(content).slice(0, CONTENT_HASH_LENGTH);
}
