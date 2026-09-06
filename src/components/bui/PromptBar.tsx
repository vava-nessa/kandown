/**
 * @file Prompt bar of the BeautifulUI chat kit
 * @description Faithful port of the official BeautifulUI PromptBar
 * (beautifului.dev, MIT): a composer with real controls, an attach menu,
 * @ data-source and / command menus, a model picker, dictation and send.
 * Typing @ or / opens the menus; arrows + Enter pick a row. The demo prop
 * drives a self-running walkthrough that yields on any user interaction.
 * Selecting the flagship model fires a one-shot rainbow sweep rendered by
 * the glimm package (the same WebGL shader the site uses).
 *
 * Port adaptations: "use client" removed (Vite), and the eq-bounce
 * keyframes referenced by the dictation equalizer are carried inline in a
 * <style> block because the scoped port cannot edit styles/beautifului.css
 * (on beautifului.dev they live in the global stylesheet).
 *
 * 📖 Kandown embedding (round 7): passing `value` switches the bar to
 * external mode (demo={false} is implied). The composer then renders the
 * caller's rows and state instead of the demo fixtures: `atRows` /
 * `slashRows` feed the @ and / menus (already filtered by the embedder),
 * `onPickAt` / `onPickSlash` handle the picks (the token commit stays
 * here), `models` / `model` / `onModelChange` drive the model menu,
 * `turnActive` / `onStop` swap the send square for a stop square,
 * `onSkillClick` replaces the dictation button, `leftSlot` hosts the
 * Steer/Queue control and `toolbar` a slim row inside the composer.
 * Without `value` the bar is the untouched demo (gallery unchanged).
 *
 * @exports PromptBar (default) : the composer, variant "Rounded" | "Pill"
 * @exports PromptBarRow, PromptBarModel, PromptBarLabels
 * @see src/components/bui/gallery/ChatSection.tsx
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createShader, playSweep, accentChain, ACCENTS } from "glimm";

/* The built-in "prism" palette is only cyan→indigo→magenta, so a sweep
 * reads as blue/purple. Build a true full-spectrum rainbow instead. */
const RAINBOW = accentChain([
  ACCENTS.red,
  ACCENTS.orange,
  ACCENTS.yellow,
  ACCENTS.green,
  ACCENTS.cyan,
  ACCENTS.blue,
  ACCENTS.purple,
]);

/* ─────────────────────────────────────────────────────────
 * PROMPT BAR
 * A composer with real controls: attach, @ data sources,
 * / commands, a model picker, dictation, and send.
 * Type @ or / to open the menus; ↑↓ + Enter to pick.
 * Variants: Rounded (card radius) · Pill (full radius).
 * ───────────────────────────────────────────────────────── */

function Icon({ children, size = 15, strokeWidth = 1.8 }: { children: React.ReactNode; size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const GLYPHS: Record<string, React.ReactNode> = {
  clip: <path d="m21.4 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  layers: <g><path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5M2 12l10 5 10-5" /></g>,
  globe: <g><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></g>,
};

/* real product marks, inline so the file stays self-contained */
const BRANDS: Record<string, React.ReactNode> = {
  figma: (
    <svg width="11" height="16" viewBox="0 0 38 57" aria-hidden="true">
      <path d="M9.5 57A9.5 9.5 0 0 0 19 47.5V38H9.5a9.5 9.5 0 0 0 0 19z" fill="#0ACF83" />
      <path d="M0 28.5A9.5 9.5 0 0 1 9.5 19H19v19H9.5A9.5 9.5 0 0 1 0 28.5z" fill="#A259FF" />
      <path d="M0 9.5A9.5 9.5 0 0 1 9.5 0H19v19H9.5A9.5 9.5 0 0 1 0 9.5z" fill="#F24E1E" />
      <path d="M19 0h9.5a9.5 9.5 0 1 1 0 19H19V0z" fill="#FF7262" />
      <path d="M38 28.5a9.5 9.5 0 1 1-19 0 9.5 9.5 0 0 1 19 0z" fill="#1ABCFE" />
    </svg>
  ),
  slack: (
    <svg width="15" height="15" viewBox="0 0 127 127" aria-hidden="true">
      <path d="M27.2 80c0 7.3-5.9 13.2-13.2 13.2C6.7 93.2.8 87.3.8 80c0-7.3 5.9-13.2 13.2-13.2h13.2V80zm6.6 0c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2v33c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V80z" fill="#E01E5A" />
      <path d="M47 27.2c-7.3 0-13.2-5.9-13.2-13.2C33.8 6.7 39.7.8 47 .8c7.3 0 13.2 5.9 13.2 13.2v13.2H47zm0 6.7c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H13.9C6.6 60.3.7 54.4.7 47.1c0-7.3 5.9-13.2 13.2-13.2H47z" fill="#36C5F0" />
      <path d="M99.9 47.1c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H99.9V47.1zm-6.6 0c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V13.9C66.9 6.6 72.8.7 80.1.7c7.3 0 13.2 5.9 13.2 13.2v33.2z" fill="#2EB67D" />
      <path d="M80.1 99.8c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V99.8h13.2zm0-6.6c-7.3 0-13.2-5.9-13.2-13.2 0-7.3 5.9-13.2 13.2-13.2h33.1c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H80.1z" fill="#ECB22E" />
    </svg>
  ),
  gmail: (
    <svg width="15" height="12" viewBox="0 0 256 193" aria-hidden="true">
      <path d="M58.182 192.05V93.14L27.507 65.077 0 49.504v125.091c0 9.658 7.825 17.455 17.455 17.455h40.727Z" fill="#4285F4" />
      <path d="M197.818 192.05h40.727c9.659 0 17.455-7.826 17.455-17.455V49.505l-31.156 17.837-27.026 25.798v98.91Z" fill="#34A853" />
      <path d="m58.182 93.14-4.174-38.647 4.174-36.989L128 69.868l69.818-52.364 4.669 34.992-4.669 40.644L128 145.504 58.182 93.14Z" fill="#EA4335" />
      <path d="M197.818 17.504V93.14L256 49.504V26.231c0-21.585-24.64-33.89-41.89-20.945l-16.292 12.218Z" fill="#FBBC04" />
      <path d="m0 49.504 26.759 20.07L58.182 93.14V17.504L41.89 5.286C24.61-7.66 0 4.646 0 26.23v23.273Z" fill="#C5221F" />
    </svg>
  ),
};

type Source = {
  key: string;
  name: string;
  desc: string;
  glyph?: string;
  brand?: string;
  attach?: boolean;
  connect?: boolean;
};

const SOURCES: Source[] = [
  { key: "attach", name: "Add photos & files", desc: "Upload from your computer", glyph: "clip", attach: true },
  { key: "scoop", name: "Scoop Data", desc: "Sales & churn metrics", glyph: "chart" },
  { key: "flavors", name: "Flavor records", desc: "26 makers, tags, links", glyph: "layers" },
  { key: "web", name: "Web search", desc: "Real-time news and info", glyph: "globe" },
  { key: "figma", name: "Figma", desc: "Design-to-code workflows", brand: "figma" },
  { key: "slack", name: "Slack", desc: "Read and manage Slack", brand: "slack" },
  { key: "gmail", name: "Gmail", desc: "Read and manage Gmail", brand: "gmail", connect: true },
];

const COMMANDS = [
  { key: "compare", name: "/compare", desc: "Flavor vs. last summer" },
  { key: "churn-plan", name: "/churn-plan", desc: "Draft a churn schedule" },
  { key: "restock", name: "/restock", desc: "Build a reorder list" },
  { key: "draft-email", name: "/draft-email", desc: "Write a supplier email" },
  { key: "summarize", name: "/summarize", desc: "Digest the thread so far" },
];

const MODELS = [
  { key: "sprinkles-5", name: "Sprinkles 5", tag: "Flagship" },
  { key: "vanilla-1", name: "Vanilla 1", tag: "Basic" },
  { key: "freezer-burn", name: "Freezer Burn 0.4", tag: "Stale" },
];

/* 📖 Kandown embedding: one menu row of the external @ or / menu. `name` is
 * the row title WITHOUT the @ (the component commits "@name " on pick) and
 * WITH the leading / for slash rows (picking removes the token and calls
 * onPickSlash). Rows arrive already filtered; the component does not filter
 * them again. */
export type PromptBarRow = {
  key: string;
  name: string;
  desc: string;
  /** Renders a quiet marker (skills that ask questions). */
  interactive?: boolean;
};

/* 📖 One entry of the external model menu. An empty key means "harness
 * default": nothing is forwarded on session start. */
export type PromptBarModel = { key: string; name: string; tag: string };

export type PromptBarLabels = {
  send: string;
  stop: string;
  model: string;
  sources: string;
  skills: string;
  atHint: string;
  slashHint: string;
  interactive: string;
};

const DEFAULT_LABELS: PromptBarLabels = {
  send: "Send",
  stop: "Stop",
  model: "Choose model",
  sources: "Add attachments and sources",
  skills: "Skills",
  atHint: "Type to search sources & files",
  slashHint: "Type to search commands",
  interactive: "Interactive",
};

const FILES = ["flavor-chart.png", "summer-menu.pdf", "pos-export.csv"];
const DICTATION = "Compare pistachio weekends to last summer";

/* self-running demo: walk the @ menu, then the / menu, and repeat.
 * Any pointer or key interaction hands control to the user. */
const AUTO_STEPS: {
  draft: string;
  active?: number;
  connect?: boolean;
  modelOpen?: boolean;
  model?: string;
  hold: number;
}[] = [
  { draft: "", connect: false, model: "vanilla-1", hold: 1100 },
  { draft: "@", active: 0, hold: 900 },
  { draft: "@", active: 1, hold: 620 },
  { draft: "@", active: 4, hold: 620 },
  { draft: "@", active: 6, hold: 700 },
  { draft: "@", active: 6, connect: true, hold: 1000 },
  { draft: "", hold: 700 },
  { draft: "/", active: 0, hold: 900 },
  { draft: "/", active: 1, hold: 620 },
  { draft: "/", active: 3, hold: 1000 },
  { draft: "", hold: 800 },
  // open the model picker and upgrade to the flagship → rainbow sweep
  { draft: "", modelOpen: true, hold: 1200 },
  { draft: "", model: "sprinkles-5", hold: 2400 },
  { draft: "", hold: 900 },
];

/* the last @word or /word being typed, if any */
function parseToken(draft: string): { kind: "at" | "slash"; query: string; start: number } | null {
  const match = /(^|\s)([@/])([\w-]*)$/.exec(draft);
  if (!match) return null;
  return {
    kind: match[2] === "@" ? "at" : "slash",
    query: match[3].toLowerCase(),
    start: match.index + match[1].length,
  };
}

export default function PromptBar({
  variant = "Rounded",
  demo = true,
  tall = false,
  placeholder,
  onSend,
  value,
  onValueChange,
  onCaretChange,
  atRows,
  slashRows,
  onPickAt,
  onPickSlash,
  models,
  model,
  onModelChange,
  disabled = false,
  sendDisabled = false,
  turnActive = false,
  onStop,
  onSkillClick,
  leftSlot,
  toolbar,
  menuHeading,
  menuHint,
  menuOverride = false,
  onDismissMenu,
  labels,
}: {
  variant?: string;
  /** the self-running walkthrough; turn off when embedding in a real surface */
  demo?: boolean;
  /** hero sizing: a multi-line input with controls on their own row */
  tall?: boolean;
  placeholder?: string;
  onSend?: (text: string) => void;
  /** 📖 External mode switch: the controlled draft. Absent keeps the demo
   * bar self-contained. */
  value?: string;
  /** 📖 Fires on every draft change (value + caret). This is the ONLY way the
   * child pushes text: no other handler may echo a value, or a stale closure
   * can resurrect a just-cleared draft. */
  onValueChange?: (value: string, caret: number) => void;
  /** 📖 Fires on caret moves only (selection, cursor keys). The embedder pairs
   * the caret with the value it already owns: echoing a value here raced the
   * commit that clears a focused textarea on Enter-to-send and refilled the
   * draft after every send. */
  onCaretChange?: (caret: number) => void;
  /** 📖 Rows of the @ menu (tasks), already filtered by the embedder. */
  atRows?: PromptBarRow[];
  /** 📖 Rows of the / menu (skills), already filtered by the embedder. */
  slashRows?: PromptBarRow[];
  /** 📖 Fired after an @ pick; the token commit ("@id ") already happened. */
  onPickAt?: (row: PromptBarRow) => void;
  /** 📖 Fired after a / pick; the token was removed from the draft. */
  onPickSlash?: (row: PromptBarRow) => void;
  /** 📖 Entries of the model menu; empty hides the model button. */
  models?: PromptBarModel[];
  /** 📖 Selected model key ("" = harness default). */
  model?: string;
  /** 📖 Fired when a model row is picked. */
  onModelChange?: (key: string) => void;
  /** 📖 Disables the textarea and the actions (no daemon). */
  disabled?: boolean;
  /** 📖 Extra send gate (a POST is already in flight). */
  sendDisabled?: boolean;
  /** 📖 True while a turn is live: the send square becomes a stop square
   * and Enter stops submitting. */
  turnActive?: boolean;
  /** 📖 Fired by the stop square. */
  onStop?: () => void;
  /** 📖 Replaces the dictation button (the embedder's skills surface). */
  onSkillClick?: () => void;
  /** 📖 Rendered in the control row's free column (Steer/Queue). Forces the
   * two-row layout so the control has its own row under the text. */
  leftSlot?: ReactNode;
  /** 📖 Slim control row rendered inside the composer, above the text. */
  toolbar?: ReactNode;
  /** 📖 Optional heading at the top of the @ // menu (pick-a-task mode). */
  menuHeading?: string;
  /** 📖 Replaces the menu footer hint. */
  menuHint?: string;
  /** 📖 Keeps the @ menu open regardless of the draft token (pick-a-task
   * mode); picking a row then calls onPickAt without touching the draft. */
  menuOverride?: boolean;
  /** 📖 Fired on Escape while a menu is open (pick-a-task dismissal). */
  onDismissMenu?: () => void;
  labels?: Partial<PromptBarLabels>;
}) {
  const l = { ...DEFAULT_LABELS, ...labels };
  const external = value !== undefined;
  const pill = variant === "Pill";
  const [internalDraft, setInternalDraft] = useState("");
  const draft = external ? value : internalDraft;
  const [dismissed, setDismissed] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [demoModel, setDemoModel] = useState(MODELS[1]);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [active, setActive] = useState(0);
  const [listening, setListening] = useState(false);
  const [auto, setAuto] = useState(demo);
  const [autoStep, setAutoStep] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const wide = expanded || tall || (external && leftSlot !== undefined);
  const [rowBox, setRowBox] = useState<{ top: number; height: number } | null>(null);
  const [engaged, setEngaged] = useState(false);
  const [modelBox, setModelBox] = useState<{ top: number; height: number } | null>(null);
  const [modelHovered, setModelHovered] = useState<number | null>(null);
  const [modelMenuLeft, setModelMenuLeft] = useState(0);
  const [modelMenuBottom, setModelMenuBottom] = useState(0);
  const composerAnchorRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const modelRef = useRef<HTMLButtonElement>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const modelRowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const glimmRef = useRef<HTMLCanvasElement>(null);
  const shaderRef = useRef<ReturnType<typeof createShader> | null>(null);
  const sweepingRef = useRef(false);

  /* 📖 Single draft mutation path: external mode forwards the new value and
   * caret to the embedder instead of holding the truth locally. */
  const changeDraft = (next: string, caret?: number) => {
    if (external) onValueChange?.(next, caret ?? next.length);
    else setInternalDraft(next);
  };

  /* hand control to the user: stop the demo loop, and when they aim at
   * the input itself, clear the demo's leftover draft for a clean start */
  const takeOver = (event: { target: EventTarget | null }) => {
    if (!auto) return;
    setAuto(false);
    if (event.target === inputRef.current) setInternalDraft("");
  };

  const token = dismissed && !menuOverride ? null : parseToken(draft);
  const menu: "at" | "slash" | null = menuOverride
    ? "at"
    : plusOpen ? "at" : token?.kind ?? null;
  const query = plusOpen ? "" : token?.query ?? "";

  /* 📖 Demo mode keeps filtering its fixtures; external rows arrive already
   * filtered, and the menu hides entirely when nothing matches (the chat
   * never showed a "no matches" dropdown). */
  const rows: { key: string; name: string; desc: string; interactive?: boolean }[] =
    external
      ? menu === "at" ? atRows ?? [] : slashRows ?? []
      : menu === "at"
        ? SOURCES.filter((s) => s.name.toLowerCase().includes(query))
        : menu === "slash"
          ? COMMANDS.filter((c) => c.name.slice(1).startsWith(query))
          : [];
  const menuVisible = menu !== null && (external ? Boolean(menuOverride) || rows.length > 0 : true);
  const footerHint = external
    ? menuHint ?? (menu === "at" ? l.atHint : l.slashHint)
    : menu === "at" ? "Type to search sources & files" : "Type to search commands";

  useEffect(() => {
    setActive(0);
    setEngaged(false);
    // 📖 rows.length too: in external pick-a-task mode the embedder filters
    // the rows without any token query changing, so a refinement must still
    // point the keyboard back at the first row.
  }, [menu, query, rows.length]);

  /* a single highlight glides to the active row instead of each row
   * toggling its own background: matches the gliding pill in the nav */
  useLayoutEffect(() => {
    const target = rowRefs.current[active];
    if (target) setRowBox({ top: target.offsetTop, height: target.offsetHeight });
  }, [menu, query, active, connected, rows.length]);

  /* 📖 Model list: the demo fixtures, or the embedder's entries (empty list
   * hides the model button entirely). */
  const modelList: PromptBarModel[] = external ? models ?? [] : MODELS;
  const selectedModelKey = external ? model ?? "" : demoModel.key;
  const selectedModel: PromptBarModel = modelList.find((m) => m.key === selectedModelKey)
    ?? { key: selectedModelKey, name: selectedModelKey || l.model, tag: "" };

  /* same gliding highlight in the model menu: floats to the hovered
   * row, falling back to the currently-selected model */
  const modelIndex = modelList.findIndex((m) => m.key === selectedModel.key);
  useLayoutEffect(() => {
    if (!modelOpen) return;
    const target = modelRowRefs.current[modelHovered ?? modelIndex];
    if (target) setModelBox({ top: target.offsetTop, height: target.offsetHeight });
  }, [modelOpen, modelHovered, modelIndex]);

  /* The menu is outside the clipped composer, so align it to the model
   * trigger by measurement instead of pinning it to the far-right edge. */
  useLayoutEffect(() => {
    if (!modelOpen || !composerAnchorRef.current || !modelRef.current) return;
    const anchorRect = composerAnchorRef.current.getBoundingClientRect();
    const triggerRect = modelRef.current.getBoundingClientRect();
    setModelMenuLeft(Math.max(0, Math.min(triggerRect.left - anchorRect.left, anchorRect.width - 176)));
    setModelMenuBottom(anchorRect.bottom - triggerRect.top + 8);
  }, [modelOpen, wide, selectedModel.name]);

  useEffect(() => {
    if (!modelOpen) setModelHovered(null);
  }, [modelOpen]);

  /* Build the shader with a pinned hue phase. createShader seeds its
   * internal hueShift from Math.random(), which made the sweep a different
   * colour on every reload: pin it so the rainbow is identical each time. */
  const makeShader = () => {
    const canvas = glimmRef.current;
    if (!canvas) return null;
    const random = Math.random;
    Math.random = () => 0;
    try {
      return createShader({
        canvas,
        palette: RAINBOW,
        direction: "ltr",
        bandTight: 10,
        swellAmount: 0.85,
      });
    } finally {
      Math.random = random;
    }
  };

  /* Glimm shader lives inside the composer, invisible at rest. Selecting
   * the flagship model fires a one-shot rainbow sweep across the interior. */
  useEffect(() => {
    shaderRef.current = makeShader();
    return () => {
      shaderRef.current?.destroy();
      shaderRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const celebrate = () => {
    if (sweepingRef.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Recreate the shader per sweep so uTime restarts at 0: the hue phase
    // (which drifts with time) is then identical on every trigger.
    shaderRef.current?.destroy();
    const shader = makeShader();
    shaderRef.current = shader;
    if (!shader) return;
    sweepingRef.current = true;
    const sweep = playSweep(shader, {
      palette: RAINBOW,
      direction: "ltr",
      sweepMs: 570,
      outroMs: 80,
      peakAlpha: 1.3,
      bandTight: 10,
      brightness: 1.4,
      swellAmount: 1,
      waveSpeed: 1.8,
      easing: "easeOutExpo",
    });
    sweep.done.finally(() => {
      sweepingRef.current = false;
    });
  };

  const selectModel = (next: PromptBarModel) => {
    // 📖 External mode forwards the key; the demo keeps its local state and
    // its flagship rainbow sweep.
    if (external) {
      onModelChange?.(next.key);
      setModelOpen(false);
      return;
    }
    setDemoModel(next);
    setModelOpen(false);
    if (next.key === "sprinkles-5") celebrate();
  };

  /* autoplay: apply the current step, then advance after its hold */
  useEffect(() => {
    if (!auto) return;
    const step = AUTO_STEPS[autoStep % AUTO_STEPS.length];
    setInternalDraft(step.draft);
    if (step.active !== undefined) setActive(step.active);
    if (step.connect !== undefined) setConnected(step.connect);
    if (step.modelOpen !== undefined) setModelOpen(step.modelOpen);
    if (step.model) {
      const next = MODELS.find((m) => m.key === step.model);
      if (next) selectModel(next);
    }
    const t = setTimeout(() => setAutoStep((s) => s + 1), step.hold);
    return () => clearTimeout(t);
  }, [auto, autoStep]);

  /* dictation resolves after a beat, like a real transcript landing */
  useEffect(() => {
    if (!listening) return;
    const t = setTimeout(() => {
      setInternalDraft((current) => (current ? `${current.trimEnd()} ${DICTATION}` : DICTATION));
      setListening(false);
      inputRef.current?.focus();
    }, 2200);
    return () => clearTimeout(t);
  }, [listening]);

  /* Move wrapped text above the controls, then grow to a compact maximum. */
  useLayoutEffect(() => {
    const input = inputRef.current;
    const controls = controlsRef.current;
    const measure = measureRef.current;
    const modelButton = modelRef.current;
    if (!input || !controls || !measure) return;

    const fixedControlsWidth = 28 * 3 + (modelButton?.offsetWidth ?? 0);
    const inlineGaps = 4 * 4;
    const inlineInputWidth = controls.clientWidth - fixedControlsWidth - inlineGaps;
    const needsFullWidth = draft.includes("\n") || measure.offsetWidth + 8 > inlineInputWidth;
    if (needsFullWidth !== expanded) {
      setExpanded(needsFullWidth);
    }

    const minHeight = 28;
    const maxHeight = 100;
    input.style.height = "0px";
    const contentHeight = input.scrollHeight;
    input.style.height = `${Math.min(Math.max(contentHeight, minHeight), maxHeight)}px`;
    input.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
  }, [draft, expanded]);

  /* clicking anywhere outside the composer closes the open menus */
  useEffect(() => {
    if (!modelOpen && !plusOpen) return;
    const close = (event: PointerEvent) => {
      if (!(event.target as Element).closest("[data-promptbar]")) {
        setModelOpen(false);
        setPlusOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [modelOpen, plusOpen]);

  const closeMenus = () => {
    setPlusOpen(false);
    setModelOpen(false);
  };

  const pick = (row: PromptBarRow) => {
    if (external) {
      if (menu === "at") {
        // 📖 Pick-a-task mode: the caller owns the outcome, the draft stays
        // untouched. Mention mode commits "@name " in place of the token,
        // exactly like the demo does.
        if (!menuOverride) {
          const prefix = token ? draft.slice(0, token.start) : draft;
          changeDraft(`${prefix}@${row.name} `);
        }
        onPickAt?.(row);
      } else {
        // 📖 A slash token did its job: remove it, then let the caller launch.
        changeDraft(token ? draft.slice(0, token.start) : draft);
        onPickSlash?.(row);
      }
      setPlusOpen(false);
      setDismissed(false);
      inputRef.current?.focus();
      return;
    }
    const source = SOURCES.find((s) => s.key === row.key);
    if (source?.attach) {
      setAttachments((current) => [...current, FILES[current.length % FILES.length]]);
      if (token) setInternalDraft(draft.slice(0, token.start));
    } else if (menu === "at") {
      setInternalDraft(`${token ? draft.slice(0, token.start) : draft}@${row.name} `);
    } else {
      setInternalDraft(`${token ? draft.slice(0, token.start) : draft}${row.name} `);
    }
    setPlusOpen(false);
    setDismissed(false);
    inputRef.current?.focus();
  };

  const canSend = external
    ? draft.trim().length > 0 && !disabled && !sendDisabled
    : draft.trim().length > 0 || attachments.length > 0;
  const send = () => {
    if (!canSend) return;
    onSend?.(draft.trim());
    changeDraft("");
    setAttachments([]);
    closeMenus();
  };

  return (
    <div
      data-promptbar
      className={demo ? "flex min-h-[384px] w-full max-w-105 flex-col justify-end pb-8" : "w-full"}
      onPointerDownCapture={takeOver}
      onKeyDownCapture={takeOver}
    >
      {/* 📖 The dictation equalizer animates with eq-bounce, which lives in
          the BeautifulUI global stylesheet on the site. The scoped port
          carries the keyframes inline because styles/beautifului.css only
          ships pixel-on, shimmer-text, fade-in, fade-up and pop-in. */}
      <style>{"@keyframes eq-bounce{0%,to{transform:scaleY(.35)}50%{transform:scaleY(1)}}"}</style>
      {/* composer is the anchor: menus grow up from its top edge */}
      <div ref={composerAnchorRef} className="relative">
      {/* ── @ / slash menu ─────────────────────────────── */}
      {menuVisible && (
        <div
          onMouseLeave={() => setEngaged(false)}
          className="absolute inset-x-0 bottom-full z-10 mb-2 rounded-[10px] bg-surface p-1 shadow-raised"
          style={{ animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "bottom center" }}
        >
          {/* 📖 Optional heading (pick-a-task mode announces what is picked) */}
          {menuHeading && (
            <p className="truncate px-2 pb-1 pt-1.5 text-[11px] font-medium text-ink-3">{menuHeading}</p>
          )}
          {/* single gliding highlight: appears once a row is hovered */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-1 rounded-[6px] bg-hover"
            style={{
              top: rowBox?.top ?? 0,
              height: rowBox?.height ?? 0,
              opacity: rowBox && engaged && rows.length > 0 ? 1 : 0,
              transition:
                "top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease",
            }}
          />
          {rows.map((row, i) => {
            const source = external ? undefined : menu === "at" ? SOURCES.find((s) => s.key === row.key) : undefined;
            return (
              <button
                key={row.key}
                type="button"
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => {
                  setActive(i);
                  setEngaged(true);
                }}
                onClick={() => pick(row)}
                className="relative z-10 flex h-9 w-full items-center gap-2.5 rounded-[6px] px-2 text-left"
              >
                {source && (
                  <span className="flex size-5.5 shrink-0 items-center justify-center text-ink-2">
                    {source.brand ? BRANDS[source.brand] : <Icon size={15}>{GLYPHS[source.glyph ?? "clip"]}</Icon>}
                  </span>
                )}
                <span className="shrink-0 text-[12.5px] font-medium text-ink">
                  {row.name}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">{row.desc}</span>
                {row.interactive && (
                  <span className="shrink-0 rounded-full bg-inset px-1.5 py-0.5 text-[10px] font-medium text-ink-3">
                    {l.interactive}
                  </span>
                )}
                {source?.connect && (
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(event) => {
                      event.stopPropagation();
                      setConnected((current) => !current);
                    }}
                    className={`shrink-0 text-[12px] font-medium transition-colors duration-100 ${
                      connected ? "text-green" : "text-accent-ink hover:underline"
                    }`}
                  >
                    {connected ? "Connected" : "Connect"}
                  </span>
                )}
              </button>
            );
          })}
          {rows.length === 0 && (
            <div className="flex h-9 items-center px-2 text-[12px] text-ink-3">
              No matches for “{query}”
            </div>
          )}
          <div className="mt-1 border-t border-line px-2 pt-1.5 pb-1 text-[11px] text-ink-3">
            {footerHint}
          </div>
        </div>
      )}

      {/* ── model menu ─────────────────────────────────── */}
      {modelOpen && (
        <div
          onMouseLeave={() => setModelHovered(null)}
          className="absolute z-10 w-44 rounded-[10px] bg-surface p-1 shadow-raised"
          style={{ left: modelMenuLeft, bottom: modelMenuBottom, animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "bottom left" }}
        >
          {/* single gliding highlight: floats to the hovered / selected row */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-1 rounded-[6px] bg-hover"
            style={{
              top: modelBox?.top ?? 0,
              height: modelBox?.height ?? 0,
              opacity: modelBox && modelHovered !== null ? 1 : 0,
              transition:
                "top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease",
            }}
          />
          {modelList.map((m, i) => (
            <button
              key={m.key}
              type="button"
              ref={(el) => {
                modelRowRefs.current[i] = el;
              }}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setModelHovered(i)}
              onClick={() => {
                selectModel(m);
                inputRef.current?.focus();
              }}
              className="relative z-10 flex h-7.5 w-full items-center gap-2 rounded-[6px] px-2 text-left"
            >
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">{m.name}</span>
              <span className="shrink-0 text-[11px] text-ink-3">{m.tag}</span>
              <span className={`shrink-0 text-ink ${m.key === selectedModel.key ? "" : "invisible"}`}>
                <Icon size={13} strokeWidth={2.5}><path d="M20 6L9 17l-5-5" /></Icon>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── composer ───────────────────────────────────── */}
      <div
        className={`relative isolate flex flex-col overflow-hidden border border-line bg-surface shadow-card transition-[border-color,border-radius] duration-150 focus-within:border-line-strong ${
          tall ? "gap-2.5 p-3.5" : "gap-1.5 p-1.5"
        } ${
          pill ? (attachments.length > 0 || wide ? "rounded-[24px]" : "rounded-full") : tall ? "rounded-[22px]" : "rounded-[14px]"
        }`}
      >
        {/* rainbow glimm sweep: plays across the interior on model change.
            explicit w/h: a <canvas> is a replaced element and won't stretch
            to inset-0 alone, which feeds back into the shader's ResizeObserver. */}
        <canvas
          ref={glimmRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
          style={{ borderRadius: "inherit" }}
        />
        <span
          ref={measureRef}
          aria-hidden="true"
          className="pointer-events-none absolute invisible whitespace-pre text-[13px] leading-[18px]"
        >
          {draft}
        </span>

        {toolbar && (
          <div className="flex flex-wrap items-center gap-1.5 px-2 pt-2">{toolbar}</div>
        )}

        {attachments.length > 0 && (
          <div className={`flex flex-wrap gap-1.5 pt-0.5 ${pill ? "px-1" : "px-0.5"}`}>
            {attachments.map((file, i) => (
              <span
                key={`${file}-${i}`}
                className={`flex h-6.5 items-center gap-1.5 bg-field py-1 pr-1 pl-1.5 text-[11.5px] text-ink-2 shadow-hairline ${
                  pill ? "rounded-full" : "rounded-chip"
                }`}
                style={{ animation: "pop-in 200ms cubic-bezier(0.23,1,0.32,1) both" }}
              >
                <Icon size={12}><g><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></g></Icon>
                <span className="max-w-36 truncate">{file}</span>
                <button
                  type="button"
                  aria-label={`Remove ${file}`}
                  onClick={() => setAttachments((current) => current.filter((_, j) => j !== i))}
                  className={`-my-1 flex size-6 items-center justify-center text-ink-3 transition-colors duration-100 hover:bg-line/70 hover:text-ink ${
                    pill ? "rounded-full" : "rounded-[5px]"
                  }`}
                >
                  <Icon size={10} strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12" /></Icon>
                </button>
              </span>
            ))}
          </div>
        )}

        <div
          ref={controlsRef}
          className={`grid items-end gap-x-1 gap-y-1.5 ${
            wide
              ? "grid-cols-[28px_auto_minmax(0,1fr)_28px_28px]"
              : "grid-cols-[28px_minmax(0,1fr)_auto_28px_28px]"
          }`}
        >
          <button
            type="button"
            aria-label={l.sources}
            aria-expanded={plusOpen}
            onClick={() => {
              setModelOpen(false);
              if (external) {
                // 📖 Browse tasks: seed an @ token so the mention menu opens
                // over the board; already-open means this is just a focus.
                const seed = draft.endsWith("@")
                  ? draft
                  : draft === "" || draft.endsWith(" ")
                    ? `${draft}@`
                    : `${draft} @`;
                changeDraft(seed);
                inputRef.current?.focus();
                return;
              }
              setPlusOpen((current) => !current);
              inputRef.current?.focus();
            }}
            className={`flex size-7 shrink-0 items-center justify-center justify-self-start text-ink-3 transition-[background-color,color,transform] duration-150 hover:bg-hover hover:text-ink active:scale-[0.94] ${
              pill ? "rounded-full" : "rounded-[8px]"
            } ${plusOpen ? "bg-hover text-ink" : ""} ${wide ? "col-start-1 row-start-2" : "col-start-1 row-start-1"}`}
          >
            <Icon size={16} strokeWidth={2}><path d="M12 5v14M5 12h14" /></Icon>
          </button>

          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            disabled={disabled || undefined}
            onChange={(event) => {
              changeDraft(event.target.value, event.target.selectionStart ?? undefined);
              setDismissed(false);
              setPlusOpen(false);
            }}
            onSelect={(event) => {
              // 📖 Caret only, never a value echo: a `select` event fires
              // synchronously while the embedder's clear-on-send commit is
              // still writing the DOM, and reading the value there observed
              // the pre-clear text and resurrected the just-sent draft.
              if (external) onCaretChange?.(event.currentTarget.selectionStart ?? 0);
            }}
            onKeyDown={(event) => {
              if (menuVisible && rows.length > 0) {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setEngaged(true);
                  setActive((current) => (current + (event.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length);
                  return;
                }
                if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
                  event.preventDefault();
                  pick(rows[Math.min(active, rows.length - 1)]);
                  return;
                }
              }
              if (event.key === "Escape") {
                setDismissed(true);
                closeMenus();
                onDismissMenu?.();
                return;
              }
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                // 📖 While a turn is live the square is a stop square: Enter
                // submits nothing, matching the embedder's old contract.
                if (external && turnActive) {
                  event.preventDefault();
                  return;
                }
                event.preventDefault();
                send();
              }
            }}
            placeholder={listening ? "Listening…" : placeholder ?? "Write a message…"}
            aria-label="Prompt"
            className={`${tall ? "min-h-[68px] px-2 py-2 text-[14px] leading-5" : "min-h-7 px-1 py-[5px] text-[13px] leading-[18px]"} min-w-0 w-full resize-none bg-transparent text-ink outline-none [overflow-wrap:anywhere] placeholder:text-ink-3 disabled:opacity-60 ${
              wide ? "col-span-full col-start-1 row-start-1" : "col-start-2 row-start-1"
            }`}
          />

          {/* model picker (hidden when the embedder offers no entries) */}
          {modelList.length > 0 && (
            <button
              ref={modelRef}
              type="button"
              aria-expanded={modelOpen}
              aria-label={l.model}
              onClick={() => {
                setPlusOpen(false);
                setModelOpen((current) => !current);
              }}
              className={`flex h-7 shrink-0 items-center gap-1 px-1.5 text-[12px] font-medium text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink ${
                pill ? "rounded-full" : "rounded-[8px]"
              } ${wide ? "col-start-2 row-start-2 justify-self-start" : "col-start-3 row-start-1"}`}
            >
              {selectedModel.name}
              <span className="text-ink-3">
                <Icon size={11} strokeWidth={2.4}><path d="M6 9l6 6 6-6" /></Icon>
              </span>
            </button>
          )}

          {/* 📖 Kandown embedding: the skills button takes the dictation slot;
           * the demo keeps its fake dictation. */}
          {external ? (
            onSkillClick && (
              <button
                type="button"
                aria-label={l.skills}
                title={l.skills}
                onClick={onSkillClick}
                className={`flex size-7 shrink-0 items-center justify-center text-ink-3 transition-[background-color,color,transform] duration-150 hover:bg-hover hover:text-ink active:scale-[0.94] ${
                  pill ? "rounded-full" : "rounded-[8px]"
                } ${wide ? "col-start-4 row-start-2" : "col-start-4 row-start-1"}`}
              >
                <Icon size={15} strokeWidth={2}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" /></Icon>
              </button>
            )
          ) : (
            <button
              type="button"
              aria-label={listening ? "Stop dictation" : "Start dictation"}
              aria-pressed={listening}
              onClick={() => setListening((current) => !current)}
              className={`flex size-7 shrink-0 items-center justify-center transition-[background-color,color,transform] duration-150 active:scale-[0.94] ${
                pill ? "rounded-full" : "rounded-[8px]"
              } ${listening ? "bg-accent-tint text-accent-ink" : "text-ink-3 hover:bg-hover hover:text-ink"} ${wide ? "col-start-4 row-start-2" : "col-start-4 row-start-1"}`}
            >
              {listening ? (
                <span className="flex h-3.5 items-center gap-[2.5px]">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-[2.5px] rounded-full bg-current"
                      style={{ height: "100%", animation: `eq-bounce 900ms ease-in-out ${i * 150}ms infinite` }}
                    />
                  ))}
                </span>
              ) : (
                <Icon size={15} strokeWidth={2}><g><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" /></g></Icon>
              )}
            </button>
          )}

          {/* 📖 Kandown embedding: free column in the wide layout hosts the
           * Steer/Queue delivery control (leftSlot forces the wide layout). */}
          {leftSlot && wide && (
            <div className="col-start-3 row-start-2 flex min-w-0 items-center self-center justify-self-start">
              {leftSlot}
            </div>
          )}

          {/* send: tactile square (round in the pill variant); while a turn is
           * live it becomes the stop square */}
          {external && turnActive ? (
            <button
              type="button"
              aria-label={l.stop}
              title={l.stop}
              disabled={disabled}
              onClick={() => onStop?.()}
              className={`flex size-7 shrink-0 items-center justify-center border border-line-strong bg-surface text-ink transition-[background-color,color,transform] duration-200 enabled:active:scale-[0.94] hover:border-red hover:text-red disabled:opacity-50 ${
                pill ? "rounded-full" : "rounded-[8px]"
              } ${wide ? "col-start-5 row-start-2" : "col-start-5 row-start-1"}`}
            >
              <Icon size={15} strokeWidth={2.2}><g><rect x="6.5" y="6.5" width="11" height="11" rx="1.5" /></g></Icon>
            </button>
          ) : (
            <button
              type="button"
              aria-label={l.send}
              disabled={!canSend}
              onClick={send}
              className={`flex size-7 shrink-0 items-center justify-center transition-[background-color,color,transform] duration-200 enabled:active:scale-[0.94] ${
                pill ? "rounded-full" : "rounded-[8px]"
              } ${wide ? "col-start-5 row-start-2" : "col-start-5 row-start-1"}`}
              style={{
                background: canSend ? "hsl(var(--ink))" : "hsl(var(--line-strong))",
                color: canSend ? "hsl(var(--surface))" : "hsl(var(--ink-2))",
              }}
            >
              <Icon size={16} strokeWidth={2.4}><path d="M12 19V5M5 12l7-7 7 7" /></Icon>
            </button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
