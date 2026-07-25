/**
 * @file src/routes/index.tsx
 * @description The landing page. Six numbered sections, in the order someone
 * evaluating the project actually asks their questions: what is it (hero +
 * demo), how does it work (files), what about my agents, how do I reach it
 * (interfaces), what else does it do (features), how do I start (CTA).
 *
 * 📖 The layout is editorial rather than promotional, and the rules it follows
 * are worth stating because they are what keep it from drifting back into a
 * generic template:
 *
 *   · Everything is left-aligned. Centred hero text with two centred buttons
 *     under it is the single most recognisable landing-page cliché; an
 *     asymmetric measure reads as designed and is easier to scan.
 *   · Structure is drawn with 1px rules, not cards. Sections are separated by
 *     full-bleed hairlines and numbered `01`–`06` in mono.
 *   · There is no glow, no gradient mesh and no floating badge. The only
 *     decorative element is the column lattice, which echoes a kanban board.
 *   · Every label, count and piece of metadata is set in Geist Mono. Prose is
 *     Geist. That split is the page's voice.
 *
 * Everything here is static markup — the page prerenders to HTML and the only
 * JavaScript it needs is the copy button, the header and the theme toggle.
 *
 * @exports Route
 */
import type { ReactNode } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { CopyCommand } from '~/components/CopyCommand'
import { HeroVideo } from '~/components/HeroVideo'
import { BoardMock } from '~/components/BoardMock'
import { CodeWindow, Line } from '~/components/CodeWindow'
import { INSTALL_COMMAND, site } from '~/lib/site'
import HeroGeometric from '~/components/HeroGeometric'
import { LogoMark } from '~/components/Logo'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <>
      <Hero />
      <Files />
      <Agents />
      <Interfaces />
      <Features />
      <Cta />
    </>
  )
}

/* ── Hero ───────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative border-b border-border overflow-hidden">
      <div className="absolute inset-0 z-0 pointer-events-none">
        <HeroGeometric color1="#0ce931" color2="#fff7ed" speed={3} className="w-full h-full min-h-[600px]" />
      </div>
      <Shell className="relative z-10">
        <div className="py-16 sm:py-24 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-12">
          <div className="max-w-2xl">
            {/* 📖 A metadata line instead of a pill badge: same information,
                stated rather than decorated. */}
            <p className="label animate-rise flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-accent-fg">Local-first</span>
              <span aria-hidden="true">/</span>
              <span>MIT</span>
              <span aria-hidden="true">/</span>
              <span>Node 18+</span>
              <span aria-hidden="true">/</span>
              <a href={site.npm} target="_blank" rel="noreferrer noopener" className="hover:text-fg">
                npm
              </a>
            </p>

            <h1
              className="animate-rise mt-6 text-[2.75rem] leading-[0.98] font-semibold tracking-[-0.035em] text-balance sm:text-[4.25rem]"
              style={{ animationDelay: '60ms' }}
            >
              Too many ideas,
              <br />
              not enough{' '}
              {/* 📖 The one place the accent is used as a solid block. It lands
                  on the word the whole product is about. */}
              <span className="bg-accent px-2 text-ink">agents</span>.
            </h1>

            <p
              className="animate-rise mt-7 max-w-xl text-[1.0625rem] leading-relaxed text-fg-muted"
              style={{ animationDelay: '120ms' }}
            >
              A Kanban board whose entire database is a folder of Markdown files you own forever.
              No backend, no account, no sync service — and AI agents are first-class users, not an
              integration.
            </p>

            <div
              className="animate-rise mt-9 flex flex-col gap-4 sm:flex-row sm:items-center"
              style={{ animationDelay: '180ms' }}
            >
              <CopyCommand command={INSTALL_COMMAND} className="sm:min-w-[19rem]" />
              {/* 📖 The demo is offered next to the install command rather than
                  below the fold: "try it without installing" answers the same
                  question the install command does, one step earlier. It is a
                  plain link, not a second solid button — two competing filled
                  buttons is the cliché the rest of this page avoids. */}
              <Link
                to="/demo"
                className="group inline-flex items-center gap-2 self-start border-b-2 border-accent py-1 text-[14px] font-medium text-fg"
              >
                Try it in the browser
                <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
                  →
                </span>
              </Link>
              <Link
                to="/docs/$"
                params={{ _splat: 'quick-start' }}
                className="group inline-flex items-center gap-2 self-start py-1 text-[14px] font-medium text-fg-muted transition-colors hover:text-fg"
              >
                Quick start
              </Link>
            </div>
          </div>

          {/* 📖 Ultra-dark translucent glass block with large LogoMark + "Kanban + Markdown" text */}
          <div className="animate-rise shrink-0 flex flex-col items-center justify-center p-14 sm:p-16 rounded-3xl bg-black/85 backdrop-blur-2xl border border-white/15 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)] self-center lg:self-auto" style={{ animationDelay: '200ms' }}>
            <LogoMark size={220} />
            <span className="mt-7 text-[19px] font-semibold tracking-wider text-white font-mono">
              Kanban + Markdown
            </span>
          </div>
        </div>

          {/* 📖 Three facts as a full-width band above the demo, not a column
              beside the copy. Set beside it they left a large void at the top
              right; as a band they give the hero a horizontal beat and hand off
              cleanly to the screenshot below. */}
          <dl
            className="animate-rise mt-16 grid gap-px border-y border-border bg-border sm:grid-cols-3"
            style={{ animationDelay: '240ms' }}
          >
            {[
              ['One file', 'per task. No index, no cache, no database.'],
              ['Three ways in', 'Web board, terminal UI, scriptable CLI.'],
              ['Zero network', 'Task commands never call out. Ever.'],
            ].map(([term, detail]) => (
              <div key={term} className="bg-bg py-5 sm:px-5 sm:first:pl-0">
                <dt className="label text-accent-fg">{term}</dt>
                <dd className="mt-1.5 text-[13.5px] leading-relaxed text-fg-muted">{detail}</dd>
              </div>
            ))}
          </dl>

          {/* 📖 The demo sits below the copy at full content width rather than
              beside it. At this size the board is legible enough to actually
              read, which is the entire point of showing it. */}
          <div className="animate-rise mt-12" style={{ animationDelay: '300ms' }}>
            <HeroVideo />
          </div>
      </Shell>
    </section>
  )
}

/* ── Files ──────────────────────────────────────────────────────────────── */

function Files() {
  return (
    <>
      <Section
        index="01"
        eyebrow="File over app"
        title="Your board is a folder"
        lead="One Markdown file per task, versioned in git, readable by any editor, any script, any agent. There is no index, no cache and no database — move a file and the board moves with it."
      >
        <div className="grid gap-px border border-border bg-border lg:grid-cols-2">
          <CodeWindow title="tasks/t14.md">
            <Line tone="muted">---</Line>
            <Line tone="key">
              id: <Val>t14</Val>
            </Line>
            <Line tone="key">
              title: <Val>Refactor auth middleware</Val>
            </Line>
            <Line tone="key">
              status: <Val>In progress</Val>
            </Line>
            <Line tone="key">
              priority: <Val>P1</Val>
            </Line>
            <Line tone="key">
              tags: <Val>[backend, security]</Val>
            </Line>
            <Line tone="key">
              assignee: <Val>claude</Val>
            </Line>
            <Line tone="key">
              depends_on: <Val>[t7]</Val>
            </Line>
            <Line tone="muted">---</Line>
            <Line> </Line>
            <Line tone="key"># Refactor auth middleware</Line>
            <Line> </Line>
            <Line tone="key">## Subtasks</Line>
            <Line tone="output">- [x] Extract the token parser</Line>
            <Line tone="muted">&nbsp;&nbsp;report: Moved to src/auth/token.ts.</Line>
            <Line tone="output">- [ ] Cover the refresh path with tests</Line>
          </CodeWindow>

          {/* 📖 No fixed aspect here, unlike the hero: the cell stretches to
              match the code panel beside it and the column rules run the full
              height, which is what a real board looks like when a column is
              short. A forced 16/11 box left a band of dead space under it. */}
          <div className="flex flex-col bg-bg">
            <div className="border-b border-border px-4 py-2.5">
              <span className="label">the same tasks, rendered</span>
            </div>
            <div className="min-h-64 flex-1">
              <BoardMock />
            </div>
          </div>
        </div>
      </Section>
      <Rule />
    </>
  )
}

/* ── Agents ─────────────────────────────────────────────────────────────── */

function Agents() {
  return (
    <>
      <Section
        index="02"
        eyebrow="For AI agents"
        title="One command for full context"
        lead="Agents do not need an API key or a plugin. kandown work prints the rules, your project instructions and a live board digest as plain Markdown on stdout — then computes the next actionable task."
      >
        <div className="grid gap-px border border-border bg-border lg:grid-cols-[1.05fr_1fr]">
          <CodeWindow title="terminal">
            <Line tone="prompt">$ kandown work</Line>
            <Line> </Line>
            <Line tone="key">## Board digest</Line>
            <Line tone="output">Backlog 6 · Todo 4 · In progress 2 · Done 11</Line>
            <Line> </Line>
            <Line tone="key">### Next actionable task</Line>
            <Line tone="output">t14 — Refactor auth middleware (P1, blocked_by: none)</Line>
            <Line> </Line>
            <Line tone="prompt">$ kandown list --json | jq '.[] | select(.priority=="P1")'</Line>
            <Line tone="prompt">$ ID=$(kandown create "Add rate limiting" -p P1)</Line>
            <Line tone="prompt">$ kandown move "$ID" Done</Line>
            <Line> </Line>
            <Line tone="muted"># stdout is data only. Decoration goes to stderr,</Line>
            <Line tone="muted"># so $(…) captures one id and never a checkmark.</Line>
          </CodeWindow>

          <div className="grid content-start gap-px bg-border">
            <Row term="No stale copy of the rules">
              The agent rules are served by the installed CLI, so they cannot rot inside your repo
              the way a block of instructions pasted at init time does.
            </Row>
            <Row term="Runs offline, always">
              Task commands never contact the npm registry. Instant in CI, instant in an agent loop,
              correct on a plane.
            </Row>
            <Row term="MCP, or just a shell">
              <code className="font-mono text-[13px] text-fg">kandown mcp</code> exposes the board
              over the Model Context Protocol. Everything else drives it with plain commands.
            </Row>
            <Row term="Hand a task over with one key">
              Press <Kbd>a</Kbd> in the terminal UI to launch Claude Code, Codex, Gemini CLI, Goose,
              Aider or OpenCode on the selected task.
            </Row>
            <div className="bg-bg p-5">
              <Link
                to="/docs/$"
                params={{ _splat: 'agents/overview' }}
                className="group inline-flex items-center gap-2 border-b-2 border-accent py-0.5 text-[13.5px] font-medium text-fg"
              >
                Read the agent guide
                <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
                  →
                </span>
              </Link>
            </div>
          </div>
        </div>
      </Section>
      <Rule />
    </>
  )
}

/* ── Interfaces ─────────────────────────────────────────────────────────── */

const INTERFACES = [
  {
    n: '01',
    name: 'Web board',
    command: 'kandown',
    body: 'Drag-and-drop kanban, list view, full-text search, ⌘K palette and a WYSIWYG Markdown editor — served as one self-contained HTML file from a local daemon.',
  },
  {
    n: '02',
    name: 'Terminal UI',
    command: 'kandown board',
    body: 'A full keyboard-driven board that works over SSH with no browser. Mouse-aware, including drag between columns.',
  },
  {
    n: '03',
    name: 'CLI',
    command: 'kandown list --json',
    body: 'Every operation scriptable and pipe-friendly. Data on stdout, decoration on stderr, meaningful exit codes.',
  },
]

function Interfaces() {
  return (
    <>
      <Section
        index="03"
        eyebrow="Three ways in"
        title="Same files, three interfaces"
        lead="The parser, the dependency gate and the daemon exist once and are shared by all three. Nothing you do in one is invisible to the others."
      >
        <div className="border-t border-border">
          {INTERFACES.map((item) => (
            <div
              key={item.name}
              className="grid items-baseline gap-x-8 gap-y-2 border-b border-border py-6 md:grid-cols-[3rem_12rem_minmax(0,1fr)]"
            >
              <span className="section-index">{item.n}</span>
              <div>
                <h3 className="text-[15px] font-semibold tracking-tight">{item.name}</h3>
                <p className="mt-1 font-mono text-[12.5px] text-accent-fg">$ {item.command}</p>
              </div>
              <p className="max-w-xl text-[14px] leading-relaxed text-fg-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </Section>
      <Rule />
    </>
  )
}

/* ── Features ───────────────────────────────────────────────────────────── */

const FEATURES = [
  {
    title: 'Dependencies that hold',
    body: 'depends_on blocks a task from reaching the terminal column until everything it waits on is resolved — enforced in the shared core, so the CLI cannot bypass what the UI refuses.',
  },
  {
    title: 'Subtasks with reports',
    body: 'Each checklist step carries its own description and a completion report, so a finished task explains what actually happened rather than just turning green.',
  },
  {
    title: 'Search everything',
    body: 'Full-text across titles, bodies, subtasks, tags, assignee and priority. Filters, group-by priority, assignee or epic, and a command palette on ⌘K.',
  },
  {
    title: '38 themes, 48 languages',
    body: 'Vercel, Linear, Claude, Catppuccin, Dracula, Nord, Synthwave and more — plus custom themes in JSON, tokenised radius and density, and an animated WebGL background.',
  },
  {
    title: 'Quick-add syntax',
    body: 'Fix login p1 #backend @chacha due:friday parses into a fully formed task. Templates cover the shapes you create over and over.',
  },
  {
    title: 'Private by construction',
    body: 'The daemon binds to 127.0.0.1, mints a per-project API token and validates every task id before it touches disk. No telemetry, no account, no network.',
  },
]

function Features() {
  return (
    <>
      <Section index="04" eyebrow="Features" title="Small surface, few surprises">
        <div className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <div key={feature.title} className="bg-bg p-6">
              <span className="section-index">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="mt-3 text-[14.5px] font-semibold tracking-tight">{feature.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-fg-muted">{feature.body}</p>
            </div>
          ))}
        </div>
      </Section>
      <Rule />
    </>
  )
}

/* ── CTA ────────────────────────────────────────────────────────────────── */

function Cta() {
  return (
    <Shell>
      <div className="grid gap-10 py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-end">
        <div>
          <span className="section-index">05</span>
          <h2 className="mt-3 max-w-lg text-[2rem] leading-[1.05] font-semibold tracking-[-0.03em] text-balance sm:text-[2.75rem]">
            Two commands and your board is running.
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-fg-muted">
            Node.js 18 or newer. Nothing else to install, nothing to sign up for, nothing that can
            shut down and take your data with it.
          </p>
        </div>
        <div className="space-y-2.5">
          <CopyCommand command={INSTALL_COMMAND} />
          <CopyCommand command="kandown init && kandown" />
          <Link
            to="/docs/$"
            params={{ _splat: 'introduction' }}
            className="group inline-flex items-center gap-2 border-b-2 border-accent py-1 text-[13.5px] font-medium text-fg"
          >
            Read the documentation
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
              →
            </span>
          </Link>
        </div>
      </div>
    </Shell>
  )
}

/* ── Shared bits ────────────────────────────────────────────────────────── */

function Shell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto max-w-6xl px-5 sm:px-8 ${className}`}>{children}</div>
}

/** 📖 Full-bleed hairline between sections — the layout's main punctuation. */
function Rule() {
  return <div className="border-b border-border" />
}

function Section({
  index,
  eyebrow,
  title,
  lead,
  children,
}: {
  index: string
  eyebrow: string
  title: string
  lead?: string
  children: ReactNode
}) {
  return (
    <Shell>
      <section className="py-16 sm:py-20">
        {/* 📖 Two-column header: numbered eyebrow in the narrow rail, title and
            lead in the wide one. The rail is what makes the page feel set
            rather than stacked. */}
        <header className="mb-10 grid gap-x-8 gap-y-3 md:grid-cols-[10rem_minmax(0,1fr)]">
          <div className="flex items-baseline gap-3">
            <span className="section-index">{index}</span>
            <span className="label">{eyebrow}</span>
          </div>
          <div>
            <h2 className="text-[1.75rem] leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-[2.25rem]">
              {title}
            </h2>
            {lead && (
              <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-fg-muted text-pretty">
                {lead}
              </p>
            )}
          </div>
        </header>
        {children}
      </section>
    </Shell>
  )
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="bg-bg p-5">
      <h3 className="text-[13.5px] font-semibold tracking-tight">{term}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{children}</p>
    </div>
  )
}

function Val({ children }: { children: ReactNode }) {
  return <span className="text-accent-fg">{children}</span>
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="border border-border-strong border-b-2 bg-bg-subtle px-1.5 py-px font-mono text-[11.5px] text-fg">
      {children}
    </kbd>
  )
}
