/**
 * ============================================================================
 *  Studio Chloé — Outil Dégradé (G), directement sur l'objet
 *
 *  Comme l'annotateur de dégradé d'Illustrator :
 *    - glisser sur l'objet sélectionné trace la direction du dégradé
 *      (linéaire : du début à la fin ; radial : centre puis rayon) ;
 *      Maj contraint à 45° ; un objet sans dégradé en reçoit un
 *      (couleur de remplissage → olive) ;
 *    - l'annotateur montre la barre, ses extrémités et les arrêts de couleur :
 *      glisser une extrémité la déplace, glisser un arrêt change sa position ;
 *    - un clic sur un autre objet le sélectionne.
 *  Le dégradé reste celui de la tuile Apparence (couleurs, arrêts, type).
 * ============================================================================
 */
'use strict';

const GRAD_ICON = '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 17 17 7"/><circle cx="7" cy="17" r="1.6"/><rect x="15.4" y="5.4" width="3.2" height="3.2"/>';

const GradientTool = {
  drag: null, // { kind: 'new' | 'start' | 'end' | 'stop', index, origin }

  target() {
    const o = canvas.getActiveObject();
    return o && o.type !== 'activeSelection' && !isImage(o) && !o.locked ? o : null;
  },

  isGrad(o) { return o?.fill instanceof fabric.Gradient; },

  /** Point du document → coordonnées du dégradé (pourcentages de la boîte de l'objet) */
  toGrad(o, p) {
    const l = fabric.util.transformPoint(p, fabric.util.invertTransform(o.calcTransformMatrix()));
    const g = o.fill;
    if (g.gradientUnits === 'percentage') return { x: (l.x + o.width / 2) / (o.width || 1), y: (l.y + o.height / 2) / (o.height || 1) };
    return { x: l.x + o.width / 2, y: l.y + o.height / 2 };
  },

  /** Coordonnées du dégradé → point du document */
  toDoc(o, q) {
    const g = o.fill;
    const l = g.gradientUnits === 'percentage'
      ? { x: q.x * o.width - o.width / 2, y: q.y * o.height - o.height / 2 }
      : { x: q.x - o.width / 2, y: q.y - o.height / 2 };
    return fabric.util.transformPoint(l, o.calcTransformMatrix());
  },

  screen(p) { return fabric.util.transformPoint(p, canvas.viewportTransform); },

  /** Extrémités de la barre (document) */
  ends(o) {
    const c = o.fill.coords;
    const start = this.toDoc(o, { x: c.x1, y: c.y1 });
    if (o.fill.type === 'radial') {
      // rayon le long de l'axe horizontal de l'objet
      const end = this.toDoc(o, { x: c.x2 + c.r2, y: c.y2 });
      return { start, end };
    }
    return { start, end: this.toDoc(o, { x: c.x2, y: c.y2 }) };
  },

  ensureGradient(o) {
    if (this.isGrad(o)) return;
    const c1 = toHex(o.fill) || '#d4f04c';
    o.set('fill', new fabric.Gradient({
      type: GradientPro.type === 'radial' ? 'radial' : 'linear',
      gradientUnits: 'percentage',
      coords: GradientPro.type === 'radial' ? { x1: 0.5, y1: 0.5, r1: 0, x2: 0.5, y2: 0.5, r2: 0.5 } : { x1: 0, y1: 0.5, x2: 1, y2: 0.5 },
      colorStops: [{ offset: 0, color: c1 }, { offset: 1, color: '#25300b' }],
    }));
  },

  /** Applique une nouvelle barre (document) au dégradé */
  setBar(o, a, b) {
    const g = o.fill;
    const qa = this.toGrad(o, a);
    if (g.type === 'radial') {
      const qb = this.toGrad(o, b);
      // rayon exprimé dans l'unité de l'axe horizontal (la poignée de fin est placée sur cet axe)
      const k = g.gradientUnits === 'percentage' ? [o.width || 1, o.height || 1] : [1, 1];
      const r = Math.max(0.005, Math.hypot((qb.x - qa.x) * k[0], (qb.y - qa.y) * k[1]) / k[0]);
      g.coords = { ...g.coords, x1: qa.x, y1: qa.y, x2: qa.x, y2: qa.y, r1: 0, r2: r };
    } else {
      const qb = this.toGrad(o, b);
      g.coords = { ...g.coords, x1: qa.x, y1: qa.y, x2: qb.x, y2: qb.y };
    }
    o.dirty = true;
  },

  constrain(a, b, e) {
    if (!e?.shiftKey) return b;
    const ang = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / (Math.PI / 4)) * (Math.PI / 4);
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    return { x: a.x + Math.cos(ang) * d, y: a.y + Math.sin(ang) * d };
  },

  /** Élément de l'annotateur sous le pointeur (écran) */
  hit(o, p) {
    if (!this.isGrad(o)) return null;
    const { start, end } = this.ends(o);
    const S = this.screen(start);
    const E = this.screen(end);
    const P = this.screen(p);
    const near = (q) => Math.hypot(q.x - P.x, q.y - P.y) <= 9;
    const stops = o.fill.colorStops;
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      if (s.offset <= 0 || s.offset >= 1) continue;
      if (near({ x: S.x + (E.x - S.x) * s.offset, y: S.y + (E.y - S.y) * s.offset })) return { kind: 'stop', index: i };
    }
    if (near(E)) return { kind: 'end' };
    if (near(S)) return { kind: 'start' };
    return null;
  },

  render() {
    const ctx = canvas.contextTop;
    if (!ctx) return;
    canvas.clearContext(ctx);
    const o = this.target();
    if (state.tool !== 'gradient' || !o || !this.isGrad(o)) return;
    const { start, end } = this.ends(o);
    const S = this.screen(start);
    const E = this.screen(end);
    ctx.save();
    if (o.fill.type === 'radial') {
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(37, 48, 11, .55)';
      ctx.beginPath();
      ctx.arc(S.x, S.y, Math.hypot(E.x - S.x, E.y - S.y), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // barre : trait sombre + liseré clair (lisible sur tous les fonds)
    [['#ffffff', 5], ['#25300b', 2]].forEach(([c, w]) => {
      ctx.strokeStyle = c; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(S.x, S.y); ctx.lineTo(E.x, E.y); ctx.stroke();
    });
    // extrémités
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#25300b'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(S.x, S.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillRect(E.x - 5, E.y - 5, 10, 10); ctx.strokeRect(E.x - 5, E.y - 5, 10, 10);
    // arrêts de couleur
    o.fill.colorStops.forEach((s) => {
      const x = S.x + (E.x - S.x) * s.offset;
      const y = S.y + (E.y - S.y) * s.offset;
      ctx.beginPath(); ctx.arc(x, y, s.offset <= 0 || s.offset >= 1 ? 3.5 : 6.5, 0, Math.PI * 2);
      ctx.fillStyle = s.color; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = '#25300b'; ctx.lineWidth = 1; ctx.stroke();
    });
    ctx.restore();
  },

  /** Les arrêts intermédiaires du panneau suivent l'objet */
  syncPanel(o) {
    GradientPro.middle = o.fill.colorStops.filter((s) => s.offset > 0 && s.offset < 1).map((s) => ({ offset: s.offset, color: s.color }));
    GradientPro.type = o.fill.type;
    Properties.sync();
  },
};

Tools.gradient = {
  cursor: 'crosshair',
  activate() {
    setInteractionMode('none'); // l'outil gère lui-même les clics
    toast('Dégradé : glissez sur l\'objet pour orienter le dégradé, déplacez les arrêts sur la barre (Maj : 45°).');
    GradientTool.render();
  },
  deactivate() {
    GradientTool.drag = null;
    if (canvas.contextTop) canvas.clearContext(canvas.contextTop);
  },
  onMouseDown(p, e) {
    // Fabric vient de vider la sélection (clic sans cible) : on reprend l'objet d'avant le clic
    let o = GradientTool.before || GradientTool.target();
    GradientTool.before = null;
    if (o && canvas.getObjects().includes(o) && canvas.getActiveObject() !== o) canvas.setActiveObject(o);
    const h = o && GradientTool.hit(o, p);
    if (h) { GradientTool.drag = { ...h, obj: o }; return; }
    // un autre objet sous le pointeur : on le sélectionne
    const under = objectUnderPointer(e);
    if (under && under !== o && !isImage(under)) {
      canvas.setActiveObject(under);
      o = under;
      Properties.sync();
    }
    if (!o) { GradientTool.render(); return; }
    History.flush();
    GradientTool.ensureGradient(o);
    GradientTool.drag = { kind: 'new', obj: o, origin: p };
    canvas.requestRenderAll();
  },
  onMouseMove(p, e) {
    const d = GradientTool.drag;
    if (!d) return;
    const o = d.obj;
    if (d.kind === 'new') {
      const b = GradientTool.constrain(d.origin, p, e);
      if (Math.hypot(b.x - d.origin.x, b.y - d.origin.y) * canvas.getZoom() > 3) GradientTool.setBar(o, d.origin, b);
    } else if (d.kind === 'start' || d.kind === 'end') {
      const { start, end } = GradientTool.ends(o);
      if (d.kind === 'start') {
        if (o.fill.type === 'radial') GradientTool.setBar(o, p, { x: p.x + end.x - start.x, y: p.y + end.y - start.y });
        else GradientTool.setBar(o, p, end);
      } else GradientTool.setBar(o, start, GradientTool.constrain(start, p, e));
    } else if (d.kind === 'stop') {
      const { start, end } = GradientTool.ends(o);
      const vx = end.x - start.x;
      const vy = end.y - start.y;
      const t = ((p.x - start.x) * vx + (p.y - start.y) * vy) / (vx * vx + vy * vy || 1);
      o.fill.colorStops[d.index].offset = Math.round(Math.min(0.99, Math.max(0.01, t)) * 100) / 100;
      o.dirty = true;
    }
    canvas.requestRenderAll();
  },
  onMouseUp() {
    const d = GradientTool.drag;
    if (!d) return;
    GradientTool.drag = null;
    const o = d.obj;
    if (d.kind === 'stop') o.fill.colorStops.sort((a, b) => a.offset - b.offset);
    canvas.requestRenderAll();
    History.queue();
    GradientTool.syncPanel(o);
  },
};

TOOL_LABELS.gradient = 'Dégradé';
SHORTCUTS.g = 'gradient';

Hooks.on('init', () => {
  RailGroups.add('paint', { tool: 'gradient', label: 'Dégradé', icon: GRAD_ICON, kbd: 'G' });
  canvas.on('after:render', () => { if (state.tool === 'gradient') GradientTool.render(); });
  canvas.on('mouse:down:before', () => { if (state.tool === 'gradient') GradientTool.before = GradientTool.target(); });
});
