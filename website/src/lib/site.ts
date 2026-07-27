/**
 * @file src/lib/site.ts
 * @description Site-wide constants — the one place to change a URL, a tagline or
 * the advertised install command. Everything user-visible that appears in more
 * than one component lives here rather than being retyped in each.
 *
 * @exports site — name, tagline, canonical URL, external links
 * @exports INSTALL_COMMAND — the command shown in the hero and the docs
 */

export const site = {
  name: 'Kandown',
  tagline: 'Markdown tasks, built for AI agents.',
  description:
    'A free, open-source, local Kanban for long-running AI agent work. Every task is a Markdown file, managed from the web, TUI, or CLI.',
  url: 'https://kandown.dev',
  repo: 'https://github.com/vava-nessa/kandown',
  npm: 'https://www.npmjs.com/package/kandown',
  reddit: 'https://www.reddit.com/r/kandown/',
  issues: 'https://github.com/vava-nessa/kandown/issues',
  author: 'Vanessa Depraute',
  authorUrl: 'https://vanessadepraute.dev',
} as const

export const INSTALL_COMMAND = 'npm install -g kandown'
