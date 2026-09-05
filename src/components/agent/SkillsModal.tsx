/**
 * @file Read-only skills modal for the agent chat sidebar (round 3)
 * @description A compact centered modal listing EVERY skill the daemon reports
 * on /api/skills, not just the chat-capable subset the pill row shows: mono
 * id, chat button label when the manifest declares one, scope chip, an
 * interactive badge, the active state as a colored dot, and the daemon's
 * compatibility reason in amber when the skill cannot run. Strictly read-only
 * (no enable/disable actions: those live in Settings). Opened from the
 * sparkles button in the PromptBar row; closes on backdrop click, Esc, or the
 * close button.
 *
 * @functions
 *  → SkillsModal: the fixed-overlay skill catalog (null when closed)
 *
 * @exports SkillsModal
 * @see src/lib/store/agentChatSlice.ts: where the full skills list is fetched
 * @see src/components/agent/PromptBar.tsx: mount point and open state
 */

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { IconHelp, IconX } from '@tabler/icons-react';
import { useStore } from '../../lib/store';
import type { SkillPayload } from '../../lib/filesystem';

interface SkillsModalProps {
  open: boolean;
  onClose: () => void;
}

/** 📖 One skill row: identity + capability chips + health dot. Data values
 * (scope id, compatibility reason) render raw, like the kind chip on the
 * approval cards; authored labels go through t(). */
function SkillRow({ skill }: { skill: SkillPayload }) {
  const { t } = useTranslation();
  return (
    <li className="flex items-start gap-2 px-3 py-2">
      <span
        aria-hidden
        title={skill.active
          ? t('agentSkills.activeTitle', 'Active')
          : skill.compatibilityReason || t('agentSkills.inactiveTitle', 'Inactive')}
        className={`mt-[5px] h-2 w-2 flex-none rounded-full ${
          skill.active && skill.compatible ? 'bg-emerald-500' : 'bg-fg-faint/50'
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[11.5px] text-fg">{skill.id}</span>
          {skill.chat && (
            <span className="max-w-[160px] truncate text-[12px] text-fg-muted">
              {skill.chat.button.label}
            </span>
          )}
          {skill.chat && (
            <span className="inline-flex items-center rounded-full border border-border bg-bg-2 px-1.5 py-0.5 text-[10px] text-fg-muted">
              {skill.chat.scope}
            </span>
          )}
          {skill.chat?.interactive && (
            <IconHelp
              size={11}
              stroke={1.8}
              className="text-fg-faint"
              aria-label={t('agentSkills.interactiveBadge', 'Interactive')}
              title={t('agentSkills.interactiveBadge', 'Interactive')}
            />
          )}
        </div>
        {skill.compatibilityReason && (
          <p className="mt-0.5 text-[11px] leading-snug text-amber-500">{skill.compatibilityReason}</p>
        )}
      </div>
    </li>
  );
}

export function SkillsModal({ open, onClose }: SkillsModalProps) {
  const { t } = useTranslation();
  const skills = useStore(s => s.agentChat.skills);

  // 📖 Esc closes while open. Documented alongside the backdrop click below:
  // both are dismissal affordances, never data mutations.
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[4px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('agentSkills.skillsModalTitle', 'Skills')}
        onClick={e => e.stopPropagation()}
        className="flex max-h-[70vh] w-full max-w-[360px] flex-col overflow-hidden rounded-xl border border-border bg-bg shadow-2xl"
      >
        <div className="flex flex-none items-center justify-between border-b border-border px-3 py-2">
          <p className="text-[13px] font-semibold text-fg">
            {t('agentSkills.skillsModalTitle', 'Skills')}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-bg-2 hover:text-fg"
            title={t('common.close', 'Close')}
            aria-label={t('common.close', 'Close')}
          >
            <IconX size={14} stroke={1.8} />
          </button>
        </div>
        {skills.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12.5px] text-fg-muted">
            {t('agentSkills.skillsModalEmpty', 'No skills installed')}
          </p>
        ) : (
          <ul className="flex-1 divide-y divide-border overflow-y-auto">
            {skills.map(skill => <SkillRow key={skill.id} skill={skill} />)}
          </ul>
        )}
      </div>
    </div>
  );
}
