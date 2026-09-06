---
id: t324
title: Follow-up: opencode ACP rejects --resume and --model (acp 1.18.19)
status: Done
created: 2026-09-05
updated: 2026-09-06T22:30:02Z
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

- [x] Confirmer les versions opencode affectées (1.18.19 vérifié ; trouver depuis quelle version `acp` est strict)
  report: 1.18.5 (binaire nvm de cette machine) et 1.18.19 (verifie en t322) sont tous deux yargs stricts sur la sous-commande acp ; le bornage exact de la version d'introduction n'a pas ete pousse plus loin, sans objet puisque la voie retenue ne passe plus par argv du tout.
- [x] Choisir la voie de resume (paramètre de handshake ACP vs config opencode) et l'implémenter dans `buildArgs` / `initialStdin` de l'adaptateur ACP
  report: commit 7b1829d. Voie handshake ACP standard : --resume supprime de buildArgs, le resume part en session/load {sessionId, cwd} apres initialize (capabilite agentCapabilities.loadSession=true verifiee en probe live sur opencode 1.18 ; session/load avec un vrai id repond en ~7s). Repli : load refuse = un seul retry en session/new + event erreur non fatal (l'historique est perdu, la session vit) ; session/new refusee = fatal. Note de sonde : opencode ne repond RIEN a session/load avec un id inexistant (hang) ; le repli ne couvre que les agents qui repondent, un id invalide venu de nulle part reste un cas ou l'attente initiale expirera cote runtime.
- [x] Brancher le flag modèle opencode le jour où son CLI en accepte un (retirer l'inertie documentée dans `MODEL_FLAG_BY_HARNESS`)
  report: commit 7b1829d, mieux que prevu : pas besoin du flag CLI. session/new et session/load d'opencode portent configOptions (select id=model avec TOUTE la liste des modeles du compte + currentValue), et session/set_config_option {configId:'model', value} applique le pick (verifie live : la reponse echo la nouvelle currentValue). L'adaptateur envoie le set avant le premier prompt ; refus = event non fatal. Le pick opencode n'est donc plus inerte, et la meme voie sert a tout agent ACP qui expose configOptions. gemini garde son --model argv (verifie t322). Bonus : GET /api/agent/models sert la liste reelle au menu du chat (module model-catalog.ts, fusion baseline + discovery, recette BB).
