---
id: t310
title: Kandown Agent : skills en boutons de chat + grill-me interactif
status: Done
assignee: vava
priority: P2
tags: [agentic, llm, skills, grill-me, workflows]
ownerType: human
depends_on: [t309]
created: 2026-09-05
order: 6
updated: 2026-09-05T02:06:44Z
category: AGENTIC
---

# Kandown Agent : skills en boutons + grill-me

## Context

Les boutons du chat ("Grill me", "Refine", "Traduire"...) ne sont pas un
système de plus : ce sont les **skill packages existants**
(`.kandown/skills/<id>/`, manifest + instructions.md, cf. docs/WORKFLOWS.md)
étendus avec des champs UI optionnels. Une seule source de vérité : le même
dossier alimente le compilateur `kandown work` pour les agents externes ET les
boutons du chat (règle 6). Absorbe les workflows "Refine instantané" et
"Grill-Me" de [[t263]].

Deux skills builtin livrés avec kandown pour que la fonctionnalité existe dès
l'installation : `refine` (réécriture propre du titre, de la description et
génération d'une checklist de sous-tâches) et `grill-me` (interview : l'agent
lit la tâche, pose 3 à 5 questions sur les angles morts et les implicites,
l'UI affiche un mini-formulaire pour y répondre, puis fusionne contexte initial
et réponses en une spec propre).

## Technical Specifications

1. **Extension du manifest skill** (champs optionnels, rétrocompatibles avec
   les packages existants) : `chat.button` (label, icône), `chat.scope`
   ("task" ou "board"), `chat.interactive` (workflow multi-tours avec
   formulaire), `chat.autoApply` (en mode acceptation uniquement :
   court-circuite l'approbation pour les éditions de ce skill ; les opérations
   structurées create/move restent toujours approuvées).
2. **Validation** : les champs `chat.*` suivent le pipeline de validation
   existant des packages (rejet structuré, mêmes erreurs que manifest.md).
3. **Exécution** : un skill = instructions.md injectées dans le prompt initial
   de la session (quel que soit le harness de [[t307]]) + un tour de parole
   structuré ; un skill interactif (grill-me) séquence deux tours : questions,
   puis fusion après réponses du formulaire envoyées en message de suivi
   (steer). Le contexte (tâche ou board) vient de [[t308]].
4. **UI** : les boutons se branchent dans la PromptBar de la sidebar ; un skill
   de scope task lancé depuis une carte ouvre le chat pré-contextualisé ;
   le formulaire de réponses est un panneau du chat, pas une modal séparée.
5. **Docs** : docs/WORKFLOWS.md (section Skill packages), et le brief généré
   (`pnpm extension-brief`) si le champ manifest est partagé avec le système
   d'extensions.

## Subtasks

- [x] 1. Champs manifest chat.* + validation rétrocompatible
  report: `chat` optionnel dans le manifest skill (button.label 1..40 + icon optionnel, scope task|board requis si chat présent, interactive/autoApply défauts false), validation par le pipeline structuré existant (WorkflowFormatError, clés inconnues rejetées), manifests sans chat strictement inchangés. Types WorkflowSkillChat/Resolved dans workflows/types.ts.
- [x] 2. Picker de skills dans la PromptBar (scope task/board) + lancement pré-contextualisé
  report: SkillButtons (pills au-dessus de la PromptBar, map d'icônes tabler avec fallback Sparkles, badge interactif, disable tant que starting ou sans harness), scope task désactivé sans contexte avec tooltip, lancement via startSession({skillId}) avec le harness sélectionné et la tâche pré-contextualisée ; /api/skills expose chat et createAgentSession passe skillId.
- [x] 3. Skill builtin refine (one-shot : titre, description, checklist)
  report: templates/skills/refine (manifest + instructions.md) : réécrit titre/description et produit une checklist de sous-tâches, sans toucher au code ; directive "Apply this skill to the context above now."
- [x] 4. Skill builtin grill-me (questions, mini-formulaire, fusion en spec)
  report: templates/skills/grill-me (interactive: true) : 3 à 5 questions numérotées "N. " sur angles morts/implicites/critères d'acceptation, stop après les questions ; l'UI parse les questions (parseNumberedQuestions, 10 tests), affiche le formulaire de réponses, et renvoie les réponses en message de suivi pour le tour de fusion (lock answersSent pour ne pas rouvrir le formulaire sur la sortie du fusion).
- [x] 5. autoApply par skill en mode acceptation
  report: décision côté serveur : la création de session résout le skill et pose skillAutoApply sur la config ; le routage ACP (t309) court-circuite la file d'approbation quand le flag est posé (auto-réponse allow_once), le client n'envoie jamais ce flag.
- [x] 6. Docs WORKFLOWS + brief si partagé
  report: docs/WORKFLOWS.md section Skill packages étendue (table des champs chat + exemple grill-me + built-ins nommés) ; pas de partage avec le manifest extensions, donc extension-brief non concerné (changelog:check vert confirme).

## Livraison

- Un (ou plusieurs) commit propre par tâche fermée, préfixe `feat(agent)` ;
  `pnpm verify` vert avant chaque commit, push seulement sur demande de vava.
- Passer la tâche en Done dans kandown à la fermeture, avec un report réel
  écrit dans le fichier (protocole `kandown work`).

## Completion report

Les boutons du chat sont les skill packages existants : une seule source de
vérité, le même dossier alimente le compilateur `kandown work` et la
PromptBar. Côté manifest, les champs `chat.*` sont optionnels et validés par
le pipeline existant (rétrocompatibilité totale, tests dédiés). Deux skills
builtin livrés : refine (one-shot) et grill-me (interactif). L'exécution
assemble le prompt côté serveur (document compilé + instructions du skill +
directive adaptée) ; grill-me enchaîne deux tours : questions numérotées,
puis fusion après réponses du mini-formulaire envoyées en steer. autoApply se
décide côté serveur depuis le skill résolu et court-circuite les Approval
Cards de t309 en mode acceptation.

Vérifié : `pnpm verify` complet vert (typecheck, 28 tests sur les specs
t310 + suites existantes, build, codemap, changelog, brief, diff). Suivis :
icônes personnalisées (le champ icon accepte toute string, la map UI est
volontairement petite) ; les skills board-only arrivent avec les usages
d'orchestration de [[t311]].
