---
id: t316
title: Ouvre-moi et modifie la description
status: Backlog
created: 2026-09-05
updated: 2026-09-05T11:28:35Z
category: TEST
---

# Ouvre-moi et modifie la description

Une carte créée pour tester le panneau de détail : **gras**, *italique*,
`code inline`, un lien vers [kandown.dev](https://kandown.dev) et un bloc
délimité.

```ts
const board = loadBoard('./tasks')
console.log(board.columns.length)
```

- Une puce
- Une autre puce
  - Une puce imbriquée

## Décisions

- La modification se fait dans le tiroir (drawer) sur mobile et dans l'espace
  de travail (workspace) sur desktop ; les deux doivent enregistrer dans ce
  même fichier.

## Critères d'acceptation

- [ ] Taper dans la description écrit sur le disque en moins d'une seconde
- [ ] Le markdown se rend correctement (titres, listes, bloc de code, lien)
- [ ] Cocher une sous-tâche ci-dessous persiste après un rechargement
- [ ] Changer la priorité et l'assigné met à jour le front de la carte

## Sous-tâches

- [ ] Coche cette case, recharge, confirme qu'elle est restée cochée
- [ ] Renomme le titre et confirme que le nom du fichier suit
- [ ] Ajoute un commentaire ou une ligne de rapport