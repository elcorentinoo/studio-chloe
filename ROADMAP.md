# Studio Chloé — feuille de route

## ✅ Publié (octobre 2026)
- Coller une image avec ⌘/Ctrl + V (capture d'écran, « Copier l'image »), coller un texte copié ailleurs
- Copier / couper / coller / dupliquer des objets (⌘C, ⌘X, ⌘V, ⌘D)
- Texte : 18 typographies (sans-serif, serif, affichage, manuscrites), gras, italique, souligné — sur tout le texte ou sur les lettres sélectionnées
- Zoom sur la zone de travail uniquement (⌘ + molette, pincement, ⌘+ / ⌘− / ⌘0, pilule de zoom) et déplacement (Espace + glisser, molette)
- Bouton « i » : fenêtre des raccourcis clavier (aussi avec la touche ?)
- Sauvegarde automatique dans le navigateur (IndexedDB) : le document est restauré au rechargement

## 📋 À publier — par ordre de priorité suggéré
Impact : fort / moyen / faible · Effort : S / M / L

### Quick wins
| Feature | Impact | Effort | Notes d'implémentation |
| --- | --- | --- | --- |
| Alignement, distribution & groupes (⌘G) | fort | S | Tuile dans `Properties`, `getBoundingRect()`, `ActiveSelection.toGroup()` |
| Nouvelles formes : ligne, flèche, triangle, étoile, polygone, coins arrondis | moyen | S | Entrées `ShapeFactory` + `createDragShapeTool()` ; `rx/ry` pour les coins |
| Pipette & nuanciers (palette de marque) | moyen | S | API `EyeDropper`, repli lecture de pixel ; nuanciers en localStorage |
| Exports JPG / WebP / PDF, 1×–4×, sélection seule | moyen | S | `toDataURL` (zone + multiplicateur) ; PDF via jsPDF (cdnjs) |
| Fichier projet `.chloe` (exporter / ouvrir) | moyen | S | Le JSON est déjà produit par `History.snapshot()` |

### Gros morceaux
| Feature | Impact | Effort | Notes d'implémentation |
| --- | --- | --- | --- |
| Plans de travail aux formats (post Insta, story, A4, miniature YouTube…) | fort | M | Page de taille fixe découplée de la fenêtre ; `drawPage()` et l'export s'appuient dessus. Base des modèles et du redimensionnement magique |
| Panneau Calques (renommer, masquer, verrouiller, réordonner) | fort | M | Propriétés perso à ajouter dans `toJSON([...])` de `History.snapshot()` |
| Guides magnétiques, règles, grille | fort | M | `object:moving` + tracé sur `contextTop` |
| Plume (Bézier) + édition des points | fort | L | Squelette déjà en commentaire dans `Tools` |
| Dégradés, ombres, flou, filtres photo | fort | M | `fabric.Gradient`, `fabric.Shadow`, `fabric.Image.filters` |
| Modèles, icônes & stickers | fort | M–L | JSON dans `/templates/` + SVG libres (Lucide / Iconify) |
| Comptes & projets en ligne | fort | L | Supabase ou Netlify Blobs ; données perso (RGPD) |
| Mobile / tablette : pincer pour zoomer au doigt, panneau en tiroir, PWA hors-ligne | fort | M | Pointer events, `manifest.webmanifest`, service worker |

### Effet waouh
| Feature | Impact | Effort | Notes d'implémentation |
| --- | --- | --- | --- |
| Génération d'image par IA | fort | M | Fonction Netlify `/api/generate-image` (clé en variable d'env) ; API payante → quota |
| Assistant de design IA (« décris ton visuel ») | fort | L | LLM + schéma JSON Fabric strict ; API payante, limitation de débit |
| Redimensionnement magique multi-formats | fort | M | Dépend des plans de travail |
| Vectorisation d'image (bitmap → SVG) | moyen | M | `imagetracerjs` côté navigateur, gratuit |
| Lien de partage, puis collaboration | moyen–fort | L | Netlify Blobs + page `/v/:id` ; temps réel via Yjs / Liveblocks / PartyKit |
