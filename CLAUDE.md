# Studio Chloé — notes pour Claude

## Projet
App web d'édition vectorielle façon Adobe Illustrator, pour Corentin (francophone : réponds en français).
Site statique déployé sur Netlify (branché sur ce dépôt GitHub), sans build : `index.html`, `style.css`, `app.js`, `logo.svg`.
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
11. Raccourcis clavier ; 12. Helpers ; 13. Démarrage

## Identité visuelle
- Thème « glass » jaune-vert : lime `#d4f04c`, olive `#25300b`, mousse `#7c9425`, crème `#f4f2e4`
- Polices : Outfit (titres) + Inter (interface)
- Logo : monogramme SC entrelacé, trait constant, fins coupées droites (`logo.svg`)

## Feuille de route
Features publiées et liste « à publier » priorisée : `ROADMAP.md`.

## Règles de travail
- Toujours **proposer avant de coder** et attendre le feu vert de Corentin.
- Rester en JS vanilla + Fabric.js (pas de framework, pas d'étape de build) sauf accord explicite.
- Tester dans un navigateur (Playwright) après chaque changement.
