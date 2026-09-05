/**
 * @file Model picker for the agent chat sidebar header
 * @description A compact free-text input with a short datalist of common model
 * suggestions, rendered next to the harness selector. The pick applies to the
 * NEXT new conversation: it is persisted per harness in localStorage under
 * `kandown.model.<harnessId>`, prefilled again when that harness is selected,
 * and forwarded to POST /api/agent/sessions which maps it onto the harness
 * launch flag (claude `--model`, codex `-m`, pi `--model`). An empty value
 * means "harness default": nothing is sent. Free text is always allowed, the
 * datalist only suggests.
 *
 * @functions
 *  → ModelPicker: the input itself, owning persistence per harness
 *  → loadStoredModel: reads one harness's persisted pick (exported for tests)
 *
 * @exports ModelPicker, loadStoredModel
 * @see src/components/agent/ChatSidebar.tsx: where the picker is mounted
 * @see src/lib/filesystem.ts: CreateAgentSessionInput.model
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** 📖 localStorage key prefix for the per-harness model pick (round 4). */
const MODEL_STORAGE_PREFIX = 'kandown.model.';

function storedModelKey(harnessId: string): string {
  return `${MODEL_STORAGE_PREFIX}${harnessId}`;
}

/** 📖 One harness's persisted model pick, or the empty string. Storage
 * failures (private mode, quota) degrade to "no pick", never an error. */
export function loadStoredModel(harnessId: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(storedModelKey(harnessId)) ?? '';
  } catch {
    return '';
  }
}

function persistModel(harnessId: string, model: string): void {
  try {
    if (model) window.localStorage.setItem(storedModelKey(harnessId), model);
    else window.localStorage.removeItem(storedModelKey(harnessId));
  } catch {
    // 📖 Storage unavailable: the pick just does not survive the page.
  }
}

/** 📖 Short, generic suggestion lists per harness family. Deliberately free
 * text first: model ids move fast, so the datalist is a convenience, never a
 * whitelist. Harnesses without a well-known shortlist (pi, ACP agents) get an
 * empty list and a plain free-text input. */
const MODEL_SUGGESTIONS: Record<string, string[]> = {
  claude: ['opus', 'sonnet', 'haiku'],
  codex: ['gpt-5.1-codex', 'gpt-5.1', 'o4-mini'],
};

interface ModelPickerProps {
  /** Harness the next new conversation will use; null hides the picker. */
  harnessId: string | null;
  /** Notifies ChatSidebar so a session start forwards the picked model. */
  onModelChange: (model: string) => void;
}

export function ModelPicker({ harnessId, onModelChange }: ModelPickerProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');

  // 📖 Prefill on harness change from that harness's own slot and keep the
  // parent in sync: a harness switch invalidates the previous pick, so a
  // start right after switching must carry the new harness's model.
  useEffect(() => {
    const next = harnessId ? loadStoredModel(harnessId) : '';
    setValue(next);
    onModelChange(next);
  }, [harnessId, onModelChange]);

  const suggestions = useMemo(
    () => (harnessId ? MODEL_SUGGESTIONS[harnessId] ?? [] : []),
    [harnessId],
  );
  const listId = harnessId ? `kandown-model-suggestions-${harnessId}` : undefined;

  if (!harnessId) return null;

  const update = (next: string) => {
    setValue(next);
    if (harnessId) persistModel(harnessId, next);
    onModelChange(next.trim());
  };

  return (
    <>
      <input
        type="text"
        list={suggestions.length > 0 ? listId : undefined}
        value={value}
        onChange={e => update(e.target.value)}
        placeholder={t('agentChat.modelPlaceholder', 'Model')}
        title={t('agentChat.modelTitle', 'Model for new chats, empty uses the harness default')}
        aria-label={t('agentChat.modelTitle', 'Model for new chats, empty uses the harness default')}
        className="h-6 w-[110px] min-w-0 flex-none rounded-md border border-border bg-bg-1 px-1.5 text-[11.5px] text-fg-muted outline-none transition-colors placeholder:text-fg-faint hover:text-fg focus:border-border-focus"
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map(suggestion => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      )}
    </>
  );
}
