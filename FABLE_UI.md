# FABLE_UI — Système de thèmes & design moderne

> Rapport généré par Claude Fable 5 — 2026-07-19 — base : `main` @ v0.17.1
> Objectif : passer de « 5 skins hardcodés » à un **vrai système de thèmes personnalisables**, avec une galerie de presets ultra-clean (Vercel/Linear, Claude, Apple…) et des thèmes custom définis par l'utilisateur en JSON.

---

## 1. État des lieux (bon socle, plafond bas)

Ce qui est déjà bien :
- ✅ Tokens sémantiques shadcn-compatibles (`--background`, `--card`, `--primary`, …) appliqués via `applyProjectTheme` (`src/lib/theme.ts:421`) — l'UI est déjà 100 % pilotée par variables CSS.
- ✅ Light/dark par skin + mode auto, `color-scheme` correct, `data-skin`/`data-font` sur `<html>`.
- ✅ Découplage config (ids stables dans `kandown.json`) / tokens (dans le code).

Ce qui bloque :
- ❌ Les 5 skins sont **hardcodés dans `theme.ts`** (~270 lignes de HSL) — ajouter un thème = release npm.
- ❌ Les tokens ne couvrent que la **couleur** : radius, ombres, densité, borders, fonts display, vitesse d'animation sont figés dans Tailwind/composants. Or c'est précisément ce qui distingue un look « Vercel » (sec, carré, sans ombre) d'un look « Apple » (rond, translucide, ombré).
- ❌ `SkinId`/`FontId` sont des unions fermées (`types.ts:110-111`) — impossible de référencer un thème custom.
- ❌ Le TUI ignore totalement le thème du projet (couleurs ANSI en dur dans `board.tsx`).

---

## 2. Architecture cible : thèmes = données

### 2.1 Le format `KandownTheme` (JSON)

Un thème devient un objet sérialisable — chargeable depuis le code (presets), depuis `kandown.json` (customs), ou importé/exporté :

```jsonc
{
  "id": "my-theme",
  "name": "My Theme",
  "author": "vava",
  "base": "vercel",              // héritage : ne redéfinir que des deltas
  "appearance": {
    "radius": "8px",             // --radius (cards/inputs dérivés : calc)
    "borderWidth": "1px",
    "shadows": "soft",           // none | soft | elevated | dramatic
    "density": "comfortable",    // compact | comfortable | relaxed
    "glass": true,               // surfaces translucides + backdrop-blur
    "motion": "subtle"           // none | subtle | playful
  },
  "fonts": {
    "sans": "Inter",             // parmi les stacks embarquées
    "display": "same",           // ou une stack dédiée aux titres
    "mono": "SF Mono"
  },
  "light": { "background": "0 0% 100%", "primary": "0 0% 9%", "...": "..." },
  "dark":  { "background": "0 0% 4%",  "primary": "0 0% 98%", "...": "..." },
  "columnAccents": { "backlog": "gray", "in progress": "amber", "done": "green" }
}
```

Règles :
- **Héritage** (`base`) : un custom part d'un preset et n'override que quelques tokens → les thèmes custom restent courts et survivent aux évolutions du schéma.
- **Validation + fallback** : tout token manquant/invalide retombe sur le base ; jamais d'UI cassée (même philosophie que `loadConfig` t111).
- `SkinId` devient `string` + `normalizeSkinId` contre le registre runtime (presets + customs) au lieu de l'union fermée.

### 2.2 Nouveaux tokens à introduire

| Token CSS | Rôle | Exemple Vercel vs Apple |
|---|---|---|
| `--radius` (+ `--radius-sm/lg` dérivés) | arrondi global | `6px` vs `14px` |
| `--shadow-card`, `--shadow-popover`, `--shadow-drawer` | échelle d'élévation | `none` vs `0 8px 30px rgb(0 0 0 / 0.08)` |
| `--font-display` | titres (H1, colonnes) | = sans vs serif « Claude » |
| `--density-unit` | spacing de base (cards, gaps) | pilote compact/comfortable existant |
| `--motion-scale` | multiplicateur de durées (motion lib déjà présente) | `0` (reduced) → `1.2` |
| `--card-blur`, `--glass` (existant) | matériaux translucides | off vs `blur(20px) saturate(180%)` |

Implémentation : les composants remplacent leurs classes figées (`rounded-lg`, `shadow-sm`…) par les tokens (`rounded-[var(--radius)]` ou plugin Tailwind qui mappe `borderRadius.DEFAULT = 'var(--radius)'` — recommandé, zéro changement dans les composants). Respecter `prefers-reduced-motion` en forçant `--motion-scale: 0`.

### 2.3 Config

```jsonc
// kandown.json
"ui": {
  "skin": "linear",
  "customThemes": [ { "id": "my-theme", "base": "vercel", "...": "..." } ]
}
```

`.kandown/themes/*.json` en option pour les partager entre projets (et permettre un futur « theme gallery » communautaire — un thème = un fichier JSON à copier, parfaitement dans l'esprit file-over-app).

---

## 3. La galerie de presets (8 thèmes, tous light+dark)

> Les valeurs ci-dessous sont des directions art précises, prêtes à transposer en HSL dans le format ci-dessus.

### 3.1 ⚡ **Vercel** — monochrome radical
- Fond light `#FFFFFF` / dark `#000000` pur ; cartes `#0A0A0A` en dark avec border `#1F1F1F` (1px, jamais d'ombre).
- Un seul accent : blanc-sur-noir / noir-sur-blanc ; états système en couleurs Geist (`#0070F3` info, `#F5A623` warning, `#EE0000` error) uniquement sur les badges.
- Radius 6px, font Geist-like (Inter tight, `letter-spacing: -0.01em`), density compact, motion `subtle` (150ms ease-out).
- Signature : hiérarchie 100 % typographique — graisses et gris (`#666`, `#888`, `#A1A1A1`), zéro décor.

### 3.2 📐 **Linear** — dark-first, violet électrique
- Dark : fond `#08090A`, surfaces `#141516`, borders `#23252A` ; light : `#FCFCFD`.
- Accent `#5E6AD2` (le violet Linear) sur primary, focus rings, selection ; hover = accent à 8 % d'alpha.
- Radius 8px, ombres popover profondes mais cartes plates, glass activé sur header/palette (`backdrop-blur` — le `--glass` existant sert enfin).
- Motion `subtle` avec micro-spring sur le drag (motion lib déjà là) ; badges priorité façon Linear (icônes barrées P1-P4).

### 3.3 🧡 **Claude** — chaleur éditoriale
- Light : fond crème `#F5F1EA` (oat), cartes `#FBF9F5`, encre `#1F1E1D` ; dark : brun-noir `#151312`, cartes `#211E1C`.
- Accent terracotta `#D97757` (boutons primaires, colonne active, checkboxes).
- `--font-display` serif (la stack Charter « Editorial » existe déjà) pour titres et noms de colonnes, corps en sans ; radius 12px, ombres `soft` très diffuses, motion doux.
- Signature : le board qui donne envie de *lire* — parfait pour le positionnement agents IA.

### 3.4 🍎 **Apple** — matériaux & profondeur
- Light : fond `#F5F5F7`, cartes blanches translucides (`rgba(255,255,255,0.72)` + `backdrop-blur(20px) saturate(180%)`) ; dark : `#1D1D1F` / matériaux `rgba(30,30,32,0.68)`.
- Accent `#0A84FF` (systemBlue), remplissages gris système (`fill-secondary`) pour les chips.
- Radius 14px (approx. squircle), ombres `elevated` multi-couches, font stack System (SF), density relaxed, motion spring prononcé.
- Header et drawer en vraie vibrancy — le rendu single-file HTML supporte `backdrop-filter` partout où le board scrolle derrière.

### 3.5 💳 **Stripe** — nuit indigo
- Dark violacé `#0A0A23` (blurple night), cartes `#16163A`, accent `#635BFF` avec dégradé signature `#635BFF → #00D4FF` réservé au header et aux progress bars.
- Light : `#F6F9FC` avec borders bleutées `#E3E8EF`. Radius 8px, ombres colorées subtiles (`0 4px 12px rgb(99 91 255 / 0.15)`).

### 3.6 📄 **Paper** (Notion-like) — atelier calme
- Light quasi-blanc `#FFFFFF` / gris chauds `#F7F6F3`, texte `#37352F`, accents désaturés (tags pastel Notion) ; dark `#191919`.
- Radius 4px, aucune ombre sur les cartes (hover = fond `#F1F0EC`), density compact, motion none. Le thème « je veux juste mes tâches ».

### 3.7 🧛 **Catppuccin Mocha / Latte** — le favori des devs
- Reprendre la palette officielle (Mocha : base `#1E1E2E`, mauve `#CBA6F7`, etc. ; Latte en light). Colonnes mappées sur les couleurs cata (peach, green, sky…). Gratuit en notoriété : la communauté Catppuccin référence les apps qui l'adoptent.

### 3.8 🖥️ **Terminal** — CRT hommage au TUI
- Fond `#0C0C0C`, texte `#33FF66` (ou ambre `#FFB000` en variante), font Mono partout, borders ASCII-feel 1px, radius 0, scanlines optionnelles en `background-image` très subtil, motion none. Fun, identitaire, et cohérent avec le TUI.

---

## 4. UI de personnalisation

### 4.1 Sélecteur de thèmes (Settings → Appearance)
- **Grille de cartes preview** : chaque thème rendu en mini-board (3 colonnes, 2 cartes) dans ses propres tokens — pas des swatches, un vrai aperçu. Clic = application instantanée (les tokens sont déjà appliqués au runtime, aucun reload).
- Toggle light/dark/auto par-dessus, aperçu au hover avant commit.

### 4.2 Éditeur de thème custom 🟡
- « Duplicate » sur n'importe quel preset → panneau d'édition : pickers pour les ~8 tokens majeurs (background, surface, texte, accent, border) + sliders radius/ombres/densité ; les tokens dérivés (muted, secondary, ring…) sont **auto-calculés** depuis ces 8 (offsets HSL) avec override manuel possible.
- Garde-fou accessibilité : contrôle WCAG live (contraste texte/fond ≥ 4.5, muted ≥ 3.0) avec warning inline.
- Export/import du JSON (copier-coller ou fichier dans `.kandown/themes/`).

### 4.3 Cohérence TUI 🟡
Mapper chaque preset vers un mini-thème terminal (accent + 4 couleurs de colonnes en ANSI 256/truecolor) lu depuis `kandown.json` — le TUI cesse d'avoir ses couleurs en dur (`board.tsx:columnAccentColor`) et suit enfin `board.columnColors` + le skin.

---

## 5. Raffinements design transverses (indépendants du thème)

1. **Échelle typographique** : `body { font-size: 18px }` (`globals.css`) est très grand pour une app densité-info ; passer à 14-15px de base avec une vraie échelle (12/13/14/16/20) et laisser la densité au token `--density-unit`.
2. **Élévation cohérente** : aujourd'hui les ombres sont au cas par cas ; définir 3 niveaux (card / popover / modal-drawer) et ne jamais improviser.
3. **États de focus unifiés** : un seul style `focus-visible` global basé sur `--ring` (2px offset) — audit rapide des composants `ui/` pour l'appliquer partout (accessibilité clavier déjà bien engagée avec ⌘K etc.).
4. **Drag & drop premium** : carte soulevée = scale 1.02 + ombre élevée + légère rotation (1°), placeholder à hauteur réelle de la carte, colonnes cibles éclaircies — la lib motion est déjà dans le bundle, c'est du réglage.
5. **Empty states illustrés** : `EmptyState.tsx` existe ; décliner l'illustration selon le thème (monochrome en Vercel, terracotta en Claude…) via `currentColor` + tokens.
6. **Transitions light/dark** : `transition: background-color 200ms, color 200ms` sur `:root` au changement de mode (avec garde `prefers-reduced-motion`) au lieu du switch sec.
7. **Scrollbars thémées** : `scrollbar-color: hsl(var(--border-strong)) transparent` — détail qui trahit immédiatement une app non finie sous Windows/Linux.

---

## 6. Plan d'implémentation

| Étape | Contenu | Notes |
|---|---|---|
| 1 | Introduire `--radius`, `--shadow-*`, `--font-display`, `--motion-scale` + mapping Tailwind (`borderRadius: 'var(--radius)'`) | Aucun changement visuel (valeurs actuelles par défaut) |
| 2 | Refactor `theme.ts` : `SkinOption` → `KandownTheme` (données pures + `base` + `appearance`), registre runtime, `SkinId: string` | Les 5 skins actuels deviennent les premiers presets — zéro régression |
| 3 | Livrer les 8 presets §3 | Pur travail de données, itérable un par un |
| 4 | Grille de sélection avec previews live (§4.1) | Remplace le sélecteur actuel |
| 5 | `ui.customThemes` + import/export JSON (§4.2 sans l'éditeur) | Les power users créent déjà leurs thèmes à la main |
| 6 | Éditeur visuel + garde-fous WCAG | La cerise |
| 7 | Thème TUI (§4.3) | Peut se faire en parallèle dès l'étape 2 |

Les étapes 1-3 suffisent à transformer la perception du produit (« 5 skins » → « galerie de thèmes dignes de Linear ») ; 5 rend le système *ouvert*, ce qui colle à l'ADN file-over-app de Kandown.

---

*Voir aussi : `FABLE_CODEQUALITY.md` (dette & bugs) et `FABLE_FEATURES.md` (features & UX).*
