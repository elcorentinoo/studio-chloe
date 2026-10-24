/**
 * ============================================================================
 *  Studio Chloé — Crayon, Lissage, Gomme (menu du rail après le Pinceau)
 *
 *  Crayon (N)   — trait à main levée converti en courbes de Bézier propres
 *                 (simplification paper.js, fidélité réglable) ; se ferme
 *                 tout seul si l'on revient au point de départ.
 *  Lissage      — frottez sur un tracé sélectionné : ses points s'adoucissent
 *                 sous le curseur (rayon et intensité réglables).
 *  Gomme (Maj+E)— efface vraiment les tracés vectoriels (découpe booléenne
 *                 paper.js : les formes pleines sont creusées, les traits
 *                 coupés en morceaux) et les pixels des images.
 *                 S'il y a une sélection, seule la sélection est gommée.
 * ============================================================================
 */
'use strict';

const PENCIL_ICONS = {
  pencil: '<path d="M4 20l1.5-5L16 4.5a2.1 2.1 0 0 1 3 3L8.5 18z"/><path d="M14 6.5l3 3"/>',
  smooth: '<path d="M3 15c3-6 6 2 9-3s6 2 9-3"/><path d="M5 20h14" stroke-dasharray="2 2.5"/>',
  eraser: '<path d="M7 21h10"/><path d="m5.5 13.5 8-8a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L12 19H8.5l-3-3a1.8 1.8 0 0 1 0-2.5z"/><path d="m9.5 9.5 5.5 5.5"/>',
};

const DrawOpts = {
  fidelity: 5,          // tolérance de simplification du crayon (px écran)
  autoClose: true,
  smoothRadius: 24,     // px écran
  smoothStrength: 50,   // %
  eraserSize: 24,       // px écran (diamètre)
  eraseImages: true,
};

/** Trace une polyligne en aperçu sur le calque supérieur */
function drawStrokePreview(points, { color = PEN_COLOR, width = 1.5, screenWidth = true, alpha = 1 } = {}) {
  const ctx = canvas.contextTop;
  if (!ctx) return; // rendu d’export en cours (toCanvasElement) : pas de calque d’interface
  canvas.clearContext(ctx);
  if (!points || points.length < 1) return;
  const v = canvas.viewportTransform;
  ctx.save();
  ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]);
  ctx.globalAlpha = alpha;
  ctx.lineWidth = screenWidth ? width / v[0] : width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  if (points.length === 1) ctx.lineTo(points[0].x + 0.01, points[0].y);
  ctx.stroke();
  ctx.restore();
}

/** Ajoute un point à une liste si la souris a assez bougé (≥ minPx écran) */
function pushPoint(list, p, minPx = 1.5) {
  const last = list[list.length - 1];
  if (!last || Math.hypot(p.x - last.x, p.y - last.y) * canvas.getZoom() >= minPx) list.push({ x: p.x, y: p.y });
}

/* ============================================================================
   CRAYON
   ========================================================================== */

Tools.pencil = {
  cursor: 'crosshair',
  points: null,
  activate() { setInteractionMode('draw'); PaperKit.ready().catch(() => {}); },
  deactivate() { this.points = null; canvas.clearContext(canvas.contextTop); },
  onMouseDown(p) { this.points = [p]; },
  onMouseMove(p) {
    if (!this.points) return;
    pushPoint(this.points, p);
    drawStrokePreview(this.points, { color: state.style.stroke || state.style.fill || '#25300b', width: Math.max(1, state.style.strokeWidth), screenWidth: false });
  },
  async onMouseUp() {
    const pts = this.points;
    this.points = null;
    if (!pts || pts.length < 2) { canvas.clearContext(canvas.contextTop); return; }
    const zoom = canvas.getZoom();
    const first = pts[0];
    const last = pts[pts.length - 1];
    const closed = DrawOpts.autoClose && pts.length > 8 && Math.hypot(first.x - last.x, first.y - last.y) * zoom < 12;
    let d;
    try {
      const paper = await PaperKit.ready();
      const path = new paper.Path({ segments: pts.map((q) => [q.x, q.y]), insert: false });
      if (closed) path.closed = true;
      path.simplify(DrawOpts.fidelity / zoom);
      d = path.pathData;
    } catch {
      // paper.js indisponible (hors ligne) : courbe lissée locale
      const step = Math.max(1, Math.round(pts.length / 40));
      const thin = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
      d = segmentsToPathData(catmullRomSegments(thin, closed), closed);
    }
    canvas.clearContext(canvas.contextTop);
    const s = shapeStyle();
    const obj = new fabric.Path(d, {
      ...s,
      fill: closed && DrawOpts.fillClosed ? s.fill : null,
      stroke: s.stroke || s.fill || '#25300b',
      strokeWidth: Math.max(1, s.strokeWidth),
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      shapeKind: 'pencil',
    });
    canvas.add(obj);
    canvas.requestRenderAll();
    History.queue();
  },
  options() {
    const el = html(`<div class="tool-options-body">
      <p class="field-note">Dessinez à main levée : le trait est converti en courbes propres. Revenez au point de départ pour fermer la forme.</p>
      <label class="check"><input type="checkbox" id="pencil-close" ${DrawOpts.autoClose ? 'checked' : ''}> Fermer si les extrémités se rejoignent</label>
      <label class="check"><input type="checkbox" id="pencil-fill"> Remplir les formes fermées</label>
    </div>`);
    el.prepend(optionRange({ id: 'pencil-fidelity', label: 'Fidélité → lissage', min: 1, max: 20, value: DrawOpts.fidelity, onInput: (v) => { DrawOpts.fidelity = v; } }));
    el.querySelector('#pencil-close').addEventListener('change', (e) => { DrawOpts.autoClose = e.target.checked; });
    el.querySelector('#pencil-fill').addEventListener('change', (e) => { DrawOpts.fillClosed = e.target.checked; });
    return el;
  },
};

/* ============================================================================
   LISSAGE
   ========================================================================== */

/** Remplace obj par un tracé sans transformation (coordonnées du document) si besoin */
function asPlainPath(obj) {
  const m = obj.calcTransformMatrix();
  const plain = obj.type === 'path' && Math.abs(m[0] - 1) < 1e-9 && Math.abs(m[3] - 1) < 1e-9 && Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9;
  if (plain) return obj;
  return Geo.replace(obj, Geo.toPath(obj), { select: false });
}

/** Met à jour la géométrie d'un tracé sans transformation à partir de données SVG */
function setPlainPathData(obj, d) {
  obj._setPath(d, {});
  obj.setCoords();
  obj.dirty = true;
}

Tools.smooth = {
  cursor: 'crosshair',
  targets: null,
  activate() { setInteractionMode('draw'); PaperKit.ready().catch(() => {}); },
  deactivate() { this.targets = null; canvas.clearContext(canvas.contextTop); },

  async onMouseDown(p, e) {
    let objs = canvas.getActiveObjects().filter((o) => Geo.canConvert(o) && !o.locked);
    if (!objs.length) {
      const t = objectUnderPointer(e);
      if (t && Geo.canConvert(t)) objs = [t];
    }
    if (!objs.length) { toast('Sélectionnez un tracé à lisser, puis frottez dessus.'); return; }
    try { await PaperKit.ready(); } catch { toast('Lissage indisponible : paper.js n\'a pas pu être chargé.', 'error'); return; }
    canvas.discardActiveObject();
    this.targets = objs.map(asPlainPath);
    Arrange.reselect(this.targets);
    this.apply(p);
  },

  onMouseMove(p) {
    if (this.targets) this.apply(p);
    this.cursorRing(p);
  },

  onMouseUp() {
    if (!this.targets) return;
    this.targets = null;
    canvas.requestRenderAll();
    History.queue();
  },

  apply(p) {
    const paper = PaperKit.scope;
    const r = DrawOpts.smoothRadius / canvas.getZoom();
    const k = DrawOpts.smoothStrength / 100;
    this.targets.forEach((obj) => {
      const item = paper.PathItem.create(Geo.toPathData(Geo.commands(obj)));
      const paths = item.children ? item.children : [item];
      let changed = false;
      paths.forEach((path) => {
        const segs = path.segments;
        const n = segs.length;
        if (n < 3) return;
        const hits = [];
        segs.forEach((s, i) => { if (s.point.getDistance(new paper.Point(p.x, p.y)) < r) hits.push(i); });
        hits.forEach((i) => {
          if (!path.closed && (i === 0 || i === n - 1)) return; // les extrémités restent en place
          const prev = segs[(i - 1 + n) % n].point;
          const next = segs[(i + 1) % n].point;
          const target = prev.add(next).divide(2);
          segs[i].point = segs[i].point.add(target.subtract(segs[i].point).multiply(k * 0.5));
          changed = true;
        });
        hits.forEach((i) => { if (path.closed || (i > 0 && i < n - 1)) segs[i].smooth({ type: 'catmull-rom' }); });
      });
      if (changed) setPlainPathData(obj, item.pathData);
    });
    canvas.requestRenderAll();
  },

  cursorRing(p) {
    const ctx = canvas.contextTop;
    if (!ctx) return; // rendu d’export en cours (toCanvasElement) : pas de calque d’interface
    canvas.clearContext(ctx);
    const v = canvas.viewportTransform;
    ctx.save();
    ctx.strokeStyle = PEN_COLOR;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(p.x * v[0] + v[4], p.y * v[3] + v[5], DrawOpts.smoothRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  },

  options() {
    const el = html('<div class="tool-options-body"><p class="field-note">Sélectionnez un tracé (crayon, pinceau, plume…) puis frottez dessus pour l\'adoucir.</p></div>');
    el.append(
      optionRange({ id: 'smooth-radius', label: 'Rayon', min: 6, max: 80, value: DrawOpts.smoothRadius, unit: ' px', onInput: (v) => { DrawOpts.smoothRadius = v; } }),
      optionRange({ id: 'smooth-strength', label: 'Intensité', min: 5, max: 100, value: DrawOpts.smoothStrength, unit: ' %', onInput: (v) => { DrawOpts.smoothStrength = v; } }),
    );
    return el;
  },
};

/* ============================================================================
   GOMME
   ========================================================================== */

const Eraser = {
  /** Zone gommée : union de capsules le long du trait (paper.js) */
  shape(points, radius) {
    const paper = PaperKit.scope;
    // Points espacés d'au moins un demi-rayon (moins d'unions, même résultat)
    const pts = [];
    points.forEach((p) => {
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= radius * 0.5) pts.push(p);
    });
    const last = points[points.length - 1];
    if (pts[pts.length - 1] !== last) pts.push(last);
    const parts = pts.map((p) => new paper.Path.Circle({ center: [p.x, p.y], radius, insert: false }));
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1];
      const b = pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1e-6) continue;
      const nx = (-(b.y - a.y) / len) * radius;
      const ny = ((b.x - a.x) / len) * radius;
      parts.push(new paper.Path({ segments: [[a.x + nx, a.y + ny], [b.x + nx, b.y + ny], [b.x - nx, b.y - ny], [a.x - nx, a.y - ny]], closed: true, insert: false }));
    }
    // Unions deux à deux (arbre équilibré : bien plus rapide qu'en chaîne)
    let list = parts;
    while (list.length > 1) {
      const next = [];
      for (let i = 0; i < list.length; i += 2) next.push(list[i + 1] ? list[i].unite(list[i + 1], { insert: false }) : list[i]);
      list = next;
    }
    return list[0];
  },

  hasFill(obj) {
    const f = obj.fill;
    return Boolean(f && (typeof f === 'object' || toHex(f)));
  },

  /** Gomme un objet vectoriel ; renvoie 'removed' | 'changed' | null */
  eraseVector(obj, zone) {
    const paper = PaperKit.scope;
    const item = paper.PathItem.create(Geo.toPathData(Geo.commands(obj)));
    if (!item.bounds.intersects(zone.bounds)) return null;
    const filled = this.hasFill(obj) && obj.type !== 'polyline' && obj.type !== 'line';
    const result = item.subtract(zone, { insert: false, trace: filled });
    const d = result?.pathData || '';
    if (!d || !/[LHVCSQTAZlhvcsqtaz]/.test(d)) { canvas.remove(obj); return 'removed'; }
    if (d === item.pathData) return null;
    const neu = new fabric.Path(d, { ...Geo.styleOf(obj), fillRule: 'evenodd', shapeKind: obj.shapeKind });
    if (!filled) neu.set({ fill: null });
    Geo.replace(obj, neu, { select: false });
    return 'changed';
  },

  /** Gomme les pixels d'une image (le long du trait, dans son repère) */
  async eraseImage(img, points, radius) {
    const b = img.getBoundingRect(true, true);
    const touches = points.some((p) => p.x > b.left - radius && p.x < b.left + b.width + radius && p.y > b.top - radius && p.y < b.top + b.height + radius);
    if (!touches) return null;
    const el = img._originalElement || img.getElement();
    const W = el.naturalWidth || el.width;
    const H = el.naturalHeight || el.height;
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const ctx = off.getContext('2d');
    ctx.drawImage(el, 0, 0);
    const inv = fabric.util.invertTransform(img.calcTransformMatrix());
    const toImg = (p) => {
      const l = fabric.util.transformPoint(p, inv);
      return { x: l.x + img.width / 2 + img.cropX, y: l.y + img.height / 2 + img.cropY };
    };
    const scale = Math.sqrt(Math.abs(img.scaleX * img.scaleY)) || 1;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = (radius * 2) / scale;
    ctx.beginPath();
    points.map(toImg).forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    if (points.length === 1) { const p = toImg(points[0]); ctx.lineTo(p.x + 0.01, p.y); }
    ctx.stroke();
    const url = off.toDataURL('image/png');
    const elImg = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = url;
    });
    const keep = { width: img.width, height: img.height };
    img.setElement(elImg, keep);
    img.set({ ...keep, dirty: true });
    if (img.filters?.length) img.applyFilters();
    return 'changed';
  },

  async run(points, targets) {
    const radius = DrawOpts.eraserSize / 2 / canvas.getZoom();
    let paperOk = true;
    try { await PaperKit.ready(); } catch { paperOk = false; }
    const zone = paperOk ? this.shape(points, radius) : null;
    let changed = 0;
    let skipped = 0;
    for (const obj of targets) {
      if (!canvas.getObjects().includes(obj)) continue;
      if (Geo.canConvert(obj)) {
        if (!zone) { skipped += 1; continue; }
        if (this.eraseVector(obj, zone)) changed += 1;
      } else if (isImage(obj)) {
        if (DrawOpts.eraseImages && await this.eraseImage(obj, points, radius)) changed += 1;
      } else {
        const b = obj.getBoundingRect(true, true);
        if (points.some((p) => p.x > b.left && p.x < b.left + b.width && p.y > b.top && p.y < b.top + b.height)) skipped += 1;
      }
    }
    canvas.requestRenderAll();
    if (changed) History.queue();
    if (skipped) toast(paperOk ? 'Textes et groupes ne se gomment pas : vectorisez-les ou dissociez-les d\'abord.' : 'Gomme vectorielle indisponible : paper.js n\'a pas pu être chargé.');
    return changed;
  },
};

Tools.eraser = {
  cursor: 'crosshair',
  points: null,
  targets: null,
  activate() {
    setInteractionMode('draw');
    PaperKit.ready().catch(() => {});
  },
  deactivate() { this.points = null; canvas.clearContext(canvas.contextTop); },
  onMouseDown(p) {
    const sel = selectionBeforeClickFor('eraser');
    this.targets = sel.length ? sel : null;
    this.points = [p];
    this.preview(p);
  },
  onMouseMove(p) {
    if (this.points) { pushPoint(this.points, p, 1); this.preview(p); } else this.preview(p, true);
  },
  async onMouseUp() {
    const pts = this.points;
    this.points = null;
    canvas.clearContext(canvas.contextTop);
    if (!pts) return;
    const all = (this.targets || canvas.getObjects()).filter((o) => o.visible && !o.locked && !o.excludeFromExport);
    await Eraser.run(pts, all);
    if (this.targets) Arrange.reselect(this.targets.filter((o) => canvas.getObjects().includes(o)));
  },
  preview(p, ringOnly = false) {
    const size = DrawOpts.eraserSize / canvas.getZoom();
    if (!ringOnly && this.points) drawStrokePreview(this.points, { color: 'rgba(224, 69, 123, 0.35)', width: size, screenWidth: false });
    else if (canvas.contextTop) canvas.clearContext(canvas.contextTop);
    const ctx = canvas.contextTop;
    if (!ctx) return; // rendu d’export en cours (toCanvasElement) : pas de calque d’interface
    const v = canvas.viewportTransform;
    ctx.save();
    ctx.strokeStyle = '#e0457b';
    ctx.beginPath();
    ctx.arc(p.x * v[0] + v[4], p.y * v[3] + v[5], DrawOpts.eraserSize / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  },
  options() {
    const el = html(`<div class="tool-options-body">
      <p class="field-note">Frottez pour effacer. Avec une sélection, seule la sélection est gommée.</p>
      <label class="check"><input type="checkbox" id="eraser-images" ${DrawOpts.eraseImages ? 'checked' : ''}> Gommer aussi les pixels des images</label>
    </div>`);
    el.prepend(optionRange({ id: 'eraser-size', label: 'Taille', min: 4, max: 120, value: DrawOpts.eraserSize, unit: ' px', onInput: (v) => { DrawOpts.eraserSize = v; } }));
    el.querySelector('#eraser-images').addEventListener('change', (e) => { DrawOpts.eraseImages = e.target.checked; });
    return el;
  },
};

/** Sélection mémorisée juste avant le clic (Fabric la vide au clic dans le vide) */
const clickSelection = { tool: null, objs: [] };
function selectionBeforeClickFor(tool) {
  return clickSelection.tool === tool ? clickSelection.objs.filter((o) => canvas.getObjects().includes(o)) : [];
}

Object.assign(TOOL_LABELS, { pencil: 'Crayon', smooth: 'Lissage', eraser: 'Gomme' });
TYPE_LABELS.pencil = 'Tracé';
SHORTCUTS.n = 'pencil';

Hooks.on('init', () => {
  canvas.on('mouse:down:before', () => { clickSelection.tool = state.tool; clickSelection.objs = canvas.getActiveObjects(); });
  RailGroups.create('pencil', {
    title: 'Crayon & gomme',
    after: $('.rail [data-tool="brush"]'),
    items: [
      { tool: 'pencil', label: 'Crayon', icon: PENCIL_ICONS.pencil, kbd: 'N' },
      { tool: 'smooth', label: 'Lissage', icon: PENCIL_ICONS.smooth },
      { tool: 'eraser', label: 'Gomme', icon: PENCIL_ICONS.eraser, kbd: 'Maj E' },
    ],
  });
  Keys.add((e, { mod, key }) => {
    if (!mod && !e.altKey && e.shiftKey && key === 'e') { e.preventDefault(); setTool('eraser'); return true; }
    // [ et ] : taille de la gomme / du lissage
    if (!mod && (e.key === '[' || e.key === ']') && (state.tool === 'eraser' || state.tool === 'smooth')) {
      e.preventDefault();
      const k = state.tool === 'eraser' ? 'eraserSize' : 'smoothRadius';
      DrawOpts[k] = clamp(DrawOpts[k] + (e.key === ']' ? 4 : -4), 4, 120);
      const input = Tools[state.tool]._optionsEl?.querySelector('input[type=range]');
      if (input) { input.value = DrawOpts[k]; input.dispatchEvent(new Event('input')); }
      return true;
    }
    return false;
  });
});
