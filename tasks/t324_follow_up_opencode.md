---
id: t324
title: Follow-up: opencode ACP rejects --resume and --model (acp 1.18.19)
status: Backlog
created: 2026-09-05
updated: 2026-09-05T17:51:10Z
---

## Context

Découvert pendant [[t322]] (vérification live des binaires, 2026-09-05) :
opencode 1.18.19 est un parseur yargs strict, sa sous-commande `acp` rejette
tout flag inconnu avec exit 1 (vérifié : `--model X` et `--resume <id>` sortent
tous les deux en exit 1 avec le help sur stderr ; un flag connu comme `--port`
passe). Conséquences côté kandown :

1. Le pick de modèle opencode est volontairement inert au spawn (allowlist
   `MODEL_FLAG_BY_HARNESS` dans l'adaptateur ACP, [[t322]]) : la shortlist UI
   est prête le jour où opencode accepte un flag.
2. PLUS GRAVE, préexistant : le chemin resume ACP d'opencode est cassé.
   `buildArgs` passe `--resume <id>` à `opencode acp`, ce qui termine en exit 1
   au spawn : reprendre une session opencode échoue à chaque fois avec cette
   version.

## Angle possible

La voie ACP standard pour reprendre une session est `session/new` avec
`loadSession` (ou l'équivalent selon la version du protocole), pas un flag
CLI : implémenter le resume ACP par le handshake plutôt que par argv, ou
descendre le flag dans la config opencode. À arbitrer avec la doc du protocole
ACP et les versions opencode cibles.

## Subtasks

- [ ] Confirmer les versions opencode affectées (1.18.19 vérifié ; trouver depuis quelle version `acp` est strict)
- [ ] Choisir la voie de resume (paramètre de handshake ACP vs config opencode) et l'implémenter dans `buildArgs` / `initialStdin` de l'adaptateur ACP
- [ ] Brancher le flag modèle opencode le jour où son CLI en accepte un (retirer l'inertie documentée dans `MODEL_FLAG_BY_HARNESS`)
