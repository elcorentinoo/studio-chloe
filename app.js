/**
 * ============================================================================
 *  Chloe’s Touch — MVP d'éditeur vectoriel façon Illustrator
 *  Stack : HTML / CSS / JavaScript vanilla + Fabric.js 5.3
 * ============================================================================
 *
 *  Organisation du fichier :
 *    1.  Configuration (clé API Remove.bg, styles par défaut)
 *    2.  État global & références DOM
 *    3.  Initialisation du canvas Fabric + responsive
 *    3b. Vue : zoom & déplacement (Viewport)
 *    4.  Fabrique de formes (ShapeFactory)      ← ajouter de nouvelles formes ici
 *    5.  Outils (Tools) + routage souris         ← ajouter de nouveaux outils ici (ex : Plume / Bézier)
 *    6.  Panneau de propriétés
 *    7.  Import d'images (bouton + glisser-déposer)
 *    7b. Rognage d'image (Cropper)
 *    7c. Presse-papiers : copier / coller / dupliquer (Clipboard)
 *    8.  Détourage via l'API Remove.bg
 *    8b. Historique : annuler / rétablir (History)
 *    8c. Document : sérialisation & chargement (Doc)
 *    9.  Utilitaires : suppression, effacement, export PNG / SVG
 *    10. Thème clair / sombre & barre d'état
 *    10b. Styles de texte (TextStyle) & aide des raccourcis (Help)
 *    11. Raccourcis clavier
 *    12. Helpers génériques
 *    13. Démarrage
 *
 *  Modules complémentaires (dossier js/, chargés après ce fichier, même portée
 *  globale) : ils s'branchent via Hooks / Keys / Tools / ShapeFactory.
 *    js/arrange.js   — alignement, groupes, guides magnétiques, grille, règles, calques
 *    js/style-fx.js  — pipette, nuanciers, dégradés, ombres, arrondis, filtres photo
 *    js/formats.js   — formats de page, redimensionnement magique, exports
 *    js/pen.js       — outil Plume (Bézier) et édition des points
 *    js/library.js   — modèles, icônes, stickers, vectorisation
 *    js/projects.js  — galerie de projets (tableaux), stockage, verrouillage par empreinte
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

/** Version de l'application (affichée dans l'aide ; voir ROADMAP.md › Versions) */
const APP_VERSION = Object.freeze({ number: '0.7.0', name: 'Pétale' });

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

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** Zoom de la zone de travail */
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 8;
const ZOOM_STEP = 1.25;       // facteur des boutons + / − et de ⌘+ / ⌘−
const PASTE_OFFSET = 20;      // px — décalage d'un objet collé ou dupliqué

/** Style appliqué aux nouveaux objets (modifiable depuis le panneau) */
const DEFAULT_STYLE = Object.freeze({
  fill: '#f68a8d',
  stroke: '#c73527',
  strokeWidth: 2,
  opacity: 1,
});

const TEXT_DEFAULTS = Object.freeze({
  text: 'Votre texte',
  fontFamily: 'Outfit',
  fontSize: 40,
  fill: '#c73527', // couleur de départ lisible sur fond blanc (modifiable ensuite dans le panneau)
});

const CANVAS_BG = '#ffffff';
const DEFAULT_PAGE = Object.freeze({ width: 1080, height: 1080 }); // post Instagram carré
const FIT_MARGIN = 48;         // px — marge autour de la page quand on l'ajuste à l'écran

/** Propriétés personnalisées enregistrées avec chaque objet (historique, projets) */
const SERIAL_PROPS = ['name', 'locked', 'selectable', 'evented', 'shapeKind'];
const MIN_DRAG_SIZE = 4;       // px — en dessous, un simple clic crée une forme de taille par défaut
const CLICK_SHAPE_SIZE = 120;  // px — taille de la forme créée par simple clic
const IMAGE_MAX_RATIO = 0.6;   // une image importée occupe au maximum 60 % du canvas
const IMAGE_MAX_SIDE = 4096;  // px — au-delà, une image importée est réduite
const EXPORT_MULTIPLIER = 2;   // export PNG en haute définition (@2x)

const TOOL_LABELS = {
  select: 'Sélection',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  brush: 'Pinceau',
  text: 'Texte',
  line: 'Ligne',
  arrow: 'Flèche',
  triangle: 'Triangle',
  polygon: 'Polygone',
  star: 'Étoile',
};

const TYPE_LABELS = {
  line: 'Ligne',
  arrow: 'Flèche',
  triangle: 'Triangle',
  polygon: 'Polygone',
  polyline: 'Ligne',
  star: 'Étoile',
  group: 'Groupe',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  circle: 'Cercle',
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
  spaceDown: null,           // Espace maintenue (mode « main ») : réglages Fabric mémorisés
  panning: null,             // déplacement de la vue en cours : { x, y }
  exporting: false,          // export en cours : la page n'est pas dessinée par drawPage()
  page: { ...DEFAULT_PAGE }, // plan de travail (zone exportée), en px du document
  autoFit: true,             // la vue suit la taille de la fenêtre tant qu'on n'a pas zoomé
};

/**
 * Points d'extension pour les modules du dossier js/ :
 *   Hooks.on('init')        — après la liaison de l'interface
 *   Hooks.on('boot')        — chargement du document (géré par js/projects.js)
 *   Hooks.on('sync', info)  — le panneau de propriétés se met à jour
 *   Hooks.on('change', json)— une nouvelle étape d'historique (→ sauvegarde)
 *   Hooks.on('docLoaded')   — un document vient d'être chargé
 *   Hooks.on('tool', name)  — un outil vient d'être activé
 *   Hooks.on('snapTargets', { xs, ys }) — cibles d'aimantation supplémentaires
 */
const Hooks = {
  map: {},
  on(name, fn) { (this.map[name] ||= []).push(fn); },
  has(name) { return Boolean(this.map[name]?.length); },
  emit(name, ...args) { (this.map[name] || []).forEach((fn) => fn(...args)); },
};

/** Raccourcis ajoutés par les modules : fn(e, { mod, key }) renvoie true si traité */
const Keys = {
  handlers: [],
  add(fn) { this.handlers.push(fn); },
  run(e, info) { return this.handlers.some((fn) => fn(e, info)); },
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

  btnBold: $('#btn-bold'),
  btnItalic: $('#btn-italic'),
  btnUnderline: $('#btn-underline'),

  btnZoomIn: $('#btn-zoom-in'),
  btnZoomOut: $('#btn-zoom-out'),
  btnZoomReset: $('#btn-zoom-reset'),

  btnShapes: $('#btn-shapes'),
  shapeFlyout: $('#shape-flyout'),
  btnHelp: $('#btn-help'),
  helpDialog: $('#help-dialog'),
  btnHelpClose: $('#btn-help-close'),

  toast: $('#toast'),
};

/* ============================================================================
   3. CANVAS FABRIC
   ========================================================================== */

// Pas de backgroundColor : Fabric le peindrait sur tout le canvas, même en zoom
// arrière. La page blanche est dessinée par drawPage() à la bonne échelle, et
// le fond n'est ajouté qu'au moment de l'export (voir Exporter).
const canvas = new fabric.Canvas('c', {
  preserveObjectStacking: true, // l'objet sélectionné ne passe pas automatiquement au premier plan
  selectionColor: 'rgba(246, 138, 141, 0.18)',
  selectionBorderColor: '#d9474f',
  selectionLineWidth: 1,
  stopContextMenu: true,
});

// Apparence des poignées de transformation (appliquée à tous les objets)
fabric.Object.prototype.set({
  transparentCorners: false,
  cornerColor: '#f68a8d',
  cornerStrokeColor: '#c73527',
  borderColor: '#d9474f',
  cornerSize: 10,
  cornerStyle: 'circle',
  borderScaleFactor: 1.5,
  padding: 2,
});

/*
 * Performances : Fabric met chaque objet en cache dans un canvas d'au moins
 * 256 × 256 px, même un petit carré. Avec des centaines de formes simples,
 * recopier ces caches coûte bien plus cher que de les redessiner (et chaque
 * annulation recrée tous les caches). Les formes simples se dessinent donc
 * directement ; tracés, textes, images et groupes gardent leur cache, plus petit.
 */
['Rect', 'Circle', 'Ellipse', 'Triangle', 'Line'].forEach((k) => { fabric[k].prototype.objectCaching = false; });
fabric.minCacheSideLimit = 64;

/** Dessine la page blanche (zone exportée) en tenant compte du zoom */
function drawPage({ ctx }) {
  if (state.exporting) return; // l'export gère lui-même son fond (blanc ou transparent)
  const v = canvas.viewportTransform;
  ctx.save();
  ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]);
  ctx.shadowColor = 'rgba(74, 22, 24, 0.18)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = CANVAS_BG;
  ctx.fillRect(0, 0, state.page.width, state.page.height);
  ctx.restore();
}
canvas.on('before:render', drawPage);

/** Ajuste la taille du canvas à son conteneur (appelé à chaque redimensionnement) */
function resizeCanvasToContainer() {
  const { clientWidth, clientHeight } = dom.canvasWrap;
  if (!clientWidth || !clientHeight) return;
  canvas.setDimensions({ width: clientWidth, height: clientHeight });
  canvas.calcOffset();
  if (state.autoFit) Viewport.fit();
  canvas.requestRenderAll();
  updateStatus();
}

/* ============================================================================
   3b. VUE : ZOOM & DÉPLACEMENT
   ----------------------------------------------------------------------------
   Le zoom agit sur la zone de travail seulement (viewportTransform de Fabric),
   jamais sur la page entière :
     - ⌘/Ctrl + molette ou pincement du trackpad : zoom centré sur la souris
     - molette seule : défilement (Maj = horizontal)
     - Espace + glisser : déplacement (« main »)
     - ⌘/Ctrl + / − / 0 et la pilule en bas à droite
   La « page » (fond blanc, zone exportée) est le rectangle 0,0 → state.page :
   autour, la table de montage. ⌘0 ajuste la page à l'écran, ⌘1 = 100 %.
   ========================================================================== */

const Viewport = {
  /** Zoome au facteur `zoom`, en gardant fixe le point `point` (coordonnées écran du canvas) */
  setZoom(zoom, point = this.screenCenter()) {
    state.autoFit = false;
    canvas.zoomToPoint(new fabric.Point(point.x, point.y), clamp(zoom, ZOOM_MIN, ZOOM_MAX));
    this.afterChange();
  },

  zoomBy(factor, point) { this.setZoom(canvas.getZoom() * factor, point); },

  /** Centre la page à un zoom donné */
  centerPage(zoom) {
    const { width, height } = state.page;
    canvas.setViewportTransform([zoom, 0, 0, zoom,
      (canvas.getWidth() - width * zoom) / 2, (canvas.getHeight() - height * zoom) / 2]);
    this.afterChange();
  },

  /** Ajuste la page entière à l'écran (⌘0) */
  fit() {
    const { width, height } = state.page;
    const zoom = Math.min(
      (canvas.getWidth() - FIT_MARGIN * 2) / width,
      (canvas.getHeight() - FIT_MARGIN * 2) / height,
      ZOOM_MAX,
    );
    state.autoFit = true;
    this.centerPage(clamp(zoom, ZOOM_MIN, ZOOM_MAX));
  },

  /** 100 % (⌘1) */
  actualSize() {
    state.autoFit = false;
    this.centerPage(1);
  },

  reset() { this.fit(); },

  pan(dx, dy) {
    state.autoFit = false;
    canvas.relativePan(new fabric.Point(dx, dy));
    this.afterChange();
  },

  afterChange() {
    dom.btnZoomReset.textContent = `${Math.round(canvas.getZoom() * 100)} %`;
    canvas.requestRenderAll();
  },

  screenCenter() { return { x: canvas.getWidth() / 2, y: canvas.getHeight() / 2 }; },

  /** Point écran → coordonnées du document */
  toScene(point) {
    return fabric.util.transformPoint(point, fabric.util.invertTransform(canvas.viewportTransform));
  },

  /** Zone du document actuellement visible : { left, top, width, height } */
  visibleBounds() {
    const tl = this.toScene({ x: 0, y: 0 });
    const br = this.toScene({ x: canvas.getWidth(), y: canvas.getHeight() });
    return { left: tl.x, top: tl.y, width: br.x - tl.x, height: br.y - tl.y };
  },

  /** Centre de la zone visible, en coordonnées du document */
  center() { return this.toScene(this.screenCenter()); },

  /** Position de la souris relative au canvas (coordonnées écran) */
  eventPoint(e) {
    const r = canvas.upperCanvasEl.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  },

  /** Espace maintenue : la souris déplace la vue au lieu d'agir avec l'outil */
  setSpace(down) {
    if (down === Boolean(state.spaceDown)) return;
    if (down) {
      state.spaceDown = {
        isDrawingMode: canvas.isDrawingMode,
        selection: canvas.selection,
        skipTargetFind: canvas.skipTargetFind,
      };
      canvas.isDrawingMode = false;
      canvas.selection = false;
      canvas.skipTargetFind = true;
    } else {
      Object.assign(canvas, state.spaceDown);
      state.spaceDown = null;
      state.panning = null;
      dom.stage.classList.remove('is-grabbing');
    }
    dom.stage.classList.toggle('is-panning', down);
  },

  /** Renvoie vrai si l'événement souris a été consommé par le déplacement de la vue */
  handleMouse(type, e) {
    if (!state.spaceDown) return false;
    if (type === 'down') {
      state.panning = { x: e.clientX, y: e.clientY };
      dom.stage.classList.add('is-grabbing');
    } else if (type === 'move' && state.panning) {
      this.pan(e.clientX - state.panning.x, e.clientY - state.panning.y);
      state.panning = { x: e.clientX, y: e.clientY };
    } else if (type === 'up') {
      state.panning = null;
      dom.stage.classList.remove('is-grabbing');
    }
    return true;
  },

  bind() {
    // Molette : { passive: false } pour pouvoir bloquer le zoom de la page entière
    dom.stage.addEventListener('wheel', (e) => {
      if (e.target.closest('.zoom-pill')) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Pincement trackpad = ctrl + molette avec de petits deltas → zoom fluide
        this.zoomBy(0.99 ** clamp(e.deltaY, -50, 50), this.eventPoint(e));
      } else {
        const dx = e.shiftKey ? e.deltaY : e.deltaX;
        const dy = e.shiftKey ? 0 : e.deltaY;
        this.pan(-dx, -dy);
      }
    }, { passive: false });

    // Safari (macOS) : pincement du trackpad via les « gesture events »
    let gestureStart = 1;
    dom.stage.addEventListener('gesturestart', (e) => { e.preventDefault(); gestureStart = canvas.getZoom(); });
    dom.stage.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      this.setZoom(gestureStart * e.scale, this.eventPoint(e));
    });

    dom.btnZoomIn.addEventListener('click', () => this.zoomBy(ZOOM_STEP));
    dom.btnZoomOut.addEventListener('click', () => this.zoomBy(1 / ZOOM_STEP));
    dom.btnZoomReset.addEventListener('click', () => this.reset());

    window.addEventListener('blur', () => this.setSpace(false));
  },
};

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
  // update(obj, box, drag) — drag = { origin, pointer, constrain (Maj), alt, click (simple clic) }
  rect: {
    create: (p) => new fabric.Rect({ left: p.x, top: p.y, width: 0, height: 0, ...shapeStyle() }),
    update: (obj, b) => obj.set({ left: b.left, top: b.top, width: b.width, height: b.height }),
  },
  ellipse: {
    create: (p) => new fabric.Ellipse({ left: p.x, top: p.y, rx: 0, ry: 0, ...shapeStyle() }),
    // Une ellipse Fabric est définie par ses rayons : on les déduit du rectangle englobant
    update: (obj, b) => obj.set({ left: b.left, top: b.top, rx: b.width / 2, ry: b.height / 2 }),
  },
  triangle: polyShape('triangle', (b) => [
    { x: b.left + b.width / 2, y: b.top },
    { x: b.left + b.width, y: b.top + b.height },
    { x: b.left, y: b.top + b.height },
  ]),
  polygon: polyShape('polygon', (b) => radialPoints(b, 6, () => 1)),
  star: polyShape('star', (b) => radialPoints(b, 10, (i) => (i % 2 ? 0.45 : 1))),
  line: lineShape('line', (a, z) => [a, z]),
  arrow: lineShape('arrow', (a, z, obj) => {
    // Pointe ouverte, proportionnée à l'épaisseur du trait
    const len = Math.max(14, (obj.strokeWidth || 2) * 4);
    const ang = Math.atan2(z.y - a.y, z.x - a.x);
    const head = (d) => ({ x: z.x - len * Math.cos(ang + d), y: z.y - len * Math.sin(ang + d) });
    return [a, z, head(Math.PI / 6), z, head(-Math.PI / 6)];
  }),
};

/** Forme fermée (fabric.Polygon) dont les points sont calculés à partir du rectangle tracé */
function polyShape(kind, pointsFromBox) {
  return {
    create: (p) => new fabric.Polygon([{ x: p.x, y: p.y }, { x: p.x, y: p.y }, { x: p.x, y: p.y }],
      { ...shapeStyle(), shapeKind: kind, strokeLineJoin: 'round' }),
    update: (obj, b) => setPolyPoints(obj, pointsFromBox(b)),
  };
}

/** Ligne ou flèche (fabric.Polyline, sans remplissage) tracée de l'origine au pointeur */
function lineShape(kind, pointsFromEnds) {
  return {
    lineLike: true,
    create: (p) => {
      const s = shapeStyle();
      return new fabric.Polyline([{ x: p.x, y: p.y }, { x: p.x, y: p.y }], {
        ...s,
        stroke: s.stroke || s.fill || '#c73527',
        strokeWidth: Math.max(1, s.strokeWidth),
        fill: null,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        shapeKind: kind,
      });
    },
    update: (obj, b, drag) => {
      let z = drag.pointer;
      if (drag.constrain) { // Maj : angle multiple de 45°
        const ang = Math.round(Math.atan2(z.y - drag.origin.y, z.x - drag.origin.x) / (Math.PI / 4)) * (Math.PI / 4);
        const dist = Math.hypot(z.x - drag.origin.x, z.y - drag.origin.y);
        z = { x: drag.origin.x + dist * Math.cos(ang), y: drag.origin.y + dist * Math.sin(ang) };
      }
      setPolyPoints(obj, pointsFromEnds(drag.origin, z, obj));
    },
  };
}

/** Points répartis sur l'ellipse inscrite dans le rectangle (polygone, étoile) */
function radialPoints(b, count, radiusAt) {
  const cx = b.left + b.width / 2;
  const cy = b.top + b.height / 2;
  return Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    const r = radiusAt(i);
    return { x: cx + (b.width / 2) * r * Math.cos(a), y: cy + (b.height / 2) * r * Math.sin(a) };
  });
}

/** Remplace les points d'un Polygon / Polyline (coordonnées du document) et recalcule sa boîte */
function setPolyPoints(obj, points) {
  obj.points = points.map((pt) => ({ x: pt.x, y: pt.y }));
  obj._setPositionDimensions({});
  obj.dirty = true;
}

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
  triangle: createDragShapeTool('triangle'),
  polygon: createDragShapeTool('polygon'),
  star: createDragShapeTool('star'),
  line: createDragShapeTool('line'),
  arrow: createDragShapeTool('arrow'),

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
      const { obj, origin } = state.drawing;
      shape.update(obj, getDragBox(origin, p, e.shiftKey), { origin, pointer: p, constrain: e.shiftKey, alt: e.altKey });
      canvas.requestRenderAll();
    },

    onMouseUp(p, e) {
      if (!state.drawing) return;
      const { obj, origin } = state.drawing;
      state.drawing = null;

      let box = getDragBox(origin, p, e.shiftKey);
      let pointer = p;

      // Simple clic sans glisser : forme de taille par défaut centrée sur le clic
      if (box.width < MIN_DRAG_SIZE && box.height < MIN_DRAG_SIZE) {
        box = {
          left: origin.x - CLICK_SHAPE_SIZE / 2,
          top: origin.y - CLICK_SHAPE_SIZE / 2,
          width: CLICK_SHAPE_SIZE,
          height: CLICK_SHAPE_SIZE,
        };
        pointer = { x: origin.x + CLICK_SHAPE_SIZE * 1.4, y: origin.y }; // ligne / flèche horizontale
      }

      shape.update(obj, box, { origin, pointer, constrain: e.shiftKey, alt: e.altKey, click: pointer !== p });
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

  ShapeMenu.reflect(name);
  dom.toolButtons.forEach((btn) => {
    const active = btn.dataset.tool === name;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
  });

  canvas.requestRenderAll();
  Hooks.emit('tool', name); // menus d'outils du rail, options de l'outil (js/toolbox.js)
  Properties.sync();
  updateStatus();
}

/**
 * Menu des formes du rail : un seul bouton (dernière forme utilisée) qui ouvre
 * un petit menu avec toutes les formes de ShapeFactory.
 */
const ShapeMenu = {
  bind() {
    dom.btnShapes.addEventListener('click', () => {
      // Forme déjà active : ouvrir / fermer le menu ; sinon activer la dernière forme
      if (ShapeFactory[state.tool]) this.toggle();
      else setTool(dom.btnShapes.dataset.tool);
    });
    dom.shapeFlyout.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => { setTool(btn.dataset.tool); this.toggle(false); });
    });
    // Le menu vit dans <body> (le rail peut défiler et le couperait)
    document.body.appendChild(dom.shapeFlyout);
    document.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.rail-flyout, .flyout')) this.toggle(false);
    });
    window.addEventListener('resize', () => this.toggle(false));
  },
  toggle(open = dom.shapeFlyout.hidden) {
    if (open) {
      const r = dom.btnShapes.getBoundingClientRect();
      const mobile = window.matchMedia('(max-width: 720px)').matches;
      dom.shapeFlyout.style.left = `${r.right + 14}px`;
      dom.shapeFlyout.style.top = `${Math.max(8, r.top - 8)}px`;
      if (mobile) dom.shapeFlyout.style.left = `${r.right + 8}px`;
    }
    dom.shapeFlyout.hidden = !open;
    dom.btnShapes.setAttribute('aria-expanded', String(open));
  },
  /** Le bouton du rail prend l'icône de la forme active */
  reflect(name) {
    if (!ShapeFactory[name]) return;
    const item = dom.shapeFlyout.querySelector(`[data-tool="${name}"] svg`);
    if (item) dom.btnShapes.querySelector('svg').replaceWith(item.cloneNode(true));
    dom.btnShapes.dataset.tool = name;
    dom.btnShapes.title = `${TOOL_LABELS[name]} — cliquez à nouveau pour les autres formes`;
  },
};

/** Pinceau : couleur = contour courant (ou remplissage si contour « Aucun ») */
function updateBrush() {
  if (!(canvas.freeDrawingBrush instanceof fabric.PencilBrush)) {
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
  }
  const brush = canvas.freeDrawingBrush;
  brush.color = state.style.stroke || state.style.fill || '#c73527';
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
  canvas.on('mouse:down', (opt) => Viewport.handleMouse('down', opt.e) || routeToTool('onMouseDown', opt));
  canvas.on('mouse:move', (opt) => Viewport.handleMouse('move', opt.e) || routeToTool('onMouseMove', opt));
  canvas.on('mouse:up', (opt) => Viewport.handleMouse('up', opt.e) || routeToTool('onMouseUp', opt));

  // Gras / italique / souligné suivent la sélection de lettres pendant l'édition
  canvas.on('text:selection:changed', () => TextStyle.sync());
  canvas.on('text:editing:entered', () => TextStyle.sync());

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
      : single ? objectLabel(ref) : `${objects.length} objets`;
    dom.panelHint.hidden = hasSelection;

    // Couleurs, épaisseur, opacité
    setColorField(dom.propFill, dom.propFillNone, dom.hexFill, ref ? groupColor(ref, 'fill') : state.style.fill);
    setColorField(dom.propStroke, dom.propStrokeNone, dom.hexStroke, ref ? groupColor(ref, 'stroke') : state.style.stroke);

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
      TextStyle.sync();
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

    Hooks.emit('sync', { objects, ref, single, hasSelection });
  },

  /** Applique une propriété à la sélection (et au style courant) */
  apply(prop, value) {
    if (prop in state.style) state.style[prop] = value;

    const objects = canvas.getActiveObjects();
    objects.forEach((obj) => {
      if (prop === 'fill' && isImage(obj)) return;                 // pas de remplissage sur une image
      if (prop === 'fill' && value === null && isText(obj)) return; // un texte doit rester visible
      // Groupe (icône, sticker, SVG importé) : la couleur s'applique aux éléments qui en ont une
      if (obj.type === 'group' && (prop === 'fill' || prop === 'stroke')) {
        recolorGroup(obj, prop, value);
        return;
      }
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
    dom.propFontFamily.addEventListener('change', (e) => {
      this.apply('fontFamily', e.target.value);
      canvas.getActiveObjects().filter(isText).forEach(ensureFont); // charge la police puis redessine
    });
    dom.propFontSize.addEventListener('input', (e) => {
      const size = clamp(Number(e.target.value) || 0, 6, 400);
      if (size) this.apply('fontSize', size);
    });
  },
};

/** Couleur représentative d'un objet ; pour un groupe, celle du premier élément coloré */
function groupColor(obj, prop) {
  if (obj.type !== 'group') return obj[prop];
  const child = obj.getObjects().find((c) => (c.type === 'group' ? groupColor(c, prop) : toHex(c[prop])));
  return child ? groupColor(child, prop) : null;
}

/** Recolore les éléments d'un groupe qui ont déjà cette propriété (les « aucun » restent vides) */
function recolorGroup(group, prop, value) {
  group.getObjects().forEach((c) => {
    if (c.type === 'group') recolorGroup(c, prop, value);
    else if (toHex(c[prop])) c.set(prop, value);
  });
  group.dirty = true;
}

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
      toast('Format non supporté : utilisez des images JPG, PNG ou WebP.', 'error');
      return;
    }

    let lastImage = null;
    for (const [index, file] of files.entries()) {
      try {
        // Data URL (et non blob:) : l'image reste intégrée dans l'export SVG
        const dataUrl = await limitImageSize(await readFileAsDataURL(file), IMAGE_MAX_SIDE);
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
    // Taille et centre calculés sur la zone VISIBLE (le zoom est pris en compte)
    const view = Viewport.visibleBounds();
    const scale = Math.min(1, (view.width * IMAGE_MAX_RATIO) / img.width, (view.height * IMAGE_MAX_RATIO) / img.height);
    const center = point || Viewport.center();
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

      // Position du dépôt convertie en coordonnées du document (bornée à la zone visible)
      const p = canvas.getPointer(e);
      const view = Viewport.visibleBounds();
      const point = {
        x: clamp(p.x, view.left, view.left + view.width),
        y: clamp(p.y, view.top, view.top + view.height),
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
      fill: 'rgba(246, 138, 141, 0.14)',
      stroke: '#d9474f',
      strokeWidth: 1.5,
      strokeDashArray: [6, 4],
      strokeUniform: true,
      cornerStyle: 'rect',
      cornerColor: '#c73527',
      cornerStrokeColor: '#f68a8d',
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
   7c. PRESSE-PAPIERS : COPIER / COLLER / DUPLIQUER
   ----------------------------------------------------------------------------
   On écoute les événements natifs copy / cut / paste du document :
     - ⌘C / ⌘X : l'objet est cloné en mémoire, et un « marqueur » est écrit
                 dans le presse-papiers système ;
     - ⌘V      : une image du presse-papiers (capture d'écran, « Copier l'image »)
                 est importée ; sinon, si le marqueur est présent, on colle
                 l'objet copié ; sinon un texte copié ailleurs devient un objet Texte.
   Pendant la saisie (champ, texte en édition), le navigateur garde la main.
   ========================================================================== */

const Clipboard = {
  MARKER: 'studio-chloe:objets',
  data: null, // clone Fabric de la dernière copie

  copy(e, cut = false) {
    if (isTyping(e) || state.cropping) return;
    const active = canvas.getActiveObject();
    if (!active) return;
    e.preventDefault();
    e.clipboardData?.setData('text/plain', this.MARKER);
    active.clone((clone) => { this.data = clone; });
    if (cut) deleteSelection();
  },

  paste(e) {
    if (isTyping(e) || state.cropping || dom.helpDialog.open) return;
    const cd = e.clipboardData;
    if (!cd) return;

    // 1. Image (fichier dans le presse-papiers)
    const images = [...(cd.files || [])].filter((f) => ACCEPTED_IMAGE_TYPES.includes(f.type));
    if (images.length) {
      e.preventDefault();
      ImageImporter.importFiles(images, Viewport.center());
      return;
    }

    // 2. Objets copiés dans Chloe’s Touch, ou 3. texte copié ailleurs
    const text = cd.getData('text/plain') || '';
    if (text === this.MARKER || (!text.trim() && this.data)) {
      e.preventDefault();
      this.pasteObject();
    } else if (text.trim()) {
      e.preventDefault();
      this.pasteText(text.trim().slice(0, 2000));
    }
  },

  pasteObject() {
    if (!this.data) return;
    insertClone(this.data, (pasted) => {
      // Les collages successifs s'empilent en escalier
      this.data.set({ left: this.data.left + PASTE_OFFSET, top: this.data.top + PASTE_OFFSET });
      return pasted;
    });
  },

  pasteText(content) {
    const c = Viewport.center();
    const text = new fabric.IText(content, {
      left: c.x,
      top: c.y,
      originX: 'center',
      originY: 'center',
      fontFamily: TEXT_DEFAULTS.fontFamily,
      fontSize: TEXT_DEFAULTS.fontSize,
      fill: TEXT_DEFAULTS.fill,
      opacity: state.style.opacity,
    });
    setTool('select');
    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.requestRenderAll();
  },

  duplicate() {
    const active = canvas.getActiveObject();
    if (!active || state.cropping) return;
    insertClone(active);
  },

  bind() {
    document.addEventListener('copy', (e) => this.copy(e));
    document.addEventListener('cut', (e) => this.copy(e, true));
    document.addEventListener('paste', (e) => this.paste(e));
  },
};

/** Clone `source` (objet ou sélection multiple), l'ajoute décalé et le sélectionne */
function insertClone(source, done) {
  source.clone((clone) => {
    canvas.discardActiveObject();
    clone.set({ left: clone.left + PASTE_OFFSET, top: clone.top + PASTE_OFFSET, evented: true });
    if (clone.type === 'activeSelection') {
      // Une sélection multiple clonée : on ajoute chacun de ses objets
      clone.canvas = canvas;
      clone.forEachObject((obj) => canvas.add(obj));
      clone.setCoords();
    } else {
      canvas.add(clone);
    }
    setTool('select');
    canvas.setActiveObject(clone);
    canvas.requestRenderAll();
    done?.(clone);
  });
}

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

/**
 * Réserve d'images de la session : l'historique ne garde qu'une référence vers
 * l'image déjà décodée. Annuler / rétablir réutilise l'image en mémoire (pas
 * de nouveau décodage) et les instantanés pèsent quelques Ko au lieu de
 * plusieurs Mo. Ce qui sort de la session (projets, collaboration, exports)
 * reste un JSON complet : Doc.serialize() hors historique n'est pas touché.
 */
const ImagePool = {
  compact: false,
  ids: new WeakMap(), // élément → id
  entries: new Map(), // id → élément
  next: 1,

  ref(el) {
    let id = this.ids.get(el);
    if (!id) {
      id = this.next++;
      this.ids.set(el, id);
    }
    this.entries.set(id, el); // (de nouveau) disponible, même après un nettoyage
    return `pool:${id}`;
  },

  element(url) {
    return typeof url === 'string' && url.startsWith('pool:') ? this.entries.get(Number(url.slice(5))) || null : null;
  },

  /** Données réelles d'une image de la réserve */
  src(url) {
    const el = this.element(url);
    if (!el) return url;
    return el.toDataURL ? el.toDataURL() : el.src;
  },

  /** Oublie les images qu'aucun instantané ne référence plus */
  prune(snapshots) {
    const used = new Set();
    snapshots.forEach((snap) => { for (const m of String(snap).matchAll(/"pool:(\d+)"/g)) used.add(Number(m[1])); });
    [...this.entries.keys()].forEach((id) => { if (!used.has(id)) this.entries.delete(id); });
  },

  /** JSON d'historique → JSON autonome (références remplacées par les données) */
  expand(json) {
    if (typeof json !== 'string' || !json.includes('"pool:')) return json;
    return json.replace(/"pool:(\d+)"/g, (m, id) => JSON.stringify(this.src(`pool:${id}`)));
  },

  patch() {
    const self = this;
    const proto = fabric.Image.prototype;
    const baseToObject = proto.toObject;
    proto.toObject = function toObject(props) {
      const el = this._originalElement || this._element;
      if (!self.compact || !el) return baseToObject.call(this, props);
      this.getSrc = () => self.ref(el); // pas de recopie (ni de toDataURL) des pixels
      try { return baseToObject.call(this, props); } finally { delete this.getSrc; }
    };
    const baseLoad = fabric.util.loadImage;
    fabric.util.loadImage = function loadImage(url, callback, context, crossOrigin) {
      const el = self.element(url);
      if (!el) return baseLoad.call(this, url, callback, context, crossOrigin);
      Promise.resolve().then(() => callback && callback.call(context, el, false));
      return undefined;
    };
  },
};
ImagePool.patch();

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

  /**
   * Instantané léger : les images sont référencées (« pool:N ») au lieu d'être
   * recopiées en base64 à chaque étape (des Mo par photo) — voir ImagePool.
   */
  snapshot() {
    ImagePool.compact = true;
    try { return Doc.serialize(); } finally { ImagePool.compact = false; }
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
    this.commits = (this.commits || 0) + 1;
    if (this.commits % 20 === 0) ImagePool.prune(this.stack); // libère les images sorties de l'historique
    this.updateButtons();
    Hooks.emit('change', snap);
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
    // Le chargement est asynchrone (les images doivent être rechargées)
    Doc.load(this.stack[this.index], () => {
      this.restoring = false;
      Properties.sync();
      this.updateButtons();
      Hooks.emit('change', this.stack[this.index]);
    });
  },

  updateButtons() {
    dom.btnUndo.disabled = this.index <= 0;
    dom.btnRedo.disabled = this.index >= this.stack.length - 1;
  },
};

/* ============================================================================
   8c. DOCUMENT : SÉRIALISATION & CHARGEMENT
   ----------------------------------------------------------------------------
   Un document = le JSON Fabric (avec SERIAL_PROPS) + la taille de la page.
   La sauvegarde (projets, tableaux, chiffrement) est assurée par js/projects.js,
   qui écoute Hooks.on('change') et appelle Doc.open() pour ouvrir un projet.
   ========================================================================== */

const Doc = {
  /**
   * Données de document ajoutées par les modules (repères, plans de travail…) :
   *   Doc.extras.cle = { save: () => valeur JSON, load: (valeur | undefined) => void }
   * Enregistrées à côté des objets, donc dans l'historique et les projets.
   */
  extras: {},

  serialize() {
    const json = canvas.toJSON(SERIAL_PROPS);
    delete json.background; // la page est dessinée par drawPage()
    json.page = { ...state.page };
    Object.entries(this.extras).forEach(([key, ext]) => {
      const value = ext.save();
      if (value !== undefined) json[key] = value;
    });
    return JSON.stringify(json);
  },

  /** Charge un document (chaîne JSON ou objet) dans le canvas */
  load(json, done) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    canvas.loadFromJSON(data, () => {
      canvas.backgroundColor = null;
      // Anciens documents sans page : la page reprend la taille de la zone de travail d'alors
      state.page = data.page
        ? { width: data.page.width, height: data.page.height }
        : { width: Math.round(canvas.getWidth()), height: Math.round(canvas.getHeight()) };
      if (data.page?.dpi) state.page.dpi = data.page.dpi; // format d'impression (300 dpi) conservé
      Object.entries(this.extras).forEach(([key, ext]) => ext.load(data[key]));
      refreshFonts();
      canvas.requestRenderAll();
      updateStatus();
      Hooks.emit('docLoaded');
      done?.();
    });
  },

  /** Ouvre un document : chargement, historique remis à zéro, page ajustée à l'écran */
  open(json, done) {
    History.restoring = true; // le chargement ne crée pas d'étapes
    cancelDrawing();
    canvas.discardActiveObject();
    const finish = () => {
      History.restoring = false;
      History.init();
      Viewport.fit();
      Properties.sync();
      done?.();
    };
    if (json) this.load(json, finish);
    else {
      canvas.clear();
      state.page = { ...DEFAULT_PAGE };
      Object.values(this.extras).forEach((ext) => ext.load(undefined));
      updateStatus();
      Hooks.emit('docLoaded');
      finish();
    }
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
  canvas.clear(); // la page (state.page) est conservée
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
  /** Exécute un export : vue à 100 % sur la page, fond blanc ou transparent */
  withPage(fn, transparent = dom.exportTransparent.checked) {
    const vpt = canvas.viewportTransform.slice();
    canvas.backgroundColor = transparent ? null : CANVAS_BG;
    canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
    state.exporting = true;
    try {
      return fn();
    } finally {
      state.exporting = false;
      canvas.backgroundColor = null;
      canvas.viewportTransform = vpt;
      canvas.requestRenderAll();
    }
  },

  // Compatibilité (anciens appels)
  withExportBackground(fn) { return this.withPage(fn); },

  pageArea() { return { left: 0, top: 0, width: state.page.width, height: state.page.height }; },

  ensureContent() {
    if (state.cropping) Cropper.cancel();
    if (canvas.getObjects().length) return true;
    toast('La page est vide : rien à exporter.');
    return false;
  },

  /**
   * Image de la page (ou d'une zone) : format 'png' | 'jpeg' | 'webp'.
   * Le JPEG n'a pas de transparence : fond blanc forcé.
   */
  toDataURL({ format = 'png', multiplier = EXPORT_MULTIPLIER, transparent, area = this.pageArea(), quality = 0.92 } = {}) {
    const transp = format === 'jpeg' ? false : (transparent ?? dom.exportTransparent.checked);
    return this.withPage(() => canvas.toDataURL({ format, quality, multiplier, ...area }), transp);
  },

  toSVG(transparent) {
    const { width, height } = state.page;
    return this.withPage(() => canvas.toSVG({ width, height, viewBox: { x: 0, y: 0, width, height } }), transparent);
  },

  png() {
    if (!this.ensureContent()) return;
    downloadURL(this.toDataURL({ format: 'png' }), exportFileName('png'));
  },

  svg() {
    if (!this.ensureContent()) return;
    const url = URL.createObjectURL(new Blob([this.toSVG()], { type: 'image/svg+xml;charset=utf-8' }));
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
  dom.statusSize.textContent = `${state.page.width} × ${state.page.height}`;
  dom.emptyState.hidden = count > 0;
}

/* ============================================================================
   10b. STYLES DE TEXTE (GRAS / ITALIQUE / SOULIGNÉ) & AIDE
   ----------------------------------------------------------------------------
   - Texte en édition avec des lettres sélectionnées : le style ne s'applique
     qu'à ces lettres (styles par caractère de Fabric).
   - Sinon : il s'applique au(x) texte(s) entier(s) sélectionné(s).
   ========================================================================== */

const TEXT_TOGGLES = {
  bold: { prop: 'fontWeight', on: 'bold', off: 'normal' },
  italic: { prop: 'fontStyle', on: 'italic', off: 'normal' },
  underline: { prop: 'underline', on: true, off: false },
};

const TextStyle = {
  buttons() {
    return { bold: dom.btnBold, italic: dom.btnItalic, underline: dom.btnUnderline };
  },

  hasLetterSelection(obj) {
    return obj.isEditing && obj.selectionStart !== obj.selectionEnd;
  },

  isOn(key, value) {
    if (key === 'bold') return value === 'bold' || Number(value) >= 600;
    return value === TEXT_TOGGLES[key].on;
  },

  isActive(obj, key) {
    const { prop } = TEXT_TOGGLES[key];
    if (this.hasLetterSelection(obj)) {
      const styles = obj.getSelectionStyles(obj.selectionStart, obj.selectionEnd, true);
      return styles.length > 0 && styles.every((st) => this.isOn(key, st[prop]));
    }
    return this.isOn(key, obj[prop]);
  },

  toggle(key) {
    const texts = canvas.getActiveObjects().filter(isText);
    if (!texts.length) return;
    const { prop, on, off } = TEXT_TOGGLES[key];
    const value = this.isActive(texts[0], key) ? off : on;

    texts.forEach((obj) => {
      if (this.hasLetterSelection(obj)) {
        obj.setSelectionStyles({ [prop]: value });
      } else {
        obj.removeStyle?.(prop); // les réglages lettre par lettre cèdent la place au réglage global
        obj.set(prop, value);
      }
      obj.initDimensions?.();
      obj.setCoords();
      ensureFont(obj); // la variante grasse / italique d'une police est chargée à la demande
    });

    canvas.requestRenderAll();
    History.queue();
    this.sync();
  },

  sync() {
    const obj = canvas.getActiveObject();
    const text = isText(obj) ? obj : null;
    Object.entries(this.buttons()).forEach(([key, btn]) => {
      const active = Boolean(text) && this.isActive(text, key);
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  },

  bind() {
    Object.entries(this.buttons()).forEach(([key, btn]) => {
      // mousedown sans focus : le texte reste en édition et garde sa sélection de lettres
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => this.toggle(key));
    });
  },
};

/**
 * Les polices Google ne sont téléchargées qu'au premier usage : on attend
 * la bonne variante (graisse, italique), on vide le cache de mesures de
 * Fabric, puis on recalcule et redessine le texte.
 */
function ensureFont(obj) {
  if (!isText(obj) || !document.fonts?.load) return;
  const family = obj.fontFamily;
  const variants = new Set([`${obj.fontStyle || 'normal'} ${obj.fontWeight || 'normal'}`]);
  Object.values(obj.styles || {}).forEach((line) => Object.values(line).forEach((st) => {
    variants.add(`${st.fontStyle || obj.fontStyle || 'normal'} ${st.fontWeight || obj.fontWeight || 'normal'}`);
  }));
  Promise.all([...variants].map((v) => document.fonts.load(`${v} 40px "${family}"`)))
    .then(() => {
      fabric.util.clearFabricFontCache(family);
      obj.initDimensions?.();
      obj.setCoords();
      canvas.requestRenderAll();
    })
    .catch(() => { /* police indisponible : le navigateur utilise une police de secours */ });
}

/** Après un chargement de document : s'assure que toutes les polices utilisées sont prêtes */
function refreshFonts() {
  canvas.getObjects().filter(isText).forEach(ensureFont);
}

const Help = {
  open() {
    if (!dom.helpDialog.open) dom.helpDialog.showModal();
  },
  /** Numéro et nom de version dans l'en-tête de l'aide */
  showVersion() {
    const title = dom.helpDialog.querySelector('#help-title');
    if (!title || title.querySelector('.app-version')) return;
    title.insertAdjacentHTML('beforeend', ` <span class="app-version" title="Version de Chloe’s Touch">v${APP_VERSION.number} · ${APP_VERSION.name}</span>`);
  },
  bind() {
    this.showVersion();
    dom.btnHelp.addEventListener('click', () => this.open());
    dom.btnHelpClose.addEventListener('click', () => dom.helpDialog.close());
    // Clic sur le fond assombri : fermeture
    dom.helpDialog.addEventListener('click', (e) => { if (e.target === dom.helpDialog) dom.helpDialog.close(); });
  },
};

/* ============================================================================
   11. RACCOURCIS CLAVIER
   ========================================================================== */

const SHORTCUTS = { v: 'select', r: 'rect', e: 'ellipse', l: 'line', b: 'brush', t: 'text' }; // complété par les modules (P = Plume)

function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (document.querySelector('dialog[open]') || document.body.classList.contains('is-overlay')) return; // fenêtre ouverte : elle gère ses touches

    const mod = e.metaKey || e.ctrlKey; // ⌘ sur Mac, Ctrl ailleurs
    const key = e.key.toLowerCase();

    // Gras / italique / souligné : aussi pendant l'édition d'un texte
    const textToggle = { b: 'bold', i: 'italic', u: 'underline' }[key];
    if (mod && !e.shiftKey && !e.altKey && textToggle && canvas.getActiveObjects().some(isText)) {
      e.preventDefault();
      TextStyle.toggle(textToggle);
      return;
    }

    if (isTyping(e)) return; // on n'intercepte rien d'autre pendant la saisie

    // Zoom de la zone de travail (remplace le zoom de la page du navigateur)
    if (mod && (key === '=' || key === '+')) { e.preventDefault(); Viewport.zoomBy(ZOOM_STEP); return; }
    if (mod && (key === '-' || key === '_')) { e.preventDefault(); Viewport.zoomBy(1 / ZOOM_STEP); return; }
    if (mod && key === '0') { e.preventDefault(); Viewport.fit(); return; }
    if (mod && key === '1') { e.preventDefault(); Viewport.actualSize(); return; }

    // Espace maintenue : déplacement de la vue
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) Viewport.setSpace(true);
      return;
    }

    // Dupliquer
    if (mod && key === 'd') {
      e.preventDefault();
      Clipboard.duplicate();
      return;
    }

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

    // Raccourcis des modules (alignement, groupes, plume…)
    if (Keys.run(e, { mod, key })) return;

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

    if (e.key === '?') {
      e.preventDefault();
      Help.open();
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

  document.addEventListener('keyup', (e) => {
    if (e.code !== 'Space' || !state.spaceDown) return;
    e.preventDefault(); // évite qu'un bouton ayant le focus soit « cliqué » par Espace
    Viewport.setSpace(false);
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

/** Nom affiché d'un objet (calques, panneau) */
function objectLabel(obj) {
  if (!obj) return '';
  if (obj.name) return obj.name;
  return TYPE_LABELS[obj.shapeKind] || TYPE_LABELS[obj.type] || 'Objet';
}

/** Échappe un texte destiné à innerHTML */
function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Fenêtre modale (<dialog class="sheet">) construite à la demande par les modules.
 * Sheet.create({ title, body, foot }) → { el, body, foot, open(), close() }
 */
const Sheet = {
  create({ title, body = '', foot = '', wide = false }) {
    const el = html(`
      <dialog class="sheet${wide ? ' sheet-wide' : ''}">
        <div class="sheet-head">
          <h2>${escapeHTML(title)}</h2>
          <button class="chip chip-icon" type="button" data-close aria-label="Fermer">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>
        </div>
        <div class="sheet-body">${body}</div>
        ${foot ? `<div class="sheet-foot">${foot}</div>` : ''}
      </dialog>`);
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('[data-close]')) el.close();
    });
    return {
      el,
      body: el.querySelector('.sheet-body'),
      foot: el.querySelector('.sheet-foot'),
      $: (sel) => el.querySelector(sel),
      $$: (sel) => [...el.querySelectorAll(sel)],
      open() { if (!el.open) el.showModal(); },
      close() { el.close(); },
    };
  },
};

/** Charge un script externe une seule fois (bibliothèques utilisées rarement : PDF, vectorisation) */
const loadScript = (() => {
  const cache = {};
  return (src) => (cache[src] ||= new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = src;
    tag.onload = resolve;
    tag.onerror = () => { delete cache[src]; reject(new Error('Chargement impossible : vérifiez votre connexion.')); };
    document.head.appendChild(tag);
  }));
})();

/** Petit constructeur DOM : html('<div class="x">…</div>') → élément */
function html(markup) {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  return tpl.content.firstElementChild;
}
const isText = (obj) => ['i-text', 'textbox', 'text'].includes(obj?.type);
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/** Convertit une couleur Fabric (#hex, rgb(), nom…) en #rrggbb, ou null si absente / transparente */
function toHex(color) {
  if (!color || typeof color !== 'string' || color === 'transparent') return null;
  const c = new fabric.Color(color);
  if (c.getAlpha() === 0) return null;
  return `#${c.toHex().toLowerCase()}`;
}

/**
 * Réduit une image dont le grand côté dépasse maxSide (les filtres photo WebGL
 * sont limités à 4096 px). Les images plus petites sont renvoyées telles quelles.
 */
async function limitImageSize(dataUrl, maxSide) {
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Image illisible.'));
    el.src = dataUrl;
  });
  const ratio = maxSide / Math.max(img.naturalWidth, img.naturalHeight);
  if (ratio >= 1) return dataUrl;
  const off = document.createElement('canvas');
  off.width = Math.round(img.naturalWidth * ratio);
  off.height = Math.round(img.naturalHeight * ratio);
  off.getContext('2d').drawImage(img, 0, 0, off.width, off.height);
  return off.toDataURL(dataUrl.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png', 0.92);
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
  return `chloes-touch-${stamp}.${ext}`;
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
  dom.toolButtons.forEach((btn) => {
    if (btn.closest('.rail-flyout')) return; // menu des formes : géré par ShapeMenu
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });
  ShapeMenu.bind();

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
  TextStyle.bind();
  Viewport.bind();
  Clipboard.bind();
  Help.bind();
  ImageImporter.bindDragAndDrop();
  bindKeyboard();

  setTool('select');
  Hooks.emit('init');

  // Chargement du document : js/projects.js (galerie, verrouillage) s'en charge
  if (Hooks.has('boot')) Hooks.emit('boot');
  else Doc.open(null);

  // Les polices Google arrivent après le premier rendu : on redessine une fois chargées
  document.fonts?.ready.then(() => canvas.requestRenderAll());
}

// Lancement une fois tous les scripts chargés (les modules js/ s'enregistrent avant)
document.addEventListener('DOMContentLoaded', init);
