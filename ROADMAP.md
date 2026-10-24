# Studio Chloé — feuille de route

## 🌱 Versions
Numérotation `majeure.mineure.correctif` ; chaque version mineure porte le nom d'une étape de croissance de la plante (thème lime / olive). La 1.0.0 « Fruit » sera la version complète et stable.

| Version | Nom | Contenu |
| --- | --- | --- |
| 0.1.0 | Graine | Premier éditeur : formes, pinceau, texte, images, détourage, export |
| 0.2.0 | Pousse | Zoom, collage, styles de texte, aide, sauvegarde auto |
| 0.3.0 | Tige | Galerie de projets, coffre chiffré, formats, exports, Plume, calques, bibliothèque |
| 0.4.0 | Feuille | Les outils d'Illustrator : sélection, dessin, Pathfinder, plans de travail, IA, collaboration, PWA |
| 0.5.0 | Bourgeon | Le quotidien façon Illustrator : panneau Transformation, isolation, sélection directe dans les groupes, Sélection › Même, modes de fusion, styles de texte, recoloration, effets modifiables |
| 0.6.0 | Fleur | *(en cours)* Les 8 améliorations fréquentes |

## ✅ Publié
**0.6.0 « Fleur » — en cours**

**0.5.0 « Bourgeon » — octobre 2026**
- Panneau Transformation : point de référence à 9 positions, X / Y, largeur / hauteur (proportions liées), angle, calculs simples (« 200*2 »), ↑ / ↓
- Mode isolation : double-clic sur un groupe pour le modifier seul, le reste s'estompe ; Échap pour sortir, fil d'Ariane, imbrication, une seule étape d'annulation
- Sélection directe dans les groupes : la flèche blanche (A) atteint un élément d'un groupe, même imbriqué, et édite ses points sans dégrouper ; clic dans le vide pour ressortir
- Sélection › Même : bouton « Sélectionner » du panneau — même remplissage, contour, remplissage et contour, épaisseur, opacité, mode de fusion, type d'objet, police, symbole ; inverser, tout désélectionner
- Modes de fusion (tuile Apparence) : Produit, Écran, Incrustation, Lumière tamisée / crue, Différence, Teinte, Couleur… sur toute la sélection, exportés en SVG (mix-blend-mode)
- Styles de paragraphe et de caractère (tuile Texte) : créer depuis la sélection, appliquer, redéfinir (tous les textes liés suivent), remplacements locaux signalés « + », renommer, supprimer ; enregistrés avec le document
- Recolorer la composition (tuile Apparence) : toutes les couleurs de la sélection (dégradés, lettres, groupes, Aspect) remplaçables une à une, teinte / saturation / luminosité, harmonies, mélanger, niveaux de gris, aperçu en direct
- Effets modifiables (nouvelle tuile) : arrondir les angles, zigzag / ondulation, distorsion aléatoire, contracter / dilater, lueur externe — réglables, masquables, réordonnables à tout moment, « Décomposer » pour figer

**0.4.0 « Feuille » — octobre 2026**
- Correctif : le badge « Aucune sélection » n'est plus coupé en haut du panneau (passage à la ligne, points de suspension)
- Repères : glisser depuis les règles, déplacer, supprimer sur la règle, aimantation, afficher (⌘;) / verrouiller (⌘⌥;), enregistrés avec le document
- Miroir horizontal / vertical de la sélection (Maj + H / Maj + V), objets, images, groupes ou sélection multiple
- Flèche noire (V : objets et groupes) et flèche blanche (A : sélection directe des points et poignées, conversion des formes en tracés) ; double-clic sur toute forme pour éditer ses points
- Rognage rapide (Maj + C) : tracez un cadre, les éléments touchés (ou la sélection) sont rognés — vrai rognage pour les images droites, masque pour le reste, « Retirer le rognage »
- Baguette magique (Y : sélection par couleur, contour, épaisseur, opacité + tolérance) et Lasso (Q : sélection à main levée) ; menus d'outils et options d'outil dans le panneau
- Nouvelles formes : arc, spirale, grille rectangulaire, grille polaire (réglages dans le panneau)
- Outil Courbure (Maj + P) : la courbe passe par chaque clic et se lisse toute seule ; points d'angle (Alt), déplacement des points, fermeture
- Crayon (N, courbes propres, fermeture auto), Lissage (frotter un tracé) et Gomme (Maj + E : découpe vectorielle des formes et traits, pixels des images ; [ ] pour la taille)
- Outils de transformation : Rotation (Maj + R), Miroir (O), Mise à l'échelle (S), Inclinaison — point d'origine déplaçable, Maj pour contraindre, Alt pour copier, saisie numérique (Entrée)
- Outil Largeur (Maj + W) : épaisseur de contour variable point par point, profils (fuseau, pointe, goutte, vague), export SVG vectorisé
- Outils de fluidité : Déformer, Tordre, Gonfler / contracter (rayon, intensité, [ ] pour le rayon)
- Pot de peinture dynamique (Maj + K) : remplit la zone formée par les formes qui se chevauchent (survol surligné, recoloriage d'un nouveau clic)
- Pulvérisateur de symboles (Maj + S) : sème des copies de la sélection (taille, variation, rotation, densité), Alt pour effacer
- Graphiques vectoriels (J) : barres, barres horizontales / empilées, lignes, aires, secteurs, anneau — données collées depuis un tableur, double-clic pour modifier
- Outil Tranches : zones d'export nommées, déplaçables, découpe en grille, export PNG / JPG 1× à 3× en ZIP
- Pathfinder complet (paper.js) : unir (⌘⇧U), soustraire (⌘⇧-), intersecter, exclure, diviser, soustraire l'arrière-plan, rogner
- Édition avancée des points : ajouter (+), supprimer (−), convertir angle ↔ lisse (clic ou glisser), ciseaux (C) — sur tracés et formes
- Masques d'écrêtage : la forme ou le texte du dessus masque les objets du dessous (⌘7), libérer (⌘⌥7), masque inversé
- Texte avancé : zones de texte (glisser avec T), texte sur tracé (décalage, côté), texte dans une forme, vectoriser le texte (⌘⇧O, opentype.js)
- Plans de travail multiples : liste dans la tuile Page, outil Plan de travail (Maj + O, déplacement avec le contenu), alignement sur le plan, export par plan ou de tous les plans (PDF multipage, ZIP)
- Concepteur de forme (Maj + M) : glisser à travers les zones qui se chevauchent pour les fusionner, Alt pour les effacer
- Contours avancés : extrémités, jointures, pointillés réglables, pointes de flèche début / fin (flèche, triangle, cercle, barre), vectoriser le contour
- Décalage du tracé (positif / négatif) : copie agrandie ou rétrécie placée sous l'original, tracés ouverts entourés
- Symboles (instances liées, redéfinir l'original met à jour toutes les instances) et couleurs globales (modifier la couleur recolore tous les objets liés) — nouvel onglet Symboles
- Import / export avancés : ouverture des PDF et .ai compatibles PDF (pdf.js, une page = un plan de travail, vecteurs ou image), import SVG par glisser-déposer, export SVG optimisé
- Typographie pro : catalogue complet des Google Fonts (recherche, catégories, aperçu, polices récentes), graisse, alignements, interlettrage, interlignage, casse
- Panneau Aspect : plusieurs fonds et contours empilés sur un même objet (couleur, épaisseur, opacité, ordre), exportés en SVG
- Effets de distorsion : déformation par enveloppe (arc, arche, renflement, drapeau, vague, poisson, montée, gonflement, torsion) avec aperçu, et transformation répétée (copies avec décalage, rotation, échelle, fondu)
- Motifs : remplissage « Motif » (pois, rayures, damier, vagues ou motif créé depuis la sélection), échelle, espacement, angle
- Couleurs d'impression : sélecteur CMJN (remplissage et contour) et export PDF avec fonds perdus 3 mm + traits de coupe
- Pinceaux artistiques (Maj + B) : calligraphique (angle et rondeur de plume), à la vitesse, à motif (la sélection répétée le long du trait)
- Dégradés avancés : linéaires ou radiaux à plusieurs arrêts, et dégradé de formes entre deux objets en N étapes (contour, couleurs, épaisseur, opacité)
- IA gratuite : détourage dans le navigateur (@imgly/background-removal, Remove.bg en option), génération d'image Pollinations (sans clé), texte → vecteur (génération + vectorisation automatique)
- Collaboration en temps réel pair à pair (Yjs + y-webrtc) : salon par lien secret chiffré, curseurs des participants, nouveau « Projet partagé » sans toucher aux autres projets ni au coffre
- PWA installable : manifeste, icônes 192 / 512 (et masquable), service worker hors ligne (réseau pour /api), pincer pour zoomer, panneau en tiroir sur mobile, partage natif de l'export

**0.3.0 « Tige » — octobre 2026**
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

**0.2.0 « Pousse » — octobre 2026**
- Coller une image / un texte (⌘V), copier / couper / dupliquer
- Texte : 18 typographies, gras / italique / souligné
- Zoom de la zone de travail, déplacement (Espace), aide des raccourcis (bouton i)

## 🔜 Prochaines (idées, pas encore codées)
| Feature | Impact | Effort | Notes |
| --- | --- | --- | --- |
| **IA : assistant de design** (« décris ton visuel ») | fort | L | Nécessite une API payante (Claude) : non retenu tant que l'app reste 100 % gratuite |
| Jointures en angle vif pour le décalage du tracé / la vectorisation du contour | faible | M | Actuellement arrondies |
| Texte sur tracé → vectorisation directe | faible | S | Il faut détacher le texte du tracé avant de le vectoriser |

## 📋 Non retenues pour l'instant
| Feature | Notes |
| --- | --- |
| Sauvegarde de secours (fichier) | Recommandée : les projets vivent dans le navigateur ; vider ses données de navigation les efface |
| Synchro entre appareils & lien de partage | Netlify Functions + Netlify Blobs ; vérification de la passkey côté serveur |
