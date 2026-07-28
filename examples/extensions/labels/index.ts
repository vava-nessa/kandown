/**
 * 📖 Labels, an example kandown extension.
 * Demonstrates a `select` field with a custom badge, and a second gate that
 * composes with other extensions' gates: enable this alongside `burndown` and a
 * task needs BOTH points and a label before it can reach Done.
 */
import type { KandownExtensionAPI } from 'kandown';

const EMOJI: Record<string, string> = {
  bug: '🐛',
  feature: '✨',
  chore: '🔧',
  docs: '📚',
};

type LabelsPlugins = { labels?: { label?: unknown } } | undefined;

export default function (kd: KandownExtensionAPI) {
  // A select field stored under plugins.labels.label, with an emoji badge.
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
      const v = typeof value === 'string' ? value : '';
      return v ? `${EMOJI[v] ?? '🏷️'} ${v}` : null;
    },
  });

  // A gate composing with others: no Done without a label.
  kd.contributeGate({
    on: 'task:beforeMove',
    to: 'Done',
    handler: async (event) => {
      const label = (event.task.plugins as LabelsPlugins)?.labels?.label;
      if (!label) {
        return { block: true, reason: 'A task needs a label before it can move to Done.' };
      }
    },
  });
}
