---
id: t307
title: Kandown Agent : socle harness (détection, adapters, événements normalisés)
status: Done
assignee: vava
priority: P1
tags: [agentic, harness, acp, adapters, daemon]
ownerType: human
created: 2026-09-05
order: 3
updated: 2026-09-04T23:05:53Z
category: AGENTIC
---

# Kandown Agent : socle harness

## Context

Première brique de la série "kandown agent" : le socle qui alimente le chat de
[[t308]], l'édition live de [[t309]], les skills boutons de [[t310]] et
l'orchestration de [[t311]].

Décision de design grillée avec vava (2026-09-04/05, pivot final le 05) :
**kandown n'embarque pas de LLM et ne demande jamais de clé API**. Il se branche
sur les harnesses que l'utilisatrice a déjà installés et authentifiés, dans la
philosophie de bb (https://github.com/get-bb/bb, MIT) : on copie la mécanique,
pas la dépendance.

Pourquoi ce choix l'emporte :

- **Friction zéro** : un dev en 2026 a déjà claude, codex ou pi installé et
  authentifié par abonnement. Demander une clé API, c'est demander un second
  abonnement et une configuration.
- **kandown est file-based** : le harness édite `tasks/*.md` avec ses propres
  outils ; pas besoin de tools custom. Le contexte board vient du compilateur
  `kandown work` (existant) et les gates restent appliquées sur les chemins
  gérés, comme pour tout agent externe aujourd'hui.
- **Agent complet gratuit** : grill-me peut lire le vrai code du repo pour
  affiner une tâche, pas seulement le texte de la tâche.

Faits vérifiés : l'ensemble de protocoles est borné et déjà validé par bb :
claude-code, codex et pi parlent chacun un mode natif (stream-json, exec json,
mode rpc JSONL), et ACP (Agent Client Protocol, ouvert, introduit par Zed)
couvre le long tail : un agent ACP présent sur le PATH apparaît tout seul
(opencode, grok, hermes...), un adapter ponte claude-code vers ACP.

## Technical Specifications

1. **Facade `AgentRuntime`** (`src/cli/lib/agent/agent-runtime.ts`) : interface
   unique createSession(config), stream d'événements typés, stop() ; les
   backends sont pluggables. v1 = backends harness uniquement. Un backend
   provider direct (BYOK, pi-ai) est volontairement re-carté : on le
   construira si des utilisatrices le réclament.
2. **Détection** : extension du scan `$PATH` existant (agents.ts, cf. [[t262]])
   : claude, codex, pi, agents ACP connus. Résultats runtime only, affichés
   dans Settings (harness connecté, version, mode effectif) ; sans harness,
   CTA d'installation, jamais d'erreur bloquante.
3. **Adapters, un par protocole (ensemble borné)** : claude-code (stream-json),
   codex (exec json / proto), pi (mode rpc), ACP générique (JSON-RPC stdio,
   couvre opencode et la suite). Chaque adapter normalise vers le modèle
   d'événements kandown : session_started, message_delta, tool_started,
   tool_finished, file_changed, usage, turn_completed, error, stopped.
4. **Permission modes normalisés** : `yolo` (défaut) et `accept-edits`, mappés
   sur les modes du harness quand il en expose (claude permission modes, modes
   de session ACP), dégradation advisory sinon. Settings montre le mode
   effectif. C'est le réglage consommé par [[t309]].
5. **Lancement** : cwd = racine du projet, prompt initial = document compilé
   `kandown work` (contexte tâche ou digest board, cf. [[t308]]) ; le harness
   persiste ses propres sessions, kandown ne stocke que l'index mince de
   [[t308]].
6. **Endpoints daemon** : liste des harnesses détectés, création de session,
   stream SSE, stop. Fan-out sur les trois adaptateurs d'API (server.ts,
   vite.config.ts, demoBackend.ts) ; standalone et mode démo => garde "lance
   le daemon" de [[t308]].
7. **Sécurité** : le harness tourne avec les permissions de sa propre
   utilisatrice (exactement comme lancé dans son terminal) ; kandown ne
   manipule aucun identifiant et ne streame la sortie du harness que vers
   l'UI locale.

## Subtasks

- [x] 1. Facade AgentRuntime + modèle d'événements normalisés
  report: src/cli/lib/agent/types.ts (9 types d'événements fermés) + agent-runtime.ts (create/subscribe/send/stop, registre 50 sessions, buffer 500 events, splitter LF-only conforme pi). Multi-tours géré : les protocoles one-shot (claude, codex) ré-ouvrent un process avec leur flag resume natif sous le même id de session kandown.
- [x] 2. Détection des harnesses (extension du scan [[t262]]) + affichage Settings avec CTA d'installation
  report: détection serveur dans src/cli/lib/agent/detect.ts (claude, codex, pi, opencode ACP, gemini ACP ; `which` + probe `--version` best-effort ; support permission par mode ; installHint). Côté UI : hook useAgentHarnesses, panneau Settings AgentHarnessesPanel (état installé, version, chemin binaire, chips native/advisory, CTA copiable ou lien), setting select `agent.permissionMode` dans le schéma, strings EN dans en.json.
- [x] 8. Endpoints daemon (harnesses, session, SSE, stop) + fan-out des 3 adaptateurs d'API
  report: server.ts (GET /api/agent/harnesses, POST/GET /api/agent/sessions, GET /api/agent/sessions/:id/events SSE avec replay du buffer, POST .../stop), vite.config.ts miroir dev via ssrLoadModule, demoBackend 501 honnête ("The agent runtime"). `pnpm verify` vert (typecheck, tests, build, codemap 227 fichiers 100%, changelog, brief, diff).
- [x] 3. Adapter claude-code (stream-json)
  report: adapters/claude-code.ts. `claude -p --output-format stream-json --permission-mode bypassPermissions|acceptEdits`, resume natif `--resume`. Tests verts.
- [x] 4. Adapter codex (exec json / proto)
  report: adapters/codex.ts. `codex exec --json --skip-git-repo-check`, yolo = bypass flags (native), accept-edits = sandbox workspace-write (advisory, pas d'approbateur interactif en exec). Resume via `exec resume <id>`. Tests verts.
- [x] 5. Adapter pi (mode rpc)
  report: adapters/pi.ts, écrit sur la doc officielle rpc.md (badlogic/pi-mono) : JSONL LF strict, prompt/steer/follow_up, switch_session pour resume (chemin de session), get_state pour le sessionId, abort au stop, busy tracking pour router les follow-ups. Tests verts.
- [x] 6. Adapter ACP générique (JSON-RPC stdio, long tail)
  report: adapters/acp.ts. Handshake initialize -> session/new -> set_mode (si mode correspondant) -> session/prompt. session_update normalisés (chunks, tool_call/update), request_permission répondu allow_once, callbacks fs déclinés en erreur JSON-RPC (pas de surface de lecture arbitraire). Tests verts.
- [x] 7. Permission modes normalisés (yolo / accept-edits) + mapping par harness
  report: PermissionMode/PermissionSupport dans src/lib/types.ts, config `agent.permissionMode` (défaut yolo) normalisée dans src/lib/config.ts, support par harness (claude native/native, codex native/advisory, pi advisory/advisory, ACP advisory upgrade natif par session quand un mode matche). Tests verts.
- [ ] 8. Endpoints daemon (harnesses, session, SSE, stop) + fan-out des 3 adaptateurs d'API
  report: server.ts (GET /api/agent/harnesses, POST/GET /api/agent/sessions, GET /api/agent/sessions/:id/events SSE avec replay buffer, POST .../stop), vite.config.ts miroir dev, demoBackend 501 honnête. Vérification build en cours.

## Livraison

- Un (ou plusieurs) commit propre par tâche fermée, préfixe `feat(agent)` ;
  `pnpm verify` vert avant chaque commit, push seulement sur demande de vava.
- Passer la tâche en Done dans kandown à la fermeture, avec un report réel
  écrit dans le fichier (protocole `kandown work`).
- Premier maillon de la chaîne : [[t308]] dépend de celle-ci.

## Completion report

Socle livré dans `src/cli/lib/agent/` : types.ts (modèle d'événements fermé à
neuf types + session config), detect.ts (catalogue harness borné : claude,
codex, pi, opencode ACP, gemini ACP, avec version probe et support permission
par mode), agent-runtime.ts (facade create/subscribe/send/stop, registre en
mémoire plafonné à 50 sessions, buffer de replay 500 événements par session,
splitter LF strict conforme au framing pi). Quatre adapters purs et testés :
claude-code (`-p --output-format stream-json`, permission modes natifs,
resume `--resume`), codex (`exec --json --skip-git-repo-check`, yolo = bypass
flags, accept-edits = sandbox workspace-write donc advisory, resume `exec
resume`), pi (`--mode rpc` écrit sur la doc officielle rpc.md : prompt avec
streamingBehavior, steer/follow_up, switch_session pour reprise, get_state
pour le sessionId, abort au stop), ACP générique (handshake initialize,
session/new, set_mode si un mode matche, session/prompt, tool_call/update,
request_permission répondu allow_once, callbacks fs déclinés proprement).
Multi-tours : les protocoles one-shot ré-ouvrent un process avec leur flag
resume natif sous le même id de session kandown, les protocoles interactifs
steerent le process vivant (pi busy tracking pour router prompt vs followUp).

Permission modes : `PermissionMode` dans src/lib/types.ts, config
`agent.permissionMode` (défaut yolo) normalisée partagée browser/CLI, support
par harness affiché en Settings (AgentHarnessesPanel + setting select).
Endpoints daemon : /api/agent/harnesses, POST/GET /api/agent/sessions (le
prompt initial est le document compilé `kandown work`, contexte tâche ou
digest board), SSE par session avec replay, stop ; fan-out complet sur les
trois adaptateurs d'API (server.ts, vite.config.ts, demoBackend 501). Le
harness tourne avec les permissions de l'utilisatrice, kandown ne touche
aucun identifiant et ne streame que vers l'UI locale (spawn sans shell, cwd
= racine projet).

Vérifié : `pnpm verify` complet vert (typecheck, 11 tests adapters, build,
codemap 227 fichiers 100% documentés, changelog, extension brief, diff).
Reste connu, hors scope voulu : pas de CLI steer endpoint (livré avec le
chat de [[t308]]), pas de provider BYOK (re-carté), versions ACP réelles à
confirmer au premier run contre opencode/gemini.
