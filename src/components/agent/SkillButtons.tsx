/**
 * @file Skill pill buttons for the agent chat sidebar (t310)
 * @description Renders the installed skills that declare a `chat` block as
 * compact pill buttons above the PromptBar. Clicking one starts a new session
 * whose prompt is assembled by the daemon from the compiled context plus the
 * skill instructions. Scope 'task' buttons stay disabled until the sidebar has
 * a task context; interactive skills (grill-me) carry a tiny help badge and,
 * once launched, drive the answer form further down the slice's state machine.
 *
 * @functions
 *  → resolveSkillIcon: maps a manifest icon string to a tabler icon, silent
 *    fallback for unknown strings
 *  → SkillButtons: the pill row (plus the running-skill chip)
 *
 * @exports SkillButtons
 * @see src/lib/store/agentChatSlice.ts: where chatSkills / activeSkill live
 * @see src/components/agent/ChatSidebar.tsx: mount point and launch handler
 */

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconHelp,
  IconListCheck,
  IconMessageCircle,
  IconQuestionMark,
  IconSparkles,
  IconWand,
} from '@tabler/icons-react';
import type { ChatSkillButton } from '../../lib/store/types';

/** 📖 Any tabler icon component; `typeof IconSparkles` avoids importing a
 * version-sensitive type name. */
type IconComponent = typeof IconSparkles;

/** 📖 Manifest icon strings are free text: match a small keyword set, fall
 * back to Sparkles for anything unknown (and for a missing icon). */
const SKILL_ICONS: Array<{ keywords: string[]; icon: IconComponent }> = [
  { keywords: ['help', 'question'], icon: IconHelp },
  { keywords: ['wand', 'magic'], icon: IconWand },
  { keywords: ['list', 'check'], icon: IconListCheck },
  { keywords: ['message', 'chat'], icon: IconMessageCircle },
  { keywords: ['sparkle'], icon: IconSparkles },
];

function resolveSkillIcon(icon: string | undefined): IconComponent {
  if (!icon) return IconSparkles;
  const needle = icon.toLowerCase();
  for (const entry of SKILL_ICONS) {
    if (entry.keywords.some(keyword => needle.includes(keyword))) return entry.icon;
  }
  return IconSparkles;
}

interface SkillButtonsProps {
  /** Chat-declaring skills, projected by the slice from /api/skills. */
  skills: ChatSkillButton[];
  /** True while a session is starting or no harness can run the skill. */
  disabled: boolean;
  /** Whether a task context exists (scope 'task' buttons need one). */
  hasTaskContext: boolean;
  /** Label of the skill the active session was launched from, if any. */
  activeSkillLabel: string | null;
  /** Launch handler: the sidebar wires it to startSession + harness selection. */
  onLaunch: (skill: ChatSkillButton) => void;
}

export function SkillButtons({ skills, disabled, hasTaskContext, activeSkillLabel, onLaunch }: SkillButtonsProps) {
  const { t } = useTranslation();

  const handleLaunch = useCallback((skill: ChatSkillButton) => {
    if (disabled) return;
    if (skill.scope === 'task' && !hasTaskContext) return;
    onLaunch(skill);
  }, [disabled, hasTaskContext, onLaunch]);

  // 📖 Nothing to show: no installed chat skills and no running skill chip.
  if (skills.length === 0 && !activeSkillLabel) return null;

  return (
    <div
      role="toolbar"
      aria-label={t('agentSkills.skillsLabel', 'Skills')}
      className="flex flex-none flex-wrap items-center gap-1.5 px-2.5 pb-1 pt-2"
    >
      {activeSkillLabel && (
        <span
          className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10.5px] text-fg"
          title={t('agentSkills.skillRunning', 'Skill running')}
        >
          <IconSparkles size={11} stroke={1.8} />
          <span className="max-w-[180px] truncate">{activeSkillLabel}</span>
        </span>
      )}
      {skills.map(skill => {
        const Icon = resolveSkillIcon(skill.icon);
        const needsTask = skill.scope === 'task' && !hasTaskContext;
        const title = needsTask
          ? t('agentSkills.needsTaskContext', 'Needs a task context')
          : skill.label;
        return (
          <button
            key={skill.skillId}
            type="button"
            onClick={() => handleLaunch(skill)}
            disabled={disabled || needsTask}
            title={title}
            aria-label={title}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-bg-1 px-2 py-0.5 text-[10.5px] text-fg-muted transition-colors hover:border-border-focus hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:text-fg-muted"
          >
            <Icon size={11} stroke={1.8} />
            <span className="max-w-[140px] truncate">{skill.label}</span>
            {skill.interactive && (
              <IconHelp
                size={10}
                stroke={1.8}
                aria-label={t('agentSkills.interactiveBadge', 'Interactive')}
                title={t('agentSkills.interactiveBadge', 'Interactive')}
                className="text-fg-faint"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
