/**
 * @file src/components/SiteFooter.tsx
 * @description The site footer: wordmark, three link columns, licence line.
 *
 * 📖 The docs columns mirror the top of `docsNav` rather than hard-coding a
 * second list, so a renamed page cannot leave a dead link down here.
 *
 * @exports SiteFooter
 */
import { Link } from '@tanstack/react-router'
import { Logo } from './Logo'
import { site } from '~/lib/site'

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
            A local-first Kanban board where every task is a Markdown file you own forever.
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
          <FooterLink slug="agents/launching">Launching agents</FooterLink>
          <FooterLink slug="agents/mcp">MCP server</FooterLink>
        </FooterColumn>

        <FooterColumn title="Project">
          <FooterExternal href={site.repo}>GitHub</FooterExternal>
          <FooterExternal href={site.npm}>npm</FooterExternal>
          <FooterExternal href={site.issues}>Issues</FooterExternal>
          <FooterLink slug="project/contributing">Contributing</FooterLink>
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
          <p>Zero backend · Zero database · No account · No telemetry</p>
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
