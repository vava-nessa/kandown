/**
 * @file Markdown Editor component
 * @description Wraps Wysimark with read/edit toggle behavior.
 * Default state is read mode (markdown preview); clicking switches to edit mode.
 * A manual toggle button allows switching between preview and edit modes.
 *
 * 📖 Uses `@wysimark/react` — a free open-source WYSIWYG editor for Markdown.
 * Preview mode uses `marked` to render markdown to HTML.
 *
 * @functions
 *  → MarkdownEditor — toggleable markdown editor/preview
 *
 * @exports MarkdownEditor
 */

import { useState, useCallback } from 'react';
import { Editable, useEditor } from '@wysimark/react';
import { marked } from 'marked';
import { Icon } from '../Icons';

export interface MarkdownEditorProps {
  /** Markdown content to display/edit */
  value: string;
  /** Called when content changes (only in edit mode) */
  onChange?: (value: string) => void;
  /** If true, component is read-only display (always preview) */
  readOnly?: boolean;
  /** Placeholder shown in edit mode when empty */
  placeholder?: string;
  /** Minimum height (default 120px) */
  minHeight?: string;
}

/** Configure marked for safe rendering */
marked.setOptions({
  breaks: true,
  gfm: true,
});

/**
 * Toggleable markdown editor that defaults to read/preview mode.
 * Clicking the preview area or toggle button switches to edit mode.
 */
export function MarkdownEditor({
  value,
  onChange,
  readOnly = false,
  placeholder,
  minHeight = '120px',
}: MarkdownEditorProps) {
  const [isEditMode, setIsEditMode] = useState(false);

  const isLocked = readOnly || !onChange;

  const editor = useEditor({});

  const handleToggle = useCallback(() => {
    if (isLocked) return;
    setIsEditMode(prev => !prev);
  }, [isLocked]);

  const handleClick = useCallback(() => {
    if (isLocked || isEditMode) return;
    setIsEditMode(true);
  }, [isLocked, isEditMode]);

  const handleChange = useCallback(
    (markdown: string) => {
      if (onChange) {
        onChange(markdown);
      }
    },
    [onChange]
  );

  const renderedHtml = value ? marked.parse(value) : '';

  if (isLocked) {
    return (
      <div
        className="markdown-preview border border-transparent rounded-[6px] overflow-hidden"
        style={{ minHeight }}
      >
        {value ? (
          <div
            className="markdown-content prose prose-sm max-w-none px-3 py-2.5 text-[14px] leading-relaxed font-sans"
            dangerouslySetInnerHTML={{ __html: renderedHtml as string }}
          />
        ) : (
          <div className="text-fg-faint italic px-3 py-2.5 text-[14px]">
            {placeholder}
          </div>
        )}
      </div>
    );
  }

  if (!isEditMode) {
    return (
      <div
        className="relative group markdown-preview border border-border rounded-[6px] overflow-hidden cursor-pointer hover:border-border-focus transition-colors"
        style={{ minHeight }}
        onClick={handleClick}
        title={placeholder || 'Click to edit'}
      >
        {value ? (
          <>
            <div
              className="markdown-content prose prose-sm max-w-none px-3 py-2.5 text-[14px] leading-relaxed font-sans"
              dangerouslySetInnerHTML={{ __html: renderedHtml as string }}
            />
            <button
              onClick={e => {
                e.stopPropagation();
                handleToggle();
              }}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 rounded-[4px] bg-bg-2/90 border border-border text-fg-muted hover:text-fg hover:bg-bg-3 transition-all"
              title="Edit"
            >
              <Icon.Pencil size={14} />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2.5 text-fg-faint italic text-[14px]">
            <Icon.Edit size={14} />
            {placeholder || 'Click to add content'}
          </div>
        )}
      </div>
    );
  }

return (
    <div className="border border-border-focus rounded-[6px] overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1 bg-bg-2 border-b border-border">
        <span className="text-[11px] text-fg-muted font-medium uppercase tracking-wide">
          Markdown
        </span>
        <button
          onClick={handleToggle}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-[3px] text-[11px] text-fg-muted hover:text-fg hover:bg-bg-3 transition-colors"
          title="Preview mode"
        >
          <Icon.Eye size={12} />
          Preview
        </button>
      </div>
      <div className="bg-bg">
        <Editable
          editor={editor}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          style={{ minHeight: `calc(${minHeight} - 36px)` }}
          className="px-3 py-2 text-[14px] markdown-content"
        />
      </div>
    </div>
  );
}
