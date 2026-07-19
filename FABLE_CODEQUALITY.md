# FABLE_CODEQUALITY — Audit qualité du code Kandown

> Rapport généré par Claude Fable 5 — 2026-07-19 — base : `main` @ v0.17.1
> Focus principal : **le CLI (`bin/kandown.js` + `src/cli/`)**, puis serveur HTTP, watcher, et dette transverse.

---

## Résumé exécutif

Le projet a une bonne fondation (parser pur, tokens shadcn, TUI Ink, daemon per-project bien pensé), mais le CLI souffre de **4 bugs critiques reproductibles**, d'une **duplication massive de logique** entre `bin/kandown.js` (2 311 lignes de JS non typé) et `src/cli/` (TypeScript), et d'une **absence totale de tests**. La plupart des bugs "bizarres" ressentis à l'usage (clics souris qui sélectionnent la mauvaise tâche, champs de tâche qui disparaissent, daemon zombie) ont une cause racine identifiée ci-dessous.

| Sévérité | Nombre | Exemples |
|---|---|---|
| 🔴 Critique (perte de données / comportement faux) | 4 | collision `-p`, round-trip frontmatter, hit-testing souris, daemon orphelin |
| 🟠 Majeur (casse un usage réel) | 7 | auto-update bloquant, stdout pollué, unarchive incohérent, colonnes non scrollables, CORS `*` |
| 🟡 Mineur / dette | ~15 | code mort, Windows, timers fuités, CPU watcher, semver, pas de tests |

---

## 🔴 Bugs critiques

### C1. Collision de flag `-p` : `kandown shell create "x" -p P1` installe Kandown dans un dossier `P1/`

- `bin/kandown.js:516` — `parseArgs` mappe `-p` sur `--path`.
- `bin/kandown.js:947` — `shellParseArgs` mappe `-p` sur `--priority`.
- Chaque commande shell appelle **d'abord** `ensureKandownDir(rawArgs)` (`bin/kandown.js:972,1031,1062…`), qui passe les args bruts dans `parseArgs`.

Résultat : `kandown shell create "Fix auth" -p P1` → `args.path = "P1"` → le dossier `P1/` n'existe pas → **auto-init silencieux d'une installation Kandown complète dans `./P1/`** et la tâche est créée là-bas. L'exemple de la doc intégrée (`kandown shell create "Refactor auth" -p P1`, `bin/kandown.js:400`) déclenche lui-même le bug.

**Fix recommandé :**
1. Réserver `-p` à `--priority` dans le contexte shell ; n'accepter que `--path` (long) pour le chemin.
2. `ensureKandownDir` ne doit **jamais** auto-init sans confirmation quand le chemin vient d'un flag implicite — auto-init uniquement pour `.kandown` par défaut, et afficher ce qui va être créé.

### C2. Perte de données frontmatter : le mini-parser YAML du shell ne sait pas relire ce que son serializer écrit

- `serializeFrontmatter` (`bin/kandown.js:863-879`) émet les strings multi-lignes en block scalar :
  ```yaml
  report: |
    ligne 1
    ligne 2
  ```
- `parseFrontmatter` (`bin/kandown.js:831-861`) parse ligne par ligne avec `^([a-zA-Z_][\w-]*)\s*:\s*(.*)$` : la ligne `report: |` devient `report: null` (valeur vide → null → **supprimée à la réécriture**) et les lignes indentées suivantes sont ignorées.

Conséquence : **tout `kandown shell move` / `assign` sur une tâche contenant un champ multi-ligne (ex. `report:` écrit par un agent IA) détruit ce champ.** C'est un cycle lecture→réécriture complet du fichier, donc perte silencieuse et définitive (hors git).

**Fix recommandé :** supprimer le mini-parser du `bin` et réutiliser `src/lib/parser.ts` + `src/lib/serializer.ts` (déjà purs, zéro dépendance navigateur, déjà bundlés dans `bin/tui.js`). Sinon, à minima : parser les block scalars `|`, et **refuser de réécrire** un fichier dont des lignes de frontmatter n'ont pas été comprises (préserver les lignes inconnues verbatim).

### C3. TUI : hit-testing souris faux dès qu'une colonne contient des séparateurs ou des cartes 3 lignes

- Le rendu insère un séparateur `─` entre chaque tâche (`board.tsx:296-300`) et les tâches taguées rendent 3 lignes (`CategoryTaskRow`, `board.tsx:223-240`).
- Le hit-testing suppose 1 tâche = 1 ligne : `const taskIdx = y - TASKS_START_Y` (`board.tsx:519`, `board.tsx:758`, et gestion du menu contextuel `board.tsx:781+`).

Résultat : **cliquer sur la 2ᵉ tâche (ou en dessous) sélectionne/ouvre la mauvaise tâche**, le drag & drop dépose au mauvais index, et le menu contextuel décale tout. C'est très probablement la cause principale du ressenti « le TUI est buggué ».

De plus, `layoutRef` (positions X des colonnes) n'est recalculé qu'au chargement du board (`updateLayout`, `board.tsx:491`), pas au **resize du terminal** → les colonnes cliquées sont décalées après un resize.

**Fix recommandé :** construire à chaque rendu une *ligne map* (`lineToTask: Array<{colIdx, taskIdx} | 'separator' | 'menu'>`) dérivée des mêmes données que le rendu, et l'utiliser pour tout le hit-testing. Recalculer layout sur `process.stdout.on('resize')`.

### C4. `kandown daemon stop` peut orphaniser un daemon vivant (port occupé pour toujours)

- `getDaemonStatus` retourne `{running:false}` quand le fetch `/api/daemon` échoue **transitoirement** alors que le PID est vivant (`bin/kandown.js:1394-1402`, idem `src/cli/lib/daemon.ts:135-141`) — choix volontaire et correct.
- Mais `stopDaemon` (`bin/kandown.js:1469-1486`, `daemon.ts:192-211`) fait : status pas running → `removeDaemonMetadata()` → return. **Le process vivant n'est jamais tué, et on supprime la seule référence à son PID.** Daemon zombie, port bloqué dans la plage 2048-2150, plus aucun moyen de l'arrêter via le CLI.

**Fix recommandé :** dans `stopDaemon`, si `readDaemonMetadata()` donne un PID vivant, envoyer SIGTERM **même si** le health-check HTTP échoue ; ne supprimer la metadata qu'après mort du process (ou timeout + SIGKILL).

---

## 🟠 Problèmes majeurs

### M1. Auto-update : bloquant, sur chaque commande, y compris scriptée
`checkForUpdate` (`bin/kandown.js:160`) est `await`-é avant **chaque** commande (`bin/kandown.js:2260`) :
- ajoute jusqu'à ~6 s de latence réseau à `kandown shell list --json` utilisé dans des scripts/CI ;
- fait un `npm install -g` **sans consentement** (mutation globale de la machine) ;
- après update, respawn la commande détachée avec `stdio: 'inherit'` → un pipeline `$(kandown shell list --json)` peut recevoir une sortie dupliquée/entrelacée ;
- `semverGt` (`bin/kandown.js:133`) casse sur les prérelease (`0.18.0-beta.1` → `Number("0-beta") = NaN`).

**Fix :** (1) jamais d'update-check pour `shell`, `daemon run`, `--json`, ou si `!process.stdout.isTTY` ; (2) throttle 24 h via fichier cache ; (3) proposer au lieu d'installer (`Update available → run: npm i -g kandown`) ou demander une confirmation ; (4) opt-out `KANDOWN_NO_UPDATE=1`.

### M2. `shell create` pollue stdout — la capture d'ID promise ne marche pas
Le commentaire (`bin/kandown.js:1104`) promet `ID=$(kandown create ...)`, mais la ligne colorée `✓ Created t42 → Backlog` part **aussi** sur stdout via `log()`. `$(...)` capture les deux lignes. **Fix :** toute sortie décorative sur `stderr`, seules les données (id, JSON) sur `stdout` — règle générale à appliquer à tout le shell mode.

### M3. `shell move` sort une tâche d'archive sans déplacer le fichier
`shellMove` (`bin/kandown.js:1150-1163`) : archivage = write dans `archive/` + unlink (correct), mais **désarchivage** (move d'une tâche archivée vers une colonne) réécrit le fichier *sur place dans `archive/`* en supprimant le flag `archived`. Le dossier ne reflète plus le flag — la web UI (qui maintient miroir flag/dossier, cf. `putTask` `bin/kandown.js:1746-1752`) et le shell divergent. **Fix :** si `resolved !== 'archived'` et que le fichier vit dans `archive/`, le déplacer vers `tasks/`.

### M4. TUI : pas de scroll vertical dans les colonnes
`app.tsx` fixe `height={rows} overflow="hidden"` ; une colonne avec plus de tâches que la hauteur du terminal rend les tâches du bas **invisibles et inatteignables** (le curseur `j` continue hors écran). Il faut un viewport par colonne (offset de scroll qui suit `rowIndex`, indicateurs `↑ n more / ↓ n more`).

### M5. API locale : CORS `*` sans aucune authentification
`apiHeaders` (`bin/kandown.js:1488`) répond `Access-Control-Allow-Origin: *` sur une API qui **lit/écrit/supprime des fichiers** (`PUT /api/tasks/:id`, `DELETE`, `PUT /api/config`). N'importe quelle page web ouverte dans le navigateur peut scanner `localhost:2048-2150` et modifier/exfiltrer les tâches (drive-by localhost). **Fix :** générer un token au démarrage du daemon, l'injecter dans le HTML servi (`window.__KANDOWN_TOKEN__`), l'exiger sur toutes les routes d'écriture ; restreindre CORS à l'origin du daemon lui-même.

### M6. Écritures non atomiques
`putTask`, `putConfig`, `saveConfig`, `shellMove`… font tous `writeFileSync` direct. Un crash/kill au milieu = fichier tronqué (et `kandown.json` corrompu ⇒ reset silencieux des réglages via `loadConfig`). **Fix :** helper unique `atomicWrite(path, content)` (write `path.tmp` → `renameSync`). Idem pour `daemon.json`.

### M7. Race au démarrage de deux daemons du même projet
Deux `kandown` lancés en parallèle dans le même projet : les deux voient `running:false`, les deux spawn `daemon run`, les deux écrivent `daemon.json` (le dernier gagne, l'autre daemon devient orphelin). **Fix :** lock file `daemon.lock` (O_EXCL) autour du spawn, ou le daemon `run` doit vérifier avant d'écrire que `daemon.json` n'appartient pas à un autre PID vivant.

---

## 🟡 Dette, incohérences, robustesse

### Architecture & duplication (la cause racine de la moitié des bugs)
`bin/kandown.js` (JS non typé, 2 311 lignes) réimplémente ce qui existe déjà en TypeScript testé/typé dans `src/` :

| Logique | bin/kandown.js | src (TS) |
|---|---|---|
| Parser/serializer frontmatter | `parseFrontmatter` / `serializeFrontmatter` (buggé, cf. C2) | `src/lib/parser.ts`, `serializer.ts` |
| Status daemon / TCP probe / waitFor | lignes 1302-1486 | `src/cli/lib/daemon.ts` (quasi copie) |
| `getProjectRoot` / `getTasksDir` | lignes 531-543 | `src/cli/lib/board-reader.ts:41-52` |
| Lecture config | `readKandownConfig` (pas de defaults) | `src/cli/lib/config.ts` (defaults + garde-fous t111) |
| Gate `depends_on` | `shellTaskIsResolved` + `shellMove` | web store + `board.tsx:tryMoveWithGate` (3ᵉ copie) |

**Recommandation structurante :** transformer `bin/kandown.js` en shim de ~30 lignes qui importe un bundle CLI TS (`src/cli/commands/*.ts`, buildé par tsup comme `tui.js` l'est déjà). Un seul parser, un seul module daemon, un seul gate. C'est LE refactor qui rentabilise tout le reste.

### Code mort / trompeur
- `findKandownDir` (`bin/kandown.js:2221`) : jamais appelé.
- Double validation morte du status dans `shellList` (`bin/kandown.js:980-983`) : inatteignable après `shellResolveStatus`.
- Endpoints `board.md` (`getBoard`/`putBoard`, `bin/kandown.js:1654-1676`) : concept legacy supprimé, mais l'API existe toujours (et `cmdInit` teste encore `.kandown/board.md`, ligne 761).
- `FileWatcher.debouncedEmit` (`file-watcher.ts:271`) : jamais utilisé.
- Poll du hash config (`file-watcher.ts:227-234`) : calcule un hash puis ne fait rien (le commentaire l'admet).
- `spawnSync` importé jamais utilisé ; `rmdirSync` déprécié → `rmSync(dir, { recursive: false })`.
- Aide du shell : les exemples affichent `kandown list --json`, `kandown create`, `kandown move` (`bin/kandown.js:1272-1277` + messages d'usage lignes 1035, 1066, 1116) alors que la vraie syntaxe est `kandown shell <cmd>`. Soit corriger les textes, soit — mieux — **promouvoir `list/create/move/show/assign/commit` en commandes top-level** (elles ne collident avec rien).

### TUI (`src/cli/screens/board.tsx`)
- **Timers de statusMsg** : ~12 `setTimeout(() => setStatusMsg(''))` indépendants ; deux messages successifs → le 1ᵉʳ timer efface le 2ᵉ message trop tôt, et les timers survivent à l'unmount. Fix : un seul helper `showStatus(msg, ms)` avec ref + clearTimeout.
- **Scroll du détail non borné** : `setDetailScroll(s => s + 1)` sans max (`board.tsx:1141`) — on peut scroller dans le vide infiniment.
- Après `q`/`Esc` en mode `browse`, sortie sans confirmation même en plein drag (les modes le gèrent, browse non — ok, mais documenter).
- `columnAccentColor` en dur vs. `config.board.columnColors` de la web app : les couleurs de colonnes ne suivent pas la config projet.
- Prompt agent passé en argv (`agents.ts:buildCommand`) : `AGENT_KANDOWN.md` + tâche entière peuvent dépasser ARG_MAX (E2BIG) sur de gros docs. Le `contextFile` est écrit « en filet de sécurité » (`launcher.ts:110-118`) mais **jamais utilisé en fallback**. Fix : si la taille combinée > ~100 Ko, lancer l'agent avec une consigne courte pointant vers le fichier de contexte.
- `settings.tsx` ne propose que 11 langues alors que l'app en supporte 48 (`src/lib/i18n/locales/`) — générer la liste depuis les locales.
- `config.ts:setConfigValue` crash si un niveau intermédiaire du dot-path manque (`current[parts[i]]` undefined).

### Watcher (`src/cli/lib/file-watcher.ts`)
- Poll de **300 ms** qui re-hash SHA-256 **tous** les fichiers tâches en boucle : sur un board de 200 tâches c'est un vrai coût CPU/IO permanent. Fix : comparer `mtimeMs + size` d'abord, ne hasher que si changé ; passer le poll à 1-2 s (chokidar couvre le temps réel).
- `hashFileSync` utilise `require('node:fs')` dans un module ESM (`file-watcher.ts:55`) — ne marche que grâce au shim `globalThis.require` du bin. Importer `readFileSync` normalement.
- Le dossier `tasks/archive/` n'est pas observé : archiver/désarchiver depuis la web UI ne rafraîchit pas le TUI.

### Cross-platform
Le README documente Windows, mais : `lsof`/`ps` (`detectStaleKandown`, `bin/kandown.js:2039-2096`), `readlink /proc` (Linux ok), `which` (`agents.ts:154` — `where` sur Windows), `tmux`. Décision à prendre : soit supporter réellement Windows (utiliser `process.platform` + équivalents, ou virer `lsof` au profit du TCP probe + `daemon.json`), soit l'assumer et le documenter.

### Gestion d'erreurs process
Aucun handler `process.on('uncaughtException' | 'unhandledRejection')` dans le bin : une rejection dans un handler HTTP (ex. `readBody` reject) affiche une stack brute et peut tuer le daemon. Ajouter un filet global qui log proprement et, pour le daemon, reste vivant.

### Serveur HTTP
- `readBody` sans limite de taille (`bin/kandown.js:1512`) : cap à ~10 Mo avec 413.
- `putConfig` valide « c'est du JSON » mais pas « c'est un config valide » : un `PUT` de `[]` écrase `kandown.json` (puis `loadConfig` silently reset). Valider le shape minimal (objet, `board.columns` array de strings).
- `putTask` ne valide pas que le body est un fichier tâche parsable — au minimum vérifier le frontmatter `---` et refuser un body vide.

---

## Tests & outillage (actuellement : zéro)

Priorités de mise en place, dans l'ordre de rentabilité :

1. **Vitest** + tests unitaires du cœur pur (aucun mock nécessaire) :
   - round-trip `parseTaskFile` ↔ `serializeTaskFile` (aurait attrapé C2 immédiatement) ;
   - `buildColumnsFromTasks`, gate `depends_on`, `semverGt`, `parseMouseInput`.
2. **Tests d'intégration CLI** (spawn du bin dans un tmpdir) : `init`, `shell create/list/move/assign` (aurait attrapé C1, M2, M3), allocation de port, `daemon start/stop`.
3. **ESLint + typecheck du bin** : passer le bin en TS (cf. refactor) ou au minimum `// @ts-check` + JSDoc types.
4. **CI GitHub Actions** : `pnpm typecheck && pnpm test && pnpm build` sur PR (le workflow actuel ne fait que publier sur tag).
5. Nettoyage repo : `.gitignore 2`, `draft.af`, `draft.af~lock~`, `README_ALT.md`, `graphify-out/` (obsolète), `AUDIT.md`/`DESIGN_IMPROVEMENTS.md`/`ameliorations_ideas_audit.md` (à archiver dans `docs/` ou supprimer).

---

## Feuille de route proposée

| Phase | Contenu | Effort estimé |
|---|---|---|
| **P0 — hotfix patch** | C1 (flag `-p`), C2 (round-trip via parser partagé), C4 (stop daemon), M2 (stdout), M3 (unarchive) | 1-2 jours |
| **P1 — TUI fiable** | C3 (line-map hit-testing + resize), M4 (scroll colonnes), timers statusMsg, scroll détail borné | 2-3 jours |
| **P2 — refactor structurant** | bin → shim + `src/cli/commands/*.ts`, un seul parser/daemon/gate, écritures atomiques, M1 (update policy), M7 (lock) | 3-5 jours |
| **P3 — durcissement** | M5 (token API), limites body, validation config, handlers globaux, watcher mtime, Windows | 2-3 jours |
| **P4 — filet permanent** | Vitest + intégration CLI + CI | 2 jours |

---

*Voir aussi : `FABLE_FEATURES.md` (fonctionnalités & UX) et `FABLE_UI.md` (système de thèmes).*
