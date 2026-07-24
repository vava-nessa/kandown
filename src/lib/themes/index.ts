/**
 * @file Theme preset registry
 * @description Aggregates every curated theme preset into the THEME_PRESETS array
 * consumed by the theme engine (src/lib/theme.ts).
 */

import type { KandownTheme } from '../types';
import { vercelTheme } from './vercel';
import { linearTheme } from './linear';
import { claudeTheme } from './claude';
import { appleTheme } from './apple';
import { stripeTheme } from './stripe';
import { paperTheme } from './paper';
import { catppuccinTheme } from './catppuccin';
import { terminalTheme } from './terminal';
import { githubTheme } from './github';
import { nordicTheme } from './nordic';
import { draculaTheme } from './dracula';
import { arcTheme } from './arc';
import { raycastTheme } from './raycast';
import { figmaTheme } from './figma';
import { spotifyTheme } from './spotify';
import { supabaseTheme } from './supabase';
import { shadcnTheme } from './shadcn';
import { notiondarkTheme } from './notion-dark';
import { bambooTheme } from './bamboo';
import { sakuraTheme } from './sakura';
import { saharaTheme } from './sahara';
import { oceanicTheme } from './oceanic';
import { auroraTheme } from './aurora';
import { volcanicTheme } from './volcanic';
import { glacierTheme } from './glacier';
import { mossTheme } from './moss';
import { solarisTheme } from './solaris';
import { nebulaTheme } from './nebula';
import { cyberpunkTheme } from './cyberpunk';
import { synthwaveTheme } from './synthwave';
import { bauhausTheme } from './bauhaus';
import { monolithTheme } from './monolith';
import { emeraldTheme } from './emerald';
import { midnighttokyoTheme } from './midnight-tokyo';
import { copperTheme } from './copper';
import { lattemacchiatoTheme } from './latte-macchiato';
import { synthgoldTheme } from './synth-gold';
import { vaporwaveTheme } from './vaporwave';

export const THEME_PRESETS: KandownTheme[] = [
  vercelTheme,
  linearTheme,
  claudeTheme,
  appleTheme,
  stripeTheme,
  paperTheme,
  catppuccinTheme,
  terminalTheme,
  githubTheme,
  nordicTheme,
  draculaTheme,
  arcTheme,
  raycastTheme,
  figmaTheme,
  spotifyTheme,
  supabaseTheme,
  shadcnTheme,
  notiondarkTheme,
  bambooTheme,
  sakuraTheme,
  saharaTheme,
  oceanicTheme,
  auroraTheme,
  volcanicTheme,
  glacierTheme,
  mossTheme,
  solarisTheme,
  nebulaTheme,
  cyberpunkTheme,
  synthwaveTheme,
  bauhausTheme,
  monolithTheme,
  emeraldTheme,
  midnighttokyoTheme,
  copperTheme,
  lattemacchiatoTheme,
  synthgoldTheme,
  vaporwaveTheme,
];
