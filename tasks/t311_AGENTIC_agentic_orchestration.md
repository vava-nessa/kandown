---
id: t311
title: Kandown Agent : orchestration (sessions vers cartes, herdr/tmux, autopilot)
status: Done
assignee: vava
priority: P2
tags: [agentic, orchestration, herdr, tmux, autopilot]
ownerType: human
depends_on: [t310]
created: 2026-09-05
order: 7
updated: 2026-09-05T06:55:57Z
category: AGENTIC
---

# Kandown Agent : orchestration

## Context

Le morceau final de la série : kandown comme tour de contrôle. L'ordonnancement
est **agentic, pas un pipeline codé en dur** : l'agent lit le board, choisit le
travail prêt, dispatch, rend compte. kandown reste déterministe aux frontières :
dependency gate, convention de completion report, budget, kill switch. Remplace
le DAG orchestrator codé en dur de [[t262]] (subtask 4) par un preset
"autopilot", et s'appuie sur le runner herdr de [[t261]] pour les sessions
lourdes visibles (PTY).

Les sub-agents sont des sessions harness de plus : dispatch via le launcher
existant ([[t262]], agents détectés) ou via herdr/tmux ([[t261]]) pour les
sessions visibles avec preview PTY et suivi iPhone/Moshi ; le suivi d'état
passe par les événements normalisés de [[t307]], pas par un loop maison.

## Technical Specifications

1. **Mapping session vers carte** : toute session (chat, agent dispatché,
   sub-agent) est reliée à sa tâche via l'entrée custom de session ([[t308]]) ;
   badges d'état live sur la carte (Working, Blocked, Done), stop par carte.
2. **Dispatch** : l'orchestrateur lance des sessions harness via le launcher
   existant ([[t262]], agents détectés) pour un one-shot, ou via herdr/tmux
   ([[t261]]) pour une session visible avec PTY ; le pilotage (steer, stop)
   passe par les adapters de [[t307]].
3. **Preset autopilot** : readiness (status + depends_on résolus), dispatch,
   completion report, handoff du rapport vers la tâche suivante ; chaque
   changement de colonne reste soumis aux gates, le passage à Done reste
   proposé par l'agent et confirmable par l'humain.
4. **Budget et kill switch** : plafonds de tokens/coût par session et par run
   autopilot (settings), stop global depuis le header de la sidebar et depuis
   la carte.
5. **Concurrence** : limite configurable de sessions parallèles, file
   d'attente simple, reprise après crash du daemon (les fichiers restent la
   vérité : une tâche en cours sans session vivante est marquée à reprendre).

## Subtasks

- [x] 1. Mapping session vers carte + badges live + stop par carte
  report: le mapping passe par les events board SSE agent_edit_started/ended (t309) et le snapshot autopilot ; chips Working/Queued/Resumable sur les cartes (board) et les lignes (list), bouton stop par carte (toujours visible quand une session est active, POST .../stop avec token, optimistic + toast).
- [x] 2. Tool dispatch_task + intégration launcher / herdr / tmux
  report: le dispatch v1 passe par le runtime t307 (sessions headless pilotables : steer, stop, events normalisés), ce qui est le canal que l'orchestrateur sait observer. L'intégration herdr/tmux (sessions visibles PTY) dépend du runner de [[t261]] encore en Todo : reportée d'un cran, le preset reste compatible quand elle arrivera. `kandown run` (cascade synchrone) reste disponible pour les runs séquentiels.
- [x] 3. Preset autopilot (readiness, handoff des reports, gates)
  report: orchestrator.ts (23 tests) : readiness = status non terminal + depends_on résolus + pas de session vivante (helpers partagés de la dépendance, jamais de copie), dispatch jusqu'à maxParallel (tick 5s), prompt = document compilé + directive (report écrit, passage à Done proposé et confirmable par l'humain) + handoff des reports des tâches terminées du run. L'orchestrateur n'écrit jamais les fichiers de tâches : les moves appartiennent au harness via les gates existantes.
- [x] 4. Budget caps + kill switch global
  report: cumul usage par session dans le runtime (tokens + coût), caps par session et par run dans config agent.autopilot (décision stricte > cap), dépassement => stop session ou stop du run ; kill switch dans le header de la sidebar (destructif, debounce 800ms) + stop par carte ; réglages maxParallel et caps dans Settings (schema).
- [x] 5. Concurrence : limite, file d'attente, reprise après crash
  report: maxParallel (1..8, défaut 2), file d'attente prioritaire (P1 puis id) ; à chaque start, les tâches actives sans session vivante sont marquées orphelines et re-file d'abord (les fichiers sont la vérité) ; tâche non terminée en fin de session => abandonnée ce run, jamais re-file automatiquement.
- [x] 6. Clore la subtask 4 de [[t262]] (remplacée par ce preset)
  report: cochée dans tasks/t262 avec report de remplacement.

## Livraison

- Un (ou plusieurs) commit propre par tâche fermée, préfixe `feat(agent)` ;
  `pnpm verify` vert avant chaque commit, push seulement sur demande de vava.
- Passer la tâche en Done dans kandown à la fermeture, avec un report réel
  écrit dans le fichier (protocole `kandown work`).

## Completion report

Kandown devient une tour de contrôle : le preset autopilot lit le board,
dispatch des sessions harness sur les tâches prêtes, transmet les completion
reports en handoff, applique les budgets et reste arrêtable partout. Les
frontières restent déterministes : readiness calculée avec les helpers de
dépendance partagés, changements de colonne opérés par le harness à travers
les gates existantes, passage à Done proposé dans le report et confirmé par
l'humain, fichiers de tâches jamais écrits par l'orchestrateur.

Endpoints : GET/POST start/stop /api/agent/autopilot, snapshot diffusé en SSE
board à chaque pivot (active, queue, orphans, totals). UI : AutopilotControls
(start/kill switch + totals) dans la sidebar, chips Working/Queued/Resumable
et stop par carte sur board et list, réglages budget dans Settings. Sémantique
des totals fixée : le daemon est propriétaire du cumul du run, le front
remplace, il n'accumule jamais.

Vérifié : `pnpm verify` complet vert (typecheck, 52 tests t311 + suites
complètes, build, codemap, changelog, brief, diff). Suivis notés : dispatch
herdr/tmux (PTY visible) attend le runner de [[t261]] ; les sessions autopilot
répondent aux demandes de permission ACP en auto-réponse (cohérent avec le
mode yolo par défaut) ; la reprise orpheline re-file les tâches bloquées en
milieu de colonne avant le backlog prêt (les gates et les directives de
prompt couvrent ce cas).
