/**
 * @file Bundled Labels extension entry
 * @description Self-contained JavaScript distribution entry matching index.ts,
 * including the select field, emoji badge and Done transition gate.
 */

const EMOJI = { bug: '🐛', feature: '✨', chore: '🔧', docs: '📚' };

export default function activate(kd) {
  kd.contributeField({
    key: 'label',
    label: 'Label',
    type: 'select',
    options: [
      { value: 'bug', label: 'Bug' },
      { value: 'feature', label: 'Feature' },
      { value: 'chore', label: 'Chore' },
      { value: 'docs', label: 'Docs' },
    ],
    badge: (value) => {
      const label = typeof value === 'string' ? value : '';
      return label ? `${EMOJI[label] ?? '🏷️'} ${label}` : null;
    },
  });

  kd.contributeGate({
    on: 'task:beforeMove',
    to: 'Done',
    handler: async (event) => {
      if (!event.task.plugins?.labels?.label) {
        return { block: true, reason: 'A task needs a label before it can move to Done.' };
      }
    },
  });
}
