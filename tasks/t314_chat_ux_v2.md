---
id: t314
title: Chat UX v2 : markdown, bloc d'activite unifie, liens de tache + presence blobatar
status: Done
created: 2026-09-05
updated: 2026-09-05T09:07:58Z
---

## Context

Feedback vava apres la serie agent (capture du chat pi a l'appui) : le markdown n'est pas rendu, les Thinking et les tool calls s'empilent en pile, BeautifulUI sous-exploite, et l'agent ne sait pas montrer une tache a l'utilisatrice.

## Subtasks

- [x] Markdown rendu dans les messages assistant (react-markdown + remark-gfm, blocs de code sur les tokens du theme avec bouton copier)
  report: MarkdownContent.tsx ; StreamingText passe en mode markdown avec caret vivant ; messages utilisateur en texte brut.
- [x] Un seul bloc d'activite par tour (thinking courant + tool calls mutuailises, mise a jour en direct)
  report: ActivityBlock.tsx : ticker thinking + rangees d'outils dans le meme bloc repliable (bilan "N tools: X ok, Y failed"), les bash repetes deviennent des rangees du bloc au lieu de chips eparses ; le fold garde tous les evenements, le groupement est du rendu.
- [x] Port BeautifulUI (beautifului.dev, MIT) : thinking repliable, shimmer, tool rows, streaming caret, approval card pulse, code blocks
  report: patterns portes au style kandown (tokens, motion-presets, reduced-motion), credit en entete de fichiers.
- [x] Liens de tache cliquables + directive [show: tXXX] avec ouverture automatique et blobatar de session
  report: task-links.ts (parseur pur, 13 tests) : [[tXXX]] et tXXX nus deviennent des chips cliquables vers openDrawer ; directive [show: tXXX#anchor] retirée de l'affichage, ouvre la tache a la fin du tour, scrolle vers la section (ancres data-task-section dans TaskWorkspace et Drawer) et affiche AgentPresenceBadge (blobatar de session, sans lock) ; affix "Chat affordances" ajoute au prompt de session cote daemon + miroir vite.
