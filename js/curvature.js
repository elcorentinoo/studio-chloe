/**
 * ============================================================================
 *  Chloe’s Touch — Outil Courbure (Maj + P), dans le menu de la Plume
 *
 *  Comme dans Illustrator : chaque clic pose un point par lequel la courbe
 *  passe, et la courbe se lisse toute seule (spline de Catmull-Rom convertie
 *  en courbes de Bézier).
 *    clic            → point lisse
 *    Alt + clic      → point d'angle (ou double-clic sur un point existant)
 *    glisser un point déjà posé → le déplacer
 *    clic sur le 1er point → ferme la forme
 *    Entrée / Échap  → termine · Retour arrière → retire le dernier point
 * ============================================================================
 */
'use strict';

const CURVE_ICON = '<path d="M4 18C6 8 12 5 20 6"/><circle cx="4" cy="18" r="1.6"/><circle cx="11" cy="8.4" r="1.6"/><circle cx="20" cy="6" r="1.6"/>';
const PEN_ICON = '<path d="M12 19l7-7 3 3-7 7z"/><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18z"/><path d="m2 2 7.6 7.6"/><circle cx="11" cy="11" r="2"/>';

/**
 * Courbe lisse passant par les points (Catmull-Rom → Bézier).
 * pts : [{ x, y, corner }] ; renvoie des segments [p0, c1, c2, p1].
 */
function catmullRomSegments(pts, closed) {
  const n = pts.length;
  const get = (i) => (closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)]);
  const segs = [];
  const count = closed ? n : n - 1;
  for (let i = 0; i < count; i += 1) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    const c1 = p1.corner ? { x: p1.x, y: p1.y } : { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = p2.corner ? { x: p2.x, y: p2.y } : { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    segs.push([p1, c1, c2, p2]);
  }
  return segs;
}

function segmentsToPathData(segs, closed) {
  const f = (n) => Math.round(n * 100) / 100;
  if (!segs.length) return '';
  let d = `M ${f(segs[0][0].x)} ${f(segs[0][0].y)}`;
  segs.forEach(([, c1, c2, p]) => { d += ` C ${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p.x)} ${f(p.y)}`; });
  return closed ? `${d} Z` : d;
}

Tools.curvature = {
  cursor: 'crosshair',
  points: [],
  mouse: null,
  dragIndex: -1,
  lastClick: 0,

  activate() { setInteractionMode('draw'); this.points = []; this.render(); },
  deactivate() { this.finish(false); },

  hitIndex(p) {
    const r = PEN_CLOSE_PX / canvas.getZoom();
    return this.points.findIndex((pt) => Math.hypot(pt.x - p.x, pt.y - p.y) < r);
  },

  onMouseDown(p, e) {
    const hit = this.hitIndex(p);
    const now = Date.now();
    const dbl = now - this.lastClick < 350;
    this.lastClick = now;
    if (hit === 0 && this.points.length >= 3 && !dbl) { this.finish(true); return; }
    if (hit >= 0) {
      if (dbl) this.points[hit].corner = !this.points[hit].corner; // double-clic : angle ↔ lisse
      this.dragIndex = hit;
      this.render();
      return;
    }
    this.points.push({ x: p.x, y: p.y, corner: e.altKey });
    this.dragIndex = this.points.length - 1;
    this.render();
  },

  onMouseMove(p) {
    this.mouse = p;
    if (this.dragIndex >= 0 && this.points[this.dragIndex]) {
      Object.assign(this.points[this.dragIndex], { x: p.x, y: p.y });
    }
    this.render();
  },

  onMouseUp() { this.dragIndex = -1; },

  removeLast() { this.points.pop(); this.render(); },

  finish(close) {
    const pts = this.points;
    this.points = [];
    this.dragIndex = -1;
    canvas.clearContext(canvas.contextTop);
    if (pts.length < 2) return;
    const d = segmentsToPathData(catmullRomSegments(pts, close), close);
    const s = shapeStyle();
    const path = new fabric.Path(d, {
      ...s,
      fill: close ? s.fill : null,
      stroke: s.stroke || (close ? null : s.fill) || '#c73527',
      strokeWidth: close ? s.strokeWidth : Math.max(1, s.strokeWidth),
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      shapeKind: 'pen',
    });
    canvas.add(path);
    canvas.setActiveObject(path);
    canvas.requestRenderAll();
    History.queue();
  },

  render() {
    const ctx = canvas.contextTop;
    if (!ctx) return; // rendu d’export en cours (toCanvasElement) : pas de calque d’interface
    if (!ctx) return;
    canvas.clearContext(ctx);
    if (!this.points.length || state.tool !== 'curvature') return;
    const v = canvas.viewportTransform;
    const zoom = v[0];
    const preview = this.dragIndex < 0 && this.mouse ? [...this.points, { ...this.mouse }] : this.points;
    ctx.save();
    ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]);
    ctx.lineWidth = 1.5 / zoom;
    ctx.strokeStyle = PEN_COLOR;
    if (preview.length >= 2) {
      const segs = catmullRomSegments(preview, false);
      ctx.beginPath();
      ctx.moveTo(segs[0][0].x, segs[0][0].y);
      segs.forEach(([, c1, c2, q]) => ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, q.x, q.y));
      ctx.stroke();
    }
    this.points.forEach((pt, i) => {
      const r = (i === 0 && this.points.length >= 3 ? 5 : 3.5) / zoom;
      ctx.beginPath();
      if (pt.corner) ctx.rect(pt.x - r, pt.y - r, r * 2, r * 2);
      else ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
      ctx.fillStyle = i === this.dragIndex ? '#f68a8d' : '#ffffff';
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  },

  options() {
    return html('<p class="field-note">Cliquez pour poser des points : la courbe se lisse toute seule. Alt + clic : point d\'angle · double-clic sur un point : angle ↔ lisse · glisser un point pour le déplacer · clic sur le 1er point pour fermer · Entrée pour terminer.</p>');
  },
};

TOOL_LABELS.curvature = 'Courbure';

Hooks.on('init', () => {
  // La Plume du rail devient un menu : Plume + Courbure
  const penBtn = $('.rail [data-tool="pen"]');
  RailGroups.create('pen', {
    title: 'Plume',
    after: penBtn,
    items: [
      { tool: 'pen', label: 'Plume', icon: PEN_ICON, kbd: 'P' },
      { tool: 'curvature', label: 'Courbure', icon: CURVE_ICON, kbd: 'Maj P' },
    ],
  });
  penBtn.remove();
  dom.toolButtons = document.querySelectorAll('[data-tool]');

  Keys.add((e, { mod, key }) => {
    if (!mod && !e.altKey && e.shiftKey && key === 'p') { e.preventDefault(); setTool('curvature'); return true; }
    if (state.tool === 'curvature' && Tools.curvature.points.length) {
      if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); Tools.curvature.finish(false); return true; }
      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); Tools.curvature.removeLast(); return true; }
    }
    return false;
  });
  canvas.on('after:render', () => { if (state.tool === 'curvature' && Tools.curvature.points.length) Tools.curvature.render(); });

  // ⌘Z pendant un tracé à la Courbure : retire le dernier point
  const baseUndo = History.undo;
  History.undo = () => {
    if (state.tool === 'curvature' && Tools.curvature.points.length) { Tools.curvature.removeLast(); return; }
    baseUndo();
  };
});
