/**
 * ============================================================================
 *  Studio Chloé — Remplissage & symboles (menu « Peinture » du rail)
 *
 *  Pot de peinture dynamique (Maj + K) — comme la Peinture dynamique
 *    d'Illustrator : les formes qui se chevauchent découpent la page en
 *    zones ; un clic remplit la zone sous la souris avec la couleur de
 *    remplissage courante (survol : la zone est surlignée). La zone devient
 *    une forme à part (« Zone peinte »), recolorable d'un nouveau clic.
 * ============================================================================
 */
'use strict';

const PAINT_ICONS = {
  bucket: '<path d="m19 11-8-8-8.5 8.5a2 2 0 0 0 0 2.8l5.2 5.2a2 2 0 0 0 2.8 0z"/><path d="m5 2 5 5M2 13h15"/><path d="M22 20a2 2 0 1 1-4 0c0-1.6 2-4 2-4s2 2.4 2 4z"/>',
};

const LivePaint = {
  hoverKey: null,
  hoverItem: null,
  timer: null,

  isClosed(obj) {
    if (['rect', 'ellipse', 'circle', 'polygon', 'triangle'].includes(obj.type)) return true;
    if (obj.type !== 'path') return false;
    // Tous les sous-tracés doivent être fermés
    const subs = obj.path.filter((c) => c[0].toUpperCase() === 'M').length;
    const closes = obj.path.filter((c) => c[0].toUpperCase() === 'Z').length;
    return subs > 0 && closes >= subs;
  },

  candidates() {
    return canvas.getObjects().filter((o) => o.visible && !o.locked && !o.excludeFromExport && Geo.canConvert(o) && this.isClosed(o));
  },

  /** Zone (paper PathItem) contenant le point p, ou null */
  regionAt(p) {
    const paper = PaperKit.scope;
    if (!paper) return null;
    const pt = new paper.Point(p.x, p.y);
    const items = this.candidates().map((obj) => ({ obj, item: PaperKit.fromObject(obj) }));
    const inside = items.filter(({ item }) => item.bounds.contains(pt) && item.contains(pt));
    if (!inside.length) return null;
    let region = inside[0].item;
    inside.slice(1).forEach(({ item }) => { region = region.intersect(item, { insert: false }); });
    items.forEach(({ obj, item }) => {
      if (inside.some((x) => x.obj === obj)) return;
      if (!item.bounds.intersects(region.bounds)) return;
      region = region.subtract(item, { insert: false });
    });
    if (!region || !region.contains(pt)) return null;
    if (region.children && region.children.length > 1) {
      // Ne garder que l'îlot cliqué (le plus petit sous-tracé qui contient le point) et ses trous
      const kids = [...region.children];
      const outer = kids.filter((c) => c.contains(pt)).sort((a, b) => Math.abs(a.area) - Math.abs(b.area))[0];
      if (outer) {
        const holes = kids.filter((c) => c !== outer && c.clockwise !== outer.clockwise && outer.bounds.contains(c.bounds));
        region = new paper.CompoundPath({ children: [outer, ...holes].map((c) => c.clone({ insert: false })), insert: false });
      }
    }
    return { region, inside };
  },

  fill(p) {
    const hit = this.regionAt(p);
    if (!hit) { toast('Cliquez dans une zone fermée formée par vos formes.'); return; }
    const { region, inside } = hit;
    const color = state.style.fill || '#d4f04c';
    const area = Math.abs(region.area);
    // Zone déjà peinte, ou forme entière non recouverte : on la recolore
    const same = inside.find(({ item }) => Math.abs(Math.abs(item.area) - area) < Math.max(1, area * 0.002));
    if (same) {
      same.obj.set({ fill: color });
      canvas.requestRenderAll();
      History.queue();
      return;
    }
    const top = Math.max(...inside.map(({ obj }) => canvas.getObjects().indexOf(obj)));
    const face = new fabric.Path(region.pathData, {
      fill: color, stroke: null, strokeWidth: 0, fillRule: 'evenodd', strokeUniform: true,
      name: 'Zone peinte', opacity: state.style.opacity,
    });
    face.livePaint = true;
    canvas.insertAt(face, top + 1);
    canvas.requestRenderAll();
    History.queue();
  },

  hover(p) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (state.tool !== 'livepaint' || !PaperKit.scope) return;
      const hit = this.regionAt(p);
      this.hoverItem = hit?.region || null;
      this.render();
    }, 40);
  },

  render() {
    const ctx = canvas.contextTop;
    canvas.clearContext(ctx);
    if (!this.hoverItem || state.tool !== 'livepaint') return;
    const v = canvas.viewportTransform;
    ctx.save();
    ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]);
    const p2d = new Path2D(this.hoverItem.pathData);
    ctx.fillStyle = 'rgba(212, 240, 76, 0.25)';
    ctx.fill(p2d, 'evenodd');
    ctx.lineWidth = 3 / v[0];
    ctx.strokeStyle = '#e0457b';
    ctx.stroke(p2d);
    ctx.restore();
  },
};

Tools.livepaint = {
  cursor: 'crosshair',
  async activate() {
    setInteractionMode('draw');
    canvas.discardActiveObject();
    try { await PaperKit.ready(); } catch { toast('Pot de peinture indisponible : paper.js n\'a pas pu être chargé.', 'error'); }
  },
  deactivate() { LivePaint.hoverItem = null; canvas.clearContext(canvas.contextTop); },
  onMouseMove(p) { LivePaint.hover(p); },
  async onMouseUp(p) {
    try { await PaperKit.ready(); } catch { return; }
    LivePaint.fill(p);
    LivePaint.hoverItem = null;
    LivePaint.hover(p);
  },
  options() {
    return html('<p class="field-note">Survolez : la zone formée par les formes qui se chevauchent s\'illumine. Cliquez pour la remplir avec la couleur de remplissage (réglable ci-dessous, ou dans les nuanciers).</p>');
  },
};

TOOL_LABELS.livepaint = 'Pot de peinture';
TYPE_LABELS.livepaint = 'Zone peinte';
SERIAL_PROPS.push('livePaint');

Hooks.on('init', () => {
  RailGroups.create('paint', {
    title: 'Peinture & symboles',
    after: $('.rail [data-group="deform"]'),
    items: [{ tool: 'livepaint', label: 'Pot de peinture dynamique', icon: PAINT_ICONS.bucket, kbd: 'Maj K' }],
  });
  Keys.add((e, { mod, key }) => {
    if (!mod && !e.altKey && e.shiftKey && key === 'k') { e.preventDefault(); setTool('livepaint'); return true; }
    return false;
  });
});
