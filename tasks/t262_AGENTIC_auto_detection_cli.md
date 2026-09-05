---
id: t262
title: Auto-détection des CLI Agents & Cascade Pipelines
status: Todo
assignee: vava
priority: P1
tags: [agentic, cli, agents, pipeline, dag]
ownerType: human
created: 2026-07-26
order: 2
updated: 2026-09-04T14:49:58Z
category: AGENTIC
---

# Auto-détection des CLI Agents & Cascade Pipelines

## Context

Reconvertir le champ "Assignee" (inutile pour un dev solo) pour en faire un sélecteur d'agents IA installés sur la machine. Permettre le déclenchement de cascades de tâches automatisées en respectant l'ordre des dépendances, avec une configuration versionnée sur Git.

## Technical Specifications

1. **Scan Dynamique au Démarrage (`Startup Agent Detection`)** :
   - À chaque lancement du CLI/TUI/Web app, exécuter un scan ultra-rapide et non-bloquant du `$PATH` système (`which` / `where`).
   - Détecter automatiquement les binaires disponibles (`claude`, `aider`, `goose`, `opencode`, `codex`, `cursor`, etc.).

2. **Configuration Persistante & Versionnée (`.kandown/agents.json`)** :
   - Sauvegarder la liste des agents détectés et leurs paramètres dans un fichier local du projet (ex: `.kandown/agents.json`).
   - Ce fichier est commité sur Git pour que l'équipe partage la même cartographie d'agents et les mêmes alias de commandes.

3. **Reconversion du champ Assignee** :
   - Remplir le champ `assignee:` du frontmatter Markdown avec l'ID de l'agent sélectionné (ex: `assignee: claude-code`).

4. **Moteur d'Exécution en Cascade (DAG Orchestrator)** :
   - Lorsqu'un utilisateur clique sur "Play" ou lance `kandown run`:
     1. Identifier les tâches prêtes (status `To Do` et zéro dépendance bloquante).
     2. Lancer l'agent assigné sur la tâche active.
     3. À la fermeture de la tâche (création du *completion report* + passage à `Done`), débloquer automatiquement la tâche suivante.
     4. Transmettre le rapport de la tâche précédente à l'agent assigné à la tâche suivante et démarrer son exécution.

## Subtasks

- [x] 1. Scan dynamique au démarrage ($PATH check for `claude`, `aider`, `goose`, etc.)
- [ ] 2. Configuration persistante et versionnée (`.kandown/agents.json`)
- [x] 3. Reconversion du champ Assignee (sélecteur d'agents & frontmatter `assignee:`)
  report: La touche `a` du TUI assigne ET lance. `assignTaskToAgent` (board-reader.ts)
  écrit l'id canonique de l'agent dans `assignee:`, appelé par `prepareLaunch`
  (launcher.ts) juste avant le move vers "In Progress" : une seule action, un seul
  write, et la web view attribue la tâche à l'agent qui tourne vraiment. La détection
  `which` cache désormais le chemin absolu (`resolveBinPath`) au lieu d'un booléen ;
  le picker liste uniquement les binaires présents, nom + chemin en dimmed, sans
  description. Catalogue élargi : copilot, amp, droid, auggie, amazonq (q), cline, agy.
  Tests : src/cli/lib/__tests__/agent-assign.spec.ts (12 cas). Vérifié de bout en bout
  dans le TUI sur un board jetable (assignee + status + prompt transmis).
- [x] 4. Moteur d'Exécution en Cascade (DAG Orchestrator, chaining tasks, completion report handoff)
  report: Remplacé par le preset autopilot de [[t311]] (orchestration agentic plutôt que DAG codé en dur) : readiness (status + depends_on résolus), dispatch de sessions harness via le runtime t307, handoff des completion reports vers les tâches suivantes, budget et kill switch. Le chaînage historique `kandown run` (src/cli/lib/cascade.ts) reste disponible pour les runs séquentiels synchrones.
