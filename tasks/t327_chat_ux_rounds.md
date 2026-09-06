---
id: t327
title: Chat UX : rounds 8 a 14 (blobatar thinking, hover apercu, merges, tokens BUI)
status: Done
created: 2026-09-06
updated: 2026-09-06T16:00:00Z
---

## Context

Boucle iterate-test-fix lancee sur les retours vava apres la release 0.57.0,
chat en conditions reelles avec pi et claude (browser-use, dark et light).

## Rounds livrees

- Round 8 (9329114) : sidebar sous le scope `.bui` (vrais tokens au lieu des
  fallbacks kandown), thinking/tools replies par defaut, assistant deboite,
  marges serrees, mode chat centre (bouton dployer).
- Round 9 (4d54855) : mort du silence et des trous de 220px. ToolChips ne
  reserve plus sa min-height de demo hors galerie ; le loader pixel-grid
  couvre le boot (statuts starting/running, etat vide inclus) ; un message
  livre ouvre l'entree assistant immédiatement (openPendingTurn).
- Round 10 (2882923) : cause racine des labels invisibles et icones noires :
  81 usages de tokens HSL bruts comme couleurs directes (gradients shimmer,
  fill/stroke SVG, color-mix, shadows arbitraires) ; tous wrappes hsl().
  Ajout : form AnswerForm... (voir round 13)
- Round 10b (ddb8ef9) : les cartes options grandissent pendant le stream
  (le viewport mesure re-mesure quand questions change ; avant, tout choix
  arrive apres le premier etait clippé).
- Round 11 (8d098d0) : les tours d'activite successifs fusionnent en un bloc
  (compteur "Finished thinking (N)", tools agreges, deplie = tout le run) ;
  garde-fous : reponse ou user message casse la fusion. 4 tests fold.
- Round 12 (a2730e1) : formulaire grill redessine : typo du chat (13.5px),
  choix pleine largeur a tints rotatifs, input contraste, doubles marges
  remplacees par des traits.
- Round 13/14 (84b8226) : blobatar qui se concentre (shake) pendant le
  thinking + estimation de tokens qui grimpe + extrait throttle (600ms,
  coupe au mot) ; mentions et references de taches survolables avec aperçu
  scrollable du contenu (portail, cache par tache, clic drawer intact) ;
  store/theme guardes hors navigateur ; jsdom en devDep.

## Decisions

- Tool calls demotes : compteur replie seulement, l'accent live est sur le
  thinking (blobatar + tokens) : "les gens s'en foutent des tools calls".
- Le merge ne s'applique qu'aux tours sans reponse ; une reponse ou un
  message utilisateur ouvre un bloc neuf.
- opencode ACP reste inerte sur le model pick (CLI yargs strict) : [[t324]].

## Verification

- pnpm verify vert a chaque round ; 45 tests fold/options + 24 tests merge.
- Live pi/claude : loader des 0.9s, cartes options completes en stream,
  hover apercu (portail), dark et light.
- Bloque au moment du test final : quota Anthropic epuise jusqu'a 18h
  (claude et pi partagent le compte) ; la validation visuelle du blobatar
  live se fera au premier tour apres reset.
