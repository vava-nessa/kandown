/**
 * @file ValuePill atom of the BeautifulUI design system
 * @description Faithful-enough port of the BeautifulUI atoms/ValuePill
 * (beautifului.dev, MIT): a compact monospace pill for numeric values and
 * deltas, with an optional green tone for positive readings. Written against
 * the scoped `.bui` tokens from styles/beautifului.css.
 *
 * @exports ValuePill
 * @see src/components/bui/InsightCards.tsx
 */

export function ValuePill({
  children,
  tone,
  className = "",
}: {
  children: React.ReactNode;
  /** `green` renders the positive reading; omit for the neutral inset look. */
  tone?: "green";
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 font-mono text-[11.5px] tabular-nums ${
        tone === "green"
          ? "bg-green-tint font-medium text-green"
          : "bg-inset text-ink-2 shadow-hairline"
      } ${className}`}
    >
      {children}
    </span>
  );
}

export default ValuePill;
