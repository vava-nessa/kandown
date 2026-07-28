/**
 * 📖 Webhook Sync, an example kandown extension.
 * Demonstrates the `sync` contribution point and the `net:*` permission: when a
 * task moves to Done, it POSTs a small payload to the URL in KANDOWN_WEBHOOK_URL.
 * Also contributes a `kandown webhook-sync` command to send a test ping.
 */
import type { KandownExtensionAPI } from 'kandown';

const WEBHOOK_URL = process.env.KANDOWN_WEBHOOK_URL;

export default function (kd: KandownExtensionAPI) {
  // Sync: react to a task reaching Done by firing a webhook.
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
        body: JSON.stringify({
          event: 'task.done',
          id: event.task.id,
          title: event.task.frontmatter.title,
        }),
      });
      ctx.log.info(`Webhook sent for ${event.task.id}.`);
    },
  });

  // Command: verify the webhook is reachable.
  kd.contributeCommand('webhook-sync', {
    description: 'Send a test payload to KANDOWN_WEBHOOK_URL.',
    handler: async (_args, ctx) => {
      if (!WEBHOOK_URL) {
        ctx.log.warn('Set KANDOWN_WEBHOOK_URL first (e.g. export KANDOWN_WEBHOOK_URL=https://hookb.in/...).');
        return;
      }
      await ctx.fetch?.(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'ping', at: new Date().toISOString() }),
      });
      ctx.log.info(`Test ping sent to ${WEBHOOK_URL}.`);
    },
  });
}
