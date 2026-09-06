---
id: t322
title: Agentic : finitions techniques + dispatch visible herdr/tmux
status: Done
depends_on: [t321, t261]
created: 2026-09-05
updated: 2026-09-05T18:19:00Z
---



## Context

Finitions techniques notees dans les reports des tasks t307 a t311, plus le
dispatch visible qui attend le runner herdr de [[t261]].

## Subtasks

- [x] Endpoint GET /api/agent/active-edits : presence des sessions sur les cartes des le reload
  report: commit 504bf80. Route daemon en lecture seule (jamais de creation lazy du runtime, binding kandownDir, auth globale, teste 401/200 + paires reelles via setAgentEditRuntimeForTests), seed client une fois par page en server mode via le fold pur partage (seedAgentEditsFromPairs), miroir dev {edits:[]} commente, demo garde son 501 et le client ne l'appelle pas. Review independant : approve 2 axes.
- [x] Model picker pour les sessions ACP (flags par agent ou session/set_model)
  report: commits ad113a4 (partie buildArgs, avalisee par le commit du fix permissions) + 2e817d2 (shortlists UI). Verification reelle des binaires : gemini 0.46.0 accepte --model partout (yargs global), opencode 1.18.19 est yargs strict et rejette tout flag inconnu de sa sous-commande acp (exit 1 verifie) : allowlist MODEL_FLAG_BY_HARNESS = {gemini}, opencode inert documente (3 endroits). session/set_model ecarte (pas standard ACP). Suivi : [[t324]].
- [x] Tests du routage permissions ACP (extractPermissionRequest / buildPermissionResponse)
  report: 26 tests dans src/cli/lib/__tests__/acp-permissions.spec.ts (extract 7, buildReply 6, isEditLike 2, onPermissionRequest 3, parseLine yolo 2, buildArgs 6 : le compteur "20" du message de commit ad113a4 datait de l'ajout des tests buildArgs). Finding corrige au passage : parseLine n'avait pas le fallback allow_always du chemin route (un agent n'offrant qu'un allow permanent recevait cancelled et le tour restait bloque) ; aligne sur buildPermissionResponse.
- [x] Verrouiller l'ordre de re-file des orphelines (milieu de colonne avant backlog pret ?)
  report: 7 tests (orchestrator-orphans.spec.ts). Decision : orphelines (milieu de colonne, crash-recovery) re-filees EN PREMIER, puis taches pretes par priorite puis id numerique ; verrouille par tests. Finding corrige : une orpheline bloquee par une dependance non resolue etait re-filee quand meme, contrairement aux directives autopilot ("never bypass a dependency") ; start() filtre maintenant les orphelines par la readiness et elles restent visibles dans snapshot.orphans (surface humaine non gatee).
- [x] Realigner les 9 traductions t308 basees sur une copy EN voisine
  report: DEJA LIVRE (verifie par audit de sous-agent le 2026-09-06) : commit e5dc22d ("chore(i18n): propagate the eleven new UI keys and realign the agent settings translations") = 49 corrections dont harnessLabel systemique dans les 47 locales ; la case etait simplement restee decochee. Audit independant sur HEAD : aucun drift residual (harnessLabel aligne sur "Harness for new chats" partout, zero collision de valeurs voisines sur les cles agentChat, echantillon fr/de/es/ja/ru/pt correct). Suivi non bloquant note : des em-dashes trainent encore dans les copies traduites de 3 cles (emptyState.selectFolderDesc, agent.desktopTooltip, toast.settingsUpdatedExternally) ; propagation prevue avec le prochain lot i18n.
- [ ] Dispatch visible herdr/tmux pour l'autopilot (depends sur le runner de [[t261]])
  report: BLOQUE, non double volontairement. Le contrat TaskRunner existe (src/cli/lib/runner/types.ts + herdr-client.ts, client complet : detection, tab create, mapHerdrStatus, convention kd:<taskId>) mais les implementations annoncees (herdr-runner.ts, default-runner.ts, index.ts) n'existent pas et l'agent t261 n'a pas touche ses fichiers depuis 11h44. Le dispatch visible = dispatcher la session autopilot dans un PTY visible, ce qui appartient au start() du runner : l'ecrire serait doubler [[t261]]. Le preset est deja compatible par design (seam AutopilotSessionFactory injectable, report t311). Suivi de decouverte associe cree : [[t324]] (opencode acp rejette --resume et --model). Reste a vava : reveiller l'agent t261 ou transferer la tache.

## Decisions

- Orphelines d'abord : le crash-recovery (reprendre une tache en cours) passe
  avant le demarrage de travail neuf, meme si la tache prete est P1 et
  l'orpheline sans priorite. Ordonnancement interne : orderQueue (priorite,
  puis id numerique).
- Gate de dependance appliquee au re-file : orpheline avec dependance non
  resolue = pas re-filee automatiquement, mais toujours listee dans
  snapshot.orphans pour l'humain.
- Permissions ACP : les deux chemins de reponse (auto-allow parseLine en yolo,
  reponse differee buildPermissionResponse apres decision UI) partagent la
  meme priorite d'options (allow_once puis allow_always, reject_once puis
  reject_always).

## Livraison

- pnpm verify vert par lot de subtasks, commits feat(agent) separes.

## Completion report

5 des 6 subtasks livrees, revues et acceptees (review independant deux axes :
APPROVE, 90/90 tests sur les suites touchees) :

1. Endpoint GET /api/agent/active-edits + seed presence au reload (504bf80).
2. Model picker ACP : gemini --model verifie live, opencode inert documente
   (ad113a4 + 2e817d2), shortlists UI.
3. Routage permissions ACP verrouille par 26 tests + fix fallback allow_always
   (ad113a4).
4. Ordre de re-file des orphelines verrouille par 7 tests + gate dependance
   appliquee au re-file (cec7c00).
5. Realignement des trads t308 : 49 corrections (dont harnessLabel systemique
   dans les 47 locales) + 517 additions pour les 11 nouvelles cles (e5dc22d).

Non livre : le dispatch visible herdr/tmux, bloque sur les implementations du
runner [[t261]] (contrat present, implementations absentes, agent t261 inactif
depuis 11h44). Volontairement non double, voir le report de la subtask. C'est
le seul point ouvert de la feat agentic cote code ; vava arbitre au retour.

Commits : ad113a4, cec7c00, 2e817d2, 504bf80, a9282e6, e5dc22d (+ 8b2bf8c
cote t321). pnpm verify vert sur chaque lot. Suivi de decouverte : [[t324]].
