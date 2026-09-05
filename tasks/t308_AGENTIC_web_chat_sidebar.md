---
id: t308
title: Kandown Agent : chat latéral web (sidebar droite, BeautifulUI, sessions globales)
status: Done
assignee: vava
priority: P1
tags: [agentic, llm, web, chat, ui, sidebar]
ownerType: human
depends_on: [t307]
created: 2026-09-05
order: 4
updated: 2026-09-05T00:43:19Z
category: AGENTIC
---

# Kandown Agent : chat latéral web

## Context

Deuxième brique : le chat lui-même, qui rend le socle de [[t307]] visible.
Décisions de design arrêtées :

- **Sidebar droite fixe** (repliable) sur desktop, plein écran sur mobile
  (pattern Drawer existant). Contexte glissant : une tâche sélectionnée donne
  le contexte de cette tâche, sinon c'est le board digest. Le même panneau sert
  à bosser sur kandown : rédiger des specs, organiser, planifier.
- **Primitives UI** : BeautifulUI (https://www.beautifului.dev, MIT, composants
  copy-paste orientés IA : Chat, Prompt Bar, Streaming Text, Thinking, Tool
  Chips, Approval Card), portés au style kandown (React 19, Tailwind, motion).
  Alternative avec registry CLI : AI Elements de Vercel (MIT). Choix final au
  sprint sur la qualité du port.
- **Conversations possédées par le harness** : chaque harness persiste déjà ses
  propres sessions (claude, codex, pi). Kandown ne stocke aucune conversation :
  il garde un index mince dans `~/.kandown/sessions/<project-hash>/` avec les
  liens tâche vers session et les titres, de quoi alimenter le switcher et la
  reprise (flags resume natifs du harness). État de chat, pas état de tâche :
  hors de tasks/, la règle 6 respire.
- **Plusieurs conversations par projet, isolement étanche** : une session est
  lancée avec cwd = racine du projet, le harness ne voit que ce que voit un
  terminal ouvert dans le repo ; l'index est clé par hash de chemin canonique
  (même recette que `project-state` dans `src/lib/extensions/state.ts`), et un
  daemon par projet : rien ne fuite d'un projet à l'autre.
- **Minimal v1** : bouton stop + compteur tokens/coût en direct. Hors daemon :
  bouton invitant à le lancer, pas de chat.

## Technical Specifications

1. **Composants** : ChatPanel (sidebar repliable), MessageList, PromptBar
   (avec picker de skills, cf. [[t310]]), Thinking + StreamingText, ToolChips
   (affichage des tools appelés), ApprovalCard (mode acceptation, cf. [[t309]]).
   Strings en anglais dans `src/lib/i18n/locales/` (règle 4), traduites ensuite.
2. **Contexte** : system prompt compilé par le compilateur kandown-work existant
   (task context ou board digest), plus l'état du mode YOLO/acceptation et la
   liste des skills actifs.
3. **Streaming** : SSE du daemon vers la sidebar, rendu progressif dans le
   store Zustand, rollback propre en cas d'erreur (pattern store existant).
4. **Actions depuis les cartes** : les entrées de contexte menu des cartes et de
   l'éditeur ("Grill me", "Refine") ouvrent la sidebar pré-contextualisée sur
   la tâche, en mobile comme en desktop.
5. **Switcher de conversations + isolement** : liste des conversations du
   projet courant (titre auto : premier message ou tâche liée), nouvelle
   conversation, reprise via les flags resume natifs du harness, oubli local
   de l'entrée d'index. Extraire la canonisation + hash de
   `src/lib/extensions/state.ts` dans un petit helper partagé (mêmes clés que
   project-state, dossier `sessions/` à côté de `extensions/`) ; le daemon ne
   sert que l'index de son propre projet, jamais un chemin fourni par le
   client.

## Subtasks

- [x] 1. Sidebar droite repliable (desktop) + plein écran mobile
  report: ChatSidebar.tsx (400px fixe desktop sous le header, overlay plein écran mobile sur le pattern Drawer), toggle dans le header + raccourci Cmd/Ctrl+J documenté dans le cheatsheet, montée dans App.tsx.
- [x] 2. Port des primitives BeautifulUI au style kandown (Chat, PromptBar, Streaming, ToolChips)
  report: primitives portées au style kandown (tokens, motion-presets, sans dépendance) : MessageList (bulles, ThinkingBlock, ToolChips ok/failed), StreamingText (caret), PromptBar (autosize, Enter/Shift+Enter, stop remplace send pendant un tour), UsageBadge, DaemonGuardCard. Choix pris au sprint : port direct plutot que copie BeautifulUI, zéro nouvelle dépendance.
- [x] 3. Contexte task/board via le compilateur kandown-work + état du mode d'édition
  report: le prompt initial est le document compilé (taskId quand on lance depuis une carte/éditeur, digest board sinon) ; bouton "Ask the agent" sur les cartes (hover) et en pied des deux éditeurs ; chip du mode de permission courant dans le header de la sidebar, envoyé explicitement à la création.
- [x] 4. Index mince des sessions ~/.kandown/sessions/<hash>/ (liens tâche<->session, helper projectHash partagé)
  report: session-index.ts (une entrée JSON par session : harnessId, harnessSessionId patché à la session_started, titre auto, taskId, timestamps) ; project-hash.ts extrait de extensions/state.ts à l'identique (clés disque inchangées, suites extensions vertes) ; endpoints GET/DELETE sessions-index, le daemon ne sert que l'index de son propre projet.
- [x] 5. Switcher de conversations (liste, nouvelle, reprise via resume du harness, oubli) + isolement inter-projets
  report: SessionSwitcher (titre, temps relatif, chip harness, taskId ; nouvelle conversation = brouillon lancé au premier envoi ; reprise = createAgentSession avec resumeSessionId natif du harness ; oubli = DELETE index sans tuer la session vivante) ; un seul flux SSE actif à la fois, replay du buffer à la réouverture.
- [x] 6. Stop + compteur tokens/coût live
  report: stopSession optimiste (statut stopping, rollback si le POST échoue) via POST .../stop avec X-Kandown-Token ; UsageBadge cumule input/output/cached/cost depuis les events usage.
- [x] 7. Garde standalone/démo : bouton "lancer le daemon"
  report: DaemonGuardCard affichée quand l'index répond null (hors server mode) : carte neutre + snippet `npx kandown` copiable ; helpers filesystem retournent null sans jamais throw.
- [x] 8. i18n : strings EN source + traductions des locales existantes
  report: bloc agentChat (23 clés) + cheatsheet + settings (permissionMode, yolo, acceptEdits, harnesses x14) traduits dans les 47 locales, JSON tous valides, diff purement additif. Follow-up cosmétique noté : 9 traductions basées sur une copy EN voisine (pré-translation d'un brief), en.json reste la source.

## Livraison

- Un (ou plusieurs) commit propre par tâche fermée, préfixe `feat(agent)` ;
  `pnpm verify` vert avant chaque commit, push seulement sur demande de vava.
- Passer la tâche en Done dans kandown à la fermeture, avec un report réel
  écrit dans le fichier (protocole `kandown work`).

## Completion report

Le chat est branché sur le socle de [[t307]]. Côté backend : index mince des
conversations dans `~/.kandown/sessions/<hash>/` (une entrée JSON par session,
harnessSessionId persisté dès que le harness le rapporte, jamais le contenu
des conversations : le transcript reste chez le harness), helper
`project-hash.ts` partagé avec le système d'extensions (même clé sur disque),
et les endpoints `POST /api/agent/sessions/:id/send` (messages de suivi,
steer ou resume natif), `GET /api/agent/sessions-index`,
`DELETE /api/agent/sessions-index/:id` (oubli local). Côté web : sidebar
droite repliable (plein écran mobile), primitives de chat portées au style
kandown sans nouvelle dépendance (streaming, thinking, tool chips), switcher
(nouvelle, reprise, oubli), stop toujours accessible, compteur tokens/coût
live, garde "lance le daemon" hors server mode, entrée "Ask the agent"
pré-contextualisée sur les cartes et dans les deux éditeurs, Cmd/Ctrl+J.
SSE par session avec replay du buffer : rouvrir la sidebar rattrape l'historique
du tour en cours. Isolement inter-projets : hash de chemin canonique + un
daemon par projet, l'API ne sert que l'index du projet du daemon.

Vérifié : `pnpm verify` complet vert (typecheck, 397 tests dont 14 sur le
reducer de chat et la suite session-index, build, codemap 240 fichiers 100%,
changelog, brief, diff), plus une probe live du serveur de test sur chaque
route. Suivis notés, non bloquants : 9 traductions basées sur une copy EN
voisine ; le harnessSessionId d'une session reprise n'est re-persisté à
l'index qu'au prochain stop (watcher désabonné au premier stopped) ; le picker
de skills dans la PromptBar arrive avec [[t310]].
