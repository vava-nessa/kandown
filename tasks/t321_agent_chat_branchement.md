---
id: t321
title: Agent chat : branchement BeautifulUI (round 7) + finitions
status: Done
depends_on: [t308, t310]
created: 2026-09-05
updated: 2026-09-05T19:30:00Z
---

## Context

Suite directe des rounds BeautifulUI (v0.55.0 puis commits 467f51b et suivants) :
le catalogue BeautifulUI est porte dans src/components/bui/ et visible sur la
galerie #bui. Ce task trace le branchement du chat reel sur ces composants
(mapping valide par vava) et les finitions, realise en round 7 par un sub-agent.

## Subtasks

- [x] Brancher les composants BUI sur le chat reel selon le mapping valide (loading, thinking, tool rows, streaming, choices, recommandations, context cards, prompt bar officiel)
  report: fait en round 7 : loader pixel-grid + elapsed, ThinkingState reasoning alimente par le fold, ToolChips avec extraits et compteur, options en ApprovalCard (gliding menu, auto-advance), PROPOSE en RecommendationCard, mentions en ContextCards cliquables, composer rebati sur le Prompt Bar officiel (menu @, /skills, model menu avec entree Default, Steer/Queue, stop pendant tour). Bug stale-closure corrige dans ApprovalCard.send au passage.
- [x] Review du branchement (standards + spec) avant commit
  report: verify complet vert (676 tests), scan em-dash propre, mapping compare au brief round 7 item par item.
- [x] Traductions des cles ajoutees (47 locales)
  report: commit 8b2bf8c (chore(i18n)) : 329 additions, 47 locales, JSON valides. Les 11 cles manquantes decouvertes a la review (bulk.select/deselect, common.list...) sont entrees dans en.json la meme soiree ; leur propagation passe par la passe i18n de [[t322]].

## Livraison

- pnpm verify vert, commit feat(agent), daemon a jour, URL de test a vava.

## Completion report

Le chat reel tourne sur les composants BeautifulUI : chaque composant porte
dispose maintenant de props optionnelles (rows, live, onAccept, chunks...)
qui le branchent sur les donnees reelles du fold, et la galerie #bui garde
ses donnees de demo quand aucune prop n'est passee. Le composer est le
Prompt Bar officiel (menus @ et /, model picker en menu avec entree Default,
Steer/Queue, stop), le chat garde tous ses comportements kandown (mentions,
mention ids en data, pick-a-task, lazy start, guard stale-auth).

Verifie : typecheck propre, 352 tests front verts a la livraison puis 676
sur le verify complet, commit 29c0453. Reste : la passe de trad des 7 cles.

NOTE (2026-09-05 19:30) : le contenu de ce fichier a ete restaure a la main.
Le smoke test de `kandown undo` a fait ressortir une vieille entree du
journal (le move de t321 a Done de 17h21) et ecrase les reports coches
depuis : un undo sans garde de drift est une perte de donnees silencieuse.
La garde est ajoutee a undoLastAction dans la foulee. L'historique complet
des reports reste visible dans le log de la session agent.
