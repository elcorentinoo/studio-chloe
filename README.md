# Studio Chloé

Éditeur vectoriel dans le navigateur, façon Illustrator : formes, pinceau, texte stylé (18 typographies, gras / italique / souligné), import et collage d'images, rognage, détourage IA (Remove.bg), zoom, copier / coller, annuler / rétablir, sauvegarde automatique, export PNG / SVG.

- **Stack** : HTML / CSS / JavaScript vanilla + [Fabric.js 5.3](http://fabricjs.com/) (CDN)
- **Déploiement** : site statique, aucun build — glisser le dossier sur Netlify (voir `netlify.toml`)

## Raccourcis
Liste complète dans l'app : bouton **i** (ou touche **?**).

| Touche | Action |
| --- | --- |
| V / R / E / B / T | Sélection, Rectangle, Ellipse, Pinceau, Texte |
| I | Importer une image |
| C ou double-clic | Rogner l'image sélectionnée (Entrée valide, Échap annule) |
| ⌘/Ctrl + C, X, V, D | Copier, couper, coller (objets, images, texte), dupliquer |
| ⌘/Ctrl + B, I, U | Gras, italique, souligné |
| ⌘/Ctrl + molette ou pincer, ⌘/Ctrl + + / − / 0 | Zoom de la zone de travail |
| Espace + glisser, molette | Se déplacer |
| Suppr | Supprimer la sélection |
| ⌘/Ctrl + Z, ⌘/Ctrl + Maj + Z | Annuler, Rétablir |

Le document est sauvegardé automatiquement dans le navigateur (IndexedDB). Prochaines features : voir `ROADMAP.md`.

## Détourage (Remove.bg)
Le navigateur envoie l'image à une fonction Netlify (`netlify/functions/remove-bg.mjs`, route `/api/remove-bg`) qui ajoute la clé côté serveur.

**Configuration** : Netlify → Site configuration → Environment variables → `REMOVE_BG_API_KEY` = votre clé.
La clé n'est jamais dans le dépôt ni dans le code du site. En local, utiliser `netlify dev`.
