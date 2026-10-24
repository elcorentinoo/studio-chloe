# Studio Chloé — notes pour Claude

## Projet
App web d'édition vectorielle façon Adobe Illustrator, pour Corentin (francophone : réponds en français).
Site statique déployé sur Netlify (branché sur ce dépôt GitHub), sans build : `index.html`, `style.css`, `app.js`, `logo.svg`, `js/*.js`.
PWA : `manifest.webmanifest`, `sw.js` (stale-while-revalidate, réseau pour `/api/`), icônes dans `icons/`.
Détourage : fonction Netlify `netlify/functions/remove-bg.mjs` (route `/api/remove-bg`), clé dans la variable d'env `REMOVE_BG_API_KEY`. **Ne jamais écrire de clé API dans le code.**

## Architecture de `app.js` (sections numérotées dans le fichier)
1. Configuration (endpoint du détourage, styles par défaut)
2. État global (`state`) & références DOM (`dom`)
3. Canvas Fabric + redimensionnement (ResizeObserver) ; la page blanche est dessinée par `drawPage()` (pas de `backgroundColor`, ajouté seulement à l'export) ; 3b. `Viewport` — zoom / déplacement (viewportTransform)
4. `ShapeFactory` — formes traçables au cliquer-glisser (ajouter une forme = une entrée ici)
5. `Tools` — registre d'outils (activate / deactivate / onMouseDown / onMouseMove / onMouseUp). Un exemple d'outil « Plume » (Bézier) est esquissé en commentaire.
6. `Properties` — panneau de droite (sync / apply)
7. `ImageImporter` — bouton + glisser-déposer ; 7b. `Cropper` — rognage non destructif (cropX/cropY) ; 7c. `Clipboard` — copier / coller (images, objets, texte) / dupliquer
8. `BackgroundRemover` — détourage via la fonction Netlify ; 8b. `History` — annuler/rétablir par instantanés JSON (debounce) ; 8c. `Autosave` — sauvegarde IndexedDB à chaque étape
9. Utilitaires (suppression, effacer tout, export PNG/SVG)
10. Thème clair/sombre (localStorage) & barre d'état ; 10b. `TextStyle` (gras/italique/souligné, `ensureFont`) & `Help` (fenêtre des raccourcis)
11. Raccourcis clavier ; 12. Helpers (`Sheet` fenêtres, `loadScript`, `html`, `escapeHTML`) ; 13. Démarrage (`DOMContentLoaded`)

Points d'extension : `Hooks` (init, boot, sync, change, docLoaded, tool, snapTargets, panelTab), `Keys.add()`, `Tools`, `ShapeFactory`, `SHORTCUTS`, `TOOL_LABELS`, `TYPE_LABELS`.
Document = JSON Fabric (`SERIAL_PROPS`, que les modules complètent) + `page` + `Doc.extras` (données de module : repères, plans, tranches, symboles, couleurs globales, motifs) — `Doc.serialize / load / open`.
Outils : `RailGroups.create/add` (menus d'outils du rail), `tool.options()` (tuile d'options dans le panneau), `PaperKit.ready()` (paper.js à la demande), `Geo` (formes → commandes de tracé en coordonnées du document).
Pendant un aperçu (fenêtres d'effets), `History.flush()` puis `History.restoring = true` pour ne pas créer d'étapes.

## Modules (`js/`, chargés après app.js, même portée globale)
- `arrange.js` — alignement, groupes, guides magnétiques, grille, règles, panneau Calques
- `style-fx.js` — pipette, nuanciers, dégradés, arrondis, ombre, filtres photo
- `formats.js` — formats de page, redimensionnement magique, fenêtre d'export (PDF via jsPDF)
- `pen.js` — Plume et édition des points
- `library.js` + `library-data.js` — modèles, icônes Lucide (ISC), stickers, vectorisation (ImageTracer)
- `projects.js` — IndexedDB (projets, docs, tableaux, meta), galerie Pinterest, coffre chiffré (passkey PRF + code de secours)
- `geometry.js` — `Geo` : commandes de tracé, conversion en `fabric.Path`, remplacement d'objet
- `toolbox.js` — `RailGroups`, `ToolOptions`, `PaperKit`, `optionRange`
- `guides.js` — repères posés depuis les règles · `transform.js` — miroir (Maj H/V), outils rotation / miroir / échelle / inclinaison
- `direct.js` — flèche blanche · `select-tools.js` — baguette magique, lasso · `quickcrop.js` — rognage rapide
- `shapes-plus.js` — arc, spirale, grilles · `curvature.js` — Courbure · `anchors.js` — ajout / suppression / conversion de points, ciseaux
- `pencil.js` — crayon, lissage, gomme · `brushes.js` — pinceaux artistiques · `width-tool.js` — outil Largeur (profils de contour)
- `liquify.js` — déformer / tordre / gonfler · `paint.js` — pot de peinture dynamique, pulvérisateur de symboles
- `graph.js` — graphiques · `slices.js` — tranches · `artboards.js` — plans de travail multiples (exports par plan, PDF multipage)
- `pathfinder.js` — opérations booléennes · `shape-builder.js` — concepteur de forme · `offset.js` — décalage du tracé
- `masks.js` — masques d'écrêtage · `text-pro.js` — zone de texte, texte sur tracé / dans une forme, vectorisation (opentype.js + Fontsource)
- `stroke-pro.js` — extrémités, jointures, pointillés, pointes de flèche, vectoriser le contour · `appearance.js` — panneau Aspect
- `symbols.js` — symboles liés, couleurs globales (onglet Symboles) · `patterns.js` — motifs · `gradient-pro.js` — dégradés radiaux / multi-arrêts, dégradé de formes
- `distort.js` — déformation par enveloppe, transformation répétée · `print.js` — CMJN, fonds perdus et traits de coupe
- `import-export.js` — import SVG / PDF / .ai (pdf.js), SVG optimisé · `typography.js` — catalogue Google Fonts, réglages typographiques
- `ai.js` — détourage local (@imgly), génération Pollinations, texte → vecteur · `collab.js` — collaboration Yjs + y-webrtc · `pwa.js` — service worker, tactile, tiroir mobile, partage
- `transform-panel.js` — panneau Transformation (X/Y/L/H/angle, point de référence) · `isolation.js` — mode isolation des groupes + flèche blanche dans les groupes
- `select-same.js` — Sélection › Même, inverser · `blend.js` — modes de fusion (mix-blend-mode en SVG) · `text-styles.js` — styles de paragraphe / caractère (`Doc.extras.textStyles`)
- `recolor.js` — Recolorer la composition · `live-fx.js` — effets modifiables (`obj.liveFx`, rendu à l'affichage, `FxGeo`)
- `join.js` — Joindre ⌘J / Moyenne ⌘⌥J · `dynamic-shapes.js` — angles des rectangles (`cornerRadii`, `cornerType`, widgets) · `layer-folders.js` — calques en dossiers (`layerId`, `Doc.extras.layerFolders`)
- `gradient-tool.js` — outil Dégradé (G) · `graphic-styles.js` — styles graphiques · `asset-export.js` — export des éléments ⌘⌥E (`assetName`)
- `repeat.js` — répétition radiale / grille / miroir (`group.repeat`) · `text-wrap.js` — habillage du texte (`textWrap`, surcharge du retour à la ligne des Textbox)
- `direct-pro.js` — flèche blanche : sélection de points (`DirectPro.sel`), cadre, flèches, Suppr

Performances : `ImagePool` (app.js) — l'historique référence les images (`pool:N`) au lieu de les recopier ; `ImagePool.expand()` avant toute sortie (sauvegarde projet). Les formes simples n'ont pas de cache objet (`objectCaching = false`).

## Identité visuelle
- Thème « glass » jaune-vert : lime `#d4f04c`, olive `#25300b`, mousse `#7c9425`, crème `#f4f2e4`
- Polices : Outfit (titres) + Inter (interface)
- Logo : monogramme SC entrelacé, trait constant, fins coupées droites (`logo.svg`)

## Feuille de route & versions
Features publiées et liste « à publier » priorisée : `ROADMAP.md`.
Versions nommées d'après la croissance d'une plante (0.1.0 Graine, 0.2.0 Pousse, 0.3.0 Tige, 0.4.0 Feuille, 0.5.0 Bourgeon, 0.6.0 Fleur… 1.0.0 Fruit).
À chaque nouvelle version : `APP_VERSION` (app.js), `CACHE_VERSION` (sw.js), tableau de `ROADMAP.md`, tag git `vX.Y.Z`.

## Règles de travail
- Toujours **proposer avant de coder** et attendre le feu vert de Corentin.
- Rester en JS vanilla + Fabric.js (pas de framework, pas d'étape de build) sauf accord explicite.
- Tester dans un navigateur (Playwright) après chaque changement.
