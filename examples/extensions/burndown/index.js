/**
 * @file Bundled Burndown extension entry
 * @description Self-contained JavaScript distribution entry matching index.ts.
 * Node loads it in released extensions; standalone browsers activate it through
 * a Blob module and ignore the Node-only command and gate handlers.
 */

export default function activate(kd) {
  kd.contributeField({
    key: 'points',
    label: 'Story points',
    type: 'number',
    badge: (value) => (value ? `🔺 ${value}` : null),
  });

  kd.contributeWebPanel({ id: 'chart', title: 'Burndown', entry: './web.js', icon: 'chart' });

  kd.contributeGate({
    on: 'task:beforeMove',
    to: 'Done',
    handler: async (event) => {
      const points = event.task.plugins?.burndown?.points;
      if (!points) return { block: true, reason: 'A task needs story points before it can move to Done.' };
    },
  });

  kd.contributeCommand('burndown', {
    description: 'Print a simple burndown: done vs total story points.',
    handler: async (_args, ctx) => {
      const tasks = await ctx.board.readAll();
      let total = 0;
      let done = 0;
      for (const task of tasks) {
        const points = Number(task.plugins?.burndown?.points) || 0;
        if (!points) continue;
        total += points;
        if (task.frontmatter.status === 'Done') done += points;
      }
      ctx.log.info(`Burndown: ${done}/${total} points done, ${total - done} remaining.`);
    },
  });
}
