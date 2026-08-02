# Migration Kandown Work

> Handoff autonome pour reprendre le développement dans Codex Desktop.
>
> Date du handoff: 2026-08-01
>
> État: migration partiellement implémentée, non intégrée de bout en bout.
>
> Important: ce document est volontairement indépendant du board Kandown. Il sert de spécification, journal d'avancement, liste de contrôle et point de reprise si les tâches Kandown sont indisponibles.

## 1. Résumé exécutif

L'objectif est de remplacer le système actuel d'instructions agent, dispersé entre plusieurs fichiers générés et plusieurs interfaces, par un seul pipeline dynamique:

```text
kandown work
```

Ce pipeline doit devenir l'unique source officielle des instructions Kandown destinées aux agents. Il doit compiler, dans un ordre fixe, le coeur Kandown, les colonnes réelles du projet, les extensions actives, le workflow choisi, la cadence de suivi, les skills actives, les instructions globales, les instructions du projet, puis le contexte de tâche ou le digest du board.

La migration comprend aussi:

- un workflow actif exclusif par projet;
- des skills additives compatibles avec ce workflow;
- six workflows officiels fournis avec Kandown;
- des colonnes libres mais dotées de rôles sémantiques;
- des task templates nommés et des board presets optionnels;
- un éditeur de workflow dans Settings;
- un format source lisible et une capsule Markdown portable;
- une future distribution par dépôts GitHub appartenant aux auteurs;
- une migration sûre des anciens fichiers d'instructions;
- la suppression des copies générées `AGENT_KANDOWN.md` et `AGENT.md`.

Une partie des fondations existe déjà dans le worktree. Le compiler, les adapters CLI/UI, les commandes workflow, l'intégration des extensions, la migration runtime et Settings restent à faire.

### Avancement consolidé au moment du crash

Terminé et vérifié:

- [x] Décisions produit et architecture consolidées avec vava.
- [x] Recherche de dix familles de workflow avec 37 citations primaires.
- [x] Suite finale de six workflows et mapping des inspirations décidés.
- [x] Config `KandownConfig` partagée entre web, CLI et TUI.
- [x] Migration des anciens modes de densité dans le normalizer.
- [x] Rôles de colonnes et instructions de colonnes dans la config.
- [x] Contrats workflow version 1 et erreurs structurées.
- [x] Validation data-only et sécurité des chemins.
- [x] Capsule Markdown import/export.
- [x] Six packages built-in et seize task templates rédigés.
- [x] Fondation de migration sûre des fichiers agent.
- [x] 193 tests passants et typecheck passant sur le worktree actuel.

Présent mais non intégré au produit:

- [ ] Charger les six built-ins avec le validator réel après correction du board preset.
- [ ] Brancher les helpers de migration dans init et upgrade.
- [ ] Exposer les packages, capsules et templates par la CLI et Settings.

Non commencé ou incomplet:

- [ ] Compiler partagé des neuf couches.
- [ ] `kandown work` migré vers le compiler.
- [ ] Launcher migré vers le compiler.
- [ ] Settings Workflow, Skills et Kandown Work.
- [ ] Résumés et guides extension.
- [ ] Commandes `kandown workflow`.
- [ ] Store GitHub, installation et update diff.
- [ ] Suppression effective des anciens fichiers générés.
- [ ] Documentation finale, build et quality gate complet.

## 2. Vision produit

La promesse produit est:

> Je crée un projet, j'installe Kandown, j'ouvre la web UI, je choisis un workflow et deux ou trois plugins. En moins de 30 secondes, j'ai un système de tâches fiable et cadré.

Kandown ne doit pas seulement afficher des cartes Markdown. Il doit proposer un mode de travail agent fiable, sélectionnable, compréhensible et portable.

Le workflow Kandown actuel est utile, mais il ne doit plus être imposé à tous les projets. Il devient le workflow officiel par défaut, nommé **Kandown Standard**.

## 3. Portée des tâches historiques

Cette migration regroupe principalement trois tâches existantes:

### t260, priorité P1

**Delete AGENT_KANDOWN.md, the CLI is the only source of agent instructions**

État actuel dans le board: `In Progress`, assignée à `pi`.

C'est le prérequis architectural. Il faut supprimer les copies générées et ne garder qu'une source runtime servie par `kandown work`.

### t259, priorité P1

**Make the agent workflow chosen, not imposed**

État actuel dans le board: `Todo`, assignée à `pi`, dépend de `t260`.

Cette tâche transforme le protocole Kandown en workflow sélectionnable.

### t258, priorité P3

**Workflow and skill store, pick an AI workflow in 30 seconds**

État actuel dans le board: `In Progress`, assignée à `pi`.

Cette tâche porte le format des workflows, les built-ins, les skills, les templates et les fondations du store.

## 4. Décisions produit fermes

Ces décisions ont été prises avec vava. Ne pas les modifier silencieusement.

### 4.1 Un workflow exclusif, plusieurs skills additives

- Un seul workflow est actif à la fois dans un projet.
- Les workflows ne se composent pas entre eux.
- Plusieurs skills compatibles peuvent être activées en plus du workflow.
- Le workflow définit le cycle principal.
- Les skills ajoutent des pratiques ciblées, par exemple code review, release, recherche ou TDD.

### 4.2 Coeur Kandown immuable

Le coeur de sécurité Kandown est toujours présent et toujours placé en premier.

Les utilisateurs peuvent choisir sa densité, mais ne peuvent pas le supprimer, le réordonner ou remplacer ses invariants par un raw template.

Les anciens réglages `includeBaseRules`, `sectionOrder` et `rawTemplate` restent temporairement lisibles pour compatibilité, mais ne doivent plus permettre de contourner le coeur.

### 4.3 Deux réglages indépendants

**Niveau de détail:**

- `caveman`
- `standard`
- `complete`

**Cadence de suivi des tâches:**

- `live`
- `balanced`
- `economy`

La densité des instructions et la fréquence des mises à jour sont deux axes différents. Ne pas les fusionner.

### 4.4 Instructions utilisateur

Les instructions utilisateur du projet vivent dans:

```text
.kandown/kandown_work.md
```

Les instructions globales vivent dans:

```text
~/.kandown/kandown_work.md
```

Les anciens fichiers `.kandown/instructions.md` et `~/.kandown/instructions.md` doivent être migrés sans perte.

### 4.5 Colonnes libres, rôles sémantiques explicites

Les utilisateurs gardent des noms de colonnes totalement libres.

Chaque colonne reçoit:

- un rôle sémantique;
- une instruction optionnelle éditable;
- son nom réel, qui reste la valeur écrite dans `status` des tâches.

Rôles retenus:

```text
backlog
ready
active
review
terminal
custom
```

Les workflows référencent les rôles, jamais les labels anglais codés en dur.

Exemple:

```json
{
  "name": "Building",
  "role": "active",
  "instructions": "Keep the active implementation and evidence current."
}
```

### 4.6 Board preset explicite et sûr

Un workflow peut fournir un board preset.

Ce preset:

- n'est jamais appliqué automatiquement à un projet existant;
- doit afficher un preview du changement;
- doit expliquer les migrations de statuts;
- demande une confirmation humaine;
- ne doit jamais rendre des tâches orphelines.

### 4.7 Task templates illimités

Un workflow peut fournir autant de task templates Markdown nommés que nécessaire.

Il peut définir au maximum un template par défaut.

### 4.8 Workflows du store immuables

- Un workflow installé depuis le store n'est pas modifié directement.
- Une personnalisation crée un fork local versionné.
- Le fork doit conserver la provenance et la version d'origine.
- Une update upstream ne doit jamais écraser le fork.

### 4.9 Distribution communautaire

- Les auteurs hébergent leurs workflows dans leurs propres dépôts GitHub.
- Kandown possède un index de dépôts approuvés.
- L'installation cible une release ou un commit épinglé, jamais une branche mouvante.
- Les updates sont validées mais restent opt-in.
- L'utilisateur doit voir un diff avant d'accepter une update.
- Le réseau n'est utilisé que sur action explicite, par exemple ouverture du store ou commande store.
- Le store unifié pourra contenir `plugin`, `skill`, `template`, `theme` et workflow selon l'évolution du manifest global.

### 4.10 Settings reste le centre d'édition

Le Workflow Editor reste dans Settings. Ne pas créer une application parallèle.

Les tabs décidées sont:

- **Workflow**
- **Skills**
- **Kandown Work**

## 5. Compiler unique, contrat central

La fonction centrale à créer doit s'appeler, ou être équivalente à:

```ts
compileKandownWork(input): CompiledKandownWork
```

Elle doit être pure, partagée et déterministe.

Les trois surfaces suivantes doivent appeler exactement ce compiler:

1. `kandown work`
2. le launcher agent
3. le preview exact dans Settings

Aucune de ces surfaces ne doit reconstruire les instructions de son côté.

### 5.1 Ordre obligatoire des neuf couches

L'ordre est fixe:

1. Coeur Kandown immuable
2. Colonnes dynamiques, rôles, instructions et commandes réellement disponibles
3. Résumés concis des extensions activées
4. Workflow actif
5. Politique de cadence
6. Skills actives
7. Instructions globales personnalisées
8. `.kandown/kandown_work.md`
9. Contexte de tâche explicite ou digest du board

### 5.2 Coeur immuable attendu

Le coeur doit rester court et couvrir au minimum:

- la tâche Markdown est la source de vérité;
- lire la tâche ciblée avant de travailler;
- respecter les dépendances et blocages;
- ne pas inventer de changement de scope;
- enregistrer la progression selon la cadence active;
- fournir une preuve avant le statut terminal;
- préserver les données utilisateur;
- ne pas modifier silencieusement les décisions ou le hors-scope;
- utiliser uniquement les commandes réellement disponibles.

La formulation exacte peut varier selon `caveman`, `standard` et `complete`, mais les invariants ne changent pas.

### 5.3 Commandes dynamiques

Le compiler doit afficher seulement les commandes supportées par la version installée.

Point de vigilance critique: ne pas annoncer `kandown start`, `kandown check`, `kandown report` ou `kandown done` tant que ces commandes n'existent pas réellement.

Les commandes de mutation ciblées prévues dans `t233`, ou leurs équivalents supportés, pourront être ajoutées plus tard à cette section.

### 5.4 Placeholders workflow

Les protocoles built-in utilisent actuellement:

```text
{{column:backlog}}
{{column:ready}}
{{column:active}}
{{column:review}}
{{column:terminal}}
{{trackingPolicy}}
```

Le compiler doit résoudre les colonnes depuis `KandownConfig.board.columnMeta`.

Si un rôle requis est absent:

- produire une erreur ou un warning structuré;
- proposer le board preset du workflow si disponible;
- ne pas inventer silencieusement un nom de colonne;
- ne pas déplacer de tâches automatiquement.

### 5.5 Cadence de suivi

Comportement conseillé:

**live**

- mettre à jour la checklist et les reports après chaque étape significative;
- enregistrer les blockers dès leur découverte;
- garder le board fidèle au travail en cours.

**balanced**

- mettre à jour après chaque sous-tâche, changement de phase ou découverte importante;
- éviter le bruit des micro-étapes.

**economy**

- mettre à jour au démarrage, lors d'un blocker, lors d'un changement de phase et à la fin;
- réduire les écritures tout en gardant une reprise possible.

## 6. Digest de tâche et du board

Le dernier bloc du compiler dépend de l'appel:

- si une tâche est explicitement ciblée, charger cette tâche et son contexte utile;
- sinon, fournir le digest du board et la prochaine tâche actionnable.

Le contexte doit rester compact et inclure ce qui est utile:

- id, titre, statut, priorité, assignee;
- dépendances et blockers;
- acceptance criteria;
- checklist et reports;
- décisions et hors-scope;
- prochain travail actionnable;
- résumé des colonnes si configuré.

Ne pas injecter tout le backlog dans chaque prompt.

## 7. Extensions dans Kandown Work

Chaque extension activée peut contribuer une guidance agent concise.

Le modèle décidé:

- résumé court inclus automatiquement dans `kandown work`;
- guide complet chargé seulement à la demande;
- lien source optionnel;
- une extension cassée ne doit jamais casser le coeur Kandown.

Commande prévue:

```text
kandown extension guide <id>
```

Le manifest d'extension doit pouvoir déclarer des champs équivalents à:

```json
{
  "agent": {
    "summary": "Short operational guidance.",
    "guide": "guide.md",
    "source": "https://example.com/docs"
  }
}
```

Le nom final des champs doit rester cohérent avec `docs/EXTENSIONS.md` et l'ADR extension.

## 8. Format source d'un workflow

Le format retenu est un dossier lisible, data-only:

```text
my-workflow/
  manifest.json
  protocol.md
  guide.md
  board.json
  templates/
    feature.md
    bug.md
```

### 8.1 Manifest version 1

Contrat implémenté actuellement:

```ts
interface WorkflowManifest {
  formatVersion: 1;
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  summary: string;
  minKandownVersion?: string;
  requiredRoles: WorkflowBoardRole[];
  protocol: string;
  guide?: string;
  boardPreset?: string;
  taskTemplates: WorkflowTaskTemplateManifest[];
  attribution: WorkflowAttribution[];
}
```

Règles actuelles:

- `id` et ids de templates en kebab-case;
- versions semver-like;
- chemins relatifs portables;
- aucun path traversal;
- aucun fichier exécutable;
- aucun champ runtime ou script;
- aucun fichier non déclaré;
- au maximum un task template par défaut;
- erreurs structurées, pas d'exception pour une entrée utilisateur invalide.

### 8.2 Capsule Markdown portable

Le format source reste le dossier lisible.

L'export produit un fichier:

```text
*.kandown-workflow.md
```

Ce capsule contient:

- un frontmatter versionné;
- des sections taggées et length-delimited;
- le manifest;
- le protocol;
- le guide optionnel;
- le board preset optionnel;
- tous les task templates.

Le parser actuel limite une capsule à 1 MiB et refuse les déclarations exécutables.

### 8.3 Point bloquant découvert au handoff

Les six `board.json` built-in sont actuellement des tableaux JSON:

```json
[
  { "name": "Backlog", "role": "backlog" }
]
```

Le validator dans `src/lib/workflows/validation.ts` exige actuellement un objet JSON à la racine, et les tests utilisent:

```json
{
  "columns": [
    { "name": "Backlog", "role": "backlog" }
  ]
}
```

Il faut résoudre ce mismatch avant de déclarer les packages valides.

Recommandation: garder un objet racine extensible:

```json
{
  "columns": [
    { "name": "Backlog", "role": "backlog", "instructions": "..." }
  ],
  "priorities": ["P1", "P2", "P3"]
}
```

Cette forme pourra accueillir plus tard tags, priorités et seed tasks sans casser le format.

## 9. Les six workflows officiels

Les noms sont neutres. Les manifests conservent l'attribution sans suggérer d'endorsement.

Le document de recherche recommande six archétypes avec des noms différents. La suite produit finale les mappe ainsi.

### 9.1 Kandown Standard

Id: `kandown-standard`

But: travail petit ou moyen, équilibré, rapide mais pas imprudent.

Cycle:

```text
scope -> implement smallest complete change -> verify -> review -> done
```

Template actuel:

- `standard-task`

Inspirations citées:

- OpenAI Codex best practices
- boucle Plan, Execute, Test, Commit

### 9.2 Real Engineering

Id: `real-engineering`

But: transformer une spec revue en slices verticales, appliquer TDD aux seams utiles, puis séparer review Standards et review Spec.

Cycle:

```text
spec -> tracer bullet -> vertical slices -> selected TDD -> Standards review -> Spec review
```

Templates actuels:

- `feature-spec`
- `tracer-bullet`
- `standards-review`
- `spec-review`

Inspirations citées:

- Matt Pocock, AI Hero, seven phases
- skill to-spec
- skill code-review
- Simon Willison, agentic manual testing

### 9.3 Guided Feature

Id: `guided-feature`

But: explorer un brownfield, clarifier le produit, faire approuver l'architecture, puis implémenter.

Cycle:

```text
discovery -> codebase exploration -> clarification -> architecture approval -> implementation -> review
```

Templates actuels:

- `discovery`
- `architecture-proposal`
- `implementation-slice`
- `feature-review`

Inspirations citées:

- Anthropic, building effective agents
- HumanLayer, advanced context engineering

### 9.4 Spec Driven

Id: `spec-driven`

But: transformer principes et requirements en specification, plan, graphe de tâches et implémentation traçable.

Cycle:

```text
principles -> specification -> plan -> dependency tasks -> implementation -> acceptance traceability
```

Templates actuels:

- `specification`
- `technical-plan`
- `dependency-task`

Inspirations citées:

- GitHub Spec Kit README
- official spec template
- official plan template
- official tasks template

### 9.5 Long Run

Id: `long-run`

But: rendre un développement multi-session résumable et vérifiable.

Cycle:

```text
living plan -> milestone -> evidence -> decision/discovery log -> handoff -> independent verification
```

Templates actuels:

- `living-plan`
- `milestone`
- `independent-verification`

Inspirations citées:

- OpenAI Codex best practices et ExecPlan style
- Anthropic long-running agent harness
- HumanLayer context boundaries

### 9.6 Diagnose & Fix

Id: `diagnose-and-fix`

But: diagnostiquer avec preuve avant de changer le code.

Cycle:

```text
reproduce -> minimise -> hypothesise -> instrument -> red test -> minimal fix -> regression proof -> manual proof
```

Template actuel:

- `diagnosis-and-fix`

Inspirations citées:

- Simon Willison, agentic manual testing
- Simon Willison, test-first coding agent
- Kiro bugfix specs

### 9.7 Artefacts built-in présents

Il existe actuellement 40 fichiers sous `templates/workflows/`:

- 6 manifests;
- 6 protocols;
- 6 guides;
- 6 board presets;
- 16 task templates.

Les JSON ont été parsés individuellement et les fichiers ont été scannés contre U+2013 et U+2014. Le mismatch de forme du board preset décrit plus haut reste à corriger.

## 10. Recherche déjà produite

Fichier:

```text
docs/research/agent-workflow-patterns.md
```

Contenu:

- dix familles de workflow comparées;
- 37 citations de sources primaires ou first-party;
- étapes, artefacts, rôles du board, gates et coûts de contexte;
- conventions communes;
- politiques de transition, evidence et cadence;
- proposition de six archétypes.

Familles étudiées:

- GitHub Spec Kit
- BMAD Method
- HumanLayer et 12-factor agents
- Anthropic long-running harness
- OpenAI Codex practices et planning durable
- Matt Pocock / AI Hero
- Simon Willison agentic engineering
- Kiro specs
- snarktank ai-dev-tasks
- patterns complémentaires cités dans le document

Attention: les noms recommandés dans la recherche sont Quick Fix, Test-First Bugfix, Feature Slice, Brownfield Deep Dive, Product Initiative et Autonomous Cascade. Les noms produit autoritatifs choisis avec vava sont les six noms de la section précédente. Utiliser la recherche comme matière, pas comme autorité de naming.

## 11. Migration des anciens fichiers agent

### 11.1 Fichiers à supprimer du produit final

Generated sources et copies historiques:

```text
templates/AGENT_KANDOWN.md
templates/AGENT.md
AGENT_KANDOWN.md
.kandown/AGENT_KANDOWN.md
.kandown/AGENT.md
scripts/sync-agent-kandown.js
```

Le pipeline de build et les docs qui référencent `sync:agent` doivent être mis à jour.

Ne jamais éditer un generated file pour simuler la migration.

### 11.2 Politique de suppression sûre

Les copies connues comme générées peuvent être supprimées si leur SHA-256 correspond à une version connue.

Hashes actuellement codés:

```text
AGENT.md
fc1380adf958f6e46ba8c5462fe56a9b34840bb85cc8648bd7021c0ba45fb7a5

AGENT_KANDOWN.md
889ff6069c3a7e7881fb59b1dc10a469805f3e866eccf5f29c906c268f02b2f6
```

Si un fichier est édité ou ambigu:

- ne pas le supprimer;
- le déplacer dans `.kandown/legacy-agent-docs/`;
- utiliser un nom collision-safe;
- afficher un warning avec le chemin de backup.

### 11.3 Migration des instructions

Si seulement l'ancien fichier existe:

```text
instructions.md -> kandown_work.md
```

Si les deux existent:

- garder les deux;
- ne pas merger automatiquement;
- afficher un warning clair.

La migration doit être idempotente.

### 11.4 Bootstrap dans AGENTS.md

Une ligne gérée doit être créée ou réparée dans le `AGENTS.md` racine du projet:

```text
This project uses Kandown. Before task work, run `kandown work` and follow its output. <!-- kandown:agent-ref -->
```

Règles:

- préserver tout le texte utilisateur non marqué;
- créer `AGENTS.md` s'il n'existe pas;
- remplacer uniquement la ligne portant le marker;
- supprimer les doublons portant le marker;
- préserver les line endings autant que possible;
- rester byte-idempotent une fois à jour.

### 11.5 Fondation présente mais non branchée

Fichiers présents:

```text
src/cli/lib/agent-migration.ts
src/cli/lib/__tests__/agent-migration.spec.ts
```

APIs:

```ts
migrateAgentInstructions(kandownDir, options?)
ensureAgentBootstrap(projectRoot)
```

Les 11 tests de migration passent actuellement.

Ce module n'est pas encore appelé par init, doctor, work, daemon ou upgrade. Aucun fichier legacy réel n'a encore été migré par ce code.

## 12. Config partagée déjà implémentée

### 12.1 Fichiers

```text
src/lib/config.ts
src/lib/__tests__/config.spec.ts
src/lib/types.ts
src/lib/filesystem.ts
src/cli/lib/config.ts
templates/kandown.json
```

### 12.2 Résultat

- un seul `KandownConfig` partagé par web, CLI et TUI;
- suppression de la définition CLI dupliquée;
- normalisation pure et sûre;
- migration déterministe des anciens modes de densité;
- config workflow;
- config cadence;
- rôles de colonnes et instructions;
- helpers de résolution de rôle;
- préservation de `agents.preferred` et `agents.extraArgs`;
- gestion de config malformée;
- defaults communs aux adapters navigateur et Node.

Types ajoutés:

```ts
type WorkOutputDetailMode = 'caveman' | 'standard' | 'complete';
type TaskTrackingCadence = 'live' | 'balanced' | 'economy';
type ColumnRole = 'backlog' | 'ready' | 'active' | 'review' | 'terminal' | 'custom';
```

Config ajoutée:

```ts
workflow: {
  active: 'kandown-standard',
  skills: [],
  trackingCadence: 'balanced'
}
```

### 12.3 Migration des anciens modes

Mapping actuel:

```text
caveman -> caveman
concise -> standard
optimized -> standard
full -> complete
verbose -> complete
```

### 12.4 Tests

`src/lib/__tests__/config.spec.ts` contient 12 tests.

Ils couvrent:

- defaults complets;
- migration legacy;
- mode explicite prioritaire;
- sections malformées;
- agents optionnels;
- résolution des colonnes par rôle;
- colonnes renommées;
- rôles répétés;
- fallback `custom`.

### 12.5 Dette connue

Certains commentaires historiques dans `src/lib/types.ts` parlent encore de `.kandown/instructions.md`, du raw template et de sections reorderables. Mettre ces commentaires à jour après le branchement du nouveau compiler.

## 13. Format workflow déjà présent

### 13.1 Fichiers

```text
src/lib/workflows/types.ts
src/lib/workflows/validation.ts
src/lib/workflows/capsule.ts
src/lib/workflows/index.ts
src/lib/__tests__/workflows.spec.ts
```

### 13.2 APIs

```ts
validateWorkflowManifest(raw)
loadWorkflowPackage(files)
validateWorkflowPackage(rawPackage)
isSafeWorkflowPath(path)
exportWorkflowCapsule(rawPackage)
importWorkflowCapsule(source)
```

### 13.3 Tests

`src/lib/__tests__/workflows.spec.ts` contient 17 tests.

Ils couvrent:

- package complet;
- manifest malformé;
- path traversal;
- chemins Windows, URL et absolus;
- ids, fichiers et defaults dupliqués;
- fichiers non déclarés;
- payloads exécutables;
- drift entre manifest et package;
- round trip capsule;
- sections dupliquées ou inconnues;
- tags malformés;
- id drift;
- limite de taille.

## 14. Ce qui n'est pas encore fait

La migration n'est pas utilisable de bout en bout.

### Compiler et runtime

- [ ] Créer le compiler pur des neuf couches.
- [ ] Définir les structures d'entrée et de sortie du compiler.
- [ ] Implémenter les trois densités sans retirer les invariants.
- [ ] Implémenter les trois cadences.
- [ ] Résoudre les placeholders de colonnes.
- [ ] Produire des diagnostics structurés pour rôles manquants.
- [ ] Charger les workflows built-in.
- [ ] Charger les workflows locaux installés.
- [ ] Charger les skills actives.
- [ ] Charger les instructions globales et projet.
- [ ] Charger les résumés extension.
- [ ] Compiler le contexte tâche ou digest.

### CLI

- [ ] Remplacer le `readAgentDoc()` historique de `src/cli/lib/board-reader.ts`.
- [ ] Brancher `src/cli/commands/project.ts` sur le compiler.
- [ ] Brancher `src/cli/lib/launcher.ts` sur le même compiler.
- [ ] Ajouter un ciblage explicite de tâche à `kandown work` si la syntaxe finale le permet.
- [ ] Ajouter `kandown extension guide <id>`.
- [ ] Ajouter `kandown workflow list`.
- [ ] Ajouter `kandown workflow show <id>`.
- [ ] Ajouter `kandown workflow use <id>`.
- [ ] Ajouter `kandown workflow validate <path>`.
- [ ] Ajouter `kandown workflow pack <path>`.
- [ ] Ajouter `kandown workflow import <capsule>`.
- [ ] Ajouter les messages de preview et confirmation du board preset.
- [ ] Ne pas ajouter de commande fictive au texte compilé.

### Migration

- [ ] Appeler `migrateAgentInstructions()` au bon moment.
- [ ] Appeler `ensureAgentBootstrap()` pendant init et réparation.
- [ ] Reporter tous les events à stderr ou dans le diagnostic UI.
- [ ] Migrer les chemins globaux et projet.
- [ ] Supprimer la génération des copies agent.
- [ ] Retirer les anciens templates du package.
- [ ] Retirer `scripts/sync-agent-kandown.js`.
- [ ] Retirer `sync:agent` des scripts et hooks qui l'appellent.
- [ ] Mettre à jour les docs de generated files.
- [ ] Tester une upgrade depuis plusieurs versions historiques.

### Settings et UI

- [ ] Remplacer ou refondre `WorkOutputConfigurator.tsx`.
- [ ] Ajouter tab Workflow.
- [ ] Ajouter tab Skills.
- [ ] Ajouter tab Kandown Work.
- [ ] Lister les workflows officiels et locaux.
- [ ] Afficher résumé, guide, attribution et version.
- [ ] Activer un workflow.
- [ ] Forker un workflow store en local avant édition.
- [ ] Éditer protocol, guide et templates locaux.
- [ ] Configurer détail et cadence indépendamment.
- [ ] Configurer le rôle et l'instruction de chaque colonne.
- [ ] Afficher le preview exact du compiler.
- [ ] Gérer les rôles manquants.
- [ ] Preview du board preset et confirmation.
- [ ] Éditer `.kandown/kandown_work.md`.
- [ ] Gérer les skills additives.

### Store

- [ ] Définir le schéma d'index workflow.
- [ ] Définir provenance, repo, release et checksum.
- [ ] Installer une release épinglée.
- [ ] Valider avant persistance.
- [ ] Présenter un diff d'update.
- [ ] Appliquer seulement après confirmation.
- [ ] Préserver les forks locaux.
- [ ] Ajouter tests CI d'installation dans un projet temporaire.
- [ ] Ajouter soumission communautaire et modération.

### Board et dépendances

- [ ] Remplacer les hypothèses `Backlog`, `In Progress`, `Done` dans le runtime par les rôles.
- [ ] Vérifier `src/lib/dependencies.ts` pour le statut terminal.
- [ ] Vérifier création de tâche et statut initial dans CLI et UI.
- [ ] Vérifier launcher et transitions.
- [ ] Définir comportement s'il existe plusieurs colonnes terminales.
- [ ] Définir validation minimale: au moins un backlog, active et terminal.
- [ ] Conserver les labels réels dans les task files.

### Documentation et release

- [ ] Mettre à jour `docs/ARCHITECTURE.md`.
- [ ] Mettre à jour `CODEMAP` via les JSDoc headers.
- [ ] Mettre à jour `README.md`.
- [ ] Mettre à jour docs extension.
- [ ] Documenter workflow authoring.
- [ ] Documenter capsule import/export.
- [ ] Documenter migration et backups.
- [ ] Créer le changelog de release, pas éditer `CHANGELOG.md` directement.

## 15. Ordre de reprise recommandé

### Phase 0, sécuriser le worktree

- [ ] Lire `AGENTS.md`, `CODEMAP.md`, `docs/ARCHITECTURE.md` et ce fichier.
- [ ] Exécuter `git status --short`.
- [ ] Ne pas restaurer ni écraser les changements hors migration.
- [ ] Corriger le mismatch `board.json` array contre object.
- [ ] Ajouter un test qui charge réellement les six built-ins avec `loadWorkflowPackage()`.
- [ ] Relancer tests et typecheck.

### Phase 1, compiler pur

- [ ] Créer un module partagé, par exemple `src/lib/workflows/compiler.ts`.
- [ ] Définir `KandownWorkCompilerInput` avec toutes les couches déjà chargées.
- [ ] Définir `CompiledKandownWork` avec `text`, sections et diagnostics.
- [ ] Écrire d'abord les tests d'ordre exact.
- [ ] Tester les trois densités.
- [ ] Tester les trois cadences.
- [ ] Tester colonnes renommées et rôle manquant.
- [ ] Tester absence de workflow ou skill invalide.
- [ ] Tester que le coeur reste présent malgré l'ancienne config raw.

### Phase 2, loaders Node

- [ ] Ajouter loader filesystem pour built-ins et workflows locaux.
- [ ] Ajouter loader d'instructions globales et projet.
- [ ] Ajouter loader skill.
- [ ] Ajouter loader extension summary.
- [ ] Garder la validation pure dans `src/lib/workflows/`.
- [ ] Garder Node I/O dans `src/cli/lib/`.

### Phase 3, CLI et launcher

- [ ] Faire de `kandown work` l'adapter de référence.
- [ ] Ajouter tests snapshot ou exact-string de stdout.
- [ ] Brancher launcher sur le même résultat.
- [ ] Vérifier qu'aucune ancienne source agent n'est lue.

### Phase 4, migration

- [ ] Brancher les helpers déjà présents.
- [ ] Ajouter reporting utilisateur.
- [ ] Supprimer les sources générées seulement après tests de migration.
- [ ] Tester init frais et upgrade.

### Phase 5, Settings

- [ ] Exposer le compiler au backend local si nécessaire.
- [ ] Utiliser le même résultat dans preview.
- [ ] Construire Workflow, Skills et Kandown Work.
- [ ] Ajouter édition des colonnes et templates.

### Phase 6, commandes workflow et store

- [ ] Implémenter list, show, use, validate, pack, import.
- [ ] Ajouter preset preview.
- [ ] Ajouter provenance et update diff.

### Phase 7, quality gate

- [ ] Tests ciblés.
- [ ] Suite complète.
- [ ] Typecheck.
- [ ] Build.
- [ ] Codemap check.
- [ ] Changelog check.
- [ ] Tests exacts CLI.
- [ ] Tests migration.
- [ ] Test manuel Settings et URL locale.

## 16. Surfaces de code propriétaires

### Pipeline actuel à remplacer

```text
src/cli/commands/project.ts
src/cli/lib/board-reader.ts
src/cli/lib/launcher.ts
src/components/settings/WorkOutputConfigurator.tsx
```

### Config partagée

```text
src/lib/types.ts
src/lib/config.ts
src/lib/filesystem.ts
src/cli/lib/config.ts
templates/kandown.json
```

### Workflow format

```text
src/lib/workflows/types.ts
src/lib/workflows/validation.ts
src/lib/workflows/capsule.ts
src/lib/workflows/index.ts
```

### Migration

```text
src/cli/lib/agent-migration.ts
```

### Extensions

```text
src/lib/extensions/types.ts
src/lib/extensions/manifest.ts
src/cli/lib/extensions-cli.ts
src/cli/lib/server.ts
```

### Init et génération historique

```text
src/cli/lib/init.ts
scripts/sync-agent-kandown.js
templates/AGENT.md
templates/AGENT_KANDOWN.md
package.json
```

### UI Settings

```text
src/components/settings/WorkOutputConfigurator.tsx
src/components/settings/
src/lib/filesystem.ts
src/cli/lib/server.ts
vite.config.ts
src/lib/demoBackend.ts
```

Respecter le fan-out architecture entre backend local, Vite demo et browser filesystem.

## 17. État exact des tests au handoff

Commandes exécutées le 2026-08-01:

```text
pnpm test -- src/lib/__tests__/config.spec.ts src/lib/__tests__/workflows.spec.ts src/cli/lib/__tests__/agent-migration.spec.ts
pnpm typecheck
```

Résultat réel:

```text
17 test files passed
193 tests passed
pnpm typecheck passed
```

Note: dans ce projet, cette invocation Vitest a exécuté toute la suite, pas seulement les trois fichiers listés.

Le build complet n'a pas encore été exécuté après toutes les additions présentes dans le worktree.

Avant conclusion, lancer obligatoirement:

```text
pnpm build
pnpm codemap:check
pnpm changelog:check
```

Le build peut régénérer des fichiers committés. Suivre les règles du repository au lieu d'éditer les generated files.

## 18. État Git et changements à préserver

Au moment du handoff, le worktree contient les changements de cette migration et des changements antérieurs sans rapport.

### Changements liés à cette migration

```text
M src/cli/lib/config.ts
M src/lib/filesystem.ts
M src/lib/types.ts
M tasks/t258.md
M tasks/t259.md
M tasks/t260.md
M templates/kandown.json
?? docs/research/
?? src/cli/lib/__tests__/agent-migration.spec.ts
?? src/cli/lib/agent-migration.ts
?? src/lib/__tests__/config.spec.ts
?? src/lib/__tests__/workflows.spec.ts
?? src/lib/config.ts
?? src/lib/workflows/
?? templates/workflows/
?? MIGRATION_KANDOWN_WORK_.md
```

### Changements sans rapport connus, ne pas écraser

```text
M .kandown/kandown.html
M .kandown/kandown.json
M website/src/components/SiteFooter.tsx
M website/src/components/ui/GradualBlur.tsx
?? website/public/themes/
```

La liste peut évoluer. Toujours relire `git status`.

Ne pas utiliser `git restore`, `git checkout --`, reset ou stash global sans vérifier l'origine de chaque fichier.

## 19. Règles repository importantes pour Codex

- Lire `AGENTS.md` avant toute modification.
- Lire `CODEMAP.md` pour localiser les propriétaires.
- Lire `docs/ARCHITECTURE.md` avant un changement non trivial.
- Lire `docs/EXTENSIONS.md` et l'ADR avant de toucher aux extensions.
- Ne jamais éditer directement un generated file.
- Chaque source TypeScript doit conserver un JSDoc header avec `@description`.
- Ne pas utiliser U+2013 ou U+2014 dans le contenu écrit.
- UI source text en anglais.
- TypeScript strict, pas de `any`.
- Ne pas introduire une seconde source de vérité.
- Après toute modification code, exécuter `pnpm build` avant de conclure.
- `CHANGELOG.md` est généré. Écrire dans `changelogs/v<version>.md` selon le runbook.
- `CODEMAP.md` et `CODEMAP.json` sont générés depuis les JSDoc headers.
- Préserver les changements utilisateur non liés.

## 20. Critères d'acceptation finaux

La migration est terminée seulement si tous les points suivants sont vrais.

### Source unique

- [ ] `kandown work` est la seule source officielle d'instructions Kandown.
- [ ] Le launcher utilise exactement le même compiler.
- [ ] Settings preview montre exactement le même texte.
- [ ] Aucun agent doc généré local n'est requis.

### Sécurité de migration

- [ ] Les instructions historiques sont migrées sans perte.
- [ ] Les fichiers édités sont sauvegardés et signalés.
- [ ] Les copies générées connues sont supprimées.
- [ ] La migration est idempotente.
- [ ] La ligne bootstrap est unique et gérée.

### Workflows

- [ ] Un workflow exclusif est actif.
- [ ] Les skills sont additives.
- [ ] Les six built-ins se chargent via le validator réel.
- [ ] Les placeholders sont résolus.
- [ ] Les rôles manquants produisent un diagnostic utile.
- [ ] Les task templates sont utilisables.
- [ ] Le board preset est previewed avant application.
- [ ] Les forks locaux ne sont pas écrasés.

### Compiler

- [ ] Les neuf couches sont dans l'ordre fixé.
- [ ] Le coeur ne peut pas être supprimé.
- [ ] Détail et cadence sont indépendants.
- [ ] Les commandes affichées existent vraiment.
- [ ] Les extensions cassées ne cassent pas le coeur.
- [ ] Une tâche ciblée remplace le board digest général.

### UI

- [ ] Tabs Workflow, Skills et Kandown Work disponibles.
- [ ] Rôles et instructions de colonnes éditables.
- [ ] Workflow local éditable via fork.
- [ ] Preview exact fonctionnel.
- [ ] Guides et attributions visibles.

### Qualité

- [ ] Tests unitaires et intégration passent.
- [ ] Typecheck passe.
- [ ] Build passe.
- [ ] Codemap check passe.
- [ ] Changelog check passe.
- [ ] Init frais testé.
- [ ] Upgrade historique testé.
- [ ] CLI stdout exact testé.
- [ ] Settings testé manuellement.

## 21. Pièges connus

1. Le format du board preset est incohérent entre built-ins et validator. Corriger en premier.
2. `WorkOutputConfig` contient encore des options historiques qui pourraient laisser croire que le coeur est supprimable.
3. `readAgentDoc()` lit encore l'ancien template package. Ne pas dupliquer le nouveau compiler autour de cette fonction.
4. Le launcher ne doit pas construire sa propre variante des instructions.
5. Le preview Settings ne doit pas être une approximation client.
6. Les rôles sémantiques ne doivent jamais remplacer le nom réel du statut dans les task files.
7. Ne pas annoncer des commandes non implémentées.
8. Ne pas appliquer un board preset sans preview.
9. Ne pas supprimer un agent doc édité sur simple nom de fichier.
10. Ne pas traiter un workflow communautaire comme du code exécutable.
11. Ne pas introduire un cache ou index local comme seconde source de vérité des tâches.
12. Ne pas éditer `.kandown/kandown.html`, `CODEMAP.*`, `CHANGELOG.md`, `bin/*` ou `src/lib/version.ts` directement.
13. Les changements website et thèmes déjà présents ne font pas partie de cette migration.

## 22. Première action conseillée dans Codex Desktop

Exécuter dans cet ordre:

```text
1. Lire AGENTS.md, CODEMAP.md, docs/ARCHITECTURE.md et MIGRATION_KANDOWN_WORK_.md.
2. Vérifier git status et préserver les fichiers sans rapport.
3. Transformer les six board.json en objets { columns: [...] }.
4. Ajouter un test qui charge les six dossiers templates/workflows avec loadWorkflowPackage().
5. Lancer pnpm test et pnpm typecheck.
6. Implémenter le compiler pur et ses tests d'ordre exact.
7. Brancher kandown work avant de toucher à Settings.
```

Le chemin critique est:

```text
board format agreement
-> pure compiler
-> Node loaders
-> kandown work CLI
-> launcher
-> safe migration
-> Settings exact preview
-> workflow commands
-> store distribution
```

## 23. Définition du succès produit

Une fois terminé, un projet doit pouvoir faire ceci:

```text
1. Installer Kandown.
2. Lancer Kandown.
3. Choisir Kandown Standard ou un autre workflow.
4. Activer quelques skills.
5. Configurer détail et cadence.
6. Donner à l'agent la seule consigne stable: run kandown work.
7. Obtenir des instructions actuelles, adaptées au board réel et au contexte courant.
8. Mettre à jour un workflow seulement après validation et diff explicite.
```

L'agent ne dépend plus d'une copie générée qui vieillit dans le repository. Kandown reste la source de vérité dynamique, les workflows deviennent des données portables, et chaque projet garde sa liberté de colonnes, de niveau de détail et de cadence.
