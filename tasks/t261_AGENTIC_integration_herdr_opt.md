---
id: t261
title: Intégration Herdr (Opt-in / Auto-détection)
status: In Progress
assignee: vava
priority: P1
tags: [agentic, herdr, integration, runner, ui]
ownerType: human
created: 2026-07-26
order: 0
updated: 2026-09-05T09:42:50Z
category: AGENTIC
---

# Intégration Herdr (Opt-in / Auto-détection)

## Context

Kandown conserve sa promesse d'un outil ultra-léger, installable en 30 secondes et sans dépendances forcées. Pour les utilisateurs de **Herdr** (multiplexeur de terminal pour agents IA), cette intégration débloque une expérience de *vibe coding* complète :

- **Suivi en temps réel** : Visualisez l'état de l'agent (`Working`, `Blocked`, `Done`) directement sous forme de badges sur vos cartes Kanban.
- **Aperçu Live** : Affichez le flux du terminal (PTY) de l'agent sans quitter l'interface de Kandown.
- **Lancement en 1 clic** : Démarrez un agent sur une tâche dédiée via un simple bouton.
- **Zero Configuration** : Si Herdr est installé, Kandown l'exploite automatiquement. Sinon, Kandown fonctionne de manière 100 % autonome sans alourdir l'application.

## Technical Specifications

1. **Architecture - Pattern Adapter (Runners)** :
   - Créer une interface générique `TaskRunner`.
   - Implémenter `DefaultRunner` : gestion standard des processus/CLI locaux (comportement par défaut).
   - Implémenter `HerdrRunner` : communication via Socket Unix (`/tmp/herdr.sock`) ou CLI Herdr.

2. **Auto-détection Silencieuse (Zero-Config)** :
   - Tester au démarrage la présence du socket/service Herdr.
   - Si Herdr est absent : aucun warning, aucune erreur, aucun composant UI bloqué. Retombée transparente sur `DefaultRunner`.

3. **UI & Progressive Disclosure** :
   - Masquer tous les éléments Herdr par défaut.
   - Si Herdr est détecté : afficher le bouton `[⚡ Run with Herdr]`, les badges d'état dynamique et la vue d'aperçu PTY du terminal dans la modal de tâche.

4. **Synchronisation d'événements** :
   - Écouter les changements d'état d'un agent via le socket Herdr.
   - Mettre à jour automatiquement la carte Kandown (ex: passage à *Done*, extraction des logs du terminal pour alimenter le *completion report*).

## Subtasks

- [ ] 1. Architecture Runner (Adapter Pattern & TaskRunner interface)
- [ ] 2. Auto-détection silencieuse de Herdr (socket/service test)
- [ ] 3. UI Progressive Disclosure (bouton [⚡ Run with Herdr], badges d'état, preview PTY terminal)
- [ ] 4. Synchronisation d'événements (socket events, passage à Done, extraction logs dans report)

## Decisions (2026-09-05, prises pendant l'implémentation)

- **Socket réel** : la spec annonçait `/tmp/herdr.sock`. Herdr 0.8.2 expose en fait
  `~/.config/herdr/herdr.sock` (`herdr status`). La détection cherche
  `$HERDR_SOCKET`, puis `$XDG_CONFIG_HOME/herdr/herdr.sock`, puis
  `~/.config/herdr/herdr.sock`, plus le binaire `herdr` dans le PATH.
- **Transport** : la CLI `herdr` (qui parle elle-même au socket) plutôt qu'un
  client socket maison. Elle renvoie du JSON stable et versionné, et évite de
  réimplémenter le protocole (`protocol: 20`) qui n'est pas figé.
- **Pas d'auto-move vers Done** : la spec demandait le passage automatique en
  *Done*. Les règles kandown réservent la colonne terminale à une validation
  humaine, donc un run Herdr terminé écrit son rapport dans le fichier de tâche
  et affiche l'état `done` sur la carte, sans franchir la colonne.
- **Runners, pas remplacement** : `DefaultRunner` enveloppe le runtime harness
  existant (t307/t308) sans changer son comportement. Herdr est un second
  runner, jamais un préalable.
- **Pas de worktree** : le checkout principal portait déjà un large travail non
  commité (23 fichiers) ; un worktree issu de HEAD aurait perdu ce contexte.

## Plan (tranches verticales)

1. Slice 1 (subtask 1 + 2) : module `src/cli/lib/runner/` (contrat `TaskRunner`,
   `DefaultRunner`, `HerdrRunner`, détection silencieuse) + route
   `GET /api/agent/runners` + tests unitaires.
2. Slice 2 (subtask 3) : routes launch/list/read/stop, slice de store, UI en
   divulgation progressive (bouton, badges, aperçu PTY).
3. Slice 3 (subtask 4) : synchronisation d'événements (polling d'état, rapport
   de run écrit dans le fichier de tâche).
