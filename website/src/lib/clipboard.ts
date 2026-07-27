/**
 * @file src/lib/clipboard.ts
 * @description Provides one resilient text-copy path for every website control.
 * The modern Clipboard API is preferred, but a rejected, unavailable, or stuck
 * write falls back to a temporary textarea so copy buttons still work in Safari,
 * embedded browsers, and restrictive permission contexts.
 *
 * 📖 Some browser implementations leave `navigator.clipboard.writeText()`
 * pending forever after client-side navigation. The timeout is intentionally
 * short: copying is a direct interaction, and waiting indefinitely leaves the
 * button stuck on its loading label with no recovery path.
 *
 * @functions
 *  → copyTextToClipboard. Copies text with a bounded modern attempt and a DOM fallback.
 *
 * @exports copyTextToClipboard
 */

const MODERN_WRITE_TIMEOUT_MS = 1_000

async function copyWithModernApi(text: string): Promise<boolean> {
  if (!navigator.clipboard?.writeText) return false

  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      navigator.clipboard.writeText(text).then(() => true),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), MODERN_WRITE_TIMEOUT_MS)
      }),
    ])
  } catch {
    return false
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

function copyWithTextarea(text: string): boolean {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.top = '0'
  area.style.left = '0'
  area.style.opacity = '0'

  try {
    document.body.appendChild(area)
    area.focus({ preventScroll: true })
    area.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (await copyWithModernApi(text)) return true
  return copyWithTextarea(text)
}
