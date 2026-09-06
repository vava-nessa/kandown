---
id: t263
title: LLM Task Sharpening ("Grill-Me" & Auto-Refine)
status: Done
depends_on: [t310]
assignee: vava
priority: P1
tags: [agentic, llm, refine, grill-me, ai]
ownerType: human
created: 2026-07-26
order: 2
updated: 2026-09-06T22:29:05Z
category: AGENTIC
---

# LLM Task Sharpening ("Grill-Me" & Auto-Refine)

> 2026-09-05 : absorbée par la série kandown agent : [[t307]] (socle harness :
> détection et adapters), [[t308]] (chat), [[t309]] (édition live et modes),
> [[t310]] (skills boutons, refine et grill-me). Les workflows Refine et
> Grill-Me y vivent ; le BYOK direct (clé API, pi-ai) est volontairement
> re-carté : kandown se branche sur les harnesses déjà installés.

## Context

Ajouter un bouton magique "⚡ Sharpen Task" dans l'éditeur de tâche pour affiner le scope, détecter les angles morts et découper les sous-tâches grâce à un LLM. Cela évite d'envoyer des instructions floues aux agents de dev et garantit un taux de réussite maximal.

## Technical Specifications

1. **Gestion des Clés API & Local Config (BYOK)** :
   - Ajouter une section Paramètres / Config pour saisir une clé API (`OpenAI`, `Anthropic`, `OpenRouter`) ou l'URL d'un serveur local (`Ollama`).
   - Stocker la clé dans le fichier de config local non versionné (`.kandown/config.local.json` ou `.env.local`).
   - Fallback : Si aucune clé n'est renseignée, exécuter le prompt via l'un des agents CLI détectés sur la machine.

2. **Workflow "Grill-Me / Refine"** :
   - **Action 1 : Refine instantané** : Réécriture propre du titre, de la description et génération automatique d'une checklist de sous-tâches (`- [ ]`).
   - **Action 2 : Mode "Grill-Me" (Interview)** :
     1. L'IA lit la tâche et génère 3 à 5 questions concises sur les cas limites/implicites.
     2. L'interface affiche un mini-formulaire interactif pour saisir les réponses.
     3. À la validation, l'IA fusionne le contexte initial + les réponses pour produire une spec Markdown parfaite.

3. **Mise à jour du Fichier Markdown** :
   - Remplacer le contenu du fichier de tâche par la version enrichie tout en préservant le frontmatter YAML (status, priority, assignee, etc.).

## Subtasks

- [ ] 1. Gestion Clés API & Config Local BYOK (`.kandown/config.local.json` / fallback CLI agents)
  report: DESCARTE (decision du 2026-09-05, en tete de fiche). Pas de BYOK direct : kandown se branche sur les harnesses deja installes sur la machine ([[t307]] : detection + adapters). Aucune cle API n'est demandee, stockee ni transmise par kandown. Rien a livrer ici.
- [x] 2. Workflow Refine instantané (réécriture titre, context, subtasks)
  report: livre par [[t310]] sous forme de skill builtin `templates/skills/refine` (manifest + instructions.md) : reecrit titre et description, produit une checklist `- [ ]`, sans toucher au code. Expose en bouton de chat via `chat.button` et `SkillButtons.tsx`.
- [x] 3. Workflow Grill-Me / Interview (génération 3-5 questions, mini-formulaire interactif, fusion Markdown)
  report: livre par [[t310]] sous forme de skill builtin interactif `templates/skills/grill-me` (`chat.interactive: true`) : 3 a 5 questions numerotees avec reponses candidates cliquables, parsees par `parseNumberedQuestions`, mini-formulaire affiche dans le panneau de chat, puis renvoi des reponses en message de suivi pour le tour de fusion.
- [x] 4. Intégration Éditeur & Remplacement Markdown (sauvegarde sécurisée avec préservation du frontmatter YAML)
  report: livre autrement que prevu, et mieux : l'ecriture passe par le harness lui-meme (edition de fichier reelle, diff affiche dans une Approval Card de [[t309]]) au lieu d'un remplacement de contenu cote kandown. Le frontmatter est preserve parce qu'aucun code kandown ne reecrit le corps de la tache ; `chat.autoApply` permet d'enchainer sans approbation pour les skills d'edition, les operations structurees create/move restant toujours approuvees.

Note 2026-09-05 : grill-me et refine sont livres par [[t310]] (skills builtin + choix cliquables dans le chat). Le reste (auto-refine au create) reste a cadrer.

## Completion report

**t263 est absorbee, pas abandonnee.** Le contenu utile a ete livre par la serie
kandown agent, verifie sur disque le 2026-09-06 :

| Ce que t263 demandait | Ou c'est livre | Preuve |
|---|---|---|
| Refine instantane | skill builtin `refine` | `templates/skills/refine/{manifest.json,instructions.md}` |
| Grill-Me interactif | skill builtin `grill-me` | `templates/skills/grill-me/`, `chat.interactive` |
| Bouton magique dans l'editeur | pills de skills du chat | `src/components/agent/SkillButtons.tsx` |
| Champs manifest du bouton | `chat.*` valides | `src/lib/workflows/types.ts:95-116` |
| Ecriture Markdown sans casser le YAML | edition par le harness + Approval Card | [[t309]] |
| BYOK (cle API, Ollama) | volontairement descarte | decision du 2026-09-05 |

Le socle vient de [[t307]] (detection des harnesses et adapters), [[t308]]
(chat contextualise) et [[t309]] (edition live, modes d'approbation). Aucun code
n'a ete ecrit pour cette fiche : le travail etait deja fait, la fiche restait
ouverte par inertie.

**Reste ouvert, hors perimetre de cette fiche :** l'auto-refine au moment du
`create` (declencher `refine` automatiquement a la creation d'une tache) n'a
jamais ete specifie ici et n'a pas de criteres d'acceptation. A ouvrir en fiche
propre si vava le veut, plutot qu'a garder t263 ouverte pour ca.

**Proposition : passer t263 en Done** (absorbee par [[t310]]). Confirmation
humaine requise pour le move terminal.
