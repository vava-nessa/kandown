/**
 * @file plugins.* namespace helpers
 * @description Pure read/write access to the opaque `plugins.<extId>.*`
 * frontmatter namespace. The core parser/serializer treat this namespace as
 * pass-through bytes; this module is the typed accessor extensions and the host
 * use to read fields (with coercion) and to produce a new frontmatter object
 * with a field set. It never mutates in place and never touches core fields.
 *
 * 📖 Scalars are stored as strings on disk (the parser keeps them strings);
 * `readField` coerces to the field's declared type. Writing `undefined`/`null`
 * removes the key, and an empty namespace is dropped entirely so files stay
 * clean. See docs/EXTENSIONS.md § "The data model".
 *
 * @functions
 *  → getPluginData — read an extension's raw sub-object
 *  → readField — read + coerce one field
 *  → setField — return a new frontmatter with a field set/removed
 * @exports getPluginData, readField, setField
 * @see src/lib/extensions/types.ts
 */

import type { FieldType } from './types';

const NS = 'plugins';

/** Reads the raw `plugins.<extId>` object, or undefined. */
export function getPluginData(
  frontmatter: Record<string, unknown>,
  extId: string,
): Record<string, unknown> | undefined {
  const plugins = frontmatter[NS];
  if (!plugins || typeof plugins !== 'object' || Array.isArray(plugins)) return undefined;
  const ext = (plugins as Record<string, unknown>)[extId];
  if (!ext || typeof ext !== 'object' || Array.isArray(ext)) return undefined;
  return ext as Record<string, unknown>;
}

/** Coerces a raw on-disk scalar into the field's declared type. */
export function coerceField(raw: unknown, type: FieldType): unknown {
  switch (type) {
    case 'number': {
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'boolean':
      return raw === true || raw === 'true' || raw === 'True' || raw === 1 || raw === '1';
    case 'string':
    case 'date':
    case 'select':
    default:
      return raw === undefined ? undefined : String(raw);
  }
}

/** Reads and coerces one field from `plugins.<extId>.<key>`. */
export function readField(
  frontmatter: Record<string, unknown>,
  extId: string,
  key: string,
  type: FieldType,
): unknown {
  const data = getPluginData(frontmatter, extId);
  if (!data || data[key] === undefined) return undefined;
  return coerceField(data[key], type);
}

/**
 * 📖 Returns a NEW frontmatter object with `plugins.<extId>.<key>` set to
 * `value` (or removed when value is empty). The host applies the result through
 * the core serializer, so the round-trip invariant holds. Never mutates input.
 */
export function setField(
  frontmatter: Record<string, unknown>,
  extId: string,
  key: string,
  value: unknown,
): Record<string, unknown> {
  const out = { ...frontmatter };
  const plugins =
    out[NS] && typeof out[NS] === 'object' && !Array.isArray(out[NS])
      ? { ...(out[NS] as Record<string, unknown>) }
      : {};
  const ext =
    plugins[extId] && typeof plugins[extId] === 'object' && !Array.isArray(plugins[extId])
      ? { ...(plugins[extId] as Record<string, unknown>) }
      : {};

  if (value === undefined || value === null || value === '') {
    delete ext[key];
  } else {
    ext[key] = value;
  }

  if (Object.keys(ext).length > 0) plugins[extId] = ext;
  else delete plugins[extId];

  if (Object.keys(plugins).length > 0) out[NS] = plugins;
  else delete out[NS];

  return out;
}
