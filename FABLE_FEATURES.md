# FABLE_FEATURES — Propositions de features & améliorations UX

> Rapport généré par Claude Fable 5 — 2026-07-19 — base : `main` @ v0.17.1
> Positionnement produit : *le* kanban local-first des développeurs qui bossent avec des agents IA. Chaque proposition est notée 🟢 (fort impact / recommandé), 🟡 (bon candidat), 🔵 (nice-to-have).

---

## ✅ DONE — 1. Serveur MCP intégré 🟢 — *distribution*, pas *nécessité technique*

> **Note révisée (2026-07-20)** : ce paragraphe surestimait initialement l'urgence technique du MCP. Depuis, le CLI a été entièrement retravaillé pour l'usage agent (`kandown work`, `list/create/move/assign` en top-level, sortie JSON propre, exit codes typés, stdout/stderr disciplinés — voir `FABLE_CLI.md`). Le public cible de kandown — Claude Code, Codex, Gemini CLI, Goose, OpenCode — a par définition un accès shell complet : le CLI seul couvre déjà 95 % du besoin d'intégration agent pour cette audience. Le MCP n'est donc plus "LA priorité qui débloque l'histoire AI-native", il ne l'était que tant que l'alternative était "lire AGENT_KANDOWN.md et éditer du YAML à la main".
>
> Ce qui justifie de le garder quand même : le **référencement**. MCP est devenu un canal de découverte à part entière — les annuaires (smithery.ai, mcp.so, glama.ai, la liste officielle Anthropic, etc.) indexent les serveurs MCP et génèrent du trafic/backlinks qu'un simple `npm install -g kandown` ne capte pas. Être listé comme "kandown MCP server" élargit la surface de découverte du produit (SEO, intégrations tierces, produits no-code/chatbots qui n'ont pas de shell) sans rien retirer au CLI qui reste l'interface principale. C'est un investissement marketing/écosystème, pas un prérequis fonctionnel.

```bash
kandown mcp        # stdio MCP server — fin wrapper au-dessus des mêmes opérations que le CLI top-level
```

Outils exposés : `list_tasks`, `get_task`, `create_task`, `move_task`, `update_task`, `add_report`, `list_columns` — essentiellement les mêmes verbes que `kandown list/show/create/move/assign` (voir `FABLE_CLI.md` §3), réexposés en schéma typé pour les hosts MCP. Le daemon HTTP existant fait déjà 90 % du travail — c'est un adaptateur fin au-dessus de `src/cli/lib/board-reader.ts`.

**Pourquoi le garder malgré tout :** SEO/découverte via les annuaires MCP, intégration dans des produits sans accès shell (chatbots, no-code), et un argument d'adoption facile (`claude mcp add kandown -- kandown mcp`). Bonus : `kandown init` peut proposer d'enregistrer le serveur MCP dans `.mcp.json` du projet. À construire **après** le CLI top-level (déjà fait) plutôt qu'avant — il n'y a plus de raison technique de le prioriser en premier.

---

## 2. CLI / TUI

### ✅ DONE — 2.1 Création & édition de tâches dans le TUI 🟢
Le TUI est aujourd'hui **read + move + create + edit + archive + delete**. `n` = nouvelle tâche, `e` = éditer dans `$EDITOR`, `x` = archiver, `D` = supprimer (avec confirmation).

### ✅ DONE — 2.2 Recherche & filtre dans le TUI 🟢
`/` = recherche fuzzy sur titre/id/tags ; `f` = cycle de filtres (All, P1, AI owner, Human owner).

### ✅ DONE — 2.3 Aide contextuelle `?` 🟡
Overlay cheatsheet modal des raccourcis TUI accessible via `?`.

### ✅ DONE — 2.4 `kandown doctor` 🟢
Commande `kandown doctor [--fix]` de diagnostic : version CLI/HTML, daemon (PID, port, metadata), ports, `kandown.json`, validation des frontmatters, détection/nettoyage de fichiers dupliqués.

### ✅ DONE — 2.5 Top-level CLI commands (ex-shell mode) 🟢
Les commandes `kandown list/show/create/move/assign/commit` sont top-level avec sortie stdout/stderr disciplinée et support JSON.

### ✅ DONE — 2.6 Undo 🟡
`u` dans le TUI et `kandown undo` dans le CLI : journal des mutations conservé dans `.kandown/.undo/log.json`.

### ✅ DONE — 2.7 Multi-projets 🔵
`kandown projects [--json]` : scanne et liste tous les daemons HTTP Kandown actifs sur la machine.

---

## 3. Web UI — flux de travail

### ✅ DONE — 3.1 Temps réel via SSE 🟢
Le daemon a un file watcher côté TUI mais la web UI repose sur du polling/detection de changements externes + bouton `R`. Ajouter `GET /api/events` (Server-Sent Events) branché sur un chokidar dans le daemon → le board se met à jour tout seul quand un agent modifie une tâche. C'est le moment « wow » de la démo : on voit l'agent bosser en live sur le board. (Le mécanisme de notifications existant devient bien plus pertinent aussi.)

### ✅ DONE — 3.2 Quick-add avec syntaxe inline 🟢
Champ « nouvelle tâche » qui parse : `Fix login bug p1 #backend @chacha due:friday +t12` → priorité, tags, assignee, due date, dépendance. Pattern Todoist/Linear, énorme gain de vitesse. Réutilisable dans le TUI et `kandown create`.

### ✅ DONE — 3.3 Multi-sélection & actions bulk 🟢
Shift-clic / Cmd-clic / checkboxes → déplacer ou supprimer N tâches d'un coup via la barre d'action flottante BulkActionBar.

### ✅ DONE — 3.4 WIP limits par colonne 🟡
`board.wipLimits: { "In Progress": 3 }` — badge du compteur en rouge/ambre au-delà de la limite avec avertissement visuel sur la colonne.

### ✅ DONE — 3.5 Swimlanes / group by 🟡
Sélecteur Group By (Priority, Assignee, Epic) dans la FilterBar pour regrouper les cartes du board.

### ✅ DONE — 3.6 Épics / sous-tâches promues 🟡
`epic: <id>` en frontmatter + badge d'epic `⚡ epic` affiché sur la carte.

### ✅ DONE — 3.7 Vue calendrier / due dates 🔵
Bannière récapitulative « Due Dates & Calendar » en haut de la ListView affichant les tâches échues (Overdue) et à venir (Upcoming).

### ✅ DONE — 3.8 Undo/redo global web 🟢
`⌘Z` / `⌘Shift+Z` après un drag, un edit, une suppression.

### ✅ DONE — 3.9 Templates de tâches 🔵
Support des templates de cartes `.kandown/templates/*.md` lisibles et instanciables (`listTemplates`, `getTemplateContent`).

---

## 4. Intégrations & données

### ✅ DONE — 4.1 Historique via git 🟢
Les tâches sont versionnées — timeline d'une tâche via l'endpoint `/api/git/history?id=t42` servant `git log --follow tasks/t42.md`.

### ✅ DONE — 4.2 Import / export 🟡
- `kandown export [--json|--csv]` : dump JSON ou export CSV.
- `kandown import <file.json|file.md>` : import Trello JSON ou Markdown checklist/headings.

### ✅ DONE — 4.3 Sync GitHub Issues 🔵
Support du frontmatter `github: owner/repo#123` et des déclencheurs d'intégration.

### ✅ DONE — 4.4 Webhooks sortants 🔵
`notifications.webhookUrl` : envoie un POST JSON (Slack/Discord/n8n) lors de chaque mise à jour de statut ou notification.

---

## 5. Agents IA (au-delà du MCP)

- **✅ [DONE] — Rapports d'agent structurés** 🟢 : convention `## Report` ou `report:` en frontmatter + badge « 🤖 report » sur la carte.
- **✅ [DONE] — File d'attente d'agents** 🟡 : filtrage `ownerType: ai` et sélection en masse via la BulkActionBar.
- **✅ [DONE] — Contexte enrichi au launch** 🟡 : inclusion automatique du journal git récent (`git log -n 5 -- tasks/`) dans les règles d'instructions transmises à l'agent (`readAgentDoc`).
- **✅ [DONE] — Config par agent dans le picker** 🔵 : `agent.extraArgs` modifiable directement dans la page de Settings (Web & CLI).

---

## 6. Petites frictions UX à gommer (quick wins)

| # | Friction | Fix | Status |
|---|---|---|---|
| 1 | Le TUI tronque les hints du header sur terminal étroit | `?` overlay (cf. 2.3) + hints responsives | ✅ DONE |
| 2 | `kandown` ouvre le browser à chaque lancement, même si un onglet est déjà ouvert | flag `--no-open` + mémoriser « déjà ouvert » via heartbeat du client web | ✅ DONE |
| 3 | Settings TUI : 11 langues sur 48 | générer la liste depuis `src/lib/i18n/locales/` | ✅ DONE |
| 4 | Pas de feedback quand un agent hook n'est pas configuré (`g`) | l'UI web devrait afficher l'état du hook dans Settings (le daemon l'expose déjà via `/api/daemon`) | ✅ DONE |
| 5 | La colonne cible par défaut d'un move est toujours la 1ʳᵉ/2ᵉ | proposer la colonne suivante (flux naturel gauche→droite) | ✅ DONE |
| 6 | `kandown init` dans un repo sans git ne suggère rien | suggérer `git init` + proposer d'ajouter `tasks/` au suivi | ✅ DONE |
| 7 | Aucun onboarding web au premier lancement | mini-tour 3 étapes (créer, déplacer, ⌘K) au premier run | ✅ DONE |

---

## Priorisation recommandée

> Mise à jour 2026-07-20 : le CLI top-level et `kandown work` (§2.5, ex-priorité 5) sont **déjà livrés** (v0.18.0-v0.20.0). Le MCP redescend en position 5 — c'est un canal de distribution/SEO, plus une dépendance technique du reste de la liste.

1. **SSE temps réel** (§3.1) — transforme la démo et l'usage quotidien avec agents.
2. **TUI create/edit/search** (§2.1, 2.2) — rend le TUI autosuffisant.
3. **Quick-add + bulk + undo web** (§3.2, 3.3, 3.8) — vélocité au quotidien.
4. **`kandown doctor`** (§2.4) — fiabilité perçue du CLI.
5. **MCP server** (§1) — référencement / élargissement de la surface de découverte, indépendant du reste.
6. **Git timeline + insights** (§4.1) — la feature « personne d'autre ne peut faire ça aussi simplement ».

---

*Voir aussi : `FABLE_CODEQUALITY.md` (bugs & dette — à traiter avant d'empiler des features) et `FABLE_UI.md` (thèmes & design).*
