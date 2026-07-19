# FABLE_FEATURES — Propositions de features & améliorations UX

> Rapport généré par Claude Fable 5 — 2026-07-19 — base : `main` @ v0.17.1
> Positionnement produit : *le* kanban local-first des développeurs qui bossent avec des agents IA. Chaque proposition est notée 🟢 (fort impact / recommandé), 🟡 (bon candidat), 🔵 (nice-to-have).

---

## 1. La feature phare : serveur MCP intégré 🟢🟢

Kandown se vend « AI-agent friendly », mais aujourd'hui l'intégration agent = injection de prompt + fichiers markdown. Le standard du marché est **MCP (Model Context Protocol)** : Claude Code, Codex, Gemini CLI, Goose et OpenCode le supportent tous.

```bash
kandown mcp        # stdio MCP server
```

Outils exposés : `list_tasks`, `get_task`, `create_task`, `move_task`, `update_task`, `add_report`, `list_columns`. Le daemon HTTP existant fait déjà 90 % du travail — c'est un adaptateur fin au-dessus de `src/cli/lib/board-reader.ts`.

**Pourquoi c'est LA priorité :** un agent qui gère le board nativement (sans lire AGENT_KANDOWN.md ni éditer du YAML à la main) supprime toute la classe de bugs « l'agent a cassé le frontmatter », et c'est un argument d'adoption énorme (`claude mcp add kandown -- kandown mcp`). Bonus : `kandown init` peut proposer d'enregistrer le serveur MCP dans `.mcp.json` du projet.

---

## 2. CLI / TUI

### 2.1 Création & édition de tâches dans le TUI 🟢
Le TUI est aujourd'hui **read + move only**. Manquent : `n` = nouvelle tâche (titre + colonne), `e` = éditer dans `$EDITOR` (pattern `git commit` : ouvrir le `.md`, recharger au retour — trivial et ultra-puissant), `x` = archiver, `D` = supprimer (avec confirmation). C'est le minimum pour que le TUI soit un vrai client et pas un viewer.

### 2.2 Recherche & filtre dans le TUI 🟢
`/` = recherche fuzzy sur titre/id/tags avec surlignage et navigation des résultats ; `f` = cycle de filtres (assignee, priorité, owner). La web app a déjà la logique de recherche (`store.ts`) — la réutiliser.

### 2.3 Aide contextuelle `?` 🟡
Overlay cheatsheet des raccourcis (la web app a `Cheatsheet.tsx`, le TUI n'a qu'une ligne de hints tronquée à droite du header).

### 2.4 `kandown doctor` 🟢
Vu la complexité daemon/ports/migration, une commande de diagnostic qui vérifie : version CLI vs `kandown.html`, état daemon (PID vivant ? port répond ? metadata cohérente ?), ports 2048-2150 occupés et par qui, validité de `kandown.json`, tâches au frontmatter invalide, fichiers en double `tasks/` vs `archive/`. Sortie actionnable avec `--fix` pour les cas sûrs (metadata stale, fichier dupliqué).

### 2.5 Shell mode complet & scriptable 🟢
- Promouvoir en top-level : `kandown list|create|move|show|assign|commit` (aujourd'hui préfixés `shell`, et la doc interne les montre déjà sans préfixe — autant aligner la réalité sur la doc).
- Ajouter : `kandown edit <id>` (ouvre `$EDITOR`), `kandown archive <id>`, `kandown delete <id>`, `kandown open` (browser sans TUI), `kandown search <query>`.
- `--json` partout (y compris `move`, `create` — déjà partiel) + données sur stdout / décorations sur stderr → composable avec `jq`, `fzf`.
- `kandown stats [--json]` : compte par colonne, throughput 7j (via git log sur `tasks/`), tâches bloquées.

### 2.6 Undo 🟡
`u` dans le TUI et `kandown undo` : garder un petit journal des N dernières mutations (fichier avant/après dans `.kandown/.undo/`). Les moves accidentels (surtout avec la souris) sont fréquents.

### 2.7 Multi-projets 🔵
`kandown projects` : lister tous les daemons actifs de la machine (scan de la plage de ports + `/api/daemon`), avec switch rapide. Utile dès qu'on a 3+ projets kandown en parallèle.

---

## 3. Web UI — flux de travail

### 3.1 Temps réel via SSE 🟢
Le daemon a un file watcher côté TUI mais la web UI repose sur du polling/detection de changements externes + bouton `R`. Ajouter `GET /api/events` (Server-Sent Events) branché sur un chokidar dans le daemon → le board se met à jour tout seul quand un agent modifie une tâche. C'est le moment « wow » de la démo : on voit l'agent bosser en live sur le board. (Le mécanisme de notifications existant devient bien plus pertinent aussi.)

### 3.2 Quick-add avec syntaxe inline 🟢
Champ « nouvelle tâche » qui parse : `Fix login bug p1 #backend @chacha due:friday +t12` → priorité, tags, assignee, due date, dépendance. Pattern Todoist/Linear, énorme gain de vitesse. Réutilisable dans le TUI et `kandown create`.

### 3.3 Multi-sélection & actions bulk 🟢
Shift-clic / rectangle de sélection → déplacer, taguer, archiver, assigner N tâches d'un coup. Indispensable dès que le backlog dépasse ~30 tâches.

### 3.4 WIP limits par colonne 🟡
`board.wipLimits: { "In Progress": 3 }` — badge du compteur en rouge au-delà de la limite, warning au drop. Très kanban, trivial à implémenter, différenciant face aux todo-apps.

### 3.5 Swimlanes / group by 🟡
Vue board groupée par assignee, priorité, tag ou epic (lignes horizontales). La logique de grouping existe déjà (`grouping.ts`, stacks par `[bracket]`) — la généraliser.

### 3.6 Épics / sous-tâches promues 🟡
Aujourd'hui : `[bracket]` de titre = stack visuel. Étape suivante : `epic: <id>` en frontmatter, carte epic avec progression agrégée, drill-down. Reste 100 % markdown-portable.

### 3.7 Vue calendrier / due dates 🔵
Mini-vue mois basée sur `due:` + section « Overdue / This week » en haut de la list view. Les due dates existent mais ne *travaillent* pas.

### 3.8 Undo/redo global web 🟢
`⌘Z` après un drag, un edit, une suppression. Le store centralise déjà les mutations — empiler des inverse-ops. (La « guarded deletion » actuelle protège, mais l'undo est une meilleure UX que la confirmation.)

### 3.9 Templates de tâches 🔵
`.kandown/templates/*.md` (bug report, feature, chore) proposés à la création. S'accorde parfaitement au modèle « files over app ».

---

## 4. Intégrations & données

### 4.1 Historique via git 🟢
Les tâches sont versionnées — exploiter enfin ce super-pouvoir : timeline d'une tâche dans le drawer (`git log --follow tasks/t42.md` via le daemon), badge « modifié il y a 2h par claude », et un graphe throughput/burndown dans une vue Insights. Zéro base de données, tout est déjà là.

### 4.2 Import / export 🟡
- Export : JSON (dump complet), CSV (list view).
- Import : Trello (export JSON), GitHub Issues (`gh issue list --json` → tâches), Markdown checklist → tâches.
  L'import Trello/GitHub est un canal d'acquisition d'utilisateurs à lui tout seul.

### 4.3 Sync GitHub Issues 🔵
Lien bidirectionnel opt-in (`github: owner/repo#123` en frontmatter) : fermer l'issue quand la tâche passe Done, importer les nouvelles issues labellisées. Gros chantier — à ne faire qu'après le MCP.

### 4.4 Webhooks sortants 🔵
`notifications.webhookUrl` : POST à chaque changement de statut (Slack/Discord/n8n). Le `KANDOWN_AGENT_HOOK_URL` existant montre que la plomberie est déjà à moitié faite — généraliser.

---

## 5. Agents IA (au-delà du MCP)

- **Rapports d'agent structurés** 🟢 : le TUI lance un agent puis perd tout suivi. Convention : l'agent écrit `## Report` + coche les subtasks ; le board affiche un badge « 🤖 report ready » sur la carte quand un report apparaît après un launch.
- **File d'attente d'agents** 🟡 : colonne virtuelle « Agent Queue » — les tâches `ownerType: ai` en Todo sont lançables en batch (`a` sur la colonne = enchaîner les tâches, une par une, avec `goose run`/`claude -p` en mode non-interactif).
- **Contexte enrichi au launch** 🟡 : inclure dans le prompt les tâches liées (`depends_on` + dépendants) et les 5 derniers commits touchant `tasks/` — l'agent comprend l'état du board, pas juste sa tâche.
- **Config par agent dans le picker** 🔵 : l'`agents.extraArgs` de `kandown.json` existe déjà côté config mais n'est pas éditable dans les Settings TUI/web — l'exposer.

---

## 6. Petites frictions UX à gommer (quick wins)

| # | Friction | Fix |
|---|---|---|
| 1 | Le TUI tronque les hints du header sur terminal étroit | `?` overlay (cf. 2.3) + hints responsives |
| 2 | `kandown` ouvre le browser à chaque lancement, même si un onglet est déjà ouvert | flag `--no-open` + mémoriser « déjà ouvert » via heartbeat du client web |
| 3 | Settings TUI : 11 langues sur 48 | générer la liste depuis `src/lib/i18n/locales/` |
| 4 | Pas de feedback quand un agent hook n'est pas configuré (`g`) | l'UI web devrait afficher l'état du hook dans Settings (le daemon l'expose déjà via `/api/daemon`) |
| 5 | La colonne cible par défaut d'un move est toujours la 1ʳᵉ/2ᵉ | proposer la colonne suivante (flux naturel gauche→droite) |
| 6 | `kandown init` dans un repo sans git ne suggère rien | suggérer `git init` + proposer d'ajouter `tasks/` au suivi |
| 7 | Aucun onboarding web au premier lancement | mini-tour 3 étapes (créer, déplacer, ⌘K) au premier run |

---

## Priorisation recommandée

1. **MCP server** (§1) — différenciateur produit, débloque tout le reste de l'histoire « AI-native ».
2. **SSE temps réel** (§3.1) — transforme la démo et l'usage quotidien avec agents.
3. **TUI create/edit/search** (§2.1, 2.2) — rend le TUI autosuffisant.
4. **Quick-add + bulk + undo web** (§3.2, 3.3, 3.8) — vélocité au quotidien.
5. **`kandown doctor` + shell top-level** (§2.4, 2.5) — fiabilité perçue du CLI.
6. **Git timeline + insights** (§4.1) — la feature « personne d'autre ne peut faire ça aussi simplement ».

---

*Voir aussi : `FABLE_CODEQUALITY.md` (bugs & dette — à traiter avant d'empiler des features) et `FABLE_UI.md` (thèmes & design).*
