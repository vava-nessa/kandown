---
id: t323
title: Release agentic : bump 0.57.0, push et publish
status: Review
depends_on: [t321, t322]
created: 2026-09-05
updated: 2026-09-05T20:32:24Z
---

## Context

Release de l'ensemble de la feat agentic. v0.55.0 "Agent Control Tower" est
deja tagguee en local (b175e33) mais non poushee ; les commits BUI et trads
sont post-tag. Decisions a prendre avec vava : deplacer le tag ou partir sur
0.56.0.

## Decisions

- Version 0.57.0 (minor). Le contexte de la tache parlait de 0.56.0 mais
  v0.56.0 "Beautiful UI" est deja sortie et PUSHEE (tag + commit 0319fbd sur
  origin, verifie au ls-remote du 2026-09-05) : la release agentic part donc
  sur 0.57.0, sans toucher aux tags existants. Le tag local v0.55.0 reste
  local (supersede par 0.56.0, rien ne le demande sur le remote ; le pusher
  declencherait une publish npm inutile).
- Nom de release : "Beautiful Agents" (le chat 100% BeautifulUI cloture la
  feat agentic ; delegation du nom valide par le runbook).
- Push uniquement sur ok explicite de vava : le push du tag declenche la
  publish npm (workflow publish.yml) sur les machines des utilisatrices.

## Subtasks

- [x] Pre-bump manual test (doctor, work, launch)
  [REPORT] vert le 2026-09-05 : doctor tout vert (70 fichiers de taches), work (document compile), list --json (59 taches, JSON propre), launch complet exit 0 (TUI correctement skippee sans stdin interactif). Build du HEAD commite verifie en clone isole /tmp : build + 614 tests verts, l'arbre que le tag pousse est autoportant.
- [x] Changelog fusionne (Agent Control Tower + BUI gallery + rounds)
  [REPORT] changelogs/v0.57.0.md "Beautiful Agents" : round 7 (chat 100% BUI), galerie complete, model picker ACP, endpoint active-edits, fixes ACP/orchestrator, i18n (846 additions + 49 realignements). 0.55.0/0.56.0 ont deja leurs fichiers ; 0.57.0 couvre le delta, corps du commit = contenu du fichier (runbook).
- [x] Bump, build, commit release, tag
  [REPORT] package.json 0.57.0, pnpm build vert, commit 9ae3286, tag annote v0.57.0 ("v0.57.0 - Beautiful Agents", meme format que v0.56.0). Daemon relance sur le build 0.57.0 (port 2051, /api/daemon repond version 0.57.0) pour les tests de vava.
- [ ] Push et publish UNIQUEMENT sur demande explicite de vava
  [REPORT] NON execute (comme demande). Etat verifie au moment du preparatif : 10 commits devant origin/main, 0 derriere (fast-forward sans force). Commande prete : git push origin main v0.57.0

## Completion report

La release agentic est coupee en local : v0.57.0 "Beautiful Agents" (commit
9ae3286, tag annote). Tout est teste et vert ; il ne manque que le push,
volontairement non fait. Au retour de vava :

1. Relire le changelog (changelogs/v0.57.0.md) et les 10 commits
   (git log origin/main..HEAD).
2. Si ok : git push origin main v0.57.0 (declenche la publish npm, verifier
   ensuite avec gh run list && npm view kandown version).
3. Le chat est testable sur http://localhost:2051 (daemon 0.57.0 deja lance) :
   sidebar agent, composer BeautifulUI, menus @ et modele, skills.

Note : la tache est laissee en Review car le push final appartient a vava.
Tout le reste est fait et verifie.
