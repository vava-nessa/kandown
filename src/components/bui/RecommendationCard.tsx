/**
 * @file Recommendation card from BeautifulUI
 * @description Faithful port of the BeautifulUI RecommendationCard
 * (beautifului.dev, MIT): the card holds its shape, pressing
 * "Alternatives" opens the options drawer, picking one promotes it and
 * the primary action confirms. Written against the scoped `.bui` tokens
 * from styles/beautifului.css.
 *
 * 📖 Kandown embedding (round 7): passing `title` (or wiring `onAccept` /
 * `onDismiss`) switches the card to external mode: the headline carries the
 * proposed action, the alternatives drawer is hidden (a chat proposal has
 * none) and the footer shows the confidence meter plus Dismiss and Accept.
 * `signal` drives the meter (0 to 3, default 2), `disabled` freezes the
 * buttons while the turn streams. Without these props the demo card (three
 * alternatives, drawer, accepted state) is untouched.
 *
 * @exports RecommendationCard
 * @exports RecommendationOption
 * @exports RecommendationLabels
 * @see src/components/bui/gallery/CardsSection.tsx
 */

import { useState } from "react";

/* RECOMMENDATION CARD: BeautifulUI (beautifului.dev, MIT).
 * The card holds its shape. Pressing "Alternatives" opens the
 * options drawer; picking one promotes it. The primary action confirms. */

export type RecommendationOption = {
  key: string;
  body: string;
  short: string;
  signal: number;
  tone: string;
  label: string;
  cta: string;
};

export type RecommendationLabels = {
  title: string;
  alternatives: string;
  otherOptions: string;
  accepted: string;
  /** 📖 Kandown embedding: quiet dismiss action of the external card. */
  dismiss: string;
  /** 📖 Kandown embedding: primary action of the external card. */
  accept: string;
};

const DEFAULT_LABELS: RecommendationLabels = {
  title: "Want me to place this restock order?",
  alternatives: "Alternatives",
  otherOptions: "Other options",
  accepted: "Accepted",
  dismiss: "Dismiss",
  accept: "Accept",
};

function Meter({ signal, tone }: { signal: number; tone: string }) {
  return (
    <span className="flex items-end gap-0.5">
      {[0, 1, 2].map((bar) => (
        <span
          key={bar}
          className="w-1 rounded-full transition-colors duration-300"
          style={{ height: 10, background: bar < signal ? tone : "hsl(var(--line-strong))" }}
        />
      ))}
    </span>
  );
}

const OPTIONS: RecommendationOption[] = [
  {
    key: "high",
    body: "Reorder waffle cones from Cone King with a 7-day lead time.",
    short: "Reorder from Cone King · 7-day lead",
    signal: 3,
    tone: "hsl(var(--green))",
    label: "High confidence",
    cta: "Accept",
  },
  {
    key: "review",
    body: "Switch vanilla to Vanilla Madagascar for peak season.",
    short: "Switch to Vanilla Madagascar",
    signal: 2,
    tone: "hsl(var(--orange))",
    label: "Needs review",
    cta: "Configure",
  },
  {
    key: "none",
    body: "Fall back to a full restock across every SKU.",
    short: "Full restock across every SKU",
    signal: 0,
    tone: "hsl(var(--ink-3))",
    label: "No signal",
    cta: "Accept full restock",
  },
];

export default function RecommendationCard({
  options = OPTIONS,
  labels,
  title,
  body,
  signal,
  disabled = false,
  onAccept,
  onDismiss,
}: {
  options?: RecommendationOption[];
  labels?: Partial<RecommendationLabels>;
  /** 📖 Kandown embedding: the proposed action, rendered as the headline. */
  title?: string;
  /** 📖 Kandown embedding: optional supporting paragraph under the headline. */
  body?: string;
  /** 📖 Kandown embedding: confidence meter bars, 0 to 3 (default 2). */
  signal?: number;
  /** 📖 Kandown embedding: freezes the actions while the turn streams. */
  disabled?: boolean;
  /** 📖 Kandown embedding: fired by the primary action. */
  onAccept?: () => void;
  /** 📖 Kandown embedding: fired by the quiet dismiss action. */
  onDismiss?: () => void;
  variant?: string;
} = {}) {
  const t = { ...DEFAULT_LABELS, ...labels };
  const [selected, setSelected] = useState(0);
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);

  // 📖 External (chat) mode: a single synthetic option carries the meter and
  // the actions; the alternatives drawer has nothing to list.
  const external = title !== undefined || body !== undefined || onAccept !== undefined || onDismiss !== undefined;
  const active: RecommendationOption = external
    ? {
        key: "external",
        body: body ?? "",
        short: title ?? "",
        signal: signal ?? 2,
        tone: "hsl(var(--orange))",
        label: t.title,
        cta: t.accept,
      }
    : options[selected];
  const others = external
    ? []
    : options.map((o, i) => ({ o, i })).filter(({ i }) => i !== selected);
  const headline = external ? (title ?? t.title) : t.title;

  return (
    <div className="w-full max-w-95 overflow-hidden rounded-card bg-surface shadow-card">
      <div className="primitive-card-pad">
        <span className="text-[14px] font-medium text-ink">
          {headline}
        </span>
        {active.body !== "" && (
          <p
            key={active.key}
            className="mt-1.5 min-h-12 text-[13px] leading-relaxed text-ink-2"
            style={{ animation: "fade-in 180ms ease-out both" }}
          >
            {active.body}
          </p>
        )}
      </div>

      {!external && (
        <div
          className="grid transition-[grid-template-rows,opacity] duration-300"
          style={{
            gridTemplateRows: open ? "1fr" : "0fr",
            opacity: open ? 1 : 0,
            transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <div className="overflow-hidden">
            <div className="border-t border-line bg-surface px-2 py-2">
              <p className="px-1.5 pb-1 text-[11px] font-medium text-ink-3">
                {t.otherOptions}
              </p>
              {others.map(({ o, i }) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => {
                    setSelected(i);
                    setAccepted(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-control px-1.5 py-1.5
                    text-left transition-colors duration-100 hover:bg-hover"
                >
                  <Meter signal={o.signal} tone={o.tone} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{o.short}</span>
                  <span className="shrink-0 text-[11px] text-ink-3">{o.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="primitive-card-footer flex items-center justify-between gap-3 bg-surface">
        <span className="flex items-center gap-2">
          <Meter signal={active.signal} tone={active.tone} />
          <span className="text-[12.5px] font-medium text-ink-2">{active.label}</span>
        </span>

        <span className="-mr-0.5 flex items-center gap-2">
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              disabled={disabled}
              className="rounded-control px-2.5 py-1 text-[12.5px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink disabled:opacity-50"
            >
              {t.dismiss}
            </button>
          )}
          {!external && (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((current) => !current)}
              className="rounded-control px-2.5 py-1 text-[12.5px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink"
            >
              {t.alternatives}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setAccepted(true);
              onAccept?.();
            }}
            disabled={accepted || disabled}
            className="rounded-control bg-accent px-2.5 py-1 text-[12.5px] font-medium text-white shadow-btn transition-all duration-150 hover:brightness-105 disabled:opacity-60"
          >
            {accepted ? t.accepted : active.cta}
          </button>
        </span>
      </div>
    </div>
  );
}
