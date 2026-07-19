# FABLE_CLI — Le CLI Kandown : fixes, refonte TUI, interface agent

> Rapport généré par Claude Fable 5 — 2026-07-19 — base : `main` @ v0.17.1
> Consolide tout ce qui concerne le CLI depuis `FABLE_CODEQUALITY.md`, `FABLE_FEATURES.md` et `FABLE_UI.md`, puis propose **deux refontes** : le TUI pour les humains (lisibilité, densité, espace), et le mode shell pour les agents (query en un seul appel, sortie optimisée tokens).

**Vision cible — un binaire, trois publics :**

| Public | Interface | Optimisé pour |
|---|---|---|
| 👩‍💻 Humain interactif | `kandown` / `kandown board` (TUI) | lisibilité, densité, navigation clavier/souris |
| 🤖 Agent IA | `kandown q …` (shell one-shot) + `kandown mcp` | 1 appel = 1 réponse complète, minimum de tokens |
| 🧰 Scripts / CI | mêmes commandes shell, `--json` | stdout propre, exit codes, composable `jq`/`fzf` |

---

## Partie 1 — Les fixes (rappel consolidé)

### 🔴 Critiques (P0 — avant toute refonte)

| # | Bug | Où | Fix |
|---|---|---|---|
| C1 | `kandown shell create "x" -p P1` → `-p` interprété comme `--path` → **auto-init d'un Kandown dans `./P1/`** | `parseArgs` `bin/kandown.js:516` vs `shellParseArgs:947` | `-p` = priority en contexte shell ; chemin = `--path` long uniquement ; plus jamais d'auto-init depuis un flag |
| C2 | Le mini-parser YAML du bin ne relit pas les block scalars `|` que son serializer écrit → **`shell move`/`assign` détruit les champs multi-lignes** (les `report:` des agents !) | `parseFrontmatter` `bin/kandown.js:831` | Supprimer le mini-parser, réutiliser `src/lib/parser.ts` + `serializer.ts` (cf. refactor Partie 4) |
| C3 | Hit-testing souris du TUI : mapping `y − TASKS_START_Y` suppose 1 tâche = 1 ligne, mais séparateurs + cartes 3 lignes décalent tout → **le clic sélectionne la mauvaise tâche** | `board.tsx:519,758` | Line-map dérivée du rendu (résolu de fait par la refonte TUI, Partie 2) |
| C4 | `daemon stop` sur health-check transitoirement KO → metadata supprimée **sans tuer le process** → daemon zombie, port bloqué | `stopDaemon` `bin/kandown.js:1469`, `daemon.ts:192` | SIGTERM sur le PID de la metadata même si le fetch échoue ; supprimer la metadata seulement après mort du process |

### 🟠 Majeurs

- **M1 — Auto-update** *(politique amendée après discussion)* : on **garde** l'update automatique silencieux, mais : throttle du check réseau à 24 h (fichier cache), **jamais** de check pour `shell`/`q`/`daemon run`/`--json`/non-TTY (scripts et agents), `KANDOWN_NO_UPDATE=1` pour les CI, et fix de `semverGt` sur les prereleases (`Number("0-beta") = NaN`).
- **M2 — Discipline stdout/stderr** : décorations (`✓ Created…`, spinners) sur **stderr**, données (id, JSON, tables) sur **stdout**. Aujourd'hui `ID=$(kandown shell create ...)` capture deux lignes. Règle absolue pour toute la Partie 3.
- **M3 — Unarchive incohérent** : `shell move` d'une tâche archivée vers une colonne la laisse dans `archive/` avec le flag supprimé. Fix : déplacer le fichier vers `tasks/` quand la cible n'est pas `archived`.
- **M4 — Pas de scroll dans les colonnes TUI** : les tâches sous le fold sont invisibles et inatteignables (résolu par la refonte, Partie 2).
- **M7 — Race daemon** : deux lancements simultanés → deux daemons, metadata écrasée. Lock file O_EXCL autour du spawn.

### 🟡 Rappels dette CLI

Timers `statusMsg` qui s'entre-annulent, scroll détail non borné, `layoutRef` pas recalculé au resize, prompt agent en argv (risque E2BIG, le `contextFile` écrit n'est jamais utilisé en fallback), watcher qui SHA-256 tout le board toutes les 300 ms (passer à mtime+size d'abord), `archive/` non observé, `which` non-Windows, code mort (`findKandownDir`, `debouncedEmit`, endpoints `board.md`, double validation `shellList`), aide interne qui montre `kandown list` alors que la syntaxe réelle est `kandown shell list`.

---

## Partie 2 — Refonte TUI : lisible, dense, agréable

### 2.1 Diagnostic honnête de l'existant

- **Les longues tâches sont illisibles** : la vue détail dumpe le markdown brut ligne par ligne **sans wrap** (une ligne de 400 caractères = tronquée par l'overflow du terminal), sans marges, sans rendu (les `**bold**`, listes, code fences restent bruts) → « gros pavé de texte ».
- **L'espace est mal utilisé** : colonnes toutes de même largeur même vides, séparateurs `─` pleine largeur entre chaque tâche qui mangent 1 ligne sur 2, cartes catégorie de 3 lignes sur fond `#222` qui cassent le rythme, header qui tronque ses hints.
- **Pas de scroll de colonne**, pas de recherche, pas de création/édition → le TUI est un viewer, pas un client.
- **Esthétique datée** : couleurs ANSI primaires en dur (cyan/magenta/yellow), pas de bordures, pas de hiérarchie visuelle, aucun lien avec le skin du projet.

### 2.2 Nouveau layout : « board + preview », responsive

Le principe directeur : **le board sert à naviguer, le panneau de droite sert à lire.** C'est le pattern lazygit/OpenCode — on ne lit jamais un pavé dans une carte, on lit dans un panneau dédié qui wrap correctement.

**≥ 110 colonnes — layout principal :**

```
╭─ ◆ kandown v0.18 · my-project ────────────── ● web :2048 · 24 tasks ─╮
│ Backlog 8 │ Todo 3 │▸In Progress 2◂│ Review 1 │ Done 12              │ ← onglets colonnes
├──────────────────────────────┬───────────────────────────────────────┤
│  In Progress (2)             │  t203 · Improve column reorder        │
│ ▸ t203 Improve column reor…  │  ────────────────────────────────     │
│   ↪2 · P1 · @vava            │  P1 · @vava · due 21 jul · ⛔ t201    │
│   t204 Fix drag feedback     │                                       │
│                              │  ## Context                           │
│  ↓ 0 more                    │  The drop indicator flickers when     │
│                              │  the pointer crosses a column gap     │
│                              │  because the hover state is reset…    │ ← wrap propre
│                              │                                       │
│                              │  ## Subtasks             ▰▰▰▱▱ 3/5    │
│                              │  ✓ Reproduce flicker                  │
│                              │  ✓ Identify hover reset               │
│                              │  ○ Debounce column change             │
├──────────────────────────────┴───────────────────────────────────────┤
│ /search  n new  e edit  m move  a agent  Enter zoom  ? help          │
╰──────────────────────────────────────────────────────────────────────╯
```

- **Gauche (~40 %)** : *une seule colonne à la fois*, celle qui a le focus — `h/l` ou `Tab` change de colonne via la barre d'onglets (avec compteurs). Toutes les tâches d'une colonne sont visibles/scrollables au lieu de 5 colonnes écrasées à 20 caractères.
- **Droite (~60 %)** : preview live de la tâche focus, **texte wrappé à la largeur du panneau**, markdown rendu (cf. 2.4). Se met à jour en naviguant `j/k` — zéro friction pour lire.
- **< 110 colonnes** : le preview disparaît, `Enter` ouvre le détail plein écran (le mode actuel, mais réécrit cf. 2.4). **< 70 colonnes** : mode liste compacte une colonne.
- Option `board.tuiLayout: "columns"` pour retrouver la vue multi-colonnes classique en mode overview (`o` pour basculer) — utile pour *voir* le flux, pas pour lire.

### 2.3 Cartes : 1 ligne, denses, hiérarchisées

Fini les cartes 3 lignes et les séparateurs pleine largeur :

```
▸ t203  Improve column reorder drop feedback      P1 ↪2 ▰▰▱ @va
  t204  Fix drag placeholder height                P2      @va
  t189  [ui] Empty state illustration              ·  ✓
```

- **1 tâche = 1 ligne**, toujours. Le tag `[bracket]` devient un chip coloré inline, pas une ligne dédiée.
- Métadonnées alignées à droite en colonne fixe : priorité (P1 rouge, P2 orange, P3/P4 dim), `↪N` blocked, mini-progress `▰▰▱`, initiales assignee. Chaque champ n'apparaît que si activé dans `fields.*` de la config.
- Hiérarchie par **graisse et luminosité** (bold/normal/dim) plutôt que par couleurs saturées partout ; la couleur d'accent de colonne vient de `board.columnColors` de la config (enfin cohérent avec la web app), avec fallback truecolor dérivé du skin (cf. FABLE_UI §4.3).
- Le focus = fond subtil pleine ligne (`bg` sombre + accent), pas juste un `▸`.
- Séparation par espacement (marginTop sur groupes) — plus aucun `─` entre tâches.

### 2.4 Vue détail / preview : un vrai rendu markdown terminal

Le composant `TaskDetail` actuel est remplacé par un **renderer markdown → Ink** dédié (petit, ~150 lignes, pas besoin de lib) :

- **Wrap systématique** à la largeur du panneau moins padding (le fix n°1 du « pavé illisible »).
- Titres `##` → bold + couleur accent + marge verticale ; listes indentées avec puce `•` ; `- [ ]`/`- [x]` → `○/✓` colorés ; `**bold**`/`*italic*`/`` `code` `` → styles ANSI ; code fences → bloc indenté fond sombre ; liens → OSC 8 cliquables (déjà maîtrisé dans le header) ; tables → alignement simple.
- **Header de tâche structuré** : ligne id+titre (wrap), ligne meta en chips (status, priorité, due, assignee, tags), bloc `⛔ Blocked by: t201 (In Progress)` avec le *statut résolu* des dépendances (pas juste les ids bruts).
- **Subtasks en section dédiée** avec barre de progression, avant le body.
- Scroll : `j/k` ligne, `d/u` demi-page, `g/G` début/fin, **borné**, avec indicateur `── 45 % ──` ; les longues sections `report:` repliables (`z` pour toggle).

### 2.5 Le TUI devient un client complet

Repris de FABLE_FEATURES (§2.1-2.6), intégré au nouveau layout :

| Touche | Action |
|---|---|
| `n` | Nouvelle tâche : mini-formulaire inline (titre → Enter, colonne = colonne courante) |
| `e` | Ouvrir la tâche dans `$EDITOR` (pattern `git commit`), reload au retour |
| `/` | Recherche fuzzy id/titre/tags — filtre la liste en live, `Esc` restaure |
| `f` | Cycle filtres (assignee / priorité / owner / blocked) |
| `x` / `D` | Archiver / supprimer (confirmation) |
| `u` | Undo de la dernière mutation (journal `.kandown/.undo/`) |
| `1-9` | Saut direct colonne N |
| `?` | Overlay cheatsheet complet (fini les hints tronqués du header) |
| `o` | Toggle layout board-columns / focus+preview |

Et les corrections mécaniques qui vont avec : un seul gestionnaire `showStatus(msg)` (plus de timers concurrents), layout recalculé sur `resize`, hit-testing souris basé sur la line-map du rendu (C3 résolu structurellement : le nouveau layout rend la correspondance ligne↔tâche triviale puisque 1 tâche = 1 ligne).

---

## Partie 3 — Le CLI agent : query tout en un appel

### 3.1 Philosophie

Un agent ne doit **jamais** avoir besoin de plusieurs tool calls ni de lire des fichiers pour connaître l'état du board. Chaque question courante = **une commande, une réponse compacte, format prévisible**. Sorties pensées en *tokens* : par défaut du texte tabulaire minimal ; `--json` pour la structure ; jamais de couleurs/décorations quand stdout n'est pas un TTY.

Nouvelle commande racine : **`kandown q`** (alias `query`) — les commandes existantes `shell list/show/...` sont promues top-level et alignées dessus.

### 3.2 Query — lecture

```bash
# L'essentiel : ids + titres de tout le board, groupés par colonne — UN SEUL APPEL
kandown q titles
# Backlog:
#   t101  Set up OAuth provider
#   t105  [ui] Empty states
# In Progress:
#   t203  Improve column reorder
# …

kandown q titles -s backlog            # une colonne
kandown q -s backlog                   # table complète (id, pri, assignee, titre)
kandown q -p P1                        # les prioritaires
kandown q --done --since 7d            # terminées récemment
kandown q --blocked                    # bloquées, avec la chaîne de blocage résolue
kandown q --ready                      # actionnables : non bloquées, hors Done/archive
kandown q --assignee claude --tag backend
kandown q --search "auth"              # recherche plein texte (titre+body+subtasks)
kandown q --archived
```

**Sélection de champs et formats** (le cœur de l'optimisation tokens) :

```bash
kandown q --fields id,title,status,priority     # colonnes à la carte
kandown q --format json | ids | titles | table | md | tsv
kandown q --count -s backlog                    # juste un nombre
kandown q ids --ready                           # "t101 t105 t203" — one-liner composable
```

**Lecture groupée et digest :**

```bash
kandown show t1 t3 t7            # N tâches complètes en un appel (séparées par "--- <id> ---")
kandown show t203 --meta         # frontmatter seul, sans le body
kandown context                  # LE digest LLM : board complet en markdown compact —
                                 # colonnes, compteurs, tâches (id/titre/pri/blocked),
                                 # détail des In Progress, deps en attente. ~1 appel = tout le contexte.
kandown context --budget 2000    # cap en tokens approx : tronque intelligemment (Done → compteurs)
kandown next                     # LA tâche à prendre : première non-bloquée par priorité
kandown next --assignee claude --json
```

### 3.3 Mutations — écriture sans friction

```bash
kandown create "Fix login" -p P1 -t backend --to todo   # (C1 corrigé : -p = priority)
kandown move t42 done                                   # gate depends_on conservé
kandown set t42 priority=P1 assignee=claude due=2026-07-25   # patch de champs en un appel
kandown check t42 2                                     # coche la subtask n°2 (kandown show t42 --meta les numérote)
kandown report t42 --file -                             # append un ## Report depuis stdin
                                                        #   (fini les agents qui réécrivent le .md entier
                                                        #    et cassent le frontmatter)
kandown done t42 --report "Fixed in a3f21c"             # move Done + report en un appel
kandown batch --json < ops.json                         # N mutations atomiques, résultat par op
```

**Contrat de sortie strict** (M2 appliqué partout) :
- stdout = données uniquement (`t42` après create, JSON si `--json`, rien sinon) ; stderr = humain.
- Exit codes : `0` ok · `1` erreur d'usage · `2` introuvable · `3` bloqué par le gate · `4` conflit. Un agent branche sur le code, pas sur du texte.
- Erreurs en JSON sur stderr quand `--json` : `{"error":"blocked","by":["t201"]}`.
- `--quiet` pour les scripts qui ne veulent que l'exit code.

### 3.4 Intégration agents

- **`AGENT_KANDOWN.md` réécrit autour de ces commandes** : la doc agent actuelle enseigne « lis/édite les fichiers .md » ; elle doit enseigner `kandown q` / `set` / `report` / `done` en premier (plus rapide, plus sûr — c'est le CLI qui garantit frontmatter valide, gate de dépendances, archive cohérente). L'édition directe des fichiers reste le fallback documenté.
- **`kandown mcp`** (cf. FABLE_FEATURES §1) expose exactement ces mêmes verbes en MCP tools — le shell et le MCP partagent le même module core, aucune divergence possible.
- **`kandown q` = zéro latence** : pas de check update (M1), pas de daemon requis, lecture directe du filesystem.

---

## Partie 4 — Le refactor qui porte tout ça

Impossible de construire les Parties 2-3 sur `bin/kandown.js` (2 311 lignes de JS non typé qui duplique `src/`). Ordre de marche :

```
bin/kandown.js            → shim ~30 lignes (shebang, polyfills, import dist/cli.js)
src/cli/core/             → LE cœur partagé, pur, testé :
  tasks.ts                  (list/read/write via parser+serializer de src/lib — C2 mort)
  query.ts                  (filtres, tri, formats, digest — Partie 3)
  mutate.ts                 (create/move/set/check/report + gate + undo journal + atomicWrite)
  daemon.ts                 (l'actuel, + fix C4 + lock M7)
src/cli/commands/           → 1 fichier par commande (q, show, create, move, set, report,
                              context, next, doctor, daemon, init, update, mcp)
src/cli/screens/            → TUI refondu (Partie 2) : board, preview, markdown-renderer, palette
src/cli/output.ts           → discipline stdout/stderr, formats, couleurs TTY-only (M2)
```

- tsup bundle déjà `tui.js` : ajouter l'entrée `cli.ts` est trivial (`tsup.config.ts`).
- **Un seul parser, un seul gate `depends_on`, un seul module daemon** — les 3 copies actuelles convergent.
- Tests Vitest sur `core/` (round-trip parser, query, gate, formats) + intégration spawn dans tmpdir (`init`, `create -p P1` → régression C1, capture `$(…)` → M2).

### Roadmap séquencée

| Phase | Contenu | Dépend de |
|---|---|---|
| **P0 — hotfixes** (patch) | C1, C2 (parser partagé minimal), C4, M2, M3, politique update M1 | — |
| **P1 — socle** (minor) | Refactor bin→`src/cli/core` + tests + atomicWrite + lock daemon | P0 |
| **P2 — CLI agent** (minor) | `q`, `show` multi, `set/check/report/done`, `context`, `next`, exit codes, réécriture AGENT_KANDOWN.md | P1 |
| **P3 — TUI refonte** (minor) | Layout focus+preview, renderer markdown, cartes 1 ligne, scroll, `/` `n` `e` `?`, line-map souris (C3) | P1 |
| **P4 — MCP** (minor) | `kandown mcp` au-dessus de `core/` | P2 |

P2 et P3 sont indépendantes → parallélisables. Chaque phase est shippable seule (règle « bump » du projet respectée : une release nommée par phase).

---

*Sources consolidées : `FABLE_CODEQUALITY.md` (bugs C1-C4, M1-M7, dette), `FABLE_FEATURES.md` (§1 MCP, §2 TUI, §2.5 shell), `FABLE_UI.md` (§4.3 thème TUI).*
