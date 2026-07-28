/**
 * @file Theme registry metadata
 * @description Centralizes the GitHub coordinates of the community theme
 * registry so the CLI, daemon and web editor all propose themes into the
 * same place. Update here when the registry moves to a dedicated repo (see
 * ADR 0002).
 *
 * @exports KANDOWN_THEME_REPO_OWNER, KANDOWN_THEME_REPO_NAME, KANDOWN_THEME_DEFAULT_BRANCH
 * @see src/cli/lib/themes-store.ts
 * @see src/cli/lib/themes-cli.ts
 */

export const KANDOWN_THEME_REPO_OWNER = 'vava-nessa';
export const KANDOWN_THEME_REPO_NAME = 'kandown';
export const KANDOWN_THEME_DEFAULT_BRANCH = 'main';