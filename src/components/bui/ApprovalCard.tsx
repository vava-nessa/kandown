/**
 * @file Human-in-the-loop approval card
 * @description Renders one approval question at a time for agent sessions:
 * the stack slides vertically between questions while the card height
 * animates to fit, so the agent never continues without an explicit
 * human answer. Used by the agent chat surface.
 *
 * 📖 Kandown embedding (round 7): the chat renders every parsed ```options
 * block through this card (one radio question). The adaptations are all
 * optional props: `disabled` freezes the card while the turn streams,
 * `dismissible`/`custom` drop the demo-only X and free-text row, `onSkip`
 * hands the "let me type instead" action to the chat, and `answeredIndex`
 * renders the settled answered state (chosen radio filled, others dimmed).
 * Without them the demo behaves exactly as the faithful copy.
 */

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "./primitives/Button";
import GlideMenu from "./primitives/GlideMenu";

/* ─────────────────────────────────────────────────────────
 * APPROVAL CARD (human-in-the-loop)
 * One question at a time. The stack slides vertically as you
 * move between questions (the card's height animates to fit),
 * the step counter rolls like an odometer, and the footer uses
 * pill actions : a quiet Skip and a dark Continue with a ⏎.
 * Single-choice answers auto-advance; multi-select waits.
 *
 * BeautifulUI (beautifului.dev, MIT) : faithful copy.
 * ───────────────────────────────────────────────────────── */

export type ApprovalQuestion = {
  q: string;
  type: "radio" | "check";
  options: string[];
};

const QUESTIONS: ApprovalQuestion[] = [
  {
    q: "How many flavors should we launch?",
    type: "radio",
    options: ["Three (core line)", "Five (full case)", "Just one hero"],
  },
  {
    q: "Which mix-ins should we stock?",
    type: "check",
    options: ["Chocolate chips", "Waffle bits", "Sprinkles"],
  },
  {
    q: "Which market do we enter first?",
    type: "radio",
    options: ["Food trucks", "Grocery freezers", "Scoop shops"],
  },
];

export type ApprovalLabels = {
  skip: string;
  continue: string;
  send: string;
  customPlaceholder: string;
  sentMessage: string;
};

const DEFAULT_LABELS: ApprovalLabels = {
  skip: "Skip",
  continue: "Continue",
  send: "Send",
  customPlaceholder: "Something else…",
  sentMessage: "Answers sent",
};

const ROLL_MS = 400;
const SLIDE = "360ms cubic-bezier(0.22, 1, 0.36, 1)";

function RollingDigits({ value }: { value: string }) {
  const prevRef = useRef(value);
  const [oldVal, setOldVal] = useState(value);
  const [newVal, setNewVal] = useState(value);
  const [rolling, setRolling] = useState(false);
  const [shifted, setShifted] = useState(false);
  const [dir, setDir] = useState<"up" | "down">("up");

  useEffect(() => {
    if (prevRef.current === value) return;
    const from = prevRef.current;
    prevRef.current = value;
    const fromN = parseInt(from, 10);
    const toN = parseInt(value, 10);
    setDir(Number.isFinite(fromN) && Number.isFinite(toN) && toN < fromN ? "down" : "up");
    setOldVal(from);
    setNewVal(value);
    setRolling(true);
    setShifted(false);

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setShifted(true));
    });
    const done = setTimeout(() => {
      setRolling(false);
      setOldVal(value);
      setShifted(false);
    }, ROLL_MS);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(done);
    };
  }, [value]);

  const chars = rolling ? newVal : oldVal;

  return (
    <>
      {Array.from({ length: chars.length }, (_, i) => {
        const o = oldVal[i] ?? "";
        const n = chars[i] ?? "";
        if (!rolling || o === n) {
          return <span key={`${i}-${n}`}>{n}</span>;
        }
        const top = dir === "down" ? n : o;
        const bottom = dir === "down" ? o : n;
        const restY = dir === "down" ? "0" : "-1em";
        const startY = dir === "down" ? "-1em" : "0";
        return (
          <span
            key={`${i}-${o}-${n}-${dir}`}
            style={{ display: "inline-block", position: "relative", overflow: "hidden", height: "1em", lineHeight: "1em", verticalAlign: "-0.05em" }}
          >
            <span
              style={{
                display: "flex",
                flexDirection: "column",
                transition: "transform 350ms cubic-bezier(0.4, 0, 0.2, 1)",
                transform: `translateY(${shifted ? restY : startY})`,
              }}
            >
              <span style={{ height: "1em", lineHeight: "1em" }}>{top}</span>
              <span style={{ height: "1em", lineHeight: "1em" }}>{bottom}</span>
            </span>
          </span>
        );
      })}
    </>
  );
}

function Ico({ path, size = 14, sw = 2 }: { path: ReactNode; size?: number; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {path}
    </svg>
  );
}

export default function ApprovalCard({
  questions = QUESTIONS,
  labels,
  onSubmitted,
  onAnswerChange,
  resettable = true,
  disabled = false,
  dismissible = true,
  custom = true,
  onSkip,
  answeredIndex = null,
}: {
  questions?: ApprovalQuestion[];
  labels?: Partial<ApprovalLabels>;
  onSubmitted?: (answers: Record<number, number[]>) => void;
  onAnswerChange?: (questionIndex: number, answer: number[]) => void;
  resettable?: boolean;
  /** 📖 Kandown embedding: true while the turn streams; every control freezes. */
  disabled?: boolean;
  /** 📖 Hides the corner X (the chat drops the card through onSkip instead). */
  dismissible?: boolean;
  /** 📖 Hides the free-text answer row (the chat offers a Skip action). */
  custom?: boolean;
  /** 📖 Called when the last question is skipped; the chat removes the card. */
  onSkip?: () => void;
  /** 📖 Settled answered state: index of the chosen radio. Renders the card
   * read-only (chosen highlighted, others dimmed) with no footer. */
  answeredIndex?: number | null;
  variant?: string;
} = {}) {
  const t = { ...DEFAULT_LABELS, ...labels };
  const [qi, setQi] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number[]>>({});
  const [custom_, setCustom] = useState<Record<number, string>>({});
  const [sent, setSent] = useState(false);
  const [open, setOpen] = useState(true);

  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const questionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const measured = useRef(false);
  const [viewportH, setViewportH] = useState<number | undefined>(undefined);
  const [trackY, setTrackY] = useState(0);
  const [animate, setAnimate] = useState(false);
  const [ready, setReady] = useState(false);

  const last = qi === questions.length - 1;
  const selected = answers[qi] ?? [];
  const hasAnswer = selected.length > 0 || Boolean(custom_[qi]?.trim());

  const sync = (withAnim: boolean) => {
    const item = questionRefs.current[qi];
    if (!item) return;
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setViewportH(item.offsetHeight);
    setTrackY(item.offsetTop);
    setAnimate(withAnim && !reduce);
  };

  useLayoutEffect(() => {
    const withAnim = measured.current;
    measured.current = true;
    sync(withAnim);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qi, answers, custom_, open, sent]);

  useEffect(() => {
    const id = requestAnimationFrame(() => sync(measured.current));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qi]);

  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current); }, []);

  const goTo = (next: number) => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setQi(Math.min(Math.max(next, 0), questions.length - 1));
  };

  // 📖 The auto-advance timer fires `send` from the render where the pick
  // happened, so reading `answers` directly would submit the PRE-pick state
  // (the kandown chat would send nothing). The ref carries the fresh answers
  // into the deferred callback.
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const send = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setSent(true);
    onSubmitted?.(answersRef.current);
  };

  const advance = () => {
    if (last) send();
    else goTo(qi + 1);
  };

  const toggle = (index: number) => {
    if (disabled) return;
    const type = questions[qi].type;
    setAnswers((current) => {
      const picked = current[qi] ?? [];
      const next = type === "radio"
        ? [index]
        : picked.includes(index)
          ? picked.filter((item) => item !== index)
          : [...picked, index];
      onAnswerChange?.(qi, next);
      return { ...current, [qi]: next };
    });
    if (type === "radio") {
      setCustom((current) => ({ ...current, [qi]: "" }));
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      advanceTimer.current = setTimeout(() => {
        if (last) send();
        else setQi((current) => Math.min(questions.length - 1, current + 1));
      }, 480);
    }
  };

  const reset = () => {
    setQi(0);
    setAnswers({});
    setCustom({});
    setSent(false);
    setOpen(true);
    measured.current = false;
  };

  // 📖 Kandown embedding: the settled answered state. The chosen radio keeps
  // its filled dot and full-contrast text, the others dim, and the footer is
  // gone: nothing left to answer. Replaces the interactive card entirely.
  if (answeredIndex !== null && questions.length > 0) {
    const question = questions[0];
    return (
      <div className="w-full max-w-80">
        <div className="rounded-card bg-surface shadow-card" style={{ animation: "pop-in 260ms cubic-bezier(0.23,1,0.32,1) both" }}>
          <div className="primitive-card-pad">
            <div className="pr-7 text-[14px] font-medium text-ink">{question.q}</div>
            <div className="mt-2.5 flex flex-col gap-1">
              {question.options.map((option, i) => {
                const on = i === answeredIndex;
                return (
                  <div
                    key={option}
                    className={`flex items-center gap-1.5 rounded-control py-1 pl-1 pr-2 ${on ? "" : "opacity-45"}`}
                  >
                    <span
                      className={`flex size-4 shrink-0 items-center justify-center rounded-full transition-colors duration-200
                        ${on ? "bg-ink text-canvas" : "shadow-[inset_0_0_0_1.5px_var(--line-strong)] text-transparent"}`}
                    >
                      <span className="size-1.5 rounded-full bg-canvas transition-transform duration-200" style={{ transform: on ? "scale(1)" : "scale(0)" }} />
                    </span>
                    <span className={`text-[13px] leading-none ${on ? "font-medium text-ink" : "text-ink-2"}`}>
                      {option}
                    </span>
                    {on && (
                      <svg className="ml-auto shrink-0 text-green" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-control bg-surface px-3 py-2 text-[12.5px] font-medium text-ink shadow-btn transition-colors duration-150 hover:bg-hover">
        Open approval
      </button>
    );
  }

  if (sent) {
    return (
      <div className="flex w-full max-w-80 items-center gap-3" style={{ animation: "pop-in 260ms cubic-bezier(0.23,1,0.32,1) both" }}>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-tint py-1 pr-2.5 pl-1 text-[12.5px] font-medium text-green">
          <span className="flex size-4.5 items-center justify-center rounded-full bg-green text-white">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          </span>
          {t.sentMessage}
        </span>
        {resettable && (
          <button type="button" onClick={reset} className="text-[12px] font-medium text-ink-3 transition-colors duration-150 hover:text-ink">
            Start over
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="w-full max-w-80">
      <div className="relative overflow-hidden rounded-card bg-surface shadow-card" style={{ animation: "fade-up 380ms cubic-bezier(0.23,1,0.32,1) both" }}>
        {dismissible && (
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setOpen(false)}
            className="primitive-icon-button absolute right-2.5 top-2.5 z-10 text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink"
          >
            <Ico size={14} sw={2.2} path={<path d="M18 6L6 18M6 6l12 12" />} />
          </button>
        )}
        <div className="primitive-card-pad">
          <div
            className="overflow-hidden"
            style={{ height: viewportH, transition: animate ? `height ${SLIDE}` : undefined }}
            aria-live="polite"
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 26,
                transform: `translate3d(0, ${-trackY}px, 0)`,
                transition: animate ? `transform ${SLIDE}` : undefined,
                willChange: "transform",
              }}
            >
              {questions.map((question, qIdx) => {
                const active = qIdx === qi;
                if (!ready && !active) return null;
                const picked = answers[qIdx] ?? [];
                const questionStyle: CSSProperties = {
                  opacity: active ? 1 : 0,
                  transition: animate ? `opacity ${SLIDE}` : undefined,
                  pointerEvents: active ? undefined : "none",
                };
                return (
                  <div
                    key={qIdx}
                    ref={(el) => { questionRefs.current[qIdx] = el; }}
                    aria-hidden={active ? undefined : true}
                    style={questionStyle}
                  >
                    <div className="pr-7 text-[14px] font-medium text-ink">{question.q}</div>
                    <GlideMenu className="mt-2.5 flex flex-col gap-1" highlightClassName="inset-x-0 rounded-control bg-hover">
                      {question.options.map((option, i) => {
                        const on = picked.includes(i);
                        return (
                          <button
                            key={option}
                            type="button"
                            data-menu-row
                            aria-pressed={on}
                            tabIndex={active ? 0 : -1}
                            onClick={() => { if (active) toggle(i); }}
                            className="relative z-10 flex items-center gap-1.5 rounded-control pl-1 pr-2 py-1 text-left transition-colors duration-100"
                          >
                            <span
                              className={`flex size-4 shrink-0 items-center justify-center transition-colors duration-200
                                ${question.type === "radio" ? "rounded-full" : "rounded-[5px]"}
                                ${on ? "bg-ink text-canvas" : "shadow-[inset_0_0_0_1.5px_var(--line-strong)] text-transparent"}`}
                            >
                              {question.type === "radio" ? (
                                <span className="size-1.5 rounded-full bg-canvas transition-transform duration-200" style={{ transform: on ? "scale(1)" : "scale(0)" }} />
                              ) : (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                              )}
                            </span>
                            <span className={`text-[13px] leading-none transition-colors duration-200 ${on ? "text-ink" : "text-ink-2"}`}>
                              {option}
                            </span>
                          </button>
                        );
                      })}
                      {custom && (
                        <label data-menu-row className="relative z-10 flex items-center gap-1.5 rounded-control pl-1 pr-2 py-1 transition-colors duration-100">
                          <input
                            value={custom_[qIdx] ?? ""}
                            tabIndex={active ? 0 : -1}
                            onChange={(event) => {
                              if (!active || disabled) return;
                              setCustom((current) => ({ ...current, [qIdx]: event.target.value }));
                              if (question.type === "radio") setAnswers((current) => ({ ...current, [qIdx]: [] }));
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" && hasAnswer) {
                                event.preventDefault();
                                advance();
                              }
                            }}
                            placeholder={t.customPlaceholder}
                            aria-label="Custom answer"
                            className="min-w-0 flex-1 bg-transparent pl-1.5 text-[13px] text-ink outline-none placeholder:text-ink-3"
                          />
                        </label>
                      )}
                    </GlideMenu>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="primitive-card-footer flex items-center justify-between gap-3">
          <div className="flex items-center gap-1 text-ink-3">
            <button
              type="button"
              aria-label="Previous question"
              disabled={qi <= 0}
              onClick={() => goTo(qi - 1)}
              className="flex size-[18px] items-center justify-center rounded-[5px] transition-colors duration-100 enabled:hover:text-ink disabled:opacity-30"
            >
              <Ico size={14} path={<path d="M18 15l-6-6-6 6" />} />
            </button>
            <span className="inline-flex items-center text-[12px] font-medium tabular-nums text-ink-3" style={{ letterSpacing: "-0.1px", lineHeight: 1 }}>
              <RollingDigits value={`${qi + 1} / ${questions.length}`} />
            </span>
            <button
              type="button"
              aria-label="Next question"
              disabled={last}
              onClick={() => goTo(qi + 1)}
              className="flex size-[18px] items-center justify-center rounded-[5px] transition-colors duration-100 enabled:hover:text-ink disabled:opacity-30"
            >
              <Ico size={14} path={<path d="M6 9l6 6 6-6" />} />
            </button>
          </div>

          <div className="-mr-0.5 flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => {
                if (!last) {
                  goTo(qi + 1);
                  return;
                }
                // 📖 Kandown embedding: skipping the last question hands the
                // decision to the caller (the chat drops the card) instead of
                // collapsing to the demo's "Open approval" button.
                if (onSkip) onSkip();
                else setOpen(false);
              }}
            >
              {t.skip}
            </Button>
            <Button variant="accent" size="sm" disabled={disabled || !hasAnswer} onClick={advance}>
              {last ? t.send : t.continue}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
