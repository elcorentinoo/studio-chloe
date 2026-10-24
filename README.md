# Studio Chloé

Éditeur vectoriel dans le navigateur, façon Illustrator : formes, plume et courbure, crayon, pinceaux artistiques, texte avancé (sur tracé, dans une forme, vectorisation, toutes les Google Fonts), Pathfinder, concepteur de forme, masques, symboles et couleurs globales, motifs, dégradés, effets de déformation, plans de travail multiples, import PDF / .ai / SVG, exports (PNG, JPG, WebP, SVG optimisé, PDF avec fonds perdus), IA gratuite (détourage local, génération d'images), collaboration en direct, application installable (PWA).

- **Stack** : HTML / CSS / JavaScript vanilla + [Fabric.js 5.3](http://fabricjs.com/) (CDN). Bibliothèques gratuites chargées à la demande : paper.js, opentype.js, pdf.js, jsPDF, JSZip, ImageTracer, Yjs + y-webrtc, @imgly/background-removal.
- **Déploiement** : site statique, aucun build — Netlify publie la branche `main` (voir `netlify.toml`).

## Raccourcis
Liste complète dans l'app : bouton **i** (ou touche **?**).

| Touche | Action |
| --- | --- |
| V / A | Flèche noire (objets) / flèche blanche (points) |
| Y / Q | Baguette magique / lasso |
| R / E / L | Rectangle, ellipse, ligne (menu Formes : arc, spirale, grilles…) |
| P / Maj P | Plume / Courbure — + / − ajouter / supprimer un point, C ciseaux |
| B / N / Maj B / Maj E | Pinceau, crayon, pinceau artistique, gomme |
| T | Texte (glisser : zone de texte) — J : graphique |
| Maj R / O / S | Rotation, miroir, mise à l'échelle |
| Maj H / Maj V | Miroir horizontal / vertical de la sélection |
| Maj W / Maj M / Maj K / Maj S | Largeur, concepteur de forme, pot de peinture, pulvérisateur |
| Maj C / Maj O | Rognage rapide / plan de travail |
| ⌘/Ctrl + 7, ⌘/Ctrl + Alt + 7 | Créer / libérer un masque d'écrêtage |
| ⌘/Ctrl + Maj + U / − | Pathfinder : unir / soustraire |
| ⌘/Ctrl + Maj + O | Vectoriser le texte |
| ⌘/Ctrl + G / Maj G | Grouper / dissocier |
| ⌘/Ctrl + ; (Alt : verrouiller) | Afficher / masquer les repères |
| ⌘/Ctrl + C, X, V, D | Copier, couper, coller, dupliquer |
| ⌘/Ctrl + Z, ⌘/Ctrl + Maj + Z | Annuler, rétablir |
| ⌘/Ctrl + E / O | Exporter / mes projets |
| ⌘/Ctrl + molette ou pincer, ⌘/Ctrl + 0 / 1, ⌘/Ctrl + Alt + 0 | Zoom, ajuster, 100 %, tous les plans |
| Espace + glisser | Se déplacer |

Les projets sont sauvegardés automatiquement dans le navigateur (IndexedDB), chiffrables par empreinte. Feuille de route : `ROADMAP.md`.

## Détourage
- **Par défaut : IA gratuite dans le navigateur** (@imgly/background-removal, licence AGPL-3.0) : l'image ne quitte pas l'ordinateur ; le premier détourage télécharge le modèle (~40 Mo, mis en cache).
- **Option Remove.bg** : le navigateur envoie l'image à une fonction Netlify (`netlify/functions/remove-bg.mjs`, route `/api/remove-bg`) qui ajoute la clé côté serveur. Configuration : Netlify → Site configuration → Environment variables → `REMOVE_BG_API_KEY`. La clé n'est jamais dans le dépôt. En local : `netlify dev`.

## IA, collaboration, application
- **Génération d'images** : service gratuit Pollinations (sans clé) ; « Texte → vecteur » vectorise automatiquement le résultat.
- **Collaboration** : bouton « Collaborer » → lien secret ; échanges pair à pair chiffrés (WebRTC). Seul le projet partagé circule.
- **PWA** : installable (bouton du rail quand le navigateur le propose), fonctionne hors ligne après la première visite (`sw.js`).
