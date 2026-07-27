/**
 * @file src/components/SiteFooter.tsx
 * @description The site footer: wordmark, three link columns, licence line,
 * and a discreet changelog line at the very bottom.
 *
 * 📖 The docs columns mirror the top of `docsNav` rather than hard-coding a
 * second list, so a renamed page cannot leave a dead link down here.
 *
 * 📖 The bottom-row changelog line is the most discreet link on the site.
 * No column header, no border, just `Changelog · vX.Y.Z` next to the MIT
 * bar. Two reasons: it should not compete with the GitHub/npm/Issues links
 * in the `Project` column, and the changelog is a *reference*, not a
 * destination the visitor is being pushed toward.
 *
 * @exports SiteFooter
 */
import { Link } from '@tanstack/react-router'
import { Logo } from './Logo'
import { site } from '~/lib/site'

// 📖 Pinned to the latest release so the footer's "Changelog · vX.Y.Z" reads
// as current. Update on release; a stale version is a small thing, but a
// footer claiming the current release when it isn't would look like a bug.
const LATEST_VERSION = '0.38.0'

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <Logo size={24} className="rounded-[4px]" />
            <span className="text-[15px] font-semibold tracking-[-0.02em]">kandown</span>
          </div>
          <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-fg-muted">
            A local Kanban for long-running agent work. Every task stays in your project as
            Markdown.
          </p>
        </div>

        <FooterColumn title="Docs">
          <FooterLink slug="introduction">Introduction</FooterLink>
          <FooterLink slug="quick-start">Quick start</FooterLink>
          <FooterLink slug="reference/cli">CLI reference</FooterLink>
          <FooterLink slug="reference/data-model">Data model</FooterLink>
        </FooterColumn>

        <FooterColumn title="Agents">
          <FooterLink slug="agents/overview">kandown work</FooterLink>
          <FooterLink slug="agents/instructions">Project instructions</FooterLink>
          <FooterLink slug="agents/mcp">MCP server</FooterLink>
          {/* 📖 The one link on the site aimed at a reader that is not a person.
              `llms.txt` is where an agent sent here by "install kandown" should
              land: the whole corpus, indexed, in plain text. */}
          <FooterExternal href="/llms.txt">llms.txt</FooterExternal>
        </FooterColumn>

        <FooterColumn title="Project">
          <FooterExternal href={site.repo}>GitHub</FooterExternal>
          <FooterExternal href={site.npm}>npm</FooterExternal>
          <FooterExternal href={site.reddit}>Reddit (r/kandown)</FooterExternal>
          <FooterExternal href={site.issues}>Issues</FooterExternal>
          <FooterLink slug="project/contributing">Contributing</FooterLink>
          {/* 📖 Same shape as the docs links above, but pointing at the
              splat route. Lands on `/changelogs/v0.37.0` because the index
              route redirects to the latest version. */}
          <FooterChangelogLink>Changelog</FooterChangelogLink>
        </FooterColumn>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 font-mono text-[11.5px] text-fg-faint sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>
            MIT © {new Date().getFullYear()}{' '}
            <a
              href={site.authorUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-fg-muted transition-colors hover:text-fg"
            >
              {site.author}
            </a>
          </p>
          {/* 📖 The most discreet link on the whole site: a single mono line
              next to the licence and the product tagline, no label, no border.
              Version is pinned at the top of the file so it stays one search
              away when a release ships. */}
          <p className="flex items-center gap-3">
            <span>Zero backend · Zero database · No account · No telemetry</span>
            <span aria-hidden="true">·</span>
            <Link
              to="/changelogs/$"
              params={{ _splat: `v${LATEST_VERSION}` }}
              className="transition-colors hover:text-fg"
            >
              Changelog · v{LATEST_VERSION}
            </Link>
          </p>
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="label text-fg">{title}</h2>
      <ul className="mt-3 space-y-2 text-[13px]">{children}</ul>
    </div>
  )
}

function FooterLink({ slug, children }: { slug: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        to="/docs/$"
        params={{ _splat: slug }}
        className="text-fg-muted transition-colors hover:text-fg"
      >
        {children}
      </Link>
    </li>
  )
}

function FooterExternal({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className="text-fg-muted transition-colors hover:text-fg"
      >
        {children}
      </a>
    </li>
  )
}

/** 📖 Points at the latest release. The splat route is the only one that
 *  exists under `/changelogs/*`, so we redirect through it with the pinned
 *  version rather than landing on a `notFound()`. */
function FooterChangelogLink({ children }: { children: React.ReactNode }) {
  return (
    <li>
      <Link
        to="/changelogs/$"
        params={{ _splat: `v${LATEST_VERSION}` }}
        className="text-fg-muted transition-colors hover:text-fg"
      >
        {children}
      </Link>
    </li>
  )
}
