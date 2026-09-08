---
id: t340
title: 'Model picker bb-style : recherche, tabs providers, fix 401'
status: Review
created: 2026-09-08
updated: 2026-09-08T18:03:19Z
priority: P1
tags: [agent]
---

# Model picker bb-style : recherche, tabs providers, fix 401

## Context

Le model picker du chat agent "ne fonctionne toujours absolument pas"
(vava). Le catalogue daemon est riche (des centaines de modèles pi via
openrouter) mais l'ancien menu BUI le plafonnait à 16 entrées sans
recherche. Pire : la requête était un `window.fetch` brut sans le token
daemon, donc elle répondait 401 depuis le navigateur et le menu n'a
jamais montré un seul vrai modèle. La présentation demandée est celle du
picker de bb (getbb) : bouton avec logo provider, menu avec recherche,
rangée d'onglets logos providers, liste complète avec qualifier.

## Root cause (401)

`AgentChatSurface` (ex ChatSidebar t324) fetchait
`/api/agent/models?harness=...` en brut, sans `X-Kandown-Token`. Tous les
autres appels passent par `rawApiFetch`/`apiFetch` qui injectent le
token. Fix : nouveau helper `fetchAgentModels()` dans `filesystem.ts`.

## Subtasks

- [x] Diagnostiquer : 401 confirmé via Playwright network + curl comparatif
  report: curl avec header token → 200 avec catalogue ; navigateur sans
  token → 401 sur claude ET pi.
- [x] fetchAgentModels authentifié dans filesystem.ts
  report: helper + type AgentModelEntry, pattern identique à
  fetchAgentHarnesses (isServerMode, apiFetch, null si échec).
- [x] ModelPickerMenu façon bb (inspiration du renderer extrait de
  bb.app)
  report: portail document.body en position fixed (le shell du composer
  clippait le menu), hauteur bornée à l'espace au-dessus du bouton,
  recherche avec nav clavier (flèches/Entrée/Échap), onglets logos
  providers dérivés du préfixe `provider/model`, qualifier subtil à la
  bb (`splitModelLabel`), badge Current, check sur la sélection, ligne
  custom si la recherche ne matche rien (comportement t324 conservé).
- [x] Pick persisté + vérifié en conditions réelles
  report: pick "GLM-5.3-Flash openrouter" sur harness pi → bouton mis à
  jour, persistance localStorage vérifiée après re-sélection du harness,
  session réelle démarrée avec `--model openrouter/z-ai/glm-5.3-flash`
  (adapter pi), tour complété (thinking, 1 tool ok, usage 39.9k tokens).
- [x] Test utilisateur pi de bout en bout (t338)
  report: "Ask the agent" depuis la carte → page agent avec la tâche en
  contexte → prompt demandant de cocher les sous-tâches et remplir le
  report → fichier édité par pi (sous-tâches [x], report rempli, statut
  Done), visible en direct dans le panneau Task.

## Evidence

- Session pi réelle sur t338 : tour OK, usage affiché, éditions présentes
  dans tasks/t338_test_agent_pi.md (vérifié par lecture directe du fichier).
- Picker : captures comparées au screen bb (recherche + tabs + logos +
  qualifiers), recherche "glm-5.3" filtre correctement, nav clavier OK.
- pnpm typecheck + build au vert ; locales complétées (modelSearch,
  modelAllProviders, modelGroup, modelEmpty, modelCustomUse) dans les 48
  fichiers.

## Notes

- Glyphes providers forcés en variante "chainable" : google/openai sont
  des agents desktop dans la table d'alias, l'anneau pointillé desktop
  n'a pas de sens pour un label de provider.
- L'ancien menu BUI est retiré du composer (models={[]} au wrapper) ; les
  props models/model/onModelChange/allowCustomModel du wrapper agent
  PromptBar ont été supprimées.

## Out of scope

- Raisonning options et routing multi-providers à la bb (un seul harness
  par conversation côté kandown).
- Changement de modèle à chaud sur une session en cours (pi RPC
  set_model, hors scope adapter).
