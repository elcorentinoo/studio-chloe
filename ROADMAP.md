# Studio Chloé — feuille de route

## ✅ Publié
**Octobre 2026 — vague 3**
- Correctif : le badge « Aucune sélection » n'est plus coupé en haut du panneau (passage à la ligne, points de suspension)
- Repères : glisser depuis les règles, déplacer, supprimer sur la règle, aimantation, afficher (⌘;) / verrouiller (⌘⌥;), enregistrés avec le document
- Miroir horizontal / vertical de la sélection (Maj + H / Maj + V), objets, images, groupes ou sélection multiple
- Flèche noire (V : objets et groupes) et flèche blanche (A : sélection directe des points et poignées, conversion des formes en tracés) ; double-clic sur toute forme pour éditer ses points

**Octobre 2026 — vague 2**
- Galerie de projets façon Pinterest : mosaïque, tableaux, bouton « Enregistrer », recherche, renommer / dupliquer / supprimer (⌘O)
- Verrouillage par empreinte (Touch ID / Face ID / Windows Hello) : projets chiffrés (AES-256), code de secours, verrouillage automatique, ⌘⇧L
- Formats de page (réseaux sociaux, impression 300 dpi, écran, sur mesure) + redimensionnement magique (sur place ou en copie)
- Exports PNG / JPG / WebP / SVG / PDF, 1× à 4×, page ou sélection (⌘E)
- Nouvelles formes : ligne (L), flèche, triangle, polygone, étoile, coins arrondis
- Alignement, répartition, groupes (⌘G / ⌘⇧G), ordre des plans (⌘[ ⌘]), ⌘A, flèches du clavier
- Guides magnétiques, grille, règles ; panneau Calques (renommer, masquer, verrouiller, réordonner)
- Pipette, nuanciers (marque, document, mes couleurs), dégradés, ombre portée, filtres photo
- Plume (P) + édition des points (double-clic sur un tracé)
- Bibliothèque (K) : 9 modèles, ~200 icônes, 12 stickers ; vectorisation d'image

**Octobre 2026 — vague 1**
- Coller une image / un texte (⌘V), copier / couper / dupliquer
- Texte : 18 typographies, gras / italique / souligné
- Zoom de la zone de travail, déplacement (Espace), aide des raccourcis (bouton i)

## 🔜 Prochaines (cochées, pas encore codées)
| Feature | Impact | Effort | Notes |
| --- | --- | --- | --- |
| **IA : génération d'image** | fort | M | Fonction Netlify `/api/generate-image` → Replicate (FLUX schnell, rapide, ~0,3 centime/image), clé `REPLICATE_API_TOKEN`. Protégée par un code d'accès (`AI_ACCESS_CODE`) |
| **IA : assistant de design** (« décris ton visuel ») | fort | L | Fonction Netlify → API Claude (modèle rapide), clé `ANTHROPIC_API_KEY`, sortie JSON validée puis chargée comme document |
| **Mobile / PWA** | fort | M | Pincer pour zoomer au doigt, panneau en tiroir, installable (manifest + service worker), hors ligne |

## 📋 Non retenues pour l'instant
| Feature | Notes |
| --- | --- |
| Sauvegarde de secours (fichier) | Recommandée : les projets vivent dans le navigateur ; vider ses données de navigation les efface |
| Synchro entre appareils & lien de partage | Netlify Functions + Netlify Blobs ; vérification de la passkey côté serveur |
| Collaboration temps réel | Yjs + Liveblocks / PartyKit |
