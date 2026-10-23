# Studio Chloé

Éditeur vectoriel dans le navigateur, façon Illustrator : formes, pinceau, texte, import d'images, rognage, détourage IA (Remove.bg), annuler / rétablir, export PNG / SVG.

- **Stack** : HTML / CSS / JavaScript vanilla + [Fabric.js 5.3](http://fabricjs.com/) (CDN)
- **Déploiement** : site statique, aucun build — glisser le dossier sur Netlify (voir `netlify.toml`)

## Raccourcis
| Touche | Action |
| --- | --- |
| V / R / E / B / T | Sélection, Rectangle, Ellipse, Pinceau, Texte |
| I | Importer une image |
| C ou double-clic | Rogner l'image sélectionnée (Entrée valide, Échap annule) |
| Suppr | Supprimer la sélection |
| ⌘/Ctrl + Z, ⌘/Ctrl + Maj + Z | Annuler, Rétablir |

## Détourage (Remove.bg)
Le navigateur envoie l'image à une fonction Netlify (`netlify/functions/remove-bg.mjs`, route `/api/remove-bg`) qui ajoute la clé côté serveur.

**Configuration** : Netlify → Site configuration → Environment variables → `REMOVE_BG_API_KEY` = votre clé.
La clé n'est jamais dans le dépôt ni dans le code du site. En local, utiliser `netlify dev`.
