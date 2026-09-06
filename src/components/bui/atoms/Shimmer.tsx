/**
 * @file Shimmer atom of the BeautifulUI design system
 * @description Faithful port of the BeautifulUI atoms/Shimmer
 * (beautifului.dev, MIT): a span whose text is clipped to a moving accent
 * gradient, driven by the `shimmer-text` keyframe from
 * styles/beautifului.css. Used for busy labels ("Improving...") while an AI
 * action runs.
 *
 * @exports Shimmer
 * @see src/components/bui/SelectionActions.tsx
 */

export function Shimmer({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`bg-clip-text text-transparent ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(90deg, hsl(var(--ink-3)) 35%, hsl(var(--ink)) 50%, hsl(var(--ink-3)) 65%)",
        backgroundSize: "200% 100%",
        animation: "shimmer-text 1.4s linear infinite",
      }}
    >
      {children}
    </span>
  );
}

export default Shimmer;
