# Audit Technique Kandown

## Table des Matières
1. [Introduction](#introduction)
2. [Audit de l'Optimisation du Code](#audit-de-loptimisation-du-code)
   - [Dette Technique et Maintenabilité](#dette-technique-et-maintenabilite)
   - [Performance et Architecture](#performance-et-architecture)
3. [Audit de Sécurité](#audit-de-securite)
   - [Vulnérabilités Connues (NPM Audit)](#vulnerabilites-connues-npm-audit)
   - [Vulnérabilités Applicatives (Injection & Path Traversal)](#vulnerabilites-applicatives-injection--path-traversal)
4. [Recommandations Priorisées](#recommandations-priorisees)

---

## 1. Introduction
Ce document présente un audit complet de la base de code du projet Kandown (version 0.4.0). Il couvre à la fois l'optimisation (performances, dette technique, design patterns) et la sécurité (dépendances, durcissement du code applicatif).

---

## 2. Audit de l'Optimisation du Code

### Dette Technique et Maintenabilité
- **Store monolithique (Zustand) :** Le fichier `src/lib/store.ts` contient plus de 1 000 lignes de code et gère de très nombreuses responsabilités : lecture/écriture de fichiers, notifications, hydratation des vues, recherche en mémoire, résolution de conflits, etc. Ce couplage fort rend la maintenabilité complexe.
- **Absence de framework de test :** Le projet semble ne pas avoir de tests automatisés configurés (l'exécution de Playwright ou Vitest retourne des erreurs / aucune trace de test). Une application "local-first" ayant pour vocation d'interagir directement avec le système de fichiers devrait avoir une couverture exhaustive de tests d'intégration.
- **Absence de configuration de linter standard :** Un lancement de `eslint` échoue par manque d'un fichier de configuration standardisé (`eslint.config.js` ou `.eslintrc`).

### Performance et Architecture
- **Single File Output (Vite) :** L'approche consistant à tout empaqueter dans un seul fichier (`vite-plugin-singlefile`) avec inlining total (les CSS et JS atteignent environ 6.7 Mo non-gzippé) correspond bien à la promesse du produit ("single-file deployment"). Néanmoins, l'impact sur le temps d'analyse (parsing time) du navigateur au démarrage pourrait être significatif pour les gros projets.
- **Gestion de l'état (Lazy loading) :** La recherche est gérée en mémoire par l'application (voir `computeSearchMatches` dans `store.ts`). Le store charge le contenu de tous les fichiers de tâches si nécessaire (`loadTaskContents`). Pour un Kanban de taille très importante (milliers de tâches), cela pourrait poser des problèmes de consommation de mémoire et de performance.

---

## 3. Audit de Sécurité

### Vulnérabilités Connues (NPM Audit)
L'exécution de `npm audit` remonte 3 vulnérabilités de sévérité haute (High) :
- Celles-ci proviennent majoritairement du package `axios` (vulnerabilités SSRF, Cross-Site Request Forgery, et fuite potentielle de credentials).
- `axios` est introduit indirectement via `@portive/client` qui est lui-même requis par `@wysimark/react`. Il y a ici une opportunité d'isoler ou de remplacer cet éditeur par une dépendance plus sûre (ou de forcer la mise à jour).

### Vulnérabilités Applicatives (Injection & Path Traversal)
- **Directory Traversal (CLI & API Serveur) :** 
  - Dans l'API locale fournie pour le développement (`vite.config.ts`), ainsi que dans `src/cli/lib/board-reader.ts` (ex: `readTask`, `moveTaskToColumn`), l'identifiant de la tâche (`id` / `taskId`) est utilisé pour construire des chemins de fichiers de cette manière : `join(kandownDir, 'tasks', \`${taskId}.md\`)`.
  - Si un ID de tâche non assaini (`../../../etc/passwd`) est transmis au backend Node (par un appel API ou l'interface CLI), cela pourrait conduire à une lecture ou écriture arbitraire de fichiers (Path Traversal).
- **Cross-Site Scripting (XSS) via `dangerouslySetInnerHTML` :** 
  - Des propriétés `dangerouslySetInnerHTML` sont utilisées dans `src/components/ui/MarkdownEditor.tsx` pour afficher le HTML compilé à partir du Markdown : `<div dangerouslySetInnerHTML={{ __html: renderedHtml }} />`.
  - De même, des traductions non assainies peuvent être injectées (ex: `src/components/EmptyState.tsx`, `src/components/ConflictModal.tsx`).
  - Le contenu de chaque tâche est contrôlé par l'utilisateur (ou par un agent IA). S'il n'y a pas de mécanisme robuste de sanitisation (par exemple `DOMPurify`), un code JS malveillant inséré dans un fichier `.md` s'exécutera automatiquement lors de l'ouverture du tiroir de la tâche.

---

## 4. Recommandations Priorisées

### Priorité 1 : Critique (Sécurité)
1. **Corriger la faille de Path Traversal :** Assainir rigoureusement tous les identifiants de fichiers entrant dans les méthodes du système de fichiers (par ex. en vérifiant que le chemin résolu par `path.resolve` commence bien par le dossier `tasks` et n'inclut pas de caractères interdits tels que `/` ou `\`).
2. **Implémenter la sanitisation HTML (XSS) :** Ajouter la librairie `dompurify` ou équivalent et englober tout contenu Markdown compilé avant de le passer à `dangerouslySetInnerHTML`.
3. **Mettre à jour les dépendances vulnérables :** Exécuter `npm audit fix` ou configurer `npm overrides` (dans `package.json`) pour forcer une version patchée de `axios`.

### Priorité 2 : Haute (Architecture et Maintenabilité)
4. **Mettre en place un Framework de Tests :** Introduire Vitest ou Jest pour tester la logique de parsing (`src/lib/parser.ts`), et Playwright pour les tests d'intégration End-to-End du mode fichier local.
5. **Découper le Store Zustand (`store.ts`) :** Séparer le store en plusieurs slices modulaires (par ex: `createTaskSlice`, `createSearchSlice`, `createFileWatcherSlice`) pour rendre le code maintenable et testable.

### Priorité 3 : Moyenne (Bonnes Pratiques)
6. **Configurer ESLint et Prettier :** Mettre en place un linter strict adapté aux projets React 19 / TypeScript avec un fichier de configuration valide pour assurer une homogénéité du code.
7. **Optimiser le chargement (Lazy Load) :** Envisager de paginer ou différer la récupération intégrale du contenu Markdown en mémoire si le nombre de fichiers de tâches est très important afin de ne pas bloquer le thread UI principal.
