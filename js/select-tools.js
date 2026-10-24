/**
 * ============================================================================
 *  Chloe’s Touch — Outils de sélection avancés (menu du rail sous la flèche blanche)
 *
 *  Baguette magique (Y) : un clic sur un objet sélectionne tous les objets
 *    qui lui ressemblent — même remplissage, contour, épaisseur et/ou opacité,
 *    avec une tolérance réglable (options dans le panneau).
 *    Maj + clic : ajoute à la sélection · Alt + clic : retire.
 *  Lasso (Q) : entourez à main levée ; un objet est pris si son centre ou
 *    l'un de ses points d'ancrage est dans le lasso. Maj : ajoute · Alt : retire.
 * ============================================================================
 */
'use strict';

const SELECT_ICONS = {
  wand: '<path d="m4 20 10-10"/><path d="m14 10 2-2"/><path d="M15 3v2M19 7h2M18.5 4.5 17 6M11 4.5 12.5 6M19 11.5 17.5 10"/>',
  lasso: '<path d="M7 18.5C3.8 17 2.5 14.6 3.2 12 4.3 7.6 10 5 15.4 6c4.4.8 6.5 3.7 5.3 6.6-1.2 3-6 4.5-10.7 3.6"/><path d="M8 16.5a2 2 0 1 0 0 4c1.5 0 1.8 1.6.8 3"/>',
};

/** Objet le plus en avant sous le pointeur (même quand l'outil ignore les cibles) */
function objectUnderPointer(e) {
  const skip = canvas.skipTargetFind;
  canvas.skipTargetFind = false;
  const target = canvas.findTarget(e, true);
  canvas.skipTargetFind = skip;
  return target && !target.locked && target.visible && !target.excludeFromExport ? target : null;
}

/** Applique une sélection selon le mode : 'set' | 'add' | 'remove' */
let selectionBeforeClick = []; // Fabric vide la sélection au clic dans le vide : on la mémorise avant

function applySelection(found, mode) {
  const current = selectionBeforeClick.filter((o) => canvas.getObjects().includes(o));
  let next = found;
  if (mode === 'add') next = [...new Set([...current, ...found])];
  if (mode === 'remove') next = current.filter((o) => !found.includes(o));
  canvas.discardActiveObject();
  if (next.length) Arrange.reselect(next);
  canvas.requestRenderAll();
  Properties.sync();
  return next;
}

const selectionMode = (e) => (e.altKey ? 'remove' : e.shiftKey ? 'add' : 'set');

/* ============================================================================
   BAGUETTE MAGIQUE
   ========================================================================== */

const MagicWand = {
  opts: { fill: true, stroke: false, strokeWidth: false, opacity: false, tolerance: 20 },

  colorOf(obj, prop) {
    const v = obj.type === 'group' ? groupColor(obj, prop) : obj[prop];
    if (v && typeof v === 'object') return JSON.stringify(v.toObject ? v.toObject() : v); // dégradé, motif
    return toHex(v);
  },

  /** Écart entre deux couleurs, en % (0 = identiques) */
  colorDistance(a, b) {
    if (a === b) return 0;
    if (!a || !b || a.startsWith('{') || b.startsWith('{')) return 100;
    const ca = new fabric.Color(a).getSource();
    const cb = new fabric.Color(b).getSource();
    return (Math.hypot(ca[0] - cb[0], ca[1] - cb[1], ca[2] - cb[2]) / 441.68) * 100;
  },

  matches(ref, obj) {
    const { tolerance } = this.opts;
    if (this.opts.fill && this.colorDistance(this.colorOf(ref, 'fill'), this.colorOf(obj, 'fill')) > tolerance) return false;
    if (this.opts.stroke && this.colorDistance(this.colorOf(ref, 'stroke'), this.colorOf(obj, 'stroke')) > tolerance) return false;
    if (this.opts.strokeWidth && Math.abs((ref.strokeWidth || 0) - (obj.strokeWidth || 0)) > Math.max(0.5, (tolerance / 100) * 10)) return false;
    if (this.opts.opacity && Math.abs((ref.opacity ?? 1) - (obj.opacity ?? 1)) * 100 > Math.max(1, tolerance)) return false;
    return true;
  },

  similarTo(ref) {
    return canvas.getObjects().filter((o) => o.visible && !o.locked && !o.excludeFromExport && this.matches(ref, o));
  },
};

Tools.wand = {
  cursor: 'crosshair',
  activate() { setInteractionMode('draw'); },
  onMouseUp(p, e) {
    const target = objectUnderPointer(e);
    if (!target) {
      if (selectionMode(e) === 'set') { canvas.discardActiveObject(); canvas.requestRenderAll(); Properties.sync(); }
      return;
    }
    const o = MagicWand.opts;
    if (!o.fill && !o.stroke && !o.strokeWidth && !o.opacity) { toast('Cochez au moins un critère de la baguette magique.'); return; }
    const found = MagicWand.similarTo(target);
    const sel = applySelection(found, selectionMode(e));
    toast(`${sel.length} objet${sel.length > 1 ? 's' : ''} sélectionné${sel.length > 1 ? 's' : ''}`);
  },
  options() {
    const o = MagicWand.opts;
    const check = (k, label) => `<label class="check"><input type="checkbox" data-wand="${k}" ${o[k] ? 'checked' : ''}> ${label}</label>`;
    const el = html(`
      <div class="tool-options-body">
        <p class="field-note">Cliquez sur un objet : tous ceux qui lui ressemblent sont sélectionnés. Maj ajoute, Alt retire.</p>
        <div class="check-grid">
          ${check('fill', 'Remplissage')}${check('stroke', 'Contour')}${check('strokeWidth', 'Épaisseur')}${check('opacity', 'Opacité')}
        </div>
      </div>`);
    el.append(optionRange({ id: 'wand-tolerance', label: 'Tolérance', min: 0, max: 100, value: o.tolerance, unit: ' %', onInput: (v) => { o.tolerance = v; } }));
    el.querySelectorAll('[data-wand]').forEach((c) => c.addEventListener('change', () => { o[c.dataset.wand] = c.checked; }));
    return el;
  },
};

/* ============================================================================
   LASSO
   ========================================================================== */

const Lasso = {
  points: null,

  inside(p, poly) {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
      const a = poly[i];
      const b = poly[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
    }
    return hit;
  },

  /** Points représentatifs d'un objet : centre + points d'ancrage (ou coins) */
  probePoints(obj) {
    const pts = [obj.getCenterPoint()];
    if (Geo.canConvert(obj)) {
      Geo.commands(obj).forEach((c) => { if (c[0] !== 'Z') pts.push({ x: c[c.length - 2], y: c[c.length - 1] }); });
    } else {
      obj.setCoords();
      const a = obj.aCoords;
      pts.push(a.tl, a.tr, a.br, a.bl);
    }
    return pts;
  },

  render() {
    const ctx = canvas.contextTop;
    if (!ctx) return; // rendu d’export en cours (toCanvasElement) : pas de calque d’interface
    canvas.clearContext(ctx);
    const P = this.points;
    if (!P || P.length < 2) return;
    const v = canvas.viewportTransform;
    ctx.save();
    ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]);
    ctx.lineWidth = 1.5 / v[0];
    ctx.setLineDash([5 / v[0], 4 / v[0]]);
    ctx.strokeStyle = '#d9474f';
    ctx.fillStyle = 'rgba(246, 138, 141, 0.14)';
    ctx.beginPath();
    P.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  },
};

Tools.lasso = {
  cursor: 'crosshair',
  activate() { setInteractionMode('draw'); },
  deactivate() { Lasso.points = null; canvas.clearContext(canvas.contextTop); },
  onMouseDown(p) { Lasso.points = [p]; },
  onMouseMove(p) {
    if (!Lasso.points) return;
    const last = Lasso.points[Lasso.points.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) * canvas.getZoom() < 3) return;
    Lasso.points.push(p);
    Lasso.render();
  },
  onMouseUp(p, e) {
    const poly = Lasso.points;
    Lasso.points = null;
    canvas.clearContext(canvas.contextTop);
    if (!poly || poly.length < 3) {
      if (selectionMode(e) === 'set') { canvas.discardActiveObject(); canvas.requestRenderAll(); Properties.sync(); }
      return;
    }
    const found = canvas.getObjects().filter((o) => o.visible && !o.locked && !o.excludeFromExport
      && Lasso.probePoints(o).some((pt) => Lasso.inside(pt, poly)));
    applySelection(found, selectionMode(e));
  },
  options() {
    return html('<p class="field-note">Entourez les objets à main levée : ceux dont le centre ou un point est dans le lasso sont sélectionnés. Maj ajoute, Alt retire.</p>');
  },
};

TOOL_LABELS.wand = 'Baguette magique';
TOOL_LABELS.lasso = 'Lasso';
SHORTCUTS.y = 'wand';
SHORTCUTS.q = 'lasso';

Hooks.on('init', () => {
  canvas.on('mouse:down:before', () => {
    if (state.tool === 'wand' || state.tool === 'lasso') selectionBeforeClick = canvas.getActiveObjects();
  });
  RailGroups.create('select-more', {
    title: 'Sélection avancée',
    after: $('.rail [data-tool="direct"]'),
    items: [
      { tool: 'wand', label: 'Baguette magique', icon: SELECT_ICONS.wand, kbd: 'Y' },
      { tool: 'lasso', label: 'Lasso', icon: SELECT_ICONS.lasso, kbd: 'Q' },
    ],
  });
});
