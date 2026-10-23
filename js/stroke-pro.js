/**
 * ============================================================================
 *  Studio Chloé — Contours avancés (tuile Apparence → « Options de contour »)
 *    - Extrémités : plate / arrondie / carrée
 *    - Jointures  : angle / arrondie / biseau
 *    - Pointillés : longueur des tirets et des espaces
 *    - Pointes de flèche au début / à la fin des tracés ouverts
 *      (flèche, triangle, cercle, barre) + taille
 *    - Vectoriser le contour : le trait devient une forme pleine (paper.js)
 *  Les pointes sont dessinées par le rendu de l'objet (obj.arrowStart /
 *  arrowEnd / arrowScale) et exportées en SVG.
 * ============================================================================
 */
'use strict';

const ARROW_KINDS = { none: 'Aucune', arrow: 'Flèche', triangle: 'Triangle', circle: 'Cercle', bar: 'Barre' };
const STROKE_TARGET_TYPES = ['path', 'polyline', 'line', 'polygon', 'rect', 'ellipse', 'circle', 'triangle'];

const Arrowheads = {
  /** Extrémités et tangentes d'un tracé ouvert, en coordonnées LOCALES */
  ends(obj) {
    let pts = null;
    if (obj.type === 'line') {
      const p = obj.calcLinePoints();
      pts = [{ x: p.x1, y: p.y1 }, { x: p.x2, y: p.y2 }];
      return { start: pts[0], startDir: pts[1], end: pts[1], endDir: pts[0] };
    }
    if (obj.type === 'polyline') {
      const o = obj.pathOffset;
      pts = obj.points.map((p) => ({ x: p.x - o.x, y: p.y - o.y }));
      if (pts.length < 2) return null;
      return { start: pts[0], startDir: pts[1], end: pts[pts.length - 1], endDir: pts[pts.length - 2] };
    }
    if (obj.type === 'path') {
      const cmds = Geo.localCommands(obj);
      if (cmds.some((c) => c[0] === 'Z')) return null;
      const anchors = [];
      cmds.forEach((c) => { if (c[0] !== 'Z') anchors.push(c); });
      if (anchors.length < 2) return null;
      const first = anchors[0];
      const second = anchors[1];
      const last = anchors[anchors.length - 1];
      const start = { x: first[1], y: first[2] };
      const end = { x: last[last.length - 2], y: last[last.length - 1] };
      // Direction : premier point de contrôle distinct
      const pick = (c, from) => {
        for (let k = 1; k < c.length; k += 2) if (Math.hypot(c[k] - from.x, c[k + 1] - from.y) > 1e-6) return { x: c[k], y: c[k + 1] };
        return null;
      };
      const startDir = pick(second, start) || { x: start.x + 1, y: start.y };
      const lastPrevEnd = anchors[anchors.length - 2];
      const backwards = last.length > 3 ? [last[last.length - 4], last[last.length - 3]] : [lastPrevEnd[lastPrevEnd.length - 2], lastPrevEnd[lastPrevEnd.length - 1]];
      let endDir = { x: backwards[0], y: backwards[1] };
      if (Math.hypot(endDir.x - end.x, endDir.y - end.y) < 1e-6) endDir = { x: lastPrevEnd[lastPrevEnd.length - 2], y: lastPrevEnd[lastPrevEnd.length - 1] };
      return { start, startDir, end, endDir };
    }
    return null;
  },

  /** Formes d'une pointe (coordonnées locales) : [{ d: [[x,y]...], closed, filled, stroke }] */
  shape(kind, tip, from, size, sw) {
    const ang = Math.atan2(tip.y - from.y, tip.x - from.x);
    const rot = (x, y) => ({ x: tip.x + x * Math.cos(ang) - y * Math.sin(ang), y: tip.y + x * Math.sin(ang) + y * Math.cos(ang) });
    if (kind === 'arrow') return { pts: [rot(-size, -size * 0.6), rot(0, 0), rot(-size, size * 0.6)], closed: false, filled: false, width: sw };
    if (kind === 'triangle') return { pts: [rot(sw * 0.5, 0), rot(-size, -size * 0.55), rot(-size, size * 0.55)], closed: true, filled: true };
    if (kind === 'bar') return { pts: [rot(0, -size * 0.6), rot(0, size * 0.6)], closed: false, filled: false, width: sw };
    if (kind === 'circle') {
      const c = rot(0, 0);
      const r = size * 0.42;
      const pts = Array.from({ length: 24 }, (_, i) => ({ x: c.x + r * Math.cos((i / 24) * Math.PI * 2), y: c.y + r * Math.sin((i / 24) * Math.PI * 2) }));
      return { pts, closed: true, filled: true };
    }
    return null;
  },

  list(obj) {
    if (!(obj.arrowStart || obj.arrowEnd) || !toHex(obj.stroke) || !obj.strokeWidth) return [];
    const e = this.ends(obj);
    if (!e) return [];
    const sw = obj.strokeWidth;
    const size = Math.max(6, sw * 3.2) * ((obj.arrowScale || 100) / 100);
    const out = [];
    if (obj.arrowStart && obj.arrowStart !== 'none') out.push(this.shape(obj.arrowStart, e.start, e.startDir, size, sw));
    if (obj.arrowEnd && obj.arrowEnd !== 'none') out.push(this.shape(obj.arrowEnd, e.end, e.endDir, size, sw));
    return out.filter(Boolean);
  },

  draw(obj, ctx) {
    const heads = this.list(obj);
    if (!heads.length) return;
    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = obj.stroke;
    ctx.strokeStyle = obj.stroke;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    heads.forEach((h) => {
      ctx.beginPath();
      h.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (h.closed) ctx.closePath();
      if (h.filled) ctx.fill();
      else { ctx.lineWidth = h.width; ctx.stroke(); }
    });
    ctx.restore();
  },

  svg(obj) {
    const heads = this.list(obj);
    if (!heads.length) return '';
    const m = obj.group ? obj.calcOwnMatrix() : obj.calcTransformMatrix();
    const f = (n) => Math.round(n * 100) / 100;
    const color = toHex(obj.stroke);
    return heads.map((h) => {
      const pts = h.pts.map((p) => fabric.util.transformPoint(p, m));
      const d = `M ${pts.map((p) => `${f(p.x)} ${f(p.y)}`).join(' L ')}${h.closed ? ' Z' : ''}`;
      return h.filled
        ? `<path d="${d}" style="fill:${color};stroke:none;opacity:${obj.opacity ?? 1}" />\n`
        : `<path d="${d}" style="fill:none;stroke:${color};stroke-width:${f(h.width)};stroke-linecap:round;stroke-linejoin:round;opacity:${obj.opacity ?? 1}" />\n`;
    }).join('');
  },
};

/* ---------- rendu & SVG : pointes ajoutées aux tracés, polylignes, lignes ---------- */
['Path', 'Polyline', 'Line'].forEach((klass) => {
  const proto = fabric[klass].prototype;
  const baseRender = proto._render;
  proto._render = function render(ctx) {
    baseRender.call(this, ctx);
    if (this.arrowStart || this.arrowEnd) Arrowheads.draw(this, ctx);
  };
  const baseSVG = proto.toSVG;
  proto.toSVG = function toSVG(reviver) {
    const out = baseSVG.call(this, reviver);
    return this.arrowStart || this.arrowEnd ? out + Arrowheads.svg(this) : out;
  };
});
// Les pointes débordent de la boîte : pas de cache image pour ces objets
{
  const baseShould = fabric.Object.prototype.shouldCache;
  fabric.Object.prototype.shouldCache = function shouldCache() {
    if (this.arrowStart || this.arrowEnd) { this.ownCaching = false; return false; }
    return baseShould.call(this);
  };
}

/* ---------- vectoriser le contour ---------- */
const OutlineStroke = {
  /** Zone couverte par le trait d'un objet (paper PathItem, coordonnées du document) */
  strokeArea(obj) {
    const m = obj.calcTransformMatrix();
    const scale = obj.strokeUniform ? 1 : Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
    const r = (obj.strokeWidth * scale) / 2;
    const subs = WidthProfile.sample(Geo.commands(obj));
    const parts = subs.map((s) => Eraser.shape(s.pts, r));
    return parts.reduce((a, b) => a.unite(b, { insert: false }));
  },

  async run(objs = canvas.getActiveObjects()) {
    const list = objs.filter((o) => Geo.canConvert(o) && toHex(o.stroke) && o.strokeWidth > 0);
    if (!list.length) { toast('Sélectionnez une forme ou un tracé qui a un contour.'); return; }
    try { await PaperKit.ready(); } catch { toast('Indisponible : paper.js n\'a pas pu être chargé.', 'error'); return; }
    canvas.discardActiveObject();
    const made = [];
    list.forEach((obj) => {
      const area = this.strokeArea(obj);
      const outline = new fabric.Path(area.pathData, { fill: obj.stroke, stroke: null, strokeWidth: 0, opacity: obj.opacity, fillRule: 'evenodd', name: 'Contour vectorisé' });
      const hasFill = obj.fill && (typeof obj.fill === 'object' || toHex(obj.fill)) && !['polyline', 'line'].includes(obj.type);
      if (hasFill) {
        const body = Geo.toPath(obj, { stroke: null, strokeWidth: 0, opacity: 1 });
        outline.set({ opacity: 1 });
        const g = new fabric.Group([body, outline], { opacity: obj.opacity, name: objectLabel(obj) });
        Geo.replace(obj, g, { select: false });
        made.push(g);
      } else {
        Geo.replace(obj, outline, { select: false });
        made.push(outline);
      }
      // Les pointes de flèche deviennent aussi des formes
      Arrowheads.list(obj).forEach((h) => {
        const m = obj.calcTransformMatrix();
        const pts = h.pts.map((p) => fabric.util.transformPoint(p, m));
        if (h.filled) {
          const head = new fabric.Polygon(pts, { fill: obj.stroke, strokeWidth: 0 });
          canvas.add(head);
          made.push(head);
        } else {
          const area = Eraser.shape(pts, h.width / 2);
          const head = new fabric.Path(area.pathData, { fill: obj.stroke, strokeWidth: 0 });
          canvas.add(head);
          made.push(head);
        }
      });
    });
    Arrange.reselect(made);
    canvas.requestRenderAll();
    History.queue();
    toast('Contour vectorisé', 'success');
  },
};

/* ---------- panneau ---------- */
const StrokePanel = {
  mountUI() {
    const opts = (name, list) => Object.entries(list).map(([k, l]) => `<button class="chip" type="button" data-${name}="${k}">${l}</button>`).join('');
    const arrowSelect = (id) => `<select class="input input-sm" id="${id}">${Object.entries(ARROW_KINDS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>`;
    this.el = html(`
      <details class="stroke-options" id="stroke-options">
        <summary>Options de contour</summary>
        <div class="stroke-options-body">
          <span class="swatch-caption">Extrémités</span>
          <div class="chips">${opts('cap', { butt: 'Plates', round: 'Arrondies', square: 'Carrées' })}</div>
          <span class="swatch-caption">Jointures</span>
          <div class="chips">${opts('join', { miter: 'Angle', round: 'Arrondies', bevel: 'Biseau' })}</div>
          <label class="check"><input type="checkbox" id="stroke-dash"> Pointillés</label>
          <div class="dash-controls" hidden>
            <label class="field-label" for="stroke-dash-len">Tiret <output id="out-dash-len">8 px</output></label>
            <input type="range" id="stroke-dash-len" min="0" max="60" step="1" value="8">
            <label class="field-label" for="stroke-dash-gap">Espace <output id="out-dash-gap">6 px</output></label>
            <input type="range" id="stroke-dash-gap" min="1" max="60" step="1" value="6">
          </div>
          <div class="arrow-controls">
            <span class="swatch-caption">Pointes de flèche (tracés ouverts)</span>
            <div class="input-row">${arrowSelect('arrow-start')}${arrowSelect('arrow-end')}</div>
            <label class="field-label" for="arrow-scale">Taille des pointes <output id="out-arrow-scale">100 %</output></label>
            <input type="range" id="arrow-scale" min="40" max="300" step="5" value="100">
          </div>
          <button class="btn btn-sm btn-block" type="button" id="stroke-outline">Vectoriser le contour</button>
        </div>
      </details>`);
    dom.propStrokeWidth.closest('.field').after(this.el);
    const $e = (s) => this.el.querySelector(s);
    const targets = () => canvas.getActiveObjects().filter((o) => STROKE_TARGET_TYPES.includes(o.type));
    const apply = (props) => {
      const list = targets();
      list.forEach((o) => { o.set(props); o.dirty = true; });
      canvas.requestRenderAll();
      if (list.length) History.queue();
      this.sync();
    };
    this.el.querySelectorAll('[data-cap]').forEach((b) => b.addEventListener('click', () => apply({ strokeLineCap: b.dataset.cap })));
    this.el.querySelectorAll('[data-join]').forEach((b) => b.addEventListener('click', () => apply({ strokeLineJoin: b.dataset.join })));
    const dash = () => ($e('#stroke-dash').checked ? [Number($e('#stroke-dash-len').value), Number($e('#stroke-dash-gap').value)] : null);
    $e('#stroke-dash').addEventListener('change', () => apply({ strokeDashArray: dash() }));
    ['#stroke-dash-len', '#stroke-dash-gap'].forEach((id) => $e(id).addEventListener('input', () => apply({ strokeDashArray: dash() })));
    $e('#arrow-start').addEventListener('change', (e) => apply({ arrowStart: e.target.value === 'none' ? undefined : e.target.value }));
    $e('#arrow-end').addEventListener('change', (e) => apply({ arrowEnd: e.target.value === 'none' ? undefined : e.target.value }));
    $e('#arrow-scale').addEventListener('input', (e) => apply({ arrowScale: Number(e.target.value) }));
    $e('#stroke-outline').addEventListener('click', () => OutlineStroke.run());
    Hooks.on('sync', () => this.sync());
  },

  sync() {
    const ref = canvas.getActiveObjects().find((o) => STROKE_TARGET_TYPES.includes(o.type));
    this.el.hidden = !ref;
    if (!ref) return;
    const $e = (s) => this.el.querySelector(s);
    this.el.querySelectorAll('[data-cap]').forEach((b) => b.classList.toggle('is-active', b.dataset.cap === (ref.strokeLineCap || 'butt')));
    this.el.querySelectorAll('[data-join]').forEach((b) => b.classList.toggle('is-active', b.dataset.join === (ref.strokeLineJoin || 'miter')));
    const d = ref.strokeDashArray;
    $e('#stroke-dash').checked = Boolean(d?.length);
    $e('.dash-controls').hidden = !d?.length;
    if (d?.length) { $e('#stroke-dash-len').value = d[0]; $e('#stroke-dash-gap').value = d[1] ?? d[0]; }
    $e('#out-dash-len').textContent = `${$e('#stroke-dash-len').value} px`;
    $e('#out-dash-gap').textContent = `${$e('#stroke-dash-gap').value} px`;
    const open = Boolean(Arrowheads.ends(ref)) && ['path', 'polyline', 'line'].includes(ref.type);
    $e('.arrow-controls').hidden = !open;
    $e('#arrow-start').value = ref.arrowStart || 'none';
    $e('#arrow-end').value = ref.arrowEnd || 'none';
    $e('#arrow-scale').value = ref.arrowScale || 100;
    $e('#out-arrow-scale').textContent = `${$e('#arrow-scale').value} %`;
    ['#stroke-dash-len', '#stroke-dash-gap', '#arrow-scale'].forEach((id) => paintRange($e(id)));
  },
};

SERIAL_PROPS.push('arrowStart', 'arrowEnd', 'arrowScale');

Hooks.on('init', () => StrokePanel.mountUI());
