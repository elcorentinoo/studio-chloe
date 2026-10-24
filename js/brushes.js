/**
 * ============================================================================
 *  Chloe’s Touch — Pinceaux artistiques (Maj + B), menu « Crayon & gomme »
 *
 *  Trois pinceaux, dessinés à main levée, qui produisent de vraies formes
 *  vectorielles (modifiables, exportables) :
 *    Calligraphique — plume biseautée : l'épaisseur dépend de la direction
 *                     du trait (angle et rondeur de la plume réglables) ;
 *    Vitesse        — épais quand on ralentit, fin quand on accélère
 *                     (effet encre / feutre) ;
 *    Motif          — répète le motif choisi (la sélection au moment de
 *                     prendre l'outil, ou un petit losange) le long du trait,
 *                     orienté selon la direction.
 *  Couleur = contour courant (ou remplissage s'il n'y a pas de contour).
 * ============================================================================
 */
'use strict';

/** Pinceau (Lucide « brush », licence ISC) */
const BRUSH_ICON = '<path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/>';
const ARTBRUSH_ICON = '<path d="M3 21c3 0 6-1.5 7-4.5L19.5 7a2.1 2.1 0 0 0-3-3L7 13.5C4 14.5 3 18 3 21z"/><path d="M14 6l4 4"/><path d="M16 18c1.5-1 3-1 4.5 0"/>';

const ArtBrush = {
  opts: { kind: 'calligraphy', size: 18, angle: 45, roundness: 25, spacing: 100 },
  points: null,  // [{ x, y, t }]
  source: null,  // objet du pinceau motif

  color() { return state.style.stroke || state.style.fill || '#c73527'; },

  /** Largeur (px du document) en chaque point du trait */
  widths(pts) {
    const zoom = canvas.getZoom();
    const size = this.opts.size / zoom;
    if (this.opts.kind === 'calligraphy') {
      const nib = (this.opts.angle * Math.PI) / 180;
      const round = this.opts.roundness / 100;
      return pts.map((p, i) => {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(pts.length - 1, i + 1)];
        const dir = Math.atan2(b.y - a.y, b.x - a.x);
        return size * (round + (1 - round) * Math.abs(Math.sin(dir - nib)));
      });
    }
    // Vitesse : px écran par milliseconde → largeur, lissée
    const raw = pts.map((p, i) => {
      if (!i) return size;
      const q = pts[i - 1];
      const v = (Math.hypot(p.x - q.x, p.y - q.y) * zoom) / Math.max(1, p.t - q.t);
      return size * clamp(1.15 - v * 0.35, 0.18, 1.15);
    });
    const smooth = raw.map((w, i) => {
      const s = raw.slice(Math.max(0, i - 3), i + 4);
      return s.reduce((a, b) => a + b, 0) / s.length;
    });
    // Attaque et fin effilées
    return smooth.map((w, i) => w * Math.min(1, (i + 1) / 4, (pts.length - i) / 4));
  },

  /** Contour fermé d'un trait à largeur variable (polygone gauche + droite) */
  outline(pts, widths) {
    const left = [];
    const right = [];
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const L = Math.hypot(dx, dy) || 1;
      dx /= L;
      dy /= L;
      const h = widths[i] / 2;
      left.push({ x: p.x - dy * h, y: p.y + dx * h });
      right.push({ x: p.x + dy * h, y: p.y - dx * h });
    });
    return [...left, ...right.reverse()];
  },

  /** Points espacés régulièrement (rééchantillonnage), pour un rendu propre */
  resample(pts, step) {
    const out = [pts[0]];
    let carry = 0; // distance parcourue depuis le dernier point posé
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1];
      const b = pts[i];
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      if (L < 1e-9) continue;
      let d = step - carry;
      while (d <= L) {
        const r = d / L;
        out.push({ x: a.x + (b.x - a.x) * r, y: a.y + (b.y - a.y) * r, t: a.t + (b.t - a.t) * r });
        d += step;
      }
      carry = L - (d - step);
    }
    const last = pts[pts.length - 1];
    const end = out[out.length - 1];
    if (Math.hypot(end.x - last.x, end.y - last.y) > step * 0.3) out.push(last);
    return out;
  },

  preview() {
    const ctx = canvas.contextTop;
    if (!ctx) return; // rendu d’export en cours (toCanvasElement) : pas de calque d’interface
    canvas.clearContext(ctx);
    const P = this.points;
    if (!P || P.length < 2) return;
    const v = canvas.viewportTransform;
    ctx.save();
    ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]);
    ctx.fillStyle = this.color();
    ctx.globalAlpha = 0.85;
    if (this.opts.kind === 'pattern') {
      ctx.strokeStyle = this.color();
      ctx.lineWidth = 1 / v[0];
      ctx.setLineDash([4 / v[0], 4 / v[0]]);
      ctx.beginPath();
      P.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    } else {
      const poly = this.outline(P, this.widths(P));
      ctx.beginPath();
      poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  },

  async finish() {
    const raw = this.points;
    this.points = null;
    canvas.clearContext(canvas.contextTop);
    if (!raw || raw.length < 2) return;
    if (this.opts.kind === 'pattern') { await this.stampPattern(raw); return; }
    const pts = this.resample(raw, Math.max(1.5, 3 / canvas.getZoom()));
    const poly = this.outline(pts, this.widths(pts));
    let d = `M ${poly.map((p) => `${Math.round(p.x * 100) / 100} ${Math.round(p.y * 100) / 100}`).join(' L ')} Z`;
    try {
      // Contour simplifié en courbes douces (paper.js) si disponible
      const paper = await PaperKit.ready();
      const path = new paper.Path({ segments: poly.map((p) => [p.x, p.y]), closed: true, insert: false });
      path.simplify(0.6 / canvas.getZoom());
      d = path.pathData;
    } catch { /* polygone brut */ }
    const obj = new fabric.Path(d, {
      fill: this.color(), stroke: null, strokeWidth: 0, opacity: state.style.opacity,
      name: this.opts.kind === 'calligraphy' ? 'Trait calligraphique' : 'Trait au pinceau',
    });
    canvas.add(obj);
    canvas.requestRenderAll();
    History.queue();
  },

  /** Pinceau motif : copies orientées le long du trait */
  async stampPattern(raw) {
    const src = this.source || new fabric.Polygon([{ x: 0, y: -10 }, { x: 6, y: 0 }, { x: 0, y: 10 }, { x: -6, y: 0 }], { fill: this.color(), strokeWidth: 0 });
    const size = this.opts.size / canvas.getZoom();
    const box = Math.max(src.width * src.scaleX, src.height * src.scaleY) || 1;
    const k = size / box;
    const step = Math.max(2, size * (this.opts.spacing / 100));
    const pts = this.resample(raw, step);
    const clones = await Promise.all(pts.map(() => new Promise((res) => src.clone(res, SERIAL_PROPS))));
    const items = clones.map((c, i) => {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      const inst = c.type === 'activeSelection' ? new fabric.Group(c.getObjects()) : c;
      inst.set({ scaleX: inst.scaleX * k, scaleY: inst.scaleY * k, angle: ang });
      inst.setPositionByOrigin(new fabric.Point(pts[i].x, pts[i].y), 'center', 'center');
      return inst;
    });
    const group = new fabric.Group(items, { name: 'Trait motif' });
    canvas.add(group);
    canvas.requestRenderAll();
    History.queue();
  },
};

Tools.artbrush = {
  cursor: 'crosshair',
  activate() {
    setInteractionMode('draw');
    const sel = canvas.getActiveObject();
    if (sel) sel.clone((c) => { ArtBrush.source = c; const el = Tools.artbrush._optionsEl?.querySelector('#ab-source'); if (el) el.textContent = objectLabel(sel); }, SERIAL_PROPS);
    canvas.discardActiveObject();
    PaperKit.ready().catch(() => {});
  },
  deactivate() { ArtBrush.points = null; canvas.clearContext(canvas.contextTop); },
  onMouseDown(p) { ArtBrush.points = [{ x: p.x, y: p.y, t: performance.now() }]; },
  onMouseMove(p) {
    const P = ArtBrush.points;
    if (!P) return;
    const last = P[P.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) * canvas.getZoom() < 1.5) return;
    P.push({ x: p.x, y: p.y, t: performance.now() });
    ArtBrush.preview();
  },
  onMouseUp() { ArtBrush.finish(); },
  options() {
    const o = ArtBrush.opts;
    const el = html(`<div class="tool-options-body">
      <div class="chips">
        <button class="chip" type="button" data-brush="calligraphy">Calligraphique</button>
        <button class="chip" type="button" data-brush="speed">Vitesse</button>
        <button class="chip" type="button" data-brush="pattern">Motif</button>
      </div>
      <div data-for="pattern" class="spray-source"><span class="field-label">Motif</span><strong id="ab-source">Losange</strong></div>
      <p class="field-note" data-for="pattern">Le motif est la sélection au moment de prendre l'outil.</p>
    </div>`);
    const range = (id, label, min, max, key, unit) => optionRange({ id, label, min, max, value: o[key], unit, onInput: (v) => { o[key] = v; } });
    const size = range('ab-size', 'Taille', 2, 120, 'size', ' px');
    const angle = range('ab-angle', 'Angle de la plume', 0, 179, 'angle', '°');
    const round = range('ab-round', 'Rondeur', 0, 100, 'roundness', ' %');
    const spacing = range('ab-spacing', 'Espacement', 30, 300, 'spacing', ' %');
    angle.dataset.for = 'calligraphy';
    round.dataset.for = 'calligraphy';
    spacing.dataset.for = 'pattern';
    el.append(size, angle, round, spacing);
    const refresh = () => {
      el.querySelectorAll('[data-brush]').forEach((b) => b.classList.toggle('is-active', b.dataset.brush === o.kind));
      el.querySelectorAll('[data-for]').forEach((x) => { x.hidden = x.dataset.for !== o.kind; });
    };
    el.querySelectorAll('[data-brush]').forEach((b) => b.addEventListener('click', () => { o.kind = b.dataset.brush; refresh(); }));
    refresh();
    return el;
  },
};

TOOL_LABELS.artbrush = 'Pinceau artistique';

Hooks.on('init', () => {
  // Les pinceaux ont leur propre menu (et une vraie icône de pinceau) : plus de doublon avec le crayon
  const brushBtn = $('.rail [data-tool="brush"]');
  RailGroups.create('brush', {
    title: 'Pinceaux',
    after: brushBtn,
    items: [
      { tool: 'brush', label: 'Pinceau', icon: BRUSH_ICON, kbd: 'B' },
      { tool: 'artbrush', label: 'Pinceau artistique', icon: ARTBRUSH_ICON, kbd: 'Maj B' },
    ],
  });
  brushBtn.remove();
  dom.toolButtons = document.querySelectorAll('[data-tool]');
  Keys.add((e, { mod, key }) => {
    if (!mod && !e.altKey && e.shiftKey && key === 'b') { e.preventDefault(); setTool('artbrush'); return true; }
    return false;
  });
});
