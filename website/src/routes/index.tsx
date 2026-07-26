/**
 * @file src/routes/index.tsx
 * @description The landing page. Five numbered sections move from the product
 * promise and hero recording into durable agent handoffs, choosing a workflow,
 * Markdown ownership, the three interfaces, the supporting feature set, and the
 * install CTA.
 *
 * ⚠️ The section numbers (`01`–`05`) are hand-written strings, not derived.
 * Inserting a section means renumbering the ones after it, or the page starts
 * counting `01, 02, 02` and nobody notices for a month.
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
 * site chrome, and the Web/TUI/CLI storyboard selector; the brand lockup loop
 * is CSS-only and respects reduced-motion preferences.
 *
 * @exports Route
 */
import { useState, type ReactNode } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { CodeWindow, Line } from '~/components/CodeWindow'
import { CopyCommand } from '~/components/CopyCommand'
import { INSTALL_COMMAND, site } from '~/lib/site'
import HeroGeometric from '~/components/HeroGeometric'
import { LogoMark } from '~/components/Logo'
import { MorphingText } from '~/components/MorphingText'
import { HomeStructuredData } from '~/components/StructuredData'
import { CometCard } from '~/components/ui/comet-card'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <>
      <HomeStructuredData />
      <Hero />
      <Agents />
      <Workflows />
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
        <HeroGeometric color1="#0ce931" color2="#fff7ed" speed={1.7} className="w-full h-full min-h-[600px]" />
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
              {/* 📖 These stay with the pitch while installation moves into the
                  product lockup. The card now reads as one complete object:
                  identity, promise, then the command that gets it. */}
              <Link
                to="/app"
                className="group inline-flex items-center gap-2 self-start rounded-md bg-accent px-4 py-2.5 text-[14px] font-semibold text-ink transition-transform hover:-translate-y-0.5"
              >
                Try Kandown Web
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
            <div
              className="animate-rise mt-4 max-w-xl border-l-2 border-accent pl-3 text-[12.5px] leading-relaxed text-fg-muted"
              style={{ animationDelay: '220ms' }}
            >
              <p className="font-medium text-fg">Free · no login · your project stays local</p>
              <p className="mt-1">
                The web app is the lightweight experience for trying Kandown or checking a board.
                Use the TUI and CLI for agents, automation, and the full workflow.
              </p>
            </div>
          </div>

          {/* 📖 The whole product lockup lives in one dark frame: mark, the
              equation resolving into the name, then the install action. The
              frame is now a CometCard — a 3D-tilted interactive surface that
              rotates toward the cursor and lights up with a soft glare on
              hover, replacing the static rounded panel. The dark card itself
              (background, border, padding, install command) sits inside the
              CometCard so the CometCard owns the perspective and the inner
              div owns the surface. */}
          <div className="animate-rise w-full max-w-[27rem] shrink-0 self-center lg:self-auto" style={{ animationDelay: '200ms' }}>
            <CometCard className="w-full">
              <div className="hero-card-surface rounded-2xl border border-white/15 p-10 backdrop-blur-[3px] sm:p-14">
                <div className="flex flex-col items-center justify-center">
                  <LogoMark size={220} />
                  <BrandLoop />
                </div>
                <CopyCommand command={INSTALL_COMMAND} className="mt-7 w-full border-black/5 bg-[#f7ffd5]! text-black" />
              </div>
            </CometCard>
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

function BrandLoop() {
  return (
    <div
      className="mt-7 w-full text-center"
      aria-label="Kanban plus Markdown becomes Kandown"
    >
      <MorphingText
        items={[
          {
            text: 'Kanban + Markdown',
            className: 'font-mono text-[1.1875rem] font-semibold tracking-[0.08em] text-white',
          },
          {
            text: 'Kandown',
            className: 'font-sans text-[2rem] font-black tracking-[-0.045em] text-white',
          },
        ]}
      />
    </div>
  )
}

/* ── Workflows ──────────────────────────────────────────────────────────── */

/**
 * 📖 The workflow story, placed straight after the agent section because it is
 * the same subject one level up: not "how does an agent read the board" but
 * "whose method does it follow".
 *
 * ⚠️ This describes work that is designed but not shipped (see tasks t258, t259,
 * t260). The `Planned` marker in the eyebrow is what keeps the page honest —
 * remove it when workflow selection actually lands, and not before.
 */
function Workflows() {
  return (
    <>
      <Section
        index="02"
        eyebrow="Workflows · Planned"
        title="Choose your workflow"
        lead="Kandown ships one opinion about how agents should work: plan, take one task, check off subtasks, write a report. It is a good opinion, and it should still be a choice. Workflow selection is being designed now and lands before 1.0."
      >
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start">
          <div className="border-t border-border">
            <StoryPoint title="Pick a method, not a religion">
              A PRD-first flow, strict TDD, a research loop, or almost no ceremony. Choose one and
              every agent on the project follows the same plan, the same review checkpoints, and the
              same definition of done.
            </StoryPoint>
            <StoryPoint title="Today's protocol becomes one entry">
              The rules Kandown ships stay the default. They stop being the only option, and nothing
              changes for a project that never picks anything else.
            </StoryPoint>
            <StoryPoint title="Some rules are not opinions">
              Dependency gating, the Markdown round-trip, and how archiving works are the data model,
              not a method. Every workflow inherits those and none can override them.
            </StoryPoint>
            <StoryPoint title="Bring your own, or install one">
              A workflow is Markdown and a manifest. Fork one, adapt it to your team, keep it in the
              repo, or install one written by somebody else.
            </StoryPoint>
          </div>

          <CodeWindow title="Planned interface" className="border border-border">
            <Line tone="prompt">$ kandown workflow list</Line>
            <Line tone="value"> default · plan, one task, subtask reports</Line>
            <Line tone="output"> ai-dev-tasks · PRD, then tasks, one at a time</Line>
            <Line tone="output"> tdd · red, green, refactor, per subtask</Line>
            <Line> </Line>
            <Line tone="prompt">$ kandown workflow use ai-dev-tasks</Line>
            <Line tone="output"> Workflow set for this project.</Line>
            <Line> </Line>
            <Line tone="muted"># Instructions come from the CLI, never a file</Line>
            <Line tone="muted"># in your repo that can drift out of date.</Line>
          </CodeWindow>
        </div>
      </Section>
      <Rule />
    </>
  )
}

/* ── Files ──────────────────────────────────────────────────────────────── */

function Files() {
  return (
    <>
      <Section
        index="03"
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
        index="04"
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
      <Section index="05" eyebrow="Built for the long run" title="Structure that survives the work">
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
          <Link
            to="/app"
            className="group flex min-h-12 items-center justify-between rounded-md bg-accent px-4 py-3 text-[14px] font-semibold text-ink transition-transform hover:-translate-y-0.5"
          >
            <span>Open Kandown Web</span>
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span>
          </Link>
          <p className="pb-2 text-[12px] leading-relaxed text-fg-muted">
            No install or login. Opens on a sample board, then works directly with local projects
            in compatible browsers. TUI and agent launching are not available on the web.
          </p>
          <p className="label pt-1 text-fg-faint">Full local experience</p>
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
