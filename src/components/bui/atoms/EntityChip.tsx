/**
 * @file EntityChip atom of the BeautifulUI design system
 * @description Faithful-enough port of the BeautifulUI atoms/EntityChip
 * (beautifului.dev, MIT): a small inline chip that prefixes an entity name
 * with a colored dot holding the initial letter, for inline @-mentions and
 * entity references inside prose. Written against the scoped `.bui` tokens
 * from styles/beautifului.css.
 *
 * @exports EntityChip
 * @see src/components/bui/InsightCards.tsx
 */

export function EntityChip({
  name,
  tone = "bg-accent",
  className = "",
}: {
  name: string;
  /** Tailwind background class of the initial dot (e.g. `bg-orange`). */
  tone?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-inset py-0.5 pl-0.5 pr-2 align-baseline text-[12px] font-medium text-ink shadow-hairline ${className}`}
    >
      <span
        className={`flex size-3.5 items-center justify-center rounded-full text-[7.5px] font-bold text-white ${tone}`}
        aria-hidden
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
      {name}
    </span>
  );
}

export default EntityChip;
