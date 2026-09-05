---
id: t312
title: Web app remote : le board hors localhost (Tailscale-friendly) + PWA
status: Todo
assignee: vava
priority: P2
tags: [web, daemon, remote, pwa, security]
ownerType: human
created: 2026-09-05
order: 19
updated: 2026-09-05T00:50:46Z
category: WEB
---

# Web app remote : le board hors localhost

## Context

La web UI existe déjà (daemon local servant un fichier HTML auto-contenu), mais
elle n'est joignable que depuis la machine du daemon : bind 127.0.0.1, token
injecté dans la page. bb résout le même besoin pour ses threads par un service
hébergé de pairing (getbb.app) ou par Tailscale Serve pour un navigateur
distant. Le cas d'usage kandown est le workflow remote : daemon qui tourne sur
le Mac, board consulté et édité depuis l'iPhone (Moshi) ou un autre ordi du
tailnet. La série DESKTOP ([[t280]]) met explicitement le mobile et l'accès
distant hors de son périmètre : c'est le trou que cette tâche comble.

Décision de périmètre : **zéro infrastructure hébergée en v1**. Pas de compte,
pas de tunnel maison façon getbb.app ; le transport sécurisé est délégué à ce
que l'utilisatrice a déjà (Tailscale, ou tout reverse proxy HTTPS local). Un
service de pairing hébergé resterait une décision produit séparée, hors de
cette tâche.

## Technical Specifications

1. **Remote mode opt-in** : `kandown daemon start --remote` (ou clé dédiée dans
   `.kandown/kandown.json`) : bind sur une interface non-loopback déclarée
   explicitement (IP tailnet, nom d'hôte). Jamais 0.0.0.0 par défaut ; le mode
   reste fermé sans opt-in.
2. **Auth sur toutes les routes en remote** : plus aucune route anonyme, y
   compris la route d'identité et le HTML servi. Le token n'est plus injecté
   dans la page (sinon quiconque charge la page obtient le token) : un écran de
   login demande le token une fois, il vit en localStorage, et l'API le compare
   en constant-time. En local, le comportement actuel (token injecté par le
   daemon) reste identique.
3. **SSE authentifié** : le stream d'événements exige le token en remote
   (header ou query param one-shot), sinon le mode remote devient une porte
   ouverte silencieuse vers tout le board.
4. **HTTPS documenté, pas implémenté** : recette Tailscale Serve (`tailscale
   serve` vers le port du daemon) dans le README et dans l'écran remote des
   settings ; le TLS reste l'affaire du proxy, le daemon reste HTTP.
5. **PWA** : manifest + icônes servis par le daemon pour que Safari et Chrome
   proposent "Ajouter à l'écran d'accueil" avec une vraie icône ; pas de
   service worker en v1 (le HTML est déjà single-file, le cache HTTP suffit).
6. **Visibilité** : `kandown daemon status` affiche l'URL remote quand le mode
   est actif ; `kandown doctor` signale un bind plus large que l'interface
   déclarée.

## Subtasks

- [ ] 1. Flag/config remote + bind sur l'interface déclarée (jamais 0.0.0.0 par défaut)
- [ ] 2. Login par token en remote, suppression de l'injection auto du token, comparaison constant-time
- [ ] 3. SSE authentifié en remote
- [ ] 4. Recette Tailscale Serve documentée (README + écran settings)
- [ ] 5. Manifest PWA + icônes servis par le daemon
- [ ] 6. daemon status / doctor reflètent le mode remote
