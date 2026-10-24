/**
 * ============================================================================
 *  Studio Chloé — Effets modifiables (effets « dynamiques » d'Illustrator)
 *
 *  Les effets sont rangés dans obj.liveFx = [{ type, on, …réglages }] et
 *  calculés au moment de l'affichage : le tracé d'origine n'est jamais
 *  modifié. On peut changer un réglage, masquer (œil), réordonner ou retirer
 *  un effet à tout moment — tuile « Effets modifiables » du panneau.
 *    - Arrondir les angles (rayon)
 *    - Zigzag / ondulation (amplitude, crêtes par segment, ondulé)
 *    - Distorsion aléatoire (amplitude, détail, ondulé, nouveau tirage)
 *    - Contracter / dilater (−100 … 100 %)
 *    - Lueur externe (couleur, flou, intensité) — aussi sur textes, images, groupes
 *  Les effets de tracé s'enchaînent dans l'ordre de la liste. Export PNG / PDF :
 *  rendu du canvas ; export SVG : tracé calculé (et filtre d'ombre pour la lueur).
 *  « Décomposer » remplace l'objet par le résultat (tracé ordinaire).
 * ============================================================================
 */
'use strict';

const LIVE_FX = {
  round: { label: 'Arrondir les angles', path: true, defaults: { radius: 20 }, params: [['radius', 'Rayon', 0, 200, 1, ' px']] },
  zigzag: { label: 'Zigzag', path: true, defaults: { size: 8, ridges: 6, smooth: false }, params: [['size', 'Amplitude', 0, 100, 1, ' px'], ['ridges', 'Crêtes par segment', 1, 40, 1, '']], toggle: ['smooth', 'Ondulé'] },
  roughen: { label: 'Distorsion aléatoire', path: true, defaults: { size: 6, detail: 12, smooth: true, seed: 1 }, params: [['size', 'Amplitude', 0, 80, 1, ' px'], ['detail', 'Détail', 1, 60, 1, ' / 100 px']], toggle: ['smooth', 'Ondulé'], reseed: true },
  pucker: { label: 'Contracter / dilater', path: true, defaults: { amount: 40 }, params: [['amount', 'Intensité', -100, 100, 1, ' %']] },
  glow: { label: 'Lueur externe', path: false, defaults: { color: '#d4f04c', blur: 24, strength: 2 }, params: [['blur', 'Flou', 0, 120, 1, ' px'], ['strength', 'Intensité', 1, 5, 1, '']], color: true },
};
const FX_PATH_TYPES = ['rect', 'ellipse', 'circle', 'triangle', 'polygon', 'polyline', 'path', 'line'];

const hasLiveFx = (o) => Array.isArray(o?.liveFx) && o.liveFx.some((f) => f.on !== false);
const pathFxOf = (o) => (FX_PATH_TYPES.includes(o?.type) && Array.isArray(o.liveFx) ? o.liveFx.filter((f) => f.on !== false && LIVE_FX[f.type]?.path) : []);

/* ============================================================================
   GÉOMÉTRIE DES EFFETS (coordonnées locales de l'objet)
   ========================================================================== */

const FxGeo = {
  /** Commandes → sous-tracés { start, segs: [{ c, ctrl: [pts], end }], closed } (fermeture explicite) */
  split(cmds) {
    const subs = [];
    let cur = null;
    let pen = { x: 0, y: 0 };
    cmds.forEach((cmd) => {
      const c = cmd[0];
      if (c === 'M') { cur = { start: { x: cmd[1], y: cmd[2] }, segs: [], closed: false }; subs.push(cur); pen = cur.start; return; }
      if (!cur) { cur = { start: { ...pen }, segs: [], closed: false }; subs.push(cur); }
      if (c === 'Z') {
        const s = cur.start;
        if (Math.hypot(pen.x - s.x, pen.y - s.y) > 1e-6) cur.segs.push({ c: 'L', ctrl: [], end: { ...s } });
        cur.closed = true;
        pen = s;
        cur = null;
        return;
      }
      const pts = [];
      for (let k = 1; k < cmd.length; k += 2) pts.push({ x: cmd[k], y: cmd[k + 1] });
      const end = pts.pop();
      cur.segs.push({ c, ctrl: pts, end });
      pen = end;
    });
    return subs.filter((s) => s.segs.length);
  },

  join(subs) {
    const out = [];
    subs.forEach((s) => {
      out.push(['M', s.start.x, s.start.y]);
      s.segs.forEach((g) => out.push([g.c, ...g.ctrl.flatMap((p) => [p.x, p.y]), g.end.x, g.end.y]));
      if (s.closed) out.push(['Z']);
    });
    return out;
  },

  pointAt(p0, seg, t) {
    const u = 1 - t;
    if (seg.c === 'L') return { x: p0.x + (seg.end.x - p0.x) * t, y: p0.y + (seg.end.y - p0.y) * t };
    if (seg.c === 'Q') {
      const [q] = seg.ctrl;
      return { x: u * u * p0.x + 2 * u * t * q.x + t * t * seg.end.x, y: u * u * p0.y + 2 * u * t * q.y + t * t * seg.end.y };
    }
    const [a, b] = seg.ctrl;
    return {
      x: u * u * u * p0.x + 3 * u * u * t * a.x + 3 * u * t * t * b.x + t * t * t * seg.end.x,
      y: u * u * u * p0.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t * t * t * seg.end.y,
    };
  },

  /** Polyligne fine d'un segment (avec abscisses curvilignes) */
  sampleSeg(p0, seg) {
    const n = seg.c === 'L' ? 1 : 24;
    const pts = [p0];
    for (let i = 1; i <= n; i++) pts.push(this.pointAt(p0, seg, i / n));
    const len = [0];
    for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    return { pts, len, total: len[len.length - 1] };
  },

  /** Point et normale à la distance d le long d'une polyligne échantillonnée */
  along(s, d) {
    const { pts, len } = s;
    let i = 1;
    while (i < len.length - 1 && len[i] < d) i++;
    const seg = len[i] - len[i - 1] || 1;
    const t = Math.min(1, Math.max(0, (d - len[i - 1]) / seg));
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: a.x + dx * t, y: a.y + dy * t, nx: -dy / l, ny: dx / l };
  },

  /** Courbe lisse passant par des points (Catmull-Rom → Bézier) */
  smooth(points, closed) {
    const n = points.length;
    const P = (i) => (closed ? points[(i + n) % n] : points[Math.min(n - 1, Math.max(0, i))]);
    const segs = [];
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = P(i - 1); const p1 = P(i); const p2 = P(i + 1); const p3 = P(i + 2);
      segs.push({
        c: 'C',
        ctrl: [{ x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }, { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }],
        end: { ...p2 },
      });
    }
    return { start: { ...points[0] }, segs, closed };
  },

  polyline(points, closed) {
    return { start: { ...points[0] }, segs: points.slice(1).concat(closed ? [points[0]] : []).map((p) => ({ c: 'L', ctrl: [], end: { ...p } })), closed };
  },

  /* ---------- effets ---------- */
  round(subs, { radius }) {
    if (!(radius > 0)) return subs;
    return subs.map((s) => {
      const n = s.segs.length;
      const V = (i) => (i === 0 ? s.start : s.segs[i - 1].end);
      const vtx = (i) => V(((i % n) + n) % n);
      const corner = (i) => {
        if (!s.closed && (i === 0 || i === n)) return null;
        const inSeg = s.segs[(i - 1 + n) % n];
        const outSeg = s.segs[i % n];
        if (inSeg.c !== 'L' || outSeg.c !== 'L') return null;
        const v = vtx(i);
        const prev = vtx(i - 1);
        const next = outSeg.end;
        const lin = Math.hypot(prev.x - v.x, prev.y - v.y);
        const lout = Math.hypot(next.x - v.x, next.y - v.y);
        if (lin < 1e-6 || lout < 1e-6) return null;
        const ux = (prev.x - v.x) / lin; const uy = (prev.y - v.y) / lin;
        const wx = (next.x - v.x) / lout; const wy = (next.y - v.y) / lout;
        if (Math.abs(ux * wy - uy * wx) < 1e-3) return null; // points alignés : pas d'angle
        const r = Math.min(radius, lin / 2, lout / 2);
        const a = { x: v.x + ux * r, y: v.y + uy * r };
        const b = { x: v.x + wx * r, y: v.y + wy * r };
        return { v, a, b };
      };
      const corners = Array.from({ length: n + 1 }, (_, i) => corner(i));
      const c0 = s.closed ? corners[0] : null;
      const out = { start: c0 ? { ...c0.b } : { ...s.start }, segs: [], closed: s.closed };
      for (let i = 0; i < n; i++) {
        const seg = s.segs[i];
        const ci = s.closed ? corners[(i + 1) % n] : corners[i + 1];
        if (seg.c === 'L') {
          out.segs.push({ c: 'L', ctrl: [], end: ci ? { ...ci.a } : { ...seg.end } });
          if (ci) {
            out.segs.push({
              c: 'C',
              ctrl: [{ x: ci.a.x + (ci.v.x - ci.a.x) * KAPPA, y: ci.a.y + (ci.v.y - ci.a.y) * KAPPA }, { x: ci.b.x + (ci.v.x - ci.b.x) * KAPPA, y: ci.b.y + (ci.v.y - ci.b.y) * KAPPA }],
              end: { ...ci.b },
            });
          }
        } else out.segs.push({ ...seg, ctrl: seg.ctrl.map((p) => ({ ...p })), end: { ...seg.end } });
      }
      return out;
    });
  },

  zigzag(subs, { size, ridges, smooth }) {
    if (!(size > 0)) return subs;
    const steps = Math.max(1, Math.round(ridges)) + 1;
    return subs.map((s) => {
      const pts = [];
      const push = (q) => {
        const sign = pts.length % 2 ? -1 : 1;
        pts.push({ x: q.x + q.nx * size * sign, y: q.y + q.ny * size * sign });
      };
      let p0 = s.start;
      s.segs.forEach((seg, si) => {
        const sm = this.sampleSeg(p0, seg);
        for (let j = 0; j < steps; j++) push(this.along(sm, (sm.total * j) / steps)); // l'extrémité = début du segment suivant
        if (!s.closed && si === s.segs.length - 1) push(this.along(sm, sm.total));
        p0 = seg.end;
      });
      return smooth ? this.smooth(pts, s.closed) : this.polyline(pts, s.closed);
    });
  },

  roughen(subs, { size, detail, smooth, seed }) {
    if (!(size > 0)) return subs;
    let x = (seed || 1) * 2654435761 >>> 0;
    const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
    return subs.map((s) => {
      const parts = [];
      let p0 = s.start;
      s.segs.forEach((seg) => { parts.push(this.sampleSeg(p0, seg)); p0 = seg.end; });
      const total = parts.reduce((t, p) => t + p.total, 0);
      const n = Math.max(s.closed ? 4 : 2, Math.round((total / 100) * detail));
      const pts = [];
      const count = s.closed ? n : n + 1;
      for (let i = 0; i < count; i++) {
        let d = (total * i) / n;
        let part = parts[0];
        for (const p of parts) { part = p; if (d <= p.total) break; d -= p.total; }
        const q = this.along(part, Math.min(d, part.total));
        pts.push({ x: q.x + (rnd() * 2 - 1) * size, y: q.y + (rnd() * 2 - 1) * size });
      }
      return smooth ? this.smooth(pts, s.closed) : this.polyline(pts, s.closed);
    });
  },

  pucker(subs, { amount }) {
    const a = (amount || 0) / 100;
    if (!a) return subs;
    const all = subs.flatMap((s) => [s.start, ...s.segs.map((g) => g.end)]);
    const xs = all.map((p) => p.x); const ys = all.map((p) => p.y);
    const c = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    const anchor = (p) => ({ x: c.x + (p.x - c.x) * (1 - a / 2), y: c.y + (p.y - c.y) * (1 - a / 2) });
    const handle = (p) => ({ x: c.x + (p.x - c.x) * (1 + a), y: c.y + (p.y - c.y) * (1 + a) });
    return subs.map((s) => {
      let p0 = s.start;
      const segs = s.segs.map((g) => {
        let ctrl;
        if (g.c === 'L') ctrl = [p0, g.end];
        else if (g.c === 'Q') ctrl = [{ x: p0.x + (2 / 3) * (g.ctrl[0].x - p0.x), y: p0.y + (2 / 3) * (g.ctrl[0].y - p0.y) }, { x: g.end.x + (2 / 3) * (g.ctrl[0].x - g.end.x), y: g.end.y + (2 / 3) * (g.ctrl[0].y - g.end.y) }];
        else ctrl = g.ctrl;
        p0 = g.end;
        return { c: 'C', ctrl: ctrl.map(handle), end: anchor(g.end) };
      });
      return { start: anchor(s.start), segs, closed: s.closed };
    });
  },

  /** Commandes locales de l'objet après ses effets de tracé (mémorisées) */
  derived(obj) {
    const fx = pathFxOf(obj);
    if (!fx.length) return null;
    const base = Geo.localCommands(obj);
    const key = JSON.stringify(fx) + JSON.stringify(base);
    if (obj._fxCache?.key === key) return obj._fxCache.cmds;
    let subs = this.split(base);
    fx.forEach((f) => { subs = this[f.type](subs, f); });
    const cmds = this.join(subs);
    // débordement hors de la boîte d'origine (pour agrandir le cache image)
    let over = 0;
    const w = (obj.width || 0) / 2;
    const h = (obj.height || 0) / 2;
    cmds.forEach((c) => { for (let k = 1; k < c.length; k += 2) over = Math.max(over, Math.abs(c[k]) - w, Math.abs(c[k + 1]) - h); });
    obj._fxCache = { key, cmds, over: Math.max(0, over) };
    return cmds;
  },
};

/* ============================================================================
   RENDU, CACHE, SVG
   ========================================================================== */
{
  FX_PATH_TYPES.forEach((type) => {
    const klass = fabric.util.getKlass(type.charAt(0).toUpperCase() + type.slice(1));
    const proto = klass.prototype;
    const baseRender = proto._render;
    proto._render = function render(ctx) {
      const cmds = FxGeo.derived(this);
      if (!cmds) { baseRender.call(this, ctx); return; }
      ctx.beginPath();
      cmds.forEach((c) => {
        if (c[0] === 'M') ctx.moveTo(c[1], c[2]);
        else if (c[0] === 'L') ctx.lineTo(c[1], c[2]);
        else if (c[0] === 'C') ctx.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
        else if (c[0] === 'Q') ctx.quadraticCurveTo(c[1], c[2], c[3], c[4]);
        else if (c[0] === 'Z') ctx.closePath();
      });
      this._renderPaintInOrder(ctx);
    };
    const baseSVG = proto.toSVG;
    proto.toSVG = function toSVG(reviver) {
      const cmds = FxGeo.derived(this);
      if (!cmds) return baseSVG.call(this, reviver);
      return this._createBaseSVGMarkup(['<path ', 'COMMON_PARTS', `d="${Geo.toPathData(cmds)}" />\n`], { reviver });
    };
  });

  const proto = fabric.Object.prototype;
  // Le cache image s'agrandit pour contenir ce qui déborde de la forme
  const baseDims = proto._getCacheCanvasDimensions;
  proto._getCacheCanvasDimensions = function dims() {
    const d = baseDims.call(this);
    if (pathFxOf(this).length) {
      FxGeo.derived(this);
      const over = (this._fxCache?.over || 0) * 2 + (this.strokeWidth || 0);
      d.width += over * d.zoomX;
      d.height += over * d.zoomY;
    }
    return d;
  };

  // Un groupe qui contient des effets n'utilise pas de cache image (rien n'est rogné)
  const groupShould = fabric.Group.prototype.shouldCache;
  fabric.Group.prototype.shouldCache = function shouldCache() {
    if (this._objects.some((o) => hasLiveFx(o) || (o.type === 'group' && o._objects.some(hasLiveFx)))) { this.ownCaching = false; return false; }
    return groupShould.call(this);
  };

  // Lueur externe : ombre floue non décalée, dessinée sous l'objet
  const baseRender = proto.render;
  proto.render = function render(ctx) {
    const glows = Array.isArray(this.liveFx) && !this._glowBusy ? this.liveFx.filter((f) => f.type === 'glow' && f.on !== false) : [];
    if (glows.length && this.visible && !(this.canvas?.skipOffscreen && !this.group && !this.isOnScreen())) {
      this._glowBusy = true;
      const OFF = 100000; // l'objet est dessiné hors champ, seule son ombre tombe à sa place
      try {
        glows.forEach((g) => {
          const t = ctx.getTransform();
          const zoom = Math.hypot(t.a, t.b);
          for (let i = 0; i < Math.max(1, Math.min(5, g.strength || 1)); i++) {
            ctx.save();
            ctx.setTransform(t.a, t.b, t.c, t.d, t.e - OFF, t.f);
            ctx.shadowColor = g.color || '#d4f04c';
            ctx.shadowBlur = (g.blur ?? 20) * zoom * (this.getObjectScaling?.().scaleX || 1);
            ctx.shadowOffsetX = OFF;
            ctx.shadowOffsetY = 0;
            const shadow = this.shadow;
            this.shadow = null; // pas d'ombre portée pendant ce passage
            try { baseRender.call(this, ctx); } finally { this.shadow = shadow; ctx.restore(); }
          }
        });
      } finally { this._glowBusy = false; }
    }
    return baseRender.call(this, ctx);
  };

  // SVG : la lueur devient le filtre d'ombre de Fabric (si l'objet n'a pas déjà d'ombre)
  const baseToSVG = proto.toSVG;
  proto.toSVG = function toSVG(reviver) {
    const glow = Array.isArray(this.liveFx) && !this.shadow ? this.liveFx.find((f) => f.type === 'glow' && f.on !== false) : null;
    if (!glow) return baseToSVG.call(this, reviver);
    this.shadow = new fabric.Shadow({ color: glow.color, blur: glow.blur, offsetX: 0, offsetY: 0 });
    try { return baseToSVG.call(this, reviver); } finally { this.shadow = null; }
  };
}

/* ============================================================================
   PANNEAU
   ========================================================================== */

const LiveFx = {
  target() {
    const objs = canvas.getActiveObjects();
    return objs.length === 1 && !state.cropping ? objs[0] : null;
  },

  changed(obj, record = true) {
    obj.dirty = true;
    obj._fxCache = null;
    if (obj.group) obj.group.dirty = true;
    canvas.requestRenderAll();
    if (record) History.queue();
  },

  add(type) {
    const obj = this.target();
    if (!obj || !LIVE_FX[type]) return null;
    const fx = { type, on: true, ...LIVE_FX[type].defaults };
    if (type === 'roughen') fx.seed = 1 + Math.floor(Math.random() * 9999);
    obj.liveFx = [...(obj.liveFx || []), fx];
    this.changed(obj);
    this.open = obj.liveFx.length - 1;
    this.render();
    return fx;
  },

  /** Remplace l'objet par le résultat de ses effets de tracé (tracé ordinaire) */
  expand() {
    const obj = this.target();
    const cmds = obj && FxGeo.derived(obj);
    if (!cmds) return null;
    const path = new fabric.Path(Geo.toPathData(Geo.transform(cmds, obj.calcTransformMatrix())), { ...Geo.styleOf(obj) });
    const rest = obj.liveFx.filter((f) => !LIVE_FX[f.type]?.path);
    if (rest.length) path.liveFx = rest.map((f) => ({ ...f }));
    ['appearance', 'arrowStart', 'arrowEnd', 'arrowScale'].forEach((k) => { if (obj[k] !== undefined) path[k] = obj[k]; });
    Geo.replace(obj, path);
    History.queue();
    Properties.sync();
    toast('Effets décomposés : l\'objet est maintenant un tracé ordinaire.', 'success');
    return path;
  },

  mountUI() {
    this.el = html(`
      <section class="tile" id="section-livefx" hidden>
        <div class="feature-head"><div><h3>Effets modifiables</h3><p class="field-note">Calculés à l'affichage : la forme d'origine reste intacte.</p></div></div>
        <ul class="livefx-list" id="livefx-list"></ul>
        <div class="btn-row">
          <select class="input input-sm" id="livefx-add" aria-label="Ajouter un effet"></select>
          <button class="btn btn-sm" type="button" id="livefx-expand" title="Remplacer la forme par le résultat">Décomposer</button>
        </div>
      </section>`);
    $('#section-effects').before(this.el);
    this.el.querySelector('#livefx-add').addEventListener('change', (e) => {
      const v = e.target.value;
      e.target.value = '';
      if (v) this.add(v);
    });
    this.el.querySelector('#livefx-expand').addEventListener('click', () => this.expand());
    Hooks.on('sync', () => this.render());
  },

  render() {
    const obj = this.target();
    this.el.hidden = !obj;
    if (!obj) return;
    const pathOk = FX_PATH_TYPES.includes(obj.type);
    const sel = this.el.querySelector('#livefx-add');
    sel.innerHTML = `<option value="">+ Ajouter un effet…</option>${Object.entries(LIVE_FX)
      .filter(([, d]) => pathOk || !d.path).map(([k, d]) => `<option value="${k}">${d.label}</option>`).join('')}`;
    this.el.querySelector('#livefx-expand').hidden = !pathFxOf(obj).length;
    const ul = this.el.querySelector('#livefx-list');
    const list = obj.liveFx || [];
    ul.replaceChildren(...list.map((fx, i) => this.row(obj, fx, i)));
  },

  row(obj, fx, i) {
    const def = LIVE_FX[fx.type];
    const open = this.open === i;
    const li = html(`<li class="livefx-item${fx.on === false ? ' is-off' : ''}${open ? ' is-open' : ''}">
      <div class="livefx-head">
        <button class="layer-btn" type="button" data-eye title="${fx.on === false ? 'Afficher' : 'Masquer'} l'effet" aria-label="Afficher / masquer"><svg viewBox="0 0 24 24">${fx.on === false ? '<path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-2.6 3.2M6.6 6.6C4.3 8.1 3 12 3 12s4 6 9 6c1.3 0 2.5-.3 3.6-.8"/>' : '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'}</svg></button>
        <button class="livefx-name" type="button" data-toggle>${def?.label || fx.type}</button>
        <button class="layer-btn" type="button" data-up title="Monter" aria-label="Monter"><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg></button>
        <button class="layer-btn" type="button" data-del title="Retirer l'effet" aria-label="Retirer"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div>
      <div class="livefx-params">
        ${def?.color ? `<label class="livefx-color"><span class="field-label">Couleur</span><input type="color" data-color value="${toHex(fx.color) || '#d4f04c'}"></label>` : ''}
        ${(def?.params || []).map(([k, label, min, max, step, unit]) => `<div class="field"><label class="field-label">${label} <output data-out="${k}">${fx[k]}${unit}</output></label><input type="range" data-p="${k}" min="${min}" max="${max}" step="${step}" value="${fx[k]}"></div>`).join('')}
        ${def?.toggle ? `<label class="check"><input type="checkbox" data-t="${def.toggle[0]}" ${fx[def.toggle[0]] ? 'checked' : ''}> ${def.toggle[1]}</label>` : ''}
        ${def?.reseed ? '<button class="btn btn-sm" type="button" data-reseed>Nouveau tirage</button>' : ''}
      </div>
    </li>`);
    const set = (patch, record) => {
      obj.liveFx = obj.liveFx.map((x, k) => (k === i ? { ...x, ...patch } : x));
      this.changed(obj, record);
    };
    li.querySelector('[data-toggle]').addEventListener('click', () => { this.open = open ? null : i; this.render(); });
    li.querySelector('[data-eye]').addEventListener('click', () => { set({ on: fx.on === false }, true); this.render(); });
    li.querySelector('[data-up]').addEventListener('click', () => {
      if (i === 0) return;
      const a = obj.liveFx.slice();
      [a[i - 1], a[i]] = [a[i], a[i - 1]];
      obj.liveFx = a;
      this.open = i - 1;
      this.changed(obj);
      this.render();
    });
    li.querySelector('[data-del]').addEventListener('click', () => {
      obj.liveFx = obj.liveFx.filter((_, k) => k !== i);
      if (!obj.liveFx.length) obj.liveFx = undefined;
      this.open = null;
      this.changed(obj);
      this.render();
    });
    li.querySelectorAll('[data-p]').forEach((r) => {
      paintRange(r);
      const unit = def.params.find((p) => p[0] === r.dataset.p)[5];
      r.addEventListener('input', () => {
        paintRange(r);
        li.querySelector(`[data-out="${r.dataset.p}"]`).textContent = `${r.value}${unit}`;
        set({ [r.dataset.p]: Number(r.value) }, false);
      });
      r.addEventListener('change', () => History.queue());
    });
    li.querySelector('[data-color]')?.addEventListener('input', (e) => set({ color: e.target.value }, false));
    li.querySelector('[data-color]')?.addEventListener('change', () => History.queue());
    li.querySelector('[data-t]')?.addEventListener('change', (e) => set({ [e.target.dataset.t]: e.target.checked }, true));
    li.querySelector('[data-reseed]')?.addEventListener('click', () => set({ seed: 1 + Math.floor(Math.random() * 9999) }, true));
    return li;
  },
};

SERIAL_PROPS.push('liveFx');

Hooks.on('init', () => LiveFx.mountUI());
