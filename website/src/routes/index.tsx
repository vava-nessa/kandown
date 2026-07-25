/**
 * @file src/routes/index.tsx
 * @description The landing page. Six numbered sections move from the product
 * promise and hero recording into durable agent handoffs, Markdown ownership,
 * the three interfaces, the supporting feature set, and the install CTA.
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
 * The page prerenders to HTML. JavaScript is limited to copy buttons, shared
 * site chrome, theme controls, and the Web/TUI/CLI storyboard selector.
 *
 * @exports Route
 */
import { useState, type ReactNode } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { CopyCommand } from '~/components/CopyCommand'
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
      <Agents />
      <Files />
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
            {/* 📖 Lead with the ownership model, not package requirements. The
                install command below already answers the technical question. */}
            <p className="label animate-rise text-fg">
              Free, open source, and fully local.
            </p>

            <h1
              className="animate-rise mt-6 text-[2.75rem] leading-[0.98] font-semibold tracking-[-0.035em] text-balance sm:text-[4.25rem]"
              style={{ animationDelay: '60ms' }}
            >
              Markdown tasks,
              <br />
              built for AI{' '}
              {/* 📖 The one place the accent is used as a solid block. It lands
                  on the word the whole product is about. */}
              <span className="bg-accent px-2 text-ink">agents</span>.
            </h1>

            <p
              className="animate-rise mt-7 max-w-xl text-[1.0625rem] leading-relaxed text-fg-muted"
              style={{ animationDelay: '120ms' }}
            >
              Keep long-running work clear and moving. Every task is a Markdown file that you and
              your agents can read, update, and hand off from the web app, TUI, or CLI.
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
              ['Plain files', 'One Markdown file per task. Easy to read, edit, and version.'],
              ['Made for agents', 'Durable context, clear next steps, and useful completion reports.'],
              ['Works everywhere', 'Web board, full terminal UI, and scriptable CLI.'],
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
            <VideoBrief
              number="01"
              role="Hero workflow"
              format="16:10 · 12 to 15 seconds"
              title="Show the full Kandown workflow in one clean loop"
              description="Create a task in the web board, add subtasks, assign an agent, move the task into progress, save a completion report, and finish in Done. Return to the opening board state so the loop feels seamless."
              filename="demo.webm"
            />
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
        index="02"
        eyebrow="Plain files"
        title="Your board lives in your project"
        lead="Every task is a Markdown file you can open, edit, search, and commit with git. Kandown turns those files into a visual board without hiding them in a database."
      >
        <VideoBrief
          number="03"
          role="Markdown sync"
          format="16:10 · 8 to 10 seconds"
          title="Prove that the file and the board are the same thing"
          description="Record a split view with a real task file in the editor and Kandown beside it. Change the title, priority, assignee, checklist, and status in Markdown. Show each change appearing instantly on the real board."
          filename="markdown-sync.webm"
        />
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
        index="01"
        eyebrow="Agent-first"
        title="Long-running work keeps its memory"
        lead="Some tasks take hours, days, or several agents. Kandown keeps the plan, progress, blockers, and completion reports in files that survive every session."
      >
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:items-start">
          <div className="border-t border-border">
            <StoryPoint title="Start with the full picture">
              Project rules, instructions, active tasks, blockers, and priorities arrive in one
              command.
            </StoryPoint>
            <StoryPoint title="Know what comes next">
              Kandown finds the highest-priority task that is ready to start.
            </StoryPoint>
            <StoryPoint title="Leave a useful handoff">
              Agents check off subtasks and record what changed, so progress survives the session.
            </StoryPoint>
            <StoryPoint title="Use any agent you want">
              Launch Claude Code, Codex, Gemini CLI, Goose, Aider, or OpenCode. Shell commands and
              MCP work too.
            </StoryPoint>
            <Link
              to="/docs/$"
              params={{ _splat: 'agents/overview' }}
              className="group mt-5 inline-flex items-center gap-2 border-b-2 border-accent py-0.5 text-[13.5px] font-medium text-fg"
            >
              Read the agent guide
              <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
                →
              </span>
            </Link>
          </div>

          <VideoBrief
            number="02"
            role="Agent handoff"
            format="16:10 · 10 to 12 seconds"
            title="Show one task surviving two different agent sessions"
            description="Start the task with Codex in the TUI. Complete one subtask and save a report, then end the session. Launch Claude on the same task, show it reading the saved context, finish the remaining work, and move the task to Done."
            filename="agent-handoff.webm"
          />
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
    body: 'Create a task, drag it between columns, open its details, update a subtask, and find another task with search.',
    format: '16:10 · 6 to 8 seconds',
    filename: 'interface-web.webm',
  },
  {
    n: '02',
    name: 'Terminal UI',
    command: 'kandown board',
    body: 'Navigate with the keyboard, open the task detail, move a task, and launch an agent from the selected card.',
    format: '16:10 · 6 to 8 seconds',
    filename: 'interface-tui.webm',
  },
  {
    n: '03',
    name: 'CLI',
    command: 'kandown list --json',
    body: 'Create a task, run kandown work, move the task to Done, and show the same change appearing on the board.',
    format: '16:10 · 5 to 6 seconds',
    filename: 'interface-cli.webm',
  },
] as const

function Interfaces() {
  return (
    <>
      <Section
        index="03"
        eyebrow="Work your way"
        title="One board, wherever you work"
        lead="Plan in the browser, manage tasks from the terminal, or automate everything from scripts. Every interface reads and writes the same Markdown files, so your board never drifts."
      >
        <InterfaceStoryboard />
      </Section>
      <Rule />
    </>
  )
}

/* ── Features ───────────────────────────────────────────────────────────── */

const FEATURES = [
  {
    title: 'Clear handoffs',
    body: 'Every agent sees the plan, current progress, blockers, and reports left by the session before it.',
  },
  {
    title: 'Honest dependencies',
    body: 'Blocked work cannot reach Done until every task it depends on is resolved, from any interface.',
  },
  {
    title: 'Completion reports',
    body: 'A checked subtask can explain what changed, giving the next person or agent more than an empty checkmark.',
  },
  {
    title: 'Search everything',
    body: 'Find text across titles, descriptions, subtasks, tags, assignees, and priorities. Filter or group the result in seconds.',
  },
  {
    title: 'Local and private',
    body: 'No account, no telemetry, and no hosted database. Task commands work offline and your files stay inside the project.',
  },
  {
    title: '38 themes, 48 languages',
    body: 'Choose a familiar theme, tune your own, and use the board in the language that feels natural to your team.',
  },
]

function Features() {
  return (
    <>
      <Section index="04" eyebrow="Built for the long run" title="Structure that survives the work">
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
            Start with two commands.
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-fg-muted">
            Kandown runs locally and keeps every task inside your project. No account, no hosted
            service, and no migration if you ever stop using it.
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
          <div>
            <a
              href={site.repo}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[13px] text-fg-muted transition-colors hover:text-fg"
            >
              View the source on GitHub
            </a>
          </div>
        </div>
      </div>
    </Shell>
  )
}

/* ── Video storyboard ───────────────────────────────────────────────────── */

function InterfaceStoryboard() {
  const [activeIndex, setActiveIndex] = useState(0)
  const active = INTERFACES[activeIndex] ?? INTERFACES[0]

  return (
    <div>
      <div className="grid border border-border sm:grid-cols-3">
        {INTERFACES.map((item, index) => {
          const selected = index === activeIndex
          return (
            <button
              key={item.name}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-pressed={selected}
              className={`border-border px-4 py-4 text-left transition-colors sm:border-l sm:first:border-l-0 ${
                index > 0 ? 'border-t sm:border-t-0' : ''
              } ${selected ? 'bg-accent text-ink' : 'bg-bg hover:bg-bg-subtle'}`}
            >
              <span className={`font-mono text-[10px] ${selected ? 'text-ink/60' : 'text-fg-faint'}`}>
                {item.n}
              </span>
              <span className="mt-1 block text-[14px] font-semibold">{item.name}</span>
              <span
                className={`mt-1 block font-mono text-[11px] ${
                  selected ? 'text-ink/70' : 'text-fg-muted'
                }`}
              >
                $ {item.command}
              </span>
            </button>
          )
        })}
      </div>

      <VideoBrief
        number={`04.${active.n}`}
        role={`${active.name} interface`}
        format={active.format}
        title={`Record the real ${active.name.toLowerCase()}`}
        description={active.body}
        filename={active.filename}
        command={active.command}
        className="border-t-0"
      />
    </div>
  )
}

function VideoBrief({
  number,
  role,
  format,
  title,
  description,
  filename,
  command,
  className = '',
}: {
  number: string
  role: string
  format: string
  title: string
  description: string
  filename: string
  command?: string
  className?: string
}) {
  return (
    <figure
      className={`relative min-h-[30rem] overflow-hidden border border-white/20 bg-black text-white sm:aspect-[16/10] sm:min-h-0 ${className}`}
      aria-label={`Video storyboard for ${role}`}
    >
      <figcaption className="absolute inset-0 flex flex-col items-center justify-center p-7 text-center sm:p-12">
        <p className="absolute top-5 left-5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/55 sm:top-6 sm:left-6 sm:text-[11px]">
          Video {number} · {role} · {format}
        </p>

        <div className="max-w-2xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
            Recording brief
          </p>
          <h3 className="mt-4 text-[1.5rem] leading-tight font-semibold tracking-[-0.025em] text-white sm:text-[2rem]">
            {title}
          </h3>
          <p className="mt-5 text-[14px] leading-relaxed text-white/75 sm:text-[15px]">
            {description}
          </p>
          {command && (
            <p className="mt-6 font-mono text-[12px] text-white/60">$ {command}</p>
          )}
        </div>

        <p className="absolute bottom-5 left-5 font-mono text-[10px] text-white/45 sm:bottom-6 sm:left-6 sm:text-[11px]">
          Expected file: /{filename}
        </p>
      </figcaption>
    </figure>
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

function StoryPoint({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-border py-4">
      <h3 className="text-[13.5px] font-semibold tracking-tight">{title}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{children}</p>
    </div>
  )
}
