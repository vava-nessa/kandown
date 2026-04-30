/**
 * @file BlockNote markdown editor component
 * @description Replaces Wysimark for the task description body.
 * Loads markdown → blocks on mount, serializes blocks → markdown on change.
 * Always-edit mode (no preview toggle — BlockNote IS the default view).
 * Dark/light and skin-aware via dynamic theme built from kandown CSS variables.
 *
 * 📖 Anti-pollution guardrails:
 *  → isInitializingRef blocks onChange during initial replaceBlocks to prevent
 *    serialization drift from polluting .md files when no edit was made.
 *  → Schema whitelist removes non-markdown blocks/styles so the slash menu
 *    only exposes blocks that round-trip cleanly to .md.
 *  → Frontmatter and title are handled by the parent — BlockNote never sees them.
 *
 * 📖 Schema whitelist (markdown-native only):
 *  Blocks kept  : paragraph, heading, bulletListItem, numberedListItem,
 *                 checkListItem, codeBlock, image, quote, divider
 *  Blocks removed: audio, file, video, table, toggleListItem
 *  Styles kept  : bold, italic, strike, code
 *  Styles removed: underline (not standard markdown), textColor, backgroundColor
 *
 * @functions
 *  → BlockNoteMarkdownEditor — BlockNote editor with markdown round-trip
 *  → useBlockNoteTheme       — builds BlockNote Theme from kandown CSS vars,
 *                              updates on skin / dark-mode change
 *
 * @exports BlockNoteMarkdownEditor, MarkdownEditorProps
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultStyleSpecs,
  defaultInlineContentSpecs,
  createCodeBlockSpec,
} from '@blocknote/core';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView, type Theme } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import { codeBlockOptions } from '@blocknote/code-block';

export interface MarkdownEditorProps {
  /** Markdown string to display/edit */
  value: string;
  /** Called on every content change. Omitting or passing undefined → read-only. */
  onChange?: (value: string) => void;
  /** When true, forces read-only regardless of onChange presence */
  readOnly?: boolean;
  /** Hint text shown when the editor is empty */
  placeholder?: string;
  /** Minimum height CSS value (default "120px") */
  minHeight?: string;
}

// ─── Schema ────────────────────────────────────────────────────────────────────

// Keep only markdown-native blocks (but replace codeBlock with syntax-highlighted version)
const { audio, file, video, table, toggleListItem, codeBlock: _codeBlock, ...markdownBlockSpecs } = defaultBlockSpecs;

// Keep only styles that have native markdown syntax
const { underline, textColor, backgroundColor, ...markdownStyleSpecs } = defaultStyleSpecs;

const markdownSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...markdownBlockSpecs,
    codeBlock: createCodeBlockSpec(codeBlockOptions),
  },
  inlineContentSpecs: defaultInlineContentSpecs,
  styleSpecs: markdownStyleSpecs,
});

// ─── Theme ─────────────────────────────────────────────────────────────────────

function buildBlockNoteTheme(): Theme {
  const cs = getComputedStyle(document.documentElement);
  // CSS vars are stored as "H S% L%" — we wrap in hsl() for BlockNote
  const r = (name: string) => `hsl(${cs.getPropertyValue(`--${name}`).trim()})`;
  const font = cs.getPropertyValue('--font-sans').trim();

  return {
    colors: {
      editor: {
        text: r('foreground'),
        background: r('background'),
      },
      menu: {
        text: r('popover-foreground'),
        background: r('popover'),
      },
      tooltip: {
        text: r('popover-foreground'),
        background: r('popover'),
      },
      hovered: {
        text: r('accent-foreground'),
        background: r('accent'),
      },
      selected: {
        text: r('primary-foreground'),
        background: r('primary'),
      },
      disabled: {
        text: r('muted-foreground'),
        background: r('muted'),
      },
      shadow: 'transparent',
      border: r('border'),
      sideMenu: r('border-strong'),
    },
    borderRadius: 6,
    fontFamily: font || 'Inter, system-ui, sans-serif',
  };
}

/**
 * Rebuilds the BlockNote theme whenever kandown's skin or dark/light mode changes.
 * Watches `class` (dark toggle) and `style` (CSS variable injection via applyProjectTheme).
 */
function useBlockNoteTheme(): Theme {
  const [theme, setTheme] = useState(buildBlockNoteTheme);

  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(buildBlockNoteTheme()));
    obs.observe(document.documentElement, { attributeFilter: ['class', 'style'] });
    return () => obs.disconnect();
  }, []);

  return theme;
}

// ─── Component ─────────────────────────────────────────────────────────────────

/**
 * Always-edit BlockNote editor for task description bodies.
 * Markdown in → markdown out, no HTML pollution in .md files.
 */
export function BlockNoteMarkdownEditor({
  value,
  onChange,
  readOnly = false,
  placeholder,
  minHeight = '120px',
}: MarkdownEditorProps) {
  const isEditable = !readOnly && !!onChange;
  // True during initial replaceBlocks — blocks onChange to prevent dirty write
  const isInitializingRef = useRef(true);
  const theme = useBlockNoteTheme();
  // Tracks the resolved color scheme so the wrapper can mirror it via data attr
  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );

  useEffect(() => {
    const obs = new MutationObserver(() => {
      setColorScheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    });
    obs.observe(document.documentElement, { attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const editor = useCreateBlockNote({ schema: markdownSchema });

  // Fix: BlockNote slash menu z-index is calc(--bn-ui-base-z-index + 40).
  // Default base is 0 → menu z-index = 40, which is below the drawer (z-101).
  // Setting base to 150 makes the menu render at 190, above the drawer.
  // This must be set on editor.portalElement (the DOM node BlockNote renders
  // slash menu / formatting toolbar into — a direct child of <body>).
  useEffect(() => {
    const portal = editor.portalElement;
    if (!portal) return;
    portal.style.setProperty('--bn-ui-base-z-index', '150');
  }, [editor]);

  // Keep portal data-mantine-color-scheme in sync with kandown's resolved mode
  // (BlockNoteView sets it from system preference; we need kandown's preference).
  useEffect(() => {
    const portal = editor.portalElement;
    if (!portal) return;
    portal.setAttribute('data-mantine-color-scheme', colorScheme);
    portal.setAttribute('data-color-scheme', colorScheme);
  }, [editor, colorScheme]);

  // Load initial markdown content once on mount.
  // We intentionally do NOT re-run on value changes — the editor is the source
  // of truth while the drawer is open. Changes flow out via onChange, not in.
  useEffect(() => {
    isInitializingRef.current = true;
    const blocks = editor.tryParseMarkdownToBlocks(value || '');
    editor.replaceBlocks(editor.document, blocks);
    // Wait one animation frame so the replaceBlocks onChange fires before
    // we unlock normal change tracking.
    requestAnimationFrame(() => {
      isInitializingRef.current = false;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = useCallback(() => {
    if (isInitializingRef.current || !onChange) return;
    const md = editor.blocksToMarkdownLossy(editor.document);
    onChange(md);
  }, [editor, onChange]);

  return (
    <div
      className="blocknote-editor-wrapper rounded-[6px] overflow-hidden"
      style={{ minHeight }}
      data-placeholder={placeholder}
      data-mantine-color-scheme={colorScheme}
      data-color-scheme={colorScheme}
    >
      <BlockNoteView
        editor={editor}
        theme={theme}
        editable={isEditable}
        onChange={handleChange}
      />
    </div>
  );
}
