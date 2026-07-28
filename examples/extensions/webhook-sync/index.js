/**
 * @file Bundled Webhook Sync extension entry
 * @description Self-contained JavaScript distribution entry matching index.ts.
 * Browser activation only records contribution metadata; handlers remain
 * daemon-only and never run in standalone mode.
 */

const WEBHOOK_URL = globalThis.process?.env?.KANDOWN_WEBHOOK_URL;

export default function activate(kd) {
  kd.contributeSync({
    on: 'task:afterMove',
    to: 'Done',
    handler: async (event, ctx) => {
      if (!WEBHOOK_URL) {
        ctx.log.warn('KANDOWN_WEBHOOK_URL not set; skipping webhook.');
        return;
      }
      await ctx.fetch?.(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'task.done', id: event.task.id, title: event.task.frontmatter.title }),
      });
    },
  });

  kd.contributeCommand('webhook-sync', {
    description: 'Send a test payload to KANDOWN_WEBHOOK_URL.',
    handler: async (_args, ctx) => {
      if (!WEBHOOK_URL) return ctx.log.warn('Set KANDOWN_WEBHOOK_URL first.');
      await ctx.fetch?.(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'ping', at: new Date().toISOString() }),
      });
    },
  });
}
