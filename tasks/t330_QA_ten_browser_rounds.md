---
id: t330
title: QA : 10 rounds de tests navigateur en mode utilisateur (fix + repeat)
status: In Progress
priority: P1
tags: [qa, web, ux, agentic]
created: 2026-09-07
updated: 2026-09-07T00:14:52Z
order: 6
---

# QA : 10 rounds de tests navigateur en mode utilisateur (fix + repeat)

Demande vava : jouer chaque round comme un utilisateur sur une tache fictive
(t328/t329), corriger chaque defaut UI ou fonctionnel des qu'il apparait,
repete 10 fois, puis rapport complet. Sandbox : t328 (In Progress) et t329
(Backlog), a supprimer ensemble a la fin.

## Protocole par round

1. Parcours utilisateur differents par round (board, editeur, drag, chat,
   modeles, skills/grill, undo, i18n, dark mode, drawer mobile).
2. Console + screenshots + snapshot a chaque etape.
3. Fix immediat, commit propre, round suivant.

## Journal

### Round 1 (board + editeur) : termine, 3 fixes
- FIX MAJEUR : le miroir dev de GET/PUT/DELETE/archive /api/tasks/:id
  resolvait le fichier comme tasks/`<id>`.md litteral. Avec les noms
  descriptifs (t328_test_round_user.md), toute ouverture d'URL directe ou
  refresh donnait un editeur vide (404 silencieux masque par le cache du
  store quand on clique depuis le board), et le PUT aurait fourche un
  deuxieme fichier. Fixe par le resolver partage findTaskPath (board-reader)
  dans les 4 handlers du plugin vite. Verifie : GET 200, save round-trip
  correct (subtask cochee, frontmatter intact, pas de fork).
- FIX (mon erreur, pas l'app) : mes sandbox t328/t329 avaient ete doublees
  par mon heredoc vers de mauvais noms de fichiers ; doublons supprimes,
  contenu fusionne. Au passage : un id revendique par 2 fichiers produit un
  editeur vide sans message d'erreur clair (observation, a traiter plus tard).
- Observation : la description affiche la section "## Subtasks" brute en
  plus du panneau structuré (duplication visuelle). A trancher (masquer la
  section du corps dans la description ?).

### Round 2 (chat + selecteur de modeles) : termine, 4 fixes + 2 constats
- FIX : /api/skills non servie en dev (404 + unhandled rejection a chaque
  ouverture du chat) : miroir vite ajoute + catch dans refreshSessions.
- FIX MAJEUR : tout le bloc sessions du plugin vite etait decale d'un
  segment (session id lu dans parts[1] = "sessions") : sessions list,
  create, send, stop, events SSE jamais joignables en dev. Offsets corriges
  (parts[2] = id, parts[3] = action), convention documentee sur place.
- FIX : le menu modeles montrait le catalogue de l'ANCIEN harness pendant
  la discovery du nouveau : state vide au changement de harness.
- FIX (retour vava "c'est de la merde") : les listes de modeles etaient
  vagues ou perimees (claude "opus/sonnet/haiku", codex gpt-5.1/o4-mini,
  pi vide). Nouvelle source live models.dev (la base d'opencode) pour
  claude/codex/gemini/pi, tri par date de release desc, prefixe provider/id
  pour pi, filtres familles ; la discovery ACP reste prioritaire pour
  opencode (973 modeles du compte) et sert de repli pour gemini quand sa
  discovery echoue. Verifie live : claude 17 (fable-5-1 en tete), codex 24
  (generation gpt-5.6), gemini 18, pi 24 (provider/id), opencode 973.
- Menu elargi (w-56), courant en tete, check sur la ligne custom.
- CONSTAT externe : opencode met 40 s a repondre a initialize dans ce repo
  (2,7 s dans un petit dossier) et plusieurs minutes avant la premiere
  sortie ; la session reste "Working" sans feedback. Piste : message
  "starting <harness>, ca peut prendre du temps" apres N secondes.
- CONSTAT externe : gemini CLI refuse les sessions Code Assist individuelles
  ("migrate to Antigravity") : l'erreur est bien surfacée en carte rouge,
  mais gemini chat est inutilisable tant que Google ne remonte pas.

### Round 3 (drag & drop + undo + dark mode) : termine, 1 fix majeur
- Le drag navigateur de t328 (In Progress -> Review) fonctionne, y compris
  en dark mode (theme systeme, 2h du matin : le board bascule tout seul).
- FIX MAJEUR : les moves web (drag) n'ecrivaient PAS dans le journal d'undo
  : `kandown undo` ne pouvait pas les annuler (le chemin task-move.ts
  performTaskMove, partage par le miroir vite et le daemon, ecrivait les
  fichiers sans pushUndo, contrairement au chemin CLI). Fix : pushUndo
  exporte de board-reader et appele pour la tache deplacee dans la boucle
  d'ecriture. Verifie en direct : move web Review -> In Progress, undo ->
  retour a Review, re-move final vers In Progress. Derive connue et
  documentee : l'ordre des voisines n'est pas restaure par l'undo (hors
  perimetre d'une etape d'undo, comme le chemin CLI).
- (Le test CLI de l'undo a d'abord annule le move t324 au lieu du drag,
  exactement a cause du bug ci-dessus : t324 a ete remis en Done.)

### Round 4 (creation de tache + conflit) : termine, 1 fix
- Le New task UI cree bien la tache (t331, Backlog, titre correct).
- FIX : la modale de conflit affichait "Task &lt;code&gt;T331&lt;/code&gt;"
  litteral : <code> n'est pas dans la liste par defaut des noeuds HTML
  conserves par i18next (br/strong/i/p). Ajoute code + em a
  transKeepBasicHtmlNodesForBreaks. Verifie en live : plus d'echappement.
- Constats : Save & Close emet deux PUT (le deuxieme part en 409 et ouvre
  la modale de conflit a la creation : course save/close a confirmer) ;
  une tache creee depuis l'UI garde un nom nu (t331.md) au lieu du nom
  descriptif du CLI (t331_test_round_c_create_flow.md) : le PUT sur fichier
  absent retombe sur <id>.md. Deux ameliorations a derouler plus tard.

### Rounds 5 a 10 : a jouer (skills/grill, autopilot, i18n switch, drawer
mobile, lancement Herdr reel sur t328 avec preview PTY, mode centre,
hover previews, recherche). (drag, skills/grill, undo, autopilot, dark mode,
i18n switch, drawer mobile, lancement Herdr reel sur t328 avec preview PTY).

### Anomalie ouverte (non bloquante, a investiguer)
A 02:10:50, un `kandown undo` s'est execute une seule fois sans commande
visible (ligne "Undid move of t328" dans la sortie d'un git commit). Exclues
par test : hooks pre/post-commit (codemap+changelog only), graphify update
(execute manuellement apres un move : aucun undo), sessions agent du plugin
vite (stuck/dead), autres panes herdr (ernesto est dans ernesto_test),
filters git, automations. Non reproduit depuis. t328 remis en In Progress.

## Etat a 02:00 (stop quota 03:00)

Commits : 144f6cd (slice 2 fichiers exclusifs + locales), lot partage en
cours de verify. Reste apres reprise : rounds 3-10, slice 3 (sync evenements
+ dispatch visible autopilot), release v0.58.0 (bloquee par le token npm
de toute facon), rapport final complet.
