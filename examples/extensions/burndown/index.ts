/**
 * 📖 Burndown, the canonical kandown extension.
 * Exercises every CLI-visible contribution point: a custom `points` field (with
 * a card badge), a "no Done without points" transition gate, and a `kandown
 * burndown` command, plus the web panel declaration consumed by the Drawer.
 * Copy this directory as the starting point for a new
 * extension. See docs/EXTENSIONS.md.
 *
 * `import type` is erased at runtime by jiti, so the `kandown` package does not
 * need to be resolvable from this directory for the extension to load.
 */
import type { KandownExtensionAPI } from 'kandown';

type Plugins = { burndown?: { points?: unknown } } | undefined;

export default function (kd: KandownExtensionAPI) {
  // A custom task field, stored under plugins.burndown.points.
  kd.contributeField({
    key: 'points',
    label: 'Story points',
    type: 'number',
    badge: (value) => (value ? `🔺 ${value}` : null),
  });

  // A task-drawer panel rendered from the self-contained browser bundle.
  kd.contributeWebPanel({ id: 'chart', title: 'Burndown', entry: './web.js', icon: 'chart' });

  // A transition gate: no task reaches Done without points.
  kd.contributeGate({
    on: 'task:beforeMove',
    to: 'Done',
    handler: async (event) => {
      const points = (event.task.plugins as Plugins)?.burndown?.points;
      if (!points) {
        return { block: true, reason: 'A task needs story points before it can move to Done.' };
      }
    },
  });

  // A contributed CLI command: kandown burndown.
  kd.contributeCommand('burndown', {
    description: 'Print a simple burndown: done vs total story points.',
    handler: async (_args, ctx) => {
      const tasks = await ctx.board.readAll();
      let total = 0;
      let done = 0;
      for (const t of tasks) {
        const pts = Number((t.plugins as Plugins)?.burndown?.points) || 0;
        if (!pts) continue;
        total += pts;
        if ((t.frontmatter.status as string | undefined) === 'Done') done += pts;
      }
      const remaining = total - done;
      ctx.log.info(`Burndown: ${done}/${total} points done, ${remaining} remaining.`);
    },
  });
}
