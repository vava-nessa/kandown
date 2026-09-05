---
id: t241
title: Distribution agent : notes de traduction dans AGENT_KANDOWN.md + `kandown skill install`
status: Backlog
priority: P3
tags: [agents, docs, cli]
ownerType: agent
created: 2026-07-25
order: 28
updated: 2026-09-05T09:16:18Z
category: AGENTS
---

# Distribution agent : notes de traduction + skill install

## Context

Deux lacunes liées dans la façon dont kandown atteint les agents qui ne sont pas
Claude Code.

**Notes de traduction.** `templates/AGENT_KANDOWN.md` est écrit sans biais
fournisseur mais n'explique jamais comment ses primitives se mappent sur chaque
hôte. Une courte table à la fin, Claude Code / Codex CLI / Cursor / Gemini CLI /
Aider / OpenCode, avec l'emplacement du fichier de règles attendu par chacun,
rend le doc utilisable par tous au lieu d'être implicitement taillé pour Claude.

**`kandown skill install`.** Il n'existe aucune commande pour (ré)installer la
référence agent dans un projet, ni pour en tirer une depuis une URL. `kandown
init` l'écrit une fois ; ensuite, une personne qui a supprimé ou personnalisé le
fichier n'a aucun moyen pris en charge de revenir en arrière, et la communauté
n'a aucun moyen de distribuer une variante.

## Subtasks

- [ ] Ajouter une table « Translation Notes » à la fin de `templates/AGENT_KANDOWN.md` (éditer le template, jamais la copie racine synchronisée : `pnpm sync:agent`)
- [ ] `kandown skill install [--out <path>] [--force] [--from <url>]`, par défaut le template empaqueté
- [ ] Refuser d'écraser un fichier modifié sans `--force`, et dire ce qui diffère
- [ ] Documenter la commande dans le README et dans `kandown help`

## Notes

Source : `ameliorations_ideas_audit` §27 et §40.
Les propositions de skills `/orchestrate` et `/orchestrate-init` (§25-26) du même
rapport sont du **contenu, pas du code kandown** : elles relèvent d'un repo de
skills, pas d'ici. Volontairement non ticketées comme travail d'ingénierie.
