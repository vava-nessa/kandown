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
  tagline: 'Too many ideas, not enough agents.',
  description:
    'A local-first Kanban board where every task is a Markdown file you own forever. Zero backend, zero database, no account — built for working alongside AI agents.',
  url: 'https://kandown.dev',
  repo: 'https://github.com/vava-nessa/kandown',
  npm: 'https://www.npmjs.com/package/kandown',
  issues: 'https://github.com/vava-nessa/kandown/issues',
  author: 'Vanessa Depraute',
  authorUrl: 'https://vanessadepraute.dev',
} as const

export const INSTALL_COMMAND = 'npm install -g kandown'
