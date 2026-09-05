---
id: t309
title: Kandown Agent : édition live (border-beam, blobatar, diff live, YOLO/acceptation)
status: Done
assignee: vava
priority: P2
tags: [agentic, llm, web, ux, diff]
ownerType: human
depends_on: [t308]
created: 2026-09-05
order: 5
updated: 2026-09-05T01:40:35Z
category: AGENTIC
---

# Kandown Agent : expérience d'édition live

## Context

Rendre l'édition par l'agent visible et désirable, sur les vues board et list.
Pendant qu'une session de [[t307]] édite une tâche :

- La carte porte une **border-beam** : un halo animé qui court sur son bord.
  Référence : https://libraries.dev/beam (composant React, zéro dépendance
  runtime, React 18+) ; licence à confirmer sur le repo au moment du port,
  fallback : port du BorderBeam de MagicUI (MIT).
- Un **blobatar** (https://github.com/Alain00/blobatar, MIT, blobs SVG
  déterministes et animés : respiration, clignement) flotte au-dessus de la
  carte avec une petite bulle "I am editing...".
- La tâche reste ouvrable mais l'éditeur passe en **lecture seule** et montre le
  **diff live vert/rouge**. Le bouton stop reste toujours accessible.

**Qui écrit, et quand** : le harness écrit les fichiers avec ses propres outils,
selon le mode choisi dans les settings (cf. [[t307]]) :

- **YOLO (défaut)** : l'agent applique ses éditions directement, git est le
  filet ; le diff live est indicatif (l'opération est déjà appliquée quand on
  la voit) et le stop interrompt la suite.
- **Acceptation (opt-in)** : mappé sur le mode "edits à approuver" du harness
  quand il en expose un (claude permission modes, modes de session ACP) :
  l'édition est tenue par le harness jusqu'à approbation, la carte et
  l'éditeur portent une Approval Card (Appliquer / Rejeter). Sinon,
  dégradation advisory : le diff s'affiche après coup, sans blocage.

## Technical Specifications

1. **Diff depuis le file watcher** : le harness écrit `tasks/*.md` avec ses
   propres outils ; les avant/après viennent donc du watcher chokidar existant,
   poussés par le chemin SSE standard. Kandown n'écrit jamais à la place de
   l'agent, il reflète les fichiers.
2. **Composants** : CardBeam (wrapper border-beam autour de Card, vues board et
   list), AgentBubble (blobatar + bulle, respecte `prefers-reduced-motion`),
   DiffOverlay (markdown avant/après ; primitives Diff de BeautifulUI ou Code
   Block mode diff, adaptées au style kandown).
3. **Lock éditeur** : pendant une édition en cours, TaskWorkspace (desktop) et
   Drawer (mobile) passent les champs en lecture seule via un composant
   partagé, cf. checklist fan-out de AGENTS.md.
4. **Anti-conflit** : si l'utilisatrice éditait déjà la même tâche, réutiliser
   ConflictModal et la résolution SSE standard au moment du write.
5. **Mode dans les settings** : YOLO par défaut / acceptation, mappé sur les
   permission modes du harness quand il en expose (cf. [[t307]]), dégradation
   advisory sinon ; la garde "projet non git" propose git init ou force
   l'acceptation.

## Subtasks

- [x] 1. Diff live depuis le watcher chokidar (avant/après poussés en SSE)
  report: le daemon possède maintenant son propre watcher (server.ts, un par process, LRU de contenu 200 fichiers) ; task_diff poussé sur /api/events uniquement quand une paire (session, tâche) est active, avant/après plafonnés à 24k caractères avec flag truncated ; started/ended strictement idempotents (turn_completed + 10s de linger, stop, ou idle 2 min).
- [x] 2. border-beam sur les cartes (board + list) avec port/licence vérifiée
  report: CardBeam écrit from scratch (anneau conique mask-clippé 1.6px, token primary), licence confirmée : MagicUI BorderBeam MIT (WebFetch), inspiration libraries.dev/beam notée en entête ; démontage animé, glow statique sous prefers-reduced-motion ; monté sur Card (board) et ListRow (list).
- [x] 3. Blobatar + bulle "I am editing..." au-dessus de la carte
  report: Blobatar SVG déterministe (djb2 du sessionId : forme Catmull-Rom, teinte, phase), respiration + clignement CSS, bulle i18n ; source confirmée MIT (Alain00/blobatar) ; statique sous reduced motion ; aussi en header des deux éditeurs.
- [x] 4. DiffOverlay markdown live + lock lecture seule des deux shells d'éditeur
  report: DiffOverlay (diff par lignes sans LCS, contexte collapsé, notice truncated) monté dans TaskWorkspace ET Drawer ; lock via points de choke minimaux (readOnly titre + éditeurs BlockNote, garde updateField et subtasks, disabled catégories) + note ambrée "editor locked".
- [x] 5. Mode acceptation (Approval Card Appliquer/Rejeter) + setting du mode
  report: pour les harness ACP en accept-edits, les demandes de permission édit-like sont routées vers l'UI (file permission-queue, endpoints pending + resolve, réponses JSON-RPC différées allow_once/reject_once, jamais de deadlock : auto-allow si pas de handler) ; ApprovalCardStack en position fixe ; claude en acceptEdits natif auto-approuve ses edits (pas de pending) et le reste reste advisory ; le mode se règle dans Settings (t307) ; garde non-git : gitWarning sur la réponse de création + GitInitBanner dans la sidebar.
- [x] 6. ConflictModal + tests multi-éditeurs (humain + agent en parallèle)
  report: ConflictModal existante non touchée (le watcher SSE et la résolution standard s'appliquent aux writes humains comme avant) ; pendant une édition agent l'éditeur humain est verrouillé, ce qui supprime le conflit à la source ; 17 tests front (fold events, diff, prune, permissions) + 15 tests daemon (mapping chemin vers tâche, idempotence, gating task_diff, FIFO permissions) ; suite complète 429/429.

## Livraison

- Un (ou plusieurs) commit propre par tâche fermée, préfixe `feat(agent)` ;
  `pnpm verify` vert avant chaque commit, push seulement sur demande de vava.
- Passer la tâche en Done dans kandown à la fermeture, avec un report réel
  écrit dans le fichier (protocole `kandown work`).

## Completion report

L'édition par l'agent est devenue un spectacle assumé : quand une session
harness écrit une tâche, sa carte porte la border-beam, le blobatar flotte
avec sa bulle "I am editing...", et l'éditeur passe en lecture seule avec le
diff live vert/rouge. Kandown n'écrit jamais à la place de l'agent : les
avant/après viennent du watcher du daemon (cache LRU de contenu), poussés en
SSE sur le flux board standard, et mappés vers la bonne carte par la
résolution de nom de tâche. Le mode acceptation est réel pour les harness
ACP : la demande de permission du harness remonte en Approval Card, la
réponse repart en JSON-RPC différé ; pour claude, acceptEdits est natif et le
reste reste advisory. La garde non-git prévient à la création de session
(bannière git init dans la sidebar). Réutilisation de ConflictModal : non
nécessaire, le lock éditeur supprime le conflit humain/agent à la source ;
les writes externes continuent de passer par la résolution SSE existante.

Vérifié : `pnpm verify` complet vert (typecheck, 429 tests, build, codemap
251 fichiers 100%, changelog, brief, diff). Suivis notés : couvrir
extractPermissionRequest/buildPermissionResponse dans les tests ACP ; une
page ouverte en plein milieu d'une édition ne voit la présence qu'au
prochain event board (pas de endpoint "active edits").
