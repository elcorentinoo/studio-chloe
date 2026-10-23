/**
 * ============================================================================
 *  Studio Chloé — Concepteur de forme (Maj + M), menu Pathfinder du rail
 *
 *  Comme le Shape Builder d'Illustrator :
 *    1. sélectionnez des formes qui se chevauchent, prenez l'outil ;
 *    2. survolez : chaque zone s'illumine ;
 *    3. glissez à travers plusieurs zones : elles fusionnent en une forme ;
 *       un simple clic détache la zone en forme indépendante ;
 *    4. Alt + glisser / clic : les zones touchées sont effacées.
 *  Calculs booléens avec paper.js (même découpage que « Diviser »).
 * ============================================================================
 */
'use strict';

const SHAPE_BUILDER_ICON = '<path d="M3 3h10v10H3z" stroke-dasharray="2 2"/><path d="M8 8h13v13H8z"/><path d="M8 8h5v5H8z" fill="currentColor" fill-opacity=".4"/><path d="m14 17 3-3 3 3" />';

const ShapeBuilder = {
  sources: [],   // objets d'origine
  faces: [],     // { item, style, p2d }
  touched: new Set(),
  dragging: false,
  hover: null,

  async prepare() {
    this.faces = [];
    this.sources = canvas.getActiveObjects().filter((o) => !o.locked && Pathfinder.usable(o) && (o.type === 'group' || LivePaint.isClosed(o)));
    if (this.sources.length < 2) {
      toast('Sélectionnez au moins deux formes fermées qui se chevauchent, puis reprenez le Concepteur de forme.');
      return false;
    }
    try { await PaperKit.ready(); } catch { toast('Concepteur de forme indisponible : paper.js n\'a pas pu être chargé.', 'error'); return false; }
    const all = canvas.getObjects();
    const list = this.sources.slice().sort((a, b) => all.indexOf(a) - all.indexOf(b));
    this.sources = list;
    const faces = Pathfinder.divideFaces(list.map((o) => ({ item: Pathfinder.item(o), style: Pathfinder.styleOf(o) })))
      .flatMap((f) => Pathfinder.islands(f.item).map((item) => ({ item, style: f.style })));
    this.faces = faces.map((f) => ({ ...f, p2d: new Path2D(f.item.pathData) }));
    return true;
  },

  faceAt(p) {
    const pt = new PaperKit.scope.Point(p.x, p.y);
    // La plus petite zone sous le pointeur
    return this.faces.filter((f) => f.item.bounds.contains(pt) && f.item.contains(pt))
      .sort((a, b) => Math.abs(a.item.area) - Math.abs(b.item.area))[0] || null;
  },

  render(alt = false) {
    const ctx = canvas.contextTop;
    canvas.clearContext(ctx);
    if (state.tool !== 'shapebuilder' || !this.faces.length) return;
    const v = canvas.viewportTransform;
    ctx.save();
    ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]);
    ctx.lineWidth = 1 / v[0];
    ctx.setLineDash([4 / v[0], 3 / v[0]]);
    ctx.strokeStyle = 'rgba(37, 48, 11, 0.5)';
    this.faces.forEach((f) => ctx.stroke(f.p2d));
    ctx.setLineDash([]);
    const marked = new Set(this.touched);
    if (this.hover) marked.add(this.hover);
    marked.forEach((f) => {
      ctx.fillStyle = alt ? 'rgba(224, 69, 123, 0.35)' : 'rgba(212, 240, 76, 0.45)';
      ctx.fill(f.p2d, 'evenodd');
      ctx.lineWidth = 2.5 / v[0];
      ctx.strokeStyle = alt ? '#e0457b' : '#7c9425';
      ctx.stroke(f.p2d);
    });
    ctx.restore();
  },

  commit(remove) {
    if (!this.touched.size) return;
    const touched = [...this.touched];
    const rest = this.faces.filter((f) => !this.touched.has(f));
    const results = rest.map((f) => ({ item: f.item, style: f.style }));
    if (!remove) {
      const merged = touched.map((f) => f.item).reduce((a, b) => a.unite(b, { insert: false }));
      results.push({ item: merged, style: touched[0].style });
    }
    const all = canvas.getObjects();
    const index = Math.min(...this.sources.map((o) => all.indexOf(o)));
    canvas.discardActiveObject();
    this.sources.forEach((o) => canvas.remove(o));
    const made = results.filter((r) => !Pathfinder.isEmpty(r.item)).map((r) => Pathfinder.makePath(r.item, r.style));
    made.forEach((p, i) => canvas.insertAt(p, Math.max(0, index + i)));
    this.touched.clear();
    if (made.length) Arrange.reselect(made);
    canvas.requestRenderAll();
    History.queue();
    // On continue avec les nouvelles formes
    this.prepare().then(() => this.render());
  },
};

Tools.shapebuilder = {
  cursor: 'crosshair',
  async activate() {
    setInteractionMode('draw');
    await ShapeBuilder.prepare();
    ShapeBuilder.render();
  },
  deactivate() {
    ShapeBuilder.faces = [];
    ShapeBuilder.touched.clear();
    ShapeBuilder.hover = null;
    canvas.clearContext(canvas.contextTop);
  },
  onMouseDown(p, e) {
    if (!ShapeBuilder.faces.length) return;
    ShapeBuilder.dragging = true;
    ShapeBuilder.touched.clear();
    const f = ShapeBuilder.faceAt(p);
    if (f) ShapeBuilder.touched.add(f);
    ShapeBuilder.render(e.altKey);
  },
  onMouseMove(p, e) {
    if (!ShapeBuilder.faces.length || !PaperKit.scope) return;
    const f = ShapeBuilder.faceAt(p);
    if (ShapeBuilder.dragging && f) ShapeBuilder.touched.add(f);
    ShapeBuilder.hover = f;
    ShapeBuilder.render(e.altKey);
  },
  onMouseUp(p, e) {
    if (!ShapeBuilder.dragging) return;
    ShapeBuilder.dragging = false;
    ShapeBuilder.commit(e.altKey);
  },
  options() {
    return html('<p class="field-note">Sélectionnez des formes qui se chevauchent puis prenez l\'outil. Glissez à travers les zones pour les fusionner, cliquez une zone pour la détacher. Alt : effacer les zones touchées.</p>');
  },
};

TOOL_LABELS.shapebuilder = 'Concepteur de forme';

Hooks.on('init', () => {
  // Rangé avec le pot de peinture (zones formées par les chevauchements)
  RailGroups.add('paint', { tool: 'shapebuilder', label: 'Concepteur de forme', icon: SHAPE_BUILDER_ICON, kbd: 'Maj M' });
  // Les objets sélectionnés à la flèche restent la source quand on prend l'outil
  Keys.add((e, { mod, key }) => {
    if (!mod && !e.altKey && e.shiftKey && key === 'm') { e.preventDefault(); setTool('shapebuilder'); return true; }
    if (state.tool === 'shapebuilder' && e.key === 'Alt') { ShapeBuilder.render(true); return false; }
    return false;
  });
});
