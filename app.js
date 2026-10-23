/**
 * ============================================================================
 *  Studio Chloé — MVP d'éditeur vectoriel façon Illustrator
 *  Stack : HTML / CSS / JavaScript vanilla + Fabric.js 5.3
 * ============================================================================
 *
 *  Organisation du fichier :
 *    1.  Configuration (clé API Remove.bg, styles par défaut)
 *    2.  État global & références DOM
 *    3.  Initialisation du canvas Fabric + responsive
 *    4.  Fabrique de formes (ShapeFactory)      ← ajouter de nouvelles formes ici
 *    5.  Outils (Tools) + routage souris         ← ajouter de nouveaux outils ici (ex : Plume / Bézier)
 *    6.  Panneau de propriétés
 *    7.  Import d'images (bouton + glisser-déposer)
 *    7b. Rognage d'image (Cropper)
 *    8.  Détourage via l'API Remove.bg
 *    8b. Historique : annuler / rétablir (History)
 *    9.  Utilitaires : suppression, effacement, export PNG / SVG
 *    10. Thème clair / sombre & barre d'état
 *    11. Raccourcis clavier
 *    12. Helpers génériques
 *    13. Démarrage
 * ============================================================================
 */
'use strict';

/* ============================================================================
   1. CONFIGURATION
   ========================================================================== */

/**
 * 🔑 DÉTOURAGE REMOVE.BG — via une fonction Netlify (clé jamais exposée)
 * Le navigateur n'envoie l'image qu'à NOTRE serveur (/api/remove-bg).
 * La fonction netlify/functions/remove-bg.mjs ajoute la clé, lue dans la
 * variable d'environnement Netlify REMOVE_BG_API_KEY, puis appelle Remove.bg.
 * → Pour changer de clé : Netlify → Site configuration → Environment variables.
 *
 * ⚠️ En ouvrant index.html directement (file://), la fonction n'existe pas :
 *    tester le détourage sur le site déployé, ou en local avec `netlify dev`.
 */
const REMOVE_BG_ENDPOINT = '/api/remove-bg';

/** Au-delà de cette taille, l'image est réduite avant l'envoi (limite des fonctions Netlify ≈ 6 Mo) */
const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
const UPLOAD_MAX_SIDE = 2000;

/**
 * Résolution demandée à Remove.bg :
 *  - 'preview' : basse résolution (≈ 0,25 mégapixel), utilisable avec un compte gratuit
 *  - 'auto' / 'full' : meilleure résolution, consomme des crédits
 * L'image détourée est de toute façon remise aux dimensions affichées sur le canvas.
 */
const REMOVE_BG_SIZE = 'preview';

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg'];

/** Style appliqué aux nouveaux objets (modifiable depuis le panneau) */
const DEFAULT_STYLE = Object.freeze({
  fill: '#d4f04c',
  stroke: '#25300b',
  strokeWidth: 2,
  opacity: 1,
});

const TEXT_DEFAULTS = Object.freeze({
  text: 'Votre texte',
  fontFamily: 'Outfit',
  fontSize: 40,
  fill: '#25300b', // couleur de départ lisible sur fond blanc (modifiable ensuite dans le panneau)
});

const CANVAS_BG = '#ffffff';
const MIN_DRAG_SIZE = 4;       // px — en dessous, un simple clic crée une forme de taille par défaut
const CLICK_SHAPE_SIZE = 120;  // px — taille de la forme créée par simple clic
const IMAGE_MAX_RATIO = 0.6;   // une image importée occupe au maximum 60 % du canvas
const EXPORT_MULTIPLIER = 2;   // export PNG en haute définition (@2x)

const TOOL_LABELS = {
  select: 'Sélection',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  brush: 'Pinceau',
  text: 'Texte',
};

const TYPE_LABELS = {
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  path: 'Tracé',
  'i-text': 'Texte',
  textbox: 'Texte',
  text: 'Texte',
  image: 'Image',
};

/* ============================================================================
   2. ÉTAT GLOBAL & RÉFÉRENCES DOM
   ========================================================================== */

const state = {
  tool: 'select',            // outil actif
  style: { ...DEFAULT_STYLE }, // style courant (suit le dernier réglage, comme dans Illustrator)
  drawing: null,             // forme en cours de tracé : { obj, origin }
  isRemovingBg: false,       // requête Remove.bg en cours
  cropping: null,            // rognage en cours : { img, rect, saved }
};

const $ = (selector) => document.querySelector(selector);

const dom = {
  stage: $('#stage'),
  canvasWrap: $('#canvas-wrap'),
  emptyState: $('#empty-state'),
  fileInput: $('#file-input'),
  toolButtons: document.querySelectorAll('[data-tool]'),
  themeButtons: document.querySelectorAll('[data-theme-set]'),

  btnImport: $('#btn-import'),
  btnClear: $('#btn-clear'),
  btnExportPng: $('#btn-export-png'),
  btnExportSvg: $('#btn-export-svg'),
  exportTransparent: $('#export-transparent'),

  statusTool: $('#status-tool'),
  statusCount: $('#status-count'),
  statusSize: $('#status-size'),

  selType: $('#sel-type'),
  panelHint: $('#panel-hint'),
  rowFill: $('#row-fill'),
  propFill: $('#prop-fill'),
  propFillNone: $('#prop-fill-none'),
  hexFill: $('#hex-fill'),
  propStroke: $('#prop-stroke'),
  propStrokeNone: $('#prop-stroke-none'),
  hexStroke: $('#hex-stroke'),
  propStrokeWidth: $('#prop-stroke-width'),
  outStrokeWidth: $('#out-stroke-width'),
  propOpacity: $('#prop-opacity'),
  outOpacity: $('#out-opacity'),

  sectionText: $('#section-text'),
  propFontFamily: $('#prop-font-family'),
  propFontSize: $('#prop-font-size'),

  btnRemoveBg: $('#btn-remove-bg'),
  btnRemoveBgLabel: $('#btn-remove-bg-label'),
  imageNote: $('#image-note'),
  imageTitle: $('#image-title'),
  btnCrop: $('#btn-crop'),
  btnCropTool: $('#btn-crop-tool'),
  cropActions: $('#crop-actions'),
  btnCropApply: $('#btn-crop-apply'),
  btnCropCancel: $('#btn-crop-cancel'),
  sectionAppearance: $('#section-appearance'),
  sectionArrange: $('#section-arrange'),

  btnUndo: $('#btn-undo'),
  btnRedo: $('#btn-redo'),

  btnFront: $('#btn-front'),
  btnBack: $('#btn-back'),
  btnDelete: $('#btn-delete'),

  toast: $('#toast'),
};

/* ============================================================================
   3. CANVAS FABRIC
   ========================================================================== */

const canvas = new fabric.Canvas('c', {
  backgroundColor: CANVAS_BG,
  preserveObjectStacking: true, // l'objet sélectionné ne passe pas automatiquement au premier plan
  selectionColor: 'rgba(212, 240, 76, 0.18)',
  selectionBorderColor: '#7c9425',
  selectionLineWidth: 1,
  stopContextMenu: true,
});

// Apparence des poignées de transformation (appliquée à tous les objets)
fabric.Object.prototype.set({
  transparentCorners: false,
  cornerColor: '#d4f04c',
  cornerStrokeColor: '#25300b',
  borderColor: '#7c9425',
  cornerSize: 10,
  cornerStyle: 'circle',
  borderScaleFactor: 1.5,
  padding: 2,
});

/** Ajuste la taille du canvas à son conteneur (appelé à chaque redimensionnement) */
function resizeCanvasToContainer() {
  const { clientWidth, clientHeight } = dom.canvasWrap;
  if (!clientWidth || !clientHeight) return;
  canvas.setDimensions({ width: clientWidth, height: clientHeight });
  canvas.calcOffset();
  canvas.requestRenderAll();
  updateStatus();
}

/* ============================================================================
   4. FABRIQUE DE FORMES
   ----------------------------------------------------------------------------
   Chaque entrée décrit une forme « traçable » au cliquer-glisser :
     - create(point) : crée l'objet Fabric (taille nulle) au point d'ancrage
     - update(obj, box) : met à jour la géométrie à partir d'un rectangle
                          englobant { left, top, width, height }

   ➕ Pour ajouter une forme (triangle, étoile, polygone…) :
     1. ajoutez une entrée ici, par exemple :
          triangle: {
            create: (p) => new fabric.Triangle({ left: p.x, top: p.y, width: 0, height: 0, ...shapeStyle() }),
            update: (obj, b) => obj.set(b),
          },
     2. déclarez l'outil dans le registre `Tools` : triangle: createDragShapeTool('triangle')
     3. ajoutez un bouton data-tool="triangle" dans index.html
   ========================================================================== */

const ShapeFactory = {
  rect: {
    create: (p) => new fabric.Rect({ left: p.x, top: p.y, width: 0, height: 0, ...shapeStyle() }),
    update: (obj, b) => obj.set({ left: b.left, top: b.top, width: b.width, height: b.height }),
  },
  ellipse: {
    create: (p) => new fabric.Ellipse({ left: p.x, top: p.y, rx: 0, ry: 0, ...shapeStyle() }),
    // Une ellipse Fabric est définie par ses rayons : on les déduit du rectangle englobant
    update: (obj, b) => obj.set({ left: b.left, top: b.top, rx: b.width / 2, ry: b.height / 2 }),
  },
};

/** Propriétés de style communes à toutes les formes, issues du style courant */
function shapeStyle() {
  const s = state.style;
  return {
    fill: s.fill,
    stroke: s.stroke,
    strokeWidth: s.strokeWidth,
    opacity: s.opacity,
    strokeUniform: true, // le contour garde son épaisseur quand on redimensionne
  };
}

/**
 * Calcule le rectangle englobant entre le point d'origine et la souris.
 * Gère le tracé dans toutes les directions et la contrainte Maj (carré / cercle).
 */
function getDragBox(origin, pointer, constrain) {
  let w = pointer.x - origin.x;
  let h = pointer.y - origin.y;
  if (constrain) {
    const size = Math.max(Math.abs(w), Math.abs(h));
    w = Math.sign(w || 1) * size;
    h = Math.sign(h || 1) * size;
  }
  return {
    left: Math.min(origin.x, origin.x + w),
    top: Math.min(origin.y, origin.y + h),
    width: Math.abs(w),
    height: Math.abs(h),
  };
}

/* ============================================================================
   5. OUTILS
   ----------------------------------------------------------------------------
   Registre des outils. Chaque outil peut implémenter :
     cursor                       — curseur CSS sur le canvas
     activate()                   — appelé quand l'outil devient actif
     deactivate()                 — appelé quand on quitte l'outil
     onMouseDown(pointer, event)  — pointer = coordonnées dans le canvas
     onMouseMove(pointer, event)
     onMouseUp(pointer, event)

   💡 Exemple d'extension — un outil « Plume » (courbes de Bézier) :
     pen: {
       cursor: 'crosshair',
       activate() { setInteractionMode('draw'); this.points = []; },
       onMouseDown(p) {
         // Ajoute un point d'ancrage
         this.points.push({ anchor: p, handleOut: p });
       },
       onMouseMove(p, e) {
         // Si le bouton est enfoncé : la position de la souris définit la poignée
         // de contrôle sortante du dernier point (comme la Plume d'Illustrator)
       },
       deactivate() {
         // Construit la chaîne SVG : 'M x0 y0 C c1x c1y c2x c2y x1 y1 …'
         // puis canvas.add(new fabric.Path(d, shapeStyle()))
       },
     }
   ========================================================================== */

const Tools = {
  select: {
    cursor: 'default',
    activate() { setInteractionMode('select'); },
  },

  rect: createDragShapeTool('rect'),
  ellipse: createDragShapeTool('ellipse'),

  brush: {
    cursor: 'crosshair',
    activate() {
      canvas.discardActiveObject(); // le panneau pilote alors la couleur / l'épaisseur du pinceau
      setInteractionMode('brush');
      updateBrush();
    },
    deactivate() { canvas.isDrawingMode = false; },
  },

  text: {
    cursor: 'text',
    activate() { setInteractionMode('draw'); },
    // Création au relâchement : évite que Fabric n'interprète la fin du clic sur le nouveau texte
    onMouseUp(p) {
      const text = new fabric.IText(TEXT_DEFAULTS.text, {
        left: p.x,
        top: p.y,
        fontFamily: TEXT_DEFAULTS.fontFamily,
        fontSize: TEXT_DEFAULTS.fontSize,
        fill: TEXT_DEFAULTS.fill,
        opacity: state.style.opacity,
      });
      canvas.add(text);
      setTool('select');
      canvas.setActiveObject(text);
      text.enterEditing();
      text.selectAll();
      canvas.requestRenderAll();
    },
  },
};

/**
 * Génère un outil « cliquer-glisser » pour n'importe quelle forme de ShapeFactory.
 * Cycle : mousedown → crée la forme | mousemove → l'agrandit | mouseup → la finalise.
 */
function createDragShapeTool(kind) {
  const shape = ShapeFactory[kind];

  return {
    cursor: 'crosshair',

    activate() { setInteractionMode('draw'); },

    deactivate() { cancelDrawing(); },

    onMouseDown(p) {
      const obj = shape.create(p);
      obj.set({ selectable: false, evented: false }); // inerte pendant le tracé
      state.drawing = { obj, origin: p }; // défini AVANT add : l'historique ignore la forme en cours
      canvas.add(obj);
    },

    onMouseMove(p, e) {
      if (!state.drawing) return;
      shape.update(state.drawing.obj, getDragBox(state.drawing.origin, p, e.shiftKey));
      canvas.requestRenderAll();
    },

    onMouseUp(p, e) {
      if (!state.drawing) return;
      const { obj, origin } = state.drawing;
      state.drawing = null;

      let box = getDragBox(origin, p, e.shiftKey);

      // Simple clic sans glisser : forme de taille par défaut centrée sur le clic
      if (box.width < MIN_DRAG_SIZE && box.height < MIN_DRAG_SIZE) {
        box = {
          left: origin.x - CLICK_SHAPE_SIZE / 2,
          top: origin.y - CLICK_SHAPE_SIZE / 2,
          width: CLICK_SHAPE_SIZE,
          height: CLICK_SHAPE_SIZE,
        };
      }

      shape.update(obj, box);
      obj.set({ selectable: true, evented: true });
      obj.setCoords();               // recalcule les poignées de transformation
      canvas.setActiveObject(obj);   // sélectionne la forme pour l'éditer dans le panneau
      canvas.requestRenderAll();
      History.queue();               // la forme terminée devient une étape annulable
    },
  };
}

/** Annule une forme en cours de tracé (Échap, changement d'outil) */
function cancelDrawing() {
  if (!state.drawing) return;
  canvas.remove(state.drawing.obj);
  state.drawing = null;
}

/**
 * Configure le comportement de Fabric selon le type d'outil :
 *  - 'select' : sélection et transformation des objets
 *  - 'draw'   : la souris trace, les objets existants ne réagissent pas
 *  - 'brush'  : dessin libre natif de Fabric
 */
function setInteractionMode(mode) {
  canvas.isDrawingMode = mode === 'brush';
  canvas.selection = mode === 'select';
  canvas.skipTargetFind = mode !== 'select';
}

/** Active un outil (bouton du rail, raccourci clavier…) */
function setTool(name) {
  const tool = Tools[name];
  if (!tool) return;
  if (state.cropping) Cropper.cancel(); // changer d'outil abandonne un rognage en cours

  if (state.tool !== name) Tools[state.tool]?.deactivate?.();
  state.tool = name;
  tool.activate?.();

  canvas.defaultCursor = tool.cursor || 'default';
  canvas.hoverCursor = name === 'select' ? 'move' : (tool.cursor || 'default');

  dom.toolButtons.forEach((btn) => {
    const active = btn.dataset.tool === name;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
  });

  canvas.requestRenderAll();
  Properties.sync();
  updateStatus();
}

/** Pinceau : couleur = contour courant (ou remplissage si contour « Aucun ») */
function updateBrush() {
  if (!(canvas.freeDrawingBrush instanceof fabric.PencilBrush)) {
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
  }
  const brush = canvas.freeDrawingBrush;
  brush.color = state.style.stroke || state.style.fill || '#25300b';
  brush.width = Math.max(1, state.style.strokeWidth);
  brush.decimate = 1.5; // simplifie légèrement le tracé (moins de points)
}

/** Transmet les événements souris du canvas à l'outil actif */
function routeToTool(handlerName, opt) {
  if (canvas.isDrawingMode) return; // le pinceau est géré nativement par Fabric
  const handler = Tools[state.tool]?.[handlerName];
  if (handler) handler.call(Tools[state.tool], canvas.getPointer(opt.e), opt.e);
}

function bindCanvasEvents() {
  canvas.on('mouse:down', (opt) => routeToTool('onMouseDown', opt));
  canvas.on('mouse:move', (opt) => routeToTool('onMouseMove', opt));
  canvas.on('mouse:up', (opt) => routeToTool('onMouseUp', opt));

  // Finalisation d'un tracé au pinceau
  canvas.on('path:created', ({ path }) => {
    path.set({
      fill: null,
      strokeUniform: true,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      opacity: state.style.opacity,
    });
    canvas.requestRenderAll();
    History.queue();
  });

  // Double-clic sur une image : rognage
  canvas.on('mouse:dblclick', ({ target }) => {
    if (state.tool === 'select' && !state.cropping && isImage(target)) Cropper.start(target);
  });

  // Toute modification du document alimente l'historique (regroupée par History.queue)
  ['object:added', 'object:removed', 'object:modified']
    .forEach((evt) => canvas.on(evt, () => History.queue()));

  // Le panneau de propriétés suit la sélection
  ['selection:created', 'selection:updated', 'selection:cleared', 'object:modified']
    .forEach((evt) => canvas.on(evt, () => Properties.sync()));

  // Barre d'état et état vide
  ['object:added', 'object:removed'].forEach((evt) => canvas.on(evt, updateStatus));
}

/* ============================================================================
   6. PANNEAU DE PROPRIÉTÉS
   ----------------------------------------------------------------------------
   - Avec une sélection : les réglages modifient le(s) objet(s) sélectionné(s)
   - Sans sélection     : ils définissent le style des prochains objets
   ========================================================================== */

const Properties = {
  /** Met à jour l'affichage du panneau selon la sélection courante */
  sync() {
    // Mode rognage : le panneau n'affiche que Valider / Annuler
    const cropping = Boolean(state.cropping);
    dom.cropActions.hidden = !cropping;
    dom.btnCrop.hidden = cropping;
    dom.btnRemoveBg.hidden = cropping;
    dom.sectionAppearance.classList.toggle('is-disabled', cropping);
    dom.sectionArrange.classList.toggle('is-disabled', cropping);
    dom.btnCropTool.classList.toggle('is-cropping', cropping);
    if (cropping) {
      dom.selType.textContent = 'Rognage';
      dom.panelHint.hidden = true;
      dom.sectionText.hidden = true;
      dom.imageTitle.textContent = 'Rognage';
      dom.imageNote.textContent = 'Déplacez ou redimensionnez le cadre, puis validez.';
      dom.btnCropTool.disabled = false;
      return;
    }
    dom.imageTitle.textContent = 'Image';

    const objects = canvas.getActiveObjects();
    const hasSelection = objects.length > 0;
    const ref = hasSelection ? objects[0] : null; // objet de référence pour l'affichage
    const single = objects.length === 1;

    // En-tête
    dom.selType.textContent = !hasSelection
      ? 'Aucune sélection'
      : single ? (TYPE_LABELS[ref.type] || 'Objet') : `${objects.length} objets`;
    dom.panelHint.hidden = hasSelection;

    // Couleurs, épaisseur, opacité
    setColorField(dom.propFill, dom.propFillNone, dom.hexFill, ref ? ref.fill : state.style.fill);
    setColorField(dom.propStroke, dom.propStrokeNone, dom.hexStroke, ref ? ref.stroke : state.style.stroke);

    const strokeWidth = Math.round(ref ? (ref.strokeWidth || 0) : state.style.strokeWidth);
    dom.propStrokeWidth.value = strokeWidth;
    dom.outStrokeWidth.textContent = `${strokeWidth} px`;
    paintRange(dom.propStrokeWidth);

    const opacity = Math.round((ref ? ref.opacity : state.style.opacity) * 100);
    dom.propOpacity.value = opacity;
    dom.outOpacity.textContent = `${opacity} %`;
    paintRange(dom.propOpacity);

    // Le remplissage n'a pas de sens pour une image
    dom.rowFill.classList.toggle('is-disabled', hasSelection && objects.every(isImage));

    // Réglages de texte
    const textObj = single && isText(ref) ? ref : null;
    dom.sectionText.hidden = !textObj;
    if (textObj) {
      dom.propFontFamily.value = textObj.fontFamily;
      dom.propFontSize.value = Math.round(textObj.fontSize);
    }

    // Détourage : actif uniquement si UNE image est sélectionnée
    const singleImage = single && isImage(ref);
    dom.btnRemoveBg.disabled = !singleImage || state.isRemovingBg;
    dom.btnCrop.disabled = !singleImage || state.isRemovingBg;
    dom.btnCropTool.disabled = !singleImage || state.isRemovingBg;
    if (!state.isRemovingBg) {
      dom.imageNote.textContent = singleImage
        ? 'Rognez-la, ou supprimez son arrière-plan via Remove.bg.'
        : 'Sélectionnez une image pour la rogner ou la détourer.';
    }

    // Disposition
    [dom.btnFront, dom.btnBack, dom.btnDelete].forEach((btn) => { btn.disabled = !hasSelection; });
  },

  /** Applique une propriété à la sélection (et au style courant) */
  apply(prop, value) {
    if (prop in state.style) state.style[prop] = value;

    const objects = canvas.getActiveObjects();
    objects.forEach((obj) => {
      if (prop === 'fill' && isImage(obj)) return;                 // pas de remplissage sur une image
      if (prop === 'fill' && value === null && isText(obj)) return; // un texte doit rester visible
      obj.set(prop, value);
      obj.setCoords(); // l'épaisseur du contour ou la taille de police changent la boîte englobante
    });
    canvas.getActiveObject()?.setCoords();

    updateBrush();
    canvas.requestRenderAll();
    if (objects.length) History.queue(); // les curseurs sont regroupés en une seule étape
  },

  bind() {
    // Remplissage
    dom.propFill.addEventListener('input', (e) => {
      dom.propFillNone.checked = false;
      dom.hexFill.textContent = e.target.value;
      this.apply('fill', e.target.value);
    });
    dom.propFillNone.addEventListener('change', (e) => {
      this.apply('fill', e.target.checked ? null : dom.propFill.value);
      this.sync();
    });

    // Contour
    dom.propStroke.addEventListener('input', (e) => {
      dom.propStrokeNone.checked = false;
      dom.hexStroke.textContent = e.target.value;
      this.apply('stroke', e.target.value);
    });
    dom.propStrokeNone.addEventListener('change', (e) => {
      this.apply('stroke', e.target.checked ? null : dom.propStroke.value);
      this.sync();
    });

    // Épaisseur
    dom.propStrokeWidth.addEventListener('input', (e) => {
      const value = Number(e.target.value);
      dom.outStrokeWidth.textContent = `${value} px`;
      paintRange(e.target);
      this.apply('strokeWidth', value);
    });

    // Opacité
    dom.propOpacity.addEventListener('input', (e) => {
      const value = Number(e.target.value);
      dom.outOpacity.textContent = `${value} %`;
      paintRange(e.target);
      this.apply('opacity', value / 100);
    });

    // Texte
    dom.propFontFamily.addEventListener('change', (e) => this.apply('fontFamily', e.target.value));
    dom.propFontSize.addEventListener('input', (e) => {
      const size = clamp(Number(e.target.value) || 0, 6, 400);
      if (size) this.apply('fontSize', size);
    });
  },
};

/** Affiche une couleur Fabric dans un sélecteur (ou « Aucun » si absente) */
function setColorField(colorInput, noneCheckbox, hexLabel, color) {
  const hex = toHex(color);
  noneCheckbox.checked = !hex;
  if (hex) colorInput.value = hex;
  hexLabel.textContent = hex || 'Aucun';
}

/** Colore la partie « remplie » d'un curseur range */
function paintRange(input) {
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 100;
  const pct = ((Number(input.value) - min) / (max - min)) * 100;
  input.style.setProperty('--pct', `${pct}%`);
}

/* ============================================================================
   7. IMPORT D'IMAGES
   ========================================================================== */

const ImageImporter = {
  openFileDialog() {
    dom.fileInput.value = ''; // permet de réimporter le même fichier
    dom.fileInput.click();
  },

  /** Importe une liste de fichiers (input file ou glisser-déposer) */
  async importFiles(fileList, dropPoint = null) {
    const files = [...fileList].filter((f) => ACCEPTED_IMAGE_TYPES.includes(f.type));
    if (!files.length) {
      toast('Format non supporté : utilisez des images JPG ou PNG.', 'error');
      return;
    }

    let lastImage = null;
    for (const [index, file] of files.entries()) {
      try {
        // Data URL (et non blob:) : l'image reste intégrée dans l'export SVG
        const dataUrl = await readFileAsDataURL(file);
        const img = await loadFabricImage(dataUrl);
        this.placeImage(img, dropPoint, index);
        lastImage = img;
      } catch (err) {
        console.error(err);
        toast(`Impossible de charger « ${file.name} ».`, 'error');
      }
    }

    if (lastImage) {
      setTool('select');
      canvas.setActiveObject(lastImage);
      canvas.requestRenderAll();
    }
  },

  /** Réduit l'image si nécessaire puis la centre sur le point de dépôt (ou le centre du canvas) */
  placeImage(img, point, index = 0) {
    const cw = canvas.getWidth();
    const ch = canvas.getHeight();
    const scale = Math.min(1, (cw * IMAGE_MAX_RATIO) / img.width, (ch * IMAGE_MAX_RATIO) / img.height);
    const center = point || { x: cw / 2, y: ch / 2 };
    const offset = index * 24; // décale les imports multiples

    img.set({
      scaleX: scale,
      scaleY: scale,
      left: center.x - (img.width * scale) / 2 + offset,
      top: center.y - (img.height * scale) / 2 + offset,
      strokeWidth: 0,
      stroke: null,
      strokeUniform: true,
    });
    canvas.add(img);
  },

  bindDragAndDrop() {
    let depth = 0; // compteur pour gérer les dragenter/dragleave des éléments enfants
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');

    dom.stage.addEventListener('dragenter', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth += 1;
      dom.stage.classList.add('is-dragover');
    });

    dom.stage.addEventListener('dragover', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    dom.stage.addEventListener('dragleave', (e) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) dom.stage.classList.remove('is-dragover');
    });

    dom.stage.addEventListener('drop', (e) => {
      e.preventDefault();
      depth = 0;
      dom.stage.classList.remove('is-dragover');
      if (!e.dataTransfer?.files?.length) return;

      // Position du dépôt convertie en coordonnées canvas (bornée à la zone visible)
      const p = canvas.getPointer(e);
      const point = {
        x: clamp(p.x, 0, canvas.getWidth()),
        y: clamp(p.y, 0, canvas.getHeight()),
      };
      this.importFiles(e.dataTransfer.files, point);
    });

    // Empêche le navigateur d'ouvrir l'image si elle est lâchée hors de la zone
    ['dragover', 'drop'].forEach((type) => window.addEventListener(type, (e) => e.preventDefault()));
  },
};

/* ============================================================================
   7b. ROGNAGE D'IMAGE
   ----------------------------------------------------------------------------
   Principe (non destructif) :
     - Fabric affiche une image via cropX / cropY (coin haut-gauche de la zone
       visible, en pixels de l'image source) et width / height (taille de cette zone).
     - On pose un cadre (fabric.Rect) par-dessus l'image, avec la même rotation.
     - À la validation, on ramène le cadre dans le repère local de l'image
       (inverse de sa matrice de transformation), on l'intersecte avec l'image,
       puis on met à jour cropX / cropY / width / height.
     - L'image source reste entière : un nouveau rognage peut réagrandir la zone.
   Fonctionne aussi sur une image tournée ou retournée (flip), car tout le calcul
   se fait dans le repère local de l'image.
   ========================================================================== */

const Cropper = {
  start(img = canvas.getActiveObject()) {
    if (!isImage(img) || state.cropping || state.isRemovingBg) return;
    History.flush();

    // Cadre initial = image entière, même centre, même rotation
    const rect = new fabric.Rect({
      originX: 'center',
      originY: 'center',
      width: img.width * Math.abs(img.scaleX),
      height: img.height * Math.abs(img.scaleY),
      angle: img.angle,
      fill: 'rgba(212, 240, 76, 0.14)',
      stroke: '#7c9425',
      strokeWidth: 1.5,
      strokeDashArray: [6, 4],
      strokeUniform: true,
      cornerStyle: 'rect',
      cornerColor: '#25300b',
      cornerStrokeColor: '#d4f04c',
      lockRotation: true,
      lockScalingFlip: true,
      excludeFromExport: true,
    });
    rect.setControlVisible('mtr', false); // pas de poignée de rotation
    rect.setPositionByOrigin(img.getCenterPoint(), 'center', 'center');

    // On fige les autres objets pendant le rognage (états mémorisés pour les restaurer)
    const saved = canvas.getObjects().map((o) => [o, o.selectable, o.evented]);
    canvas.getObjects().forEach((o) => o.set({ selectable: false, evented: false }));

    state.cropping = { img, rect, saved, selection: canvas.selection };
    canvas.selection = false;
    canvas.discardActiveObject();
    canvas.add(rect);
    canvas.setActiveObject(rect);
    canvas.requestRenderAll();

    dom.statusTool.textContent = 'Rognage';
    Properties.sync();
  },

  apply() {
    if (!state.cropping) return;
    const { img, rect } = state.cropping;

    // 1. Centre et taille du cadre dans le repère local de l'image
    const matrix = img.calcTransformMatrix();
    const local = fabric.util.transformPoint(rect.getCenterPoint(), fabric.util.invertTransform(matrix));
    const w = (rect.width * rect.scaleX) / Math.abs(img.scaleX);
    const h = (rect.height * rect.scaleY) / Math.abs(img.scaleY);

    // 2. Intersection avec la zone visible de l'image ([-width/2, width/2] en local)
    const x0 = Math.max(-img.width / 2, local.x - w / 2);
    const x1 = Math.min(img.width / 2, local.x + w / 2);
    const y0 = Math.max(-img.height / 2, local.y - h / 2);
    const y1 = Math.min(img.height / 2, local.y + h / 2);

    if (x1 - x0 < 2 || y1 - y0 < 2) {
      toast("Le cadre ne recouvre pas l'image : rognage annulé.", 'error');
      this.cancel();
      return;
    }

    // 3. Nouveau centre (en coordonnées canvas), calculé AVANT de modifier l'image
    const newCenter = fabric.util.transformPoint({ x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, matrix);

    this.end(); // retire le cadre et restaure les objets

    // 4. Mise à jour de la zone affichée + repositionnement
    img.set({
      cropX: img.cropX + (x0 + img.width / 2),
      cropY: img.cropY + (y0 + img.height / 2),
      width: x1 - x0,
      height: y1 - y0,
    });
    img.setPositionByOrigin(newCenter, 'center', 'center');
    img.setCoords();
    canvas.setActiveObject(img);
    canvas.requestRenderAll();

    History.queue();
    Properties.sync();
    toast('Image rognée', 'success');
  },

  cancel() {
    if (!state.cropping) return;
    const { img } = state.cropping;
    this.end();
    canvas.setActiveObject(img);
    canvas.requestRenderAll();
    Properties.sync();
  },

  /** Nettoyage commun : retire le cadre, restaure la sélection des objets */
  end() {
    const { rect, saved, selection } = state.cropping;
    canvas.discardActiveObject();
    canvas.remove(rect);                 // ignoré par l'historique (state.cropping encore défini)
    saved.forEach(([o, selectable, evented]) => o.set({ selectable, evented }));
    canvas.selection = selection;
    state.cropping = null;
    updateStatus();
  },
};

/* ============================================================================
   8. DÉTOURAGE — API REMOVE.BG
   ----------------------------------------------------------------------------
   Déroulé complet :
     1. On récupère les pixels de l'image sélectionnée sous forme de Blob
     2. On les envoie à Remove.bg (POST multipart/form-data, clé dans X-Api-Key)
     3. L'API renvoie directement un PNG transparent (binaire)
     4. On le convertit en Data URL et on le charge comme image Fabric
     5. On remplace l'image d'origine en recopiant position, taille, rotation…
   Documentation : https://www.remove.bg/api
   ========================================================================== */

const BackgroundRemover = {
  async removeFromSelection() {
    const target = canvas.getActiveObject();
    if (!isImage(target) || state.isRemovingBg) return;

    if (location.protocol === 'file:') {
      toast('Le détourage fonctionne sur le site en ligne (Netlify), pas en ouvrant le fichier en local.', 'error', 6000);
      return;
    }

    this.setLoading(true);
    try {
      // Étape 1 — pixels source (réduits si le fichier est trop lourd pour la fonction)
      const sourceBlob = await shrinkIfTooLarge(await imageObjectToBlob(target));

      // Étapes 2 & 3 — appel API, réponse = PNG détouré
      const resultBlob = await callRemoveBgApi(sourceBlob);

      // Étape 4 — Data URL (et non blob:) pour rester intégrable dans l'export SVG
      const dataUrl = await readFileAsDataURL(resultBlob);
      const cutout = await loadFabricImage(dataUrl);

      // L'utilisateur a pu supprimer l'image pendant la requête
      if (!canvas.getObjects().includes(target)) {
        toast("L'image a été supprimée pendant le détourage : résultat ignoré.");
        return;
      }

      // Étape 5 — remplacement à l'identique
      replaceImagePreservingTransform(target, cutout);
      toast('Arrière-plan supprimé', 'success');
    } catch (err) {
      console.error('[Remove.bg]', err);
      toast(err.message || 'Échec du détourage.', 'error', 6000);
    } finally {
      this.setLoading(false);
    }
  },

  /** État de chargement visuel : spinner + libellé + bouton désactivé */
  setLoading(isLoading) {
    state.isRemovingBg = isLoading;
    dom.btnRemoveBg.classList.toggle('is-loading', isLoading);
    dom.btnRemoveBg.setAttribute('aria-busy', String(isLoading));
    dom.btnRemoveBgLabel.textContent = isLoading ? 'Détourage en cours…' : "Détourer l'image";
    if (isLoading) dom.imageNote.textContent = 'Envoi à Remove.bg, quelques secondes…';
    Properties.sync();
  },
};

/**
 * Récupère les pixels d'origine (pleine résolution) d'une image Fabric.
 * - Cas normal : la source est une Data URL → fetch() la convertit en Blob
 *   sans perte (on renvoie le fichier d'origine, JPG ou PNG).
 * - Repli : on redessine l'image dans un canvas hors écran.
 */
async function imageObjectToBlob(imgObj) {
  const el = imgObj._originalElement || imgObj.getElement();
  const naturalW = el.naturalWidth || el.width;
  const naturalH = el.naturalHeight || el.height;

  // Image rognée ? On n'envoie que la zone visible, pour que le résultat
  // corresponde exactement à ce qui est affiché.
  const isCropped = imgObj.cropX > 0 || imgObj.cropY > 0
    || Math.round(imgObj.width) < naturalW || Math.round(imgObj.height) < naturalH;

  const src = imgObj.getSrc();
  if (!isCropped && src && (src.startsWith('data:') || src.startsWith('blob:'))) {
    const res = await fetch(src);
    return res.blob();
  }

  const width = Math.round(imgObj.width);
  const height = Math.round(imgObj.height);
  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  off.getContext('2d').drawImage(el, imgObj.cropX, imgObj.cropY, width, height, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    off.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Impossible de lire les pixels de l'image."))),
      'image/png',
    );
  });
}

/**
 * Réduit une image trop lourde pour transiter par la fonction Netlify.
 * Le résultat est de toute façon réaffiché aux dimensions de l'image sur le canvas.
 */
async function shrinkIfTooLarge(blob) {
  if (blob.size <= UPLOAD_MAX_BYTES) return blob;
  const bitmap = await createImageBitmap(blob);
  const ratio = Math.min(1, UPLOAD_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const off = document.createElement('canvas');
  off.width = Math.round(bitmap.width * ratio);
  off.height = Math.round(bitmap.height * ratio);
  off.getContext('2d').drawImage(bitmap, 0, 0, off.width, off.height);
  bitmap.close?.();
  return new Promise((resolve, reject) => {
    off.toBlob((b) => (b ? resolve(b) : reject(new Error("Impossible de réduire l'image."))), 'image/png');
  });
}

/**
 * Envoie l'image à la fonction Netlify (qui relaie à Remove.bg) et renvoie le PNG détouré (Blob).
 * @param {Blob} imageBlob — image source
 * @returns {Promise<Blob>}
 */
async function callRemoveBgApi(imageBlob) {
  // 1. Corps multipart/form-data
  const formData = new FormData();
  formData.append('image_file', imageBlob, 'source');
  formData.append('size', REMOVE_BG_SIZE);
  formData.append('format', 'png'); // PNG = conserve la transparence

  // 2. Envoi à notre fonction Netlify (aucune clé côté navigateur).
  //    On ne définit PAS Content-Type : le navigateur l'ajoute
  //    automatiquement avec le « boundary » nécessaire au multipart.
  let response;
  try {
    response = await fetch(REMOVE_BG_ENDPOINT, {
      method: 'POST',
      body: formData,
    });
  } catch (networkError) {
    // Erreur réseau, hors-ligne, ou requête bloquée par le navigateur (CORS / extension)
    throw new Error('Impossible de joindre Remove.bg : vérifiez votre connexion.');
  }

  // 3. Erreurs HTTP : Remove.bg renvoie un JSON { errors: [{ title, code }] }
  if (!response.ok) {
    throw new Error(await describeRemoveBgError(response));
  }

  // 4. Succès : le corps de la réponse EST l'image PNG
  return response.blob();
}

/** Traduit une erreur Remove.bg en message lisible */
async function describeRemoveBgError(response) {
  let apiMessage = '';
  try {
    const data = await response.json();
    apiMessage = (data?.errors || []).map((e) => e.title).filter(Boolean).join(' — ');
  } catch { /* corps non JSON : on garde le message générique */ }

  const known = {
    400: 'Requête refusée par Remove.bg',
    402: 'Crédits Remove.bg épuisés',
    403: 'Clé API invalide ou non autorisée',
    404: 'Fonction de détourage introuvable (site non déployé sur Netlify ?)',
    413: 'Image trop lourde',
    500: 'Erreur du serveur de détourage',
    429: 'Trop de requêtes, patientez quelques secondes',
  };
  const base = known[response.status] || `Erreur Remove.bg (${response.status})`;
  return apiMessage ? `${base} : ${apiMessage}` : base;
}

/**
 * Remplace une image par une autre en conservant exactement sa transformation :
 * position, origine, rotation, miroirs, inclinaison, opacité, contour,
 * ordre d'empilement et dimensions AFFICHÉES (même si la résolution diffère).
 */
function replaceImagePreservingTransform(oldImg, newImg) {
  // Dimensions affichées = taille intrinsèque × échelle (sans l'épaisseur du contour)
  const displayWidth = oldImg.width * oldImg.scaleX;
  const displayHeight = oldImg.height * oldImg.scaleY;

  newImg.set({
    left: oldImg.left,
    top: oldImg.top,
    originX: oldImg.originX,
    originY: oldImg.originY,
    angle: oldImg.angle,
    flipX: oldImg.flipX,
    flipY: oldImg.flipY,
    skewX: oldImg.skewX,
    skewY: oldImg.skewY,
    opacity: oldImg.opacity,
    stroke: oldImg.stroke,
    strokeWidth: oldImg.strokeWidth,
    strokeUniform: true,
    scaleX: displayWidth / newImg.width,
    scaleY: displayHeight / newImg.height,
  });

  const index = canvas.getObjects().indexOf(oldImg);
  canvas.discardActiveObject();
  canvas.remove(oldImg);
  canvas.insertAt(newImg, index); // même place dans la pile des calques
  newImg.setCoords();
  canvas.setActiveObject(newImg);
  canvas.requestRenderAll();
}

/* ============================================================================
   8b. HISTORIQUE — ANNULER / RÉTABLIR
   ----------------------------------------------------------------------------
   Pile d'instantanés JSON du canvas (canvas.toJSON). Simple et robuste :
     - History.queue()  : demande un enregistrement ; les demandes rapprochées
                          (curseur qu'on glisse, suppression multiple…) sont
                          regroupées en UNE étape grâce à un court délai.
     - History.undo() / redo() : rechargent l'instantané précédent / suivant.
   Les objets temporaires (forme en cours de tracé, cadre de rognage) ne sont
   jamais enregistrés.
   💡 Pour un document très lourd (beaucoup d'images), on pourrait stocker des
      différences plutôt que des instantanés complets.
   ========================================================================== */

const History = {
  MAX_STEPS: 60,
  DEBOUNCE_MS: 160,
  stack: [],
  index: -1,
  restoring: false,
  timer: null,

  init() {
    this.stack = [this.snapshot()];
    this.index = 0;
    this.updateButtons();
  },

  snapshot() {
    return JSON.stringify(canvas.toJSON());
  },

  /** Les états temporaires ne doivent pas créer d'étape */
  isPaused() {
    return this.restoring || Boolean(state.drawing) || Boolean(state.cropping);
  },

  queue() {
    if (this.isPaused()) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.commit(), this.DEBOUNCE_MS);
  },

  commit() {
    clearTimeout(this.timer);
    this.timer = null;
    if (this.isPaused()) return;

    const snap = this.snapshot();
    if (snap === this.stack[this.index]) return; // rien n'a changé

    this.stack = this.stack.slice(0, this.index + 1); // une nouvelle action efface le « futur »
    this.stack.push(snap);
    if (this.stack.length > this.MAX_STEPS) this.stack.shift();
    this.index = this.stack.length - 1;
    this.updateButtons();
  },

  /** Enregistre immédiatement une demande en attente */
  flush() {
    if (this.timer) this.commit();
  },

  undo() {
    if (this.restoring) return;
    if (state.cropping) { Cropper.cancel(); return; } // Cmd+Z en plein rognage = annuler le rognage
    this.flush();
    if (this.index <= 0) return;
    this.index -= 1;
    this.restore();
  },

  redo() {
    if (this.restoring || state.cropping) return;
    this.flush();
    if (this.index >= this.stack.length - 1) return;
    this.index += 1;
    this.restore();
  },

  restore() {
    this.restoring = true;
    cancelDrawing();
    canvas.discardActiveObject();
    // loadFromJSON est asynchrone (les images doivent être rechargées)
    canvas.loadFromJSON(this.stack[this.index], () => {
      canvas.requestRenderAll();
      this.restoring = false;
      Properties.sync();
      updateStatus();
      this.updateButtons();
    });
  },

  updateButtons() {
    dom.btnUndo.disabled = this.index <= 0;
    dom.btnRedo.disabled = this.index >= this.stack.length - 1;
  },
};

/* ============================================================================
   9. UTILITAIRES CANVAS
   ========================================================================== */

function deleteSelection() {
  if (state.cropping) return;
  const objects = canvas.getActiveObjects();
  if (!objects.length) return;
  canvas.discardActiveObject();
  canvas.remove(...objects);
  canvas.requestRenderAll();
}

function clearCanvas() {
  if (state.cropping) Cropper.cancel();
  if (!canvas.getObjects().length) return;
  cancelDrawing();
  canvas.clear(); // supprime aussi la couleur de fond…
  canvas.backgroundColor = CANVAS_BG; // …qu'on remet
  canvas.requestRenderAll();
  Properties.sync();
  updateStatus();
  History.commit(); // annulable : plus besoin de demander confirmation
  toast('Canvas effacé — ⌘/Ctrl + Z pour annuler');
}

function bringForward(toFront) {
  const obj = canvas.getActiveObject();
  if (!obj) return;
  if (toFront) canvas.bringToFront(obj);
  else canvas.sendToBack(obj);
  canvas.requestRenderAll();
  History.queue();
}

const Exporter = {
  /** Exécute un export en retirant temporairement le fond blanc si demandé */
  withExportBackground(fn) {
    const previous = canvas.backgroundColor;
    if (dom.exportTransparent.checked) canvas.backgroundColor = null;
    try {
      return fn();
    } finally {
      canvas.backgroundColor = previous;
      canvas.requestRenderAll();
    }
  },

  ensureContent() {
    if (state.cropping) Cropper.cancel();
    if (canvas.getObjects().length) return true;
    toast('Le canvas est vide : rien à exporter.');
    return false;
  },

  png() {
    if (!this.ensureContent()) return;
    const url = this.withExportBackground(() =>
      canvas.toDataURL({ format: 'png', multiplier: EXPORT_MULTIPLIER }));
    downloadURL(url, exportFileName('png'));
  },

  svg() {
    if (!this.ensureContent()) return;
    const svg = this.withExportBackground(() => canvas.toSVG());
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    downloadURL(url, exportFileName('svg'));
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

/* ============================================================================
   10. THÈME & BARRE D'ÉTAT
   ========================================================================== */

const Theme = {
  STORAGE_KEY: 'studio-chloe-theme',

  init() {
    let saved = null;
    try { saved = localStorage.getItem(this.STORAGE_KEY); } catch { /* stockage indisponible */ }
    this.apply(saved === 'dark' ? 'dark' : 'light');

    dom.themeButtons.forEach((btn) => {
      btn.addEventListener('click', () => this.apply(btn.dataset.themeSet, true));
    });
  },

  apply(theme, persist = false) {
    document.documentElement.dataset.theme = theme;
    dom.themeButtons.forEach((btn) => {
      const active = btn.dataset.themeSet === theme;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    if (persist) {
      try { localStorage.setItem(this.STORAGE_KEY, theme); } catch { /* ignoré */ }
    }
  },
};

function updateStatus() {
  const count = canvas.getObjects().length;
  dom.statusTool.textContent = state.cropping ? 'Rognage' : (TOOL_LABELS[state.tool] || state.tool);
  dom.statusCount.textContent = count;
  dom.statusSize.textContent = `${canvas.getWidth()} × ${canvas.getHeight()}`;
  dom.emptyState.hidden = count > 0;
}

/* ============================================================================
   11. RACCOURCIS CLAVIER
   ========================================================================== */

const SHORTCUTS = { v: 'select', r: 'rect', e: 'ellipse', b: 'brush', p: 'brush', t: 'text' };

function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (isTyping(e)) return; // on n'intercepte rien pendant la saisie

    const mod = e.metaKey || e.ctrlKey; // ⌘ sur Mac, Ctrl ailleurs
    const key = e.key.toLowerCase();

    // Annuler / Rétablir : ⌘Z, ⌘⇧Z (ou Ctrl+Y)
    if (mod && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) History.redo();
      else History.undo();
      return;
    }
    if (mod && key === 'y') {
      e.preventDefault();
      History.redo();
      return;
    }

    // Rognage en cours : Entrée valide, Échap annule
    if (state.cropping) {
      if (e.key === 'Enter') { e.preventDefault(); Cropper.apply(); }
      if (e.key === 'Escape') { e.preventDefault(); Cropper.cancel(); }
      return;
    }

    // Suppression de la sélection (Suppr, et Retour arrière pour Mac)
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (canvas.getActiveObjects().length) {
        e.preventDefault();
        deleteSelection();
      }
      return;
    }

    if (e.key === 'Escape') {
      cancelDrawing();
      canvas.discardActiveObject();
      setTool('select');
      return;
    }

    if (mod || e.altKey) return;

    if (key === 'c') {
      if (isImage(canvas.getActiveObject())) { e.preventDefault(); Cropper.start(); }
      return;
    }
    if (SHORTCUTS[key]) {
      e.preventDefault();
      setTool(SHORTCUTS[key]);
    } else if (key === 'i') {
      e.preventDefault();
      ImageImporter.openFileDialog();
    }
  });
}

/** Vrai si l'utilisateur tape du texte (champ de formulaire ou texte du canvas en édition) */
function isTyping(e) {
  const t = e.target;
  const nonTextInputs = ['range', 'color', 'checkbox', 'radio', 'button', 'file'];
  const inField = t instanceof HTMLElement && (
    t.isContentEditable ||
    t.tagName === 'TEXTAREA' ||
    t.tagName === 'SELECT' ||
    (t.tagName === 'INPUT' && !nonTextInputs.includes(t.type))
  );
  return inField || Boolean(canvas.getActiveObject()?.isEditing);
}

/* ============================================================================
   12. HELPERS GÉNÉRIQUES
   ========================================================================== */

const isImage = (obj) => obj?.type === 'image';
const isText = (obj) => ['i-text', 'textbox', 'text'].includes(obj?.type);
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/** Convertit une couleur Fabric (#hex, rgb(), nom…) en #rrggbb, ou null si absente / transparente */
function toHex(color) {
  if (!color || typeof color !== 'string' || color === 'transparent') return null;
  const c = new fabric.Color(color);
  if (c.getAlpha() === 0) return null;
  return `#${c.toHex().toLowerCase()}`;
}

function readFileAsDataURL(fileOrBlob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Lecture du fichier impossible.'));
    reader.readAsDataURL(fileOrBlob);
  });
}

/** Version Promise de fabric.Image.fromURL (Fabric 5 utilise des callbacks) */
function loadFabricImage(url) {
  return new Promise((resolve, reject) => {
    fabric.Image.fromURL(url, (img, isError) => {
      if (isError || !img || !img.width) reject(new Error('Image illisible.'));
      else resolve(img);
    });
  });
}

function downloadURL(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function exportFileName(ext) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  return `studio-chloe-${stamp}.${ext}`;
}

let toastTimer = null;
/** Notification discrète en bas d'écran. type : 'info' | 'success' | 'error' */
function toast(message, type = 'info', duration = 3200) {
  dom.toast.textContent = message;
  dom.toast.className = `toast is-visible${type !== 'info' ? ` is-${type}` : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.remove('is-visible'), duration);
}

/* ============================================================================
   13. DÉMARRAGE
   ========================================================================== */

function bindUI() {
  dom.toolButtons.forEach((btn) => btn.addEventListener('click', () => setTool(btn.dataset.tool)));

  dom.btnImport.addEventListener('click', () => ImageImporter.openFileDialog());
  dom.fileInput.addEventListener('change', (e) => ImageImporter.importFiles(e.target.files));

  dom.btnClear.addEventListener('click', clearCanvas);
  dom.btnExportPng.addEventListener('click', () => Exporter.png());
  dom.btnExportSvg.addEventListener('click', () => Exporter.svg());

  dom.btnRemoveBg.addEventListener('click', () => BackgroundRemover.removeFromSelection());

  dom.btnCrop.addEventListener('click', () => Cropper.start());
  dom.btnCropTool.addEventListener('click', () => (state.cropping ? Cropper.apply() : Cropper.start()));
  dom.btnCropApply.addEventListener('click', () => Cropper.apply());
  dom.btnCropCancel.addEventListener('click', () => Cropper.cancel());

  dom.btnUndo.addEventListener('click', () => History.undo());
  dom.btnRedo.addEventListener('click', () => History.redo());

  dom.btnFront.addEventListener('click', () => bringForward(true));
  dom.btnBack.addEventListener('click', () => bringForward(false));
  dom.btnDelete.addEventListener('click', deleteSelection);
}

function init() {
  Theme.init();
  resizeCanvasToContainer();
  new ResizeObserver(resizeCanvasToContainer).observe(dom.canvasWrap);

  bindCanvasEvents();
  bindUI();
  Properties.bind();
  ImageImporter.bindDragAndDrop();
  bindKeyboard();

  setTool('select');
  History.init(); // premier instantané : le canvas vide

  // Les polices Google arrivent après le premier rendu : on redessine une fois chargées
  document.fonts?.ready.then(() => canvas.requestRenderAll());

}

init();
