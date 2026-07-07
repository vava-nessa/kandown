# 🎯 Audit — Idées d'amélioration inspirées d'ReferenceBoard

> **Date :** 2026-06-18
> **Source analysée :** [reference-project/reference-board](https://github.com/reference-project/reference-board) (v0.2.1, 3 packages : `core` / `cli` / `web`)
> **Notre projet :** Kandown (file-based kanban, dual web + TUI, AI-agent friendly)
> **Objectif :** Lister **uniquement** les features d'ReferenceBoard que nous n'avons **pas** encore, avec valeur ajoutée et estimation de complexité.

---

## 📊 Résumé exécutif

ReferenceBoard est plus jeune que kandown mais part d'une philosophie très proche : **tasks-as-markdown**, **local-first**, **agent-friendly**. Il se distingue surtout par :

1. **Une vraie gestion des dépendances entre tâches** (avec gate de blocage au status terminal)
2. **Un statut `archived` first-class** (séparé des colonnes)
3. **Trois modes de stockage interchangeables** (file / hybrid / namespace)
4. **Une architecture backend-interface pluggable**
5. **Un WebSocket live-update** côté web (pas seulement côté TUI)
6. **Un hook agent HTTP générique** (intégration IDE/Electron sans coupling)
7. **Compatibilité Backlog.md** (lecture/écriture d'anciens repos)
8. **Une couche d'orchestration AI** (`/orchestrate` skill) très aboutie
9. **Un modèle de skills installables** (`reference-board skill install --from <url>`)

**Légende impact :**
- 🟢 **Quick-win** (≤ 1 jour, gros upside UX/fonctionnel)
- 🟡 **Moyen** (2-5 jours, feature significative)
- 🔴 **Lourd** (> 1 semaine, refacto ou nouveau sous-système)

---

## 🏗️ Architecture & modèle de données

### 1. 🟢 Dépendances entre tâches (`depends_on`) avec enforcement

**Ce qu'ils font :**
- Champ frontmatter `depends_on: [T-001, T-007]`
- `moveTask(id, "done")` **rejette** la transition si une dépendance n'est pas encore dans le status terminal
- Le store expose l'erreur ; les UIs (web + TUI) la remontent

**Valeur pour kandown :** Énorme. Aujourd'hui on n'a aucun lien entre tâches. C'est la fonctionnalité manquante la plus demandée dans un vrai workflow.

**Effort d'implémentation :**
- Ajout champ `depends_on: string[]` au schema TS
- Patch du `updateTask` pour valider la transition vers le status terminal
- UI : afficher un badge `↪N` sur les cards (déjà le cas côté reference-board TUI), un panneau "Blocked by" dans le task drawer
- TUI : même chose en ASCII

**Fichiers kandown concernés :** `src/lib/types.ts`, `src/lib/store.ts`, `src/lib/TaskDrawer.tsx`, `src/cli/screens/board.tsx`

---

### 2. 🟢 Statut `archived` first-class (built-in)

**Ce qu'ils font :**
- `archived` est un **status réservé** au niveau du store, accepté par `moveTask`/`updateTask` même s'il n'est pas listé dans `config.statuses`
- Sépare "fin de cycle" des colonnes actives
- `reference-board` expose `ARCHIVED_STATUS = "archived"` exporté publiquement
- Web et TUI filtrent l'archive par défaut et la proposent via une vue sidebar dédiée

**Valeur pour kandown :** Aujourd'hui on a un dossier `tasks/archive/` séparé, mais c'est un déplacement de fichier, pas un état logique. Ça complique la recherche et l'API.

**Recommandation :** Adopter la même approche — un status `archived` virtuel + une vue dédiée, sans déplacer les fichiers. Notre TUI/web gagnent une colonne/archive unifiée.

**Effort :** 1-2 jours. Migration des archives existantes via script.

---

### 3. 🟢 ID prefix & padding customisable

**Ce qu'ils font :**
```yaml
idPrefix: T              # ou "BUG", "EPIC", "FEAT"
zeroPaddedIds: 3         # T-001, T-042, T-1000
```

**Valeur pour kandown :** Nos IDs `t1`, `t2`… sont ternes. Permettre `BUG-001` ou `EPIC-014` par projet (ou par board) est un petit upgrade perçu comme énorme.

**Effort :** 2-3 heures côté config + parseur.

---

### 4. 🟡 Backlog.md compatibility (`schema: backlog`)

**Ce qu'ils font :**
- Le parser normalise les deux schémas (`reference-board` vs `backlog`)
- `tags` ↔ `labels`, `depends_on` ↔ `dependencies`, `created_at` ↔ `createdDate`, etc.
- Le writer utilise le schéma configuré — round-trip propre
- `schema: backlog` impose un format de nommage `task-1 - title.md`

**Valeur pour kandown :** Migration facilitée des utilisateurs Backlog.md existants. C'est un différenciateur d'acquisition non négligeable.

**Effort :** 1 semaine. Nécessite un parser alias comme ils ont (`FRONTMATTER_ALIASES` + `BODY_HEADING_ALIASES`) + dual-write selon config.

**Pré-requis :** s'assurer que notre format de fichier reste lisible par l'un ou l'autre (le reader doit accepter les deux).

---

### 5. 🔴 Trois modes de stockage (`file` / `hybrid` / `namespace`)

**Ce qu'ils font :**
- `file` (défaut) : `tasks/*.md` (équivalent de ce qu'on a)
- `hybrid` : idem + un git ref `refs/reference-board/state` pour ID allocator partagé + audit log (CAS anti-collision offline)
- `namespace` : tasks comme **git blobs** dans `refs/reference-board/tasks/<id>`, working tree **vierge**. Push auto, fetch timer 60s, renumber auto en cas de collision

**Valeur pour kandown :** **Limitée.** Le mode `namespace` est conçu pour des libs publiées qui veulent un working tree propre — c'est un cas d'usage niche qui ne nous concerne pas. Le mode `hybrid` est utile pour la collab multi-machine, mais on peut le résoudre plus simplement avec un script de renumber post-merge.

**Recommandation :** **Ne pas l'implémenter.** Mais s'inspirer du **principe** : avoir une `Backend` interface pluggable (voir point 6) est sain. Si on l'ajoute, ce sera seulement `file` aujourd'hui.

**Effort si on le fait :** 2-3 semaines. Énorme. ❌ Skip.

---

### 6. 🟡 Backend interface pluggable

**Ce qu'ils font :**
```ts
interface Backend {
  readonly kind: "file" | "hybrid" | "namespace";
  init(): Promise<void>;
  dispose(): Promise<void>;
  list(opts?): Promise<Task[]>;
  get(id): Promise<Task | null>;
  create(input): Promise<Task>;
  update(id, patch): Promise<Task>;
  delete(id): Promise<void>;
  watch(listener): () => Promise<void>;
  commit?(message?): Promise<void>;   // optionnel
  fetch?(): Promise<FetchResult>;     // optionnel
}
```

**Valeur pour kandown :** Aujourd'hui on a du code couplé filesystem dans `store.ts` et le web. Découpler avec une interface `Backend` rendrait :
- les tests plus faciles (mock backend en mémoire)
- l'évolution future plus simple (ex. SQLite, GitHub Issues, Notion en remote)
- l'ajout d'un mode "remote sync" trivial

**Effort :** 1 semaine de refacto. C'est un investissement qui paie sur le long terme.

---

## 🖥️ Web UI

### 7. 🟢 WebSocket live updates (web ↔ web, web ↔ TUI)

**Ce qu'ils font :**
- Un endpoint `WS /ws` broadcast `{added | changed | removed | renamed}`
- Le front applique les events au state local
- Tout client (autre onglet, TUI, agent, éditeur) est source de vérité

**Valeur pour kandown :** **Critique pour le multi-onglets.** Aujourd'hui si on ouvre deux onglets, ils ne se parlent pas. Et la TUI ne reflète pas les changements faits dans le web. C'est frustrant.

**Effort :** 2-3 jours. Ajouter `ws` (lib standard) côté Hono, broadcaster sur les mutations, brancher le front. C'est un **must-have** pour l'UX.

**Note :** Nous avons probablement déjà la détection de fichier modifié côté web (le README mentionne "External-change detection") mais c'est en polling ou re-fetch, pas en push.

---

### 8. 🟢 Cheatsheet modal (`?` ouvre un overlay de raccourcis)

**Ce qu'ils font :**
- Une modale centrée, lisible, avec tous les raccourcis groupés par contexte (board, modal, palette)
- Toggle avec `?`, ferme avec `Esc`
- ~110 lignes de JSX

**Valeur pour kandown :** On a beaucoup de raccourcis (`⌘K`, `⌘1/2`, `N`, `R`, `/`, `Esc`, `⌘S`, `⌘⌫`, `d`, `m`, `r`, `a` dans TUI). Une cheatsheet découvrable est attendue sur tout outil de power-user.

**Effort :** 2-4 heures. Petit composant + fichier Markdown des shortcuts.

---

### 9. 🟢 Toast notifications unifiées

**Ce qu'ils font :**
- Une seule API `setToast({ message, kind: "info" | "error" })` avec auto-dismiss 2.5s / 4s
- Affichée en bas du board, au-dessus de tout
- Utilisée pour : renommage, fetch result, erreur API, succès création

**Valeur pour kandown :** Aujourd'hui nos notifications sont des "browser notifications" + sons. Avoir un système de toast in-app cohérent est complémentaire.

**Effort :** 1 jour. Composant `<Toast />` + context.

---

### 10. 🟢 Tag input chip component (édition propre des tags)

**Ce qu'ils font :**
- Un composant `TagInput` : chaque tag est un chip coloré, Backspace efface, Enter ajoute, autocomplete depuis les tags existants
- Les couleurs sont hashées depuis le nom du tag (même couleur pour le même tag partout)

**Valeur pour kandown :** Notre édition de tags est probablement un input texte brut. C'est un polish UX majeur.

**Effort :** 0.5-1 jour. Composant réutilisable.

---

### 11. 🟢 Acceptance criteria : quick-toggle en mode lecture

**Ce qu'ils font :**
- En mode view (lecture seule), on peut cliquer sur les checkboxes d'AC pour les toggle **sans** entrer en mode édition
- `PATCH /api/tasks/:id` est appelé en background, le re-render met à jour la progress bar
- Le mode édition reste pour le reste (texte, sections, etc.)

**Valeur pour kandown :** C'est un gain de fluidité énorme. Aujourd'hui il faut ouvrir le drawer, passer en edit, scroller jusqu'aux subtasks, cocher, save, fermer. Avec quick-toggle : un clic sur le board.

**Effort :** 1-2 jours. Nécessite de muter un sous-ensemble du document sans réécrire toute la tâche.

---

### 12. 🟢 Acceptance criteria : `+ Add criterion` + Enter to add next + Backspace on empty to remove

**Ce qu'ils font :**
- Bouton dédié pour ajouter un nouveau criterion
- Dans le champ texte d'un criterion : `Enter` crée le suivant, `Backspace` sur champ vide supprime
- UX de checklist type Notion/Linear

**Valeur pour kandown :** On a des subtasks, mais l'UX d'édition est probablement plus basique.

**Effort :** 0.5-1 jour sur le composant existant.

---

### 13. 🟢 Click threshold drag-vs-click (5px)

**Ce qu'ils font :**
- `onPointerDown` enregistre la position
- `onPointerUp` compare la distance au seuil (5px)
- < 5px = click (ouvre le modal) ; ≥ 5px = drag (déplace)

**Valeur pour kandown :** Évite la frustration classique de dnd-kit où un simple click est interprété comme drag raté.

**Effort :** 1-2 heures. Dix lignes dans le composant Card.

---

### 14. 🟡 Drag overlay avec rotation

**Ce qu'ils font :**
- Pendant le drag, la card "originale" devient transparente (opacity 0)
- Un `DragOverlay` flottant affiche une copie tournée (CSS `transform: rotate(2deg)`)
- Le drop target est mis en évidence

**Valeur pour kandown :** Polish visuel. Pas critique, mais ça fait pro.

**Effort :** 2-4 heures.

---

### 15. 🟡 Sidebar fold on narrow screens (responsive)

**Ce qu'ils font :**
- Seuil de 980px → 2s de grâce → sidebar passe en floating overlay
- Bouton hamburger pour la révéler/cacher
- Au retour > 980px, re-dock immédiat

**Valeur pour kandown :** On a peut-être déjà du responsive, mais pas avec cette logique de grâce (qui évite le clignotement lors d'un resize transitoire).

**Effort :** 0.5-1 jour.

---

### 16. 🟡 REST API complète (CRUD + WS)

**Ce qu'ils font :**
```
GET    /api/config
GET    /api/tasks
GET    /api/tasks/:id
POST   /api/tasks
PATCH  /api/tasks/:id
POST   /api/tasks/:id/move
DELETE /api/tasks/:id
POST   /api/tasks/:id/agent
WS     /ws
```

**Valeur pour kandown :** Permet à des outils tiers (agents, scripts, IDE) d'interagir sans passer par le filesystem. C'est la base d'un écosystème plugin. On l'a peut-être déjà partiellement, sinon c'est ~1 semaine de taf avec Hono.

**Effort :** 1-2 semaines (ou 3-4 jours si on a déjà l'infra serveur).

---

### 17. 🟡 `@dnd-kit` comme base drag-and-drop

**Ce qu'ils font :** Utilisent `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`.

**Valeur pour kandown :** Si on a une lib plus vieille ou maison, migrer sur `@dnd-kit` apporte : pointer sensors, keyboard sensors (a11y), DragOverlay, sortable. C'est devenu le standard de l'écosystème React.

**Effort :** 1 semaine pour migrer si on part de zéro, 2-3 jours si on a déjà une base comparable.

---

## ⌨️ TUI

### 18. 🟢 Sidebar TUI avec counts live

**Ce qu'ils font :**
- Trois groupes : **Views** (All · per-status · Archived), **Priority** (high/medium/low), **Tags** (top 8-20 par usage)
- Counts live à chaque event
- `Tab` pour focus, `j/k` ou `↑↓` pour naviguer
- `f` pour hide/show, épinglage avec auto-hide

**Valeur pour kandown :** Le TUI kandown est probablement 3-4 colonnes full-screen. Une sidebar interactive avec filtres donnerait un workflow "je veux voir mes trucs high priority tag backend" sans quitter le clavier.

**Effort :** 1-2 jours. C'est du muscle autour de nos filtres existants.

---

### 19. 🟢 TUI alternate screen buffer + reload live

**Ce qu'ils font :**
- Le TUI entre en alternate screen (comme vim, less) → pas de pollution du scrollback
- Watcher chokidar → re-render automatique quand un fichier change ailleurs

**Valeur pour kandown :** On l'a probablement déjà mais ça vaut la peine de le vérifier. C'est critique pour le multi-tool workflow.

**Effort :** Vérification 0.5 jour.

---

### 20. 🟢 TUI custom LineInput avec backspace/delete correct sur macOS

**Ce qu'ils font :**
- Tapent directement sur le raw stdin byte stream (`useRawBackspaceDelete`) parce qu'Ink confond Backspace et Delete sur macOS moderne
- Supportent Ctrl+←/→ (word jump), Ctrl+A/E (line start/end)

**Valeur pour kandown :** Si on a déjà un TUI, c'est probablement notre même problème non résolu.

**Effort :** 0.5-1 jour si on est sur Ink, 1-2 jours si on est sur autre chose.

---

### 21. 🟢 TUI color theme (per-status, per-priority, per-tag hashed)

**Ce qu'ils font :**
- Une map status → color (hashé sur l'index de la colonne)
- Une map priority → color (high = rouge, low = gris)
- Un hash function pour les tags → couleur reproductible
- Theme objet unique exporté

**Valeur pour kandown :** Le TUI kandown a probablement déjà des couleurs mais sans système unifié. Adopter ce pattern rend les themes (clair/sombre, ou custom par projet) triviaux.

**Effort :** 0.5-1 jour.

---

### 22. 🟢 TUI raccourcis dédiés à la sémantique du kanban

**Ce qu'ils font :**
- `m` : move via status picker (modal)
- `a` : set assignee (modal)
- `e` : edit dans `$EDITOR` externe
- `x` : archive (et non delete)
- `g` : send to agent hook
- `Space` puis `←→` : grab-and-move (vim style)

**Valeur pour kandown :** On a peut-être certaines de ces touches (`e` pour edit, `a` pour agent), mais pas toutes. Le pattern "vim grab" pour déplacer est très rapide.

**Effort :** 1 jour. C'est du binding de touches.

---

### 23. 🟢 TUI multiline section editor avec cursor row/col

**Ce qu'ils font :**
- Un éditeur inline pour le body de la tâche
- Curseur row/col tracked, word jump (Ctrl+←/→), line start/end (Ctrl+A/E)
- Wrap visuel sur la largeur disponible

**Valeur pour kandown :** Si on a déjà un task editor TUI, est-il aussi complet ?

**Effort :** 2-3 jours (refacto de l'existant pour avoir ces raccourcis).

---

## 🤖 Agent & AI

### 24. 🟢 Agent hook HTTP générique (IDE-agnostic)

**Ce qu'ils font :**
```http
POST /agent
{
  "action": "agent",
  "task": { /* full task */ },
  "context": { "tasksDir": "tasks", "cwd": "/path", "schema": "reference-board" }
}
```
- Configurable via env var `REFERENCE_AGENT_HOOK_URL`, `REFERENCE_AGENT_HOOK_LABEL`, `REFERENCE_AGENT_HOOK_HEADERS`
- Ou via option programmatique `runWeb({ agentHook: {...} })` (programmatic wins)
- Strictement opt-in : sans env var ni option, aucun bouton n'apparaît
- Côté web : bouton sur la card + dans la modal ; côté TUI : touche `g`
- Côté serveur : endpoint `POST /api/tasks/:id/agent` qui forward vers le hook

**Valeur pour kandown :** **Énorme.** Aujourd'hui kandown sait **lancer** des agents (Claude, Codex, etc.) en local, mais ne sait pas **être piloté** par un IDE/host externe. C'est la pièce qui manque pour devenir embeddable dans Cursor, VS Code extensions, Electron apps, ou des outils custom.

**Effort :** 2-3 jours. Le format du payload est simple. La doc compte autant que le code.

---

### 25. 🔴 `/orchestrate` skill — orchestration multi-tâches avec dual-reviewer

**Ce qu'ils font :** Un skill (fichier Markdown) que l'agent lit et qui :
- Prend une demande utilisateur → intake (2-4 questions)
- Casse en 2-8 tâches reference-board
- Pour chaque tâche : impl dans un worktree isolé → Reviewer A (correctness) + Reviewer B (design-fit) **en parallèle** → reconcile → done
- Supporte 3 modes : single-repo, umbrella (multi repos git), non-git-root
- Persiste le contexte intake dans le body de chaque tâche (pour les reviewers cold-start)

**Valeur pour kandown :** **Game-changer pour l'agentic workflow.** Mais c'est un skill, pas du code kandown. C'est un **fichier à écrire** qu'on distribue via `kandown skill install` (voir point 27).

**Effort :** 1-2 jours pour écrire le skill (markdown), 0 jour pour kandown lui-même. **Skip côté code, à faire côté skill.**

---

### 26. 🔴 `/orchestrate-init` skill — bootstrap du projet

**Ce qu'ils font :** Un skill compagnon qui :
- Détecte le mode (single / umbrella / non-git-root)
- Expand le status flow à 5 colonnes (review, blocked ajoutées)
- Configure `.gitignore`s
- Crée `.reference-board/orchestrate.yaml` (reviewer roster) de manière interactive

**Valeur pour kandown :** Comme ci-dessus, c'est du contenu de skill. À écrire.

---

### 27. 🟢 `kandown skill install` — install de skills depuis CLI

**Ce qu'ils font :**
```bash
kandown skill install                              # écrit ./AGENTS.md (bundled)
kandown skill install --out docs/AGENTS.md         # custom path
kandown skill install --force                      # overwrite
kandown skill install --from <url>                 # depuis une URL custom
```

**Valeur pour kandown :** C'est la **commande de distribution** des skills. Elle permet :
- À l'utilisateur d'installer le skill de base
- À des communautés de distribuer leurs skills
- À nous de mettre à jour le skill de base via `pnpm build` qui re-bundle le template

**Effort :** 0.5-1 jour. Très simple. Le template est dans `templates/AGENT_KANDOWN.md` (qu'on a déjà).

---

## 🔧 CLI

### 28. 🟢 Commandes CLI riches (`list`, `show`, `create`, `move`, `assign`, `commit`)

**Ce qu'ils font :**
```bash
reference-board list [-s status] [-a assignee] [-t tag]   # filtrable
reference-board show <id>                                  # print frontmatter + body
reference-board create "title" -p high -t payments -d T-001
reference-board move T-001 doing
reference-board assign T-001 fredrik
reference-board commit -m "msg"                            # stage tasks/ + git commit
reference-board web [--port N] [--host H] [--no-open]
reference-board board
reference-board skill install [--from u] [--out p] [--force]
```

**Valeur pour kandown :** Aujourd'hui kandown est très orienté TUI/web. Avoir un vrai CLI shellable le rend utilisable dans des scripts CI, des agents, des hooks git.

**Effort :** 2-3 jours avec commander. Le store existe déjà, c'est du wiring.

---

### 29. 🟢 `kandown commit` — commit explicite des tasks (jamais auto)

**Ce qu'ils font :** Commande qui stage `tasks/` (ou `.kandown/tasks/`) et fait `git commit -m <msg>`. **Philosophie forte :** "ReferenceBoard never auto-commits."

**Valeur pour kandown :** Adopter ce mantra. Les commits sont une décision utilisateur, pas une conséquence d'un edit. C'est plus prévisible, plus safe pour les PRs.

**Effort :** 2 heures.

---

### 30. 🟢 `KANDOWN_STORAGE` env var (override CI/tests)

**Ce qu'ils font :** Permet de forcer un mode sans toucher au fichier config. Crucial pour CI (comportement déterministe) et tests (pin un mode sur un répertoire arbitraire).

**Valeur pour kandown :** Si on a plusieurs modes, oui. Sinon, on s'en passe. **Skip probable** pour l'instant.

---

### 31. 🟢 Exit codes CLI propres (0 / 1)

**Ce qu'ils font :** `0` = succès, `1` = erreur user-visible. Pas de codes arbitraires.

**Valeur pour kandown :** Bonne hygiène. Si on a un CLI, c'est **3 lignes**.

---

## 🎨 Design / UX

### 32. 🟡 Sidebar avec vue "status counts" live

**Ce qu'ils font :** Le badge à droite de chaque ligne de sidebar affiche le count en temps réel. Pas un cache : recalculé à chaque event.

**Valeur pour kandown :** Si on a une sidebar (web), est-ce qu'elle a des counts ? Si non, c'est 2-3 heures de plus-value perçue.

---

### 33. 🟡 Hashed tag colors (couleur stable par nom de tag)

**Ce qu'ils font :** `tagColor("backend")` retourne toujours la même couleur, pour tous les utilisateurs, à travers toutes les vues. Hash simple du string → hue HSL.

**Valeur pour kandown :** Polish visuel. Évite d'avoir à configurer des couleurs par tag.

**Effort :** 1-2 heures. 10 lignes.

---

### 34. 🟢 Card actions on hover (Edit / Delete)

**Ce qu'ils font :** Survol de la card → apparition discrète de 2 boutons en haut à droite (Edit, Delete). Click séparé du drag de la card entière.

**Valeur pour kandown :** Si on ne l'a pas, c'est 2-3 heures et c'est beaucoup plus propre que des menus contextuels.

---

### 35. 🟢 Auto-focus first field on modals

**Ce qu'ils font :** Le `ref.current?.focus()` sur le premier input du modal (New task, Edit task, etc.).

**Valeur pour kandown :** Basique. Probablement déjà fait. Vérifier 30 min.

---

## 📦 Architecture & qualité

### 36. 🟡 Pure data layer (`@reference/reference-board-core`)

**Ce qu'ils font :** Un package core sans I/O frameworks, sans React, sans UI. Importable depuis n'importe quoi. Les packages UI (cli, web) **re-exportent** le core API.

**Valeur pour kandown :** On a peut-être déjà cette séparation, sinon c'est **la** refacto qui rapporte le plus. Ça permet :
- D'utiliser kandown comme lib dans d'autres outils
- D'avoir des tests unitaires sur la logique métier sans framework UI
- D'avoir plusieurs frontends (TUI, web, et demain VS Code, mobile, etc.)

**Effort :** 2-4 jours si on a déjà du découpage, 1-2 semaines si on part de zéro.

---

### 37. 🟡 Backend interface + lazy init (voir point 6)

Le point 6 couvre l'interface. Le lazy init pattern :
```ts
async #ensureInit() {
  if (!this.#initPromise) this.#initPromise = this.init();
  return this.#initPromise;
}
```
permet de garder `createContext()` synchrone. C'est précieux pour de l'embarquement IDE.

---

### 38. 🟢 Schema validation runtime avec Zod

**Ce qu'ils font :** `frontmatterSchema = z.object({...})` valide le YAML au parse. Erreurs claires, types inférés.

**Valeur pour kandown :** Robustesse. Si on parse du YAML écrit par un humain ou un agent, on **doit** valider. C'est probablement déjà partiellement le cas, sinon c'est 1 jour.

---

### 39. 🟢 Chokidar pour le file watching

**Ce qu'ils font :** `chokidar` au lieu de `fs.watch` natif. Robuste, debounced, cross-platform.

**Valeur pour kandown :** Si on a des bugs de détection de changements externes, c'est la solution standard. **Vérifier 0.5 jour.**

---

## 🧩 Skills / Documentation (contenu, pas code)

### 40. 🟢 Vendor-neutral `AGENTS.md` skill (déjà partiellement le cas)

**Ce qu'ils font :** Un seul fichier `AGENTS.md` qui décrit le format de fichier + la config + le CLI, **sans** présumer d'un agent spécifique. C'est lu par Claude, Cursor, Copilot, Codex, etc.

**Valeur pour kandown :** On a déjà `AGENT_KANDOWN.md` et `AGENTS.md`. La question est : est-il **vraiment** agent-neutral ? La `orchestrate` skill de reference-board utilise un pattern intéressant : **Translation Notes table** à la fin qui mappe les primitives vers chaque agent (Claude Code, Codex CLI, Cursor, etc.).

**Action concrète :** Ajouter une section "Translation Notes" à notre `AGENT_KANDOWN.md`.

---

### 41. 🟡 `/orchestrate` skill pour kandown

Voir point 25. C'est un **fichier `.md` à écrire** qu'on distribue. Très haute valeur pour les power users qui utilisent kandown comme backbone d'agentic coding.

---

## 🚀 Quick wins — par ordre de priorité

Si on devait shipper 5 features cette semaine :

1. **Task dependencies** (point 1) — feature #1 manquante, gros impact
2. **WebSocket live updates web** (point 7) — UX multi-onglets, simple
3. **Cheatsheet modal `?`** (point 8) — découvrabilité, 4h
4. **`kandown commit` + `kandown list/show/create` CLI** (points 28+29) — shellable
5. **Agent hook HTTP** (point 24) — embeddability, différenciateur

---

## 🎯 Vision long terme

Si on devait viser 3 mois :

1. **Backend interface pluggable** (point 6) → permet d'ajouter un remote backend, un SQLite, un Notion
2. **Pure data layer extraction** (point 36) → ouvre la voie à un SDK public
3. **`/orchestrate` + `/orchestrate-init` skills** (points 25+26) → kandown devient le backbone d'un workflow agentic de bout en bout
4. **Backlog.md compatibility** (point 4) → acquisition d'utilisateurs existants
5. **Hono + REST API + WS** (points 7+16) → écosystème plugin

---

## ❌ Ce qu'on ne prend PAS d'reference-board

- **Namespace mode** (point 5) — trop niche, complexité démesurée
- **`renamed` event pour auto-renumber** — résolvable avec un simple script post-merge
- **Setup modal pour storage mode picker** — tant qu'on a un seul mode, pas nécessaire
- **Ink comme base TUI** — on a notre stack TUI, ne pas jeter le bébé avec l'eau du bain

---

## 📚 Références croisées kandown

Pour aller plus loin sur certaines de ces features, consulter dans ce repo :
- `AGENT_KANDOWN.md` — format de tâche actuel
- `templates/AGENT_KANDOWN.md` — source pour le skill
- `src/lib/store.ts` — store actuel (à refactorer en Backend interface)
- `src/lib/TaskDrawer.tsx` — UI d'édition (quick-toggle, chip input)
- `src/lib/version.ts` — version single source of truth (déjà propre chez nous)
- `bin/kandown.js` — CLI entry point
- `src/cli/screens/board.tsx` — TUI board (sidebar, vim grab)

---

*Audit généré le 2026-06-18. Prochaine étape : prioriser et ticketiser dans `.kandown/tasks/`.* ✨
