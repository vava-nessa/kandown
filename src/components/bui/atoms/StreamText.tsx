/**
 * @file StreamText atom of the BeautifulUI design system
 * @description Faithful-enough port of the BeautifulUI atoms/StreamText
 * (beautifului.dev, MIT): streams a string word by word on an interval.
 * Calls `onProgress` after every revealed word (the selection bar re-measures
 * its anchor through it) and `onDone` once the full text is visible. Restart
 * the stream by changing `text`.
 *
 * @exports StreamText
 * @see src/components/bui/SelectionActions.tsx
 */

import { useEffect, useState } from "react";

export function StreamText({
  text,
  onProgress,
  onDone,
  speed = 32,
  className = "",
}: {
  text: string;
  /** Called after each newly revealed word. */
  onProgress?: () => void;
  /** Called once every word of `text` is visible. */
  onDone?: () => void;
  /** Delay in ms between words. */
  speed?: number;
  className?: string;
}) {
  const words = text.split(/(\s+)/);
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(0);
  }, [text]);

  useEffect(() => {
    if (count >= words.length) {
      onDone?.();
      return;
    }
    const timer = setTimeout(() => {
      setCount((current) => current + 1);
      onProgress?.();
    }, speed);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, text, speed]);

  return <span className={className}>{words.slice(0, count).join("")}</span>;
}

export default StreamText;
