/**
 * ============================================================================
 *  Chloe’s Touch — Remplissage & symboles (menu « Peinture » du rail)
 *
 *  Pot de peinture dynamique (Maj + K) — comme la Peinture dynamique
 *    d'Illustrator : les formes qui se chevauchent découpent la page en
 *    zones ; un clic remplit la zone sous la souris avec la couleur de
 *    remplissage courante (survol : la zone est surlignée). La zone devient
 *    une forme à part (« Zone peinte »), recolorable d'un nouveau clic.
 *
 *  Pulvérisateur de symboles (Maj + S) — maintenez le clic pour semer des
 *    copies du symbole autour du pointeur (taille et rotation aléatoires,
 *    densité réglable). Le symbole = la sélection au moment où l'on prend
 *    l'outil (ou « Utiliser la sélection »), sinon une petite étoile.
 *    Chaque passage forme un groupe « Jeu de symboles ». Alt : efface les
 *    symboles pulvérisés sous le pointeur.
 * ============================================================================
 */
'use strict';

const PAINT_ICONS = {
  sprayer: '<path d="M7 11h6v10H7z"/><path d="M9 11V8h2v3M11 8h3"/><circle cx="18" cy="5" r=".8"/><circle cx="20.5" cy="8" r=".8"/><circle cx="17.5" cy="9.5" r=".8"/><circle cx="21" cy="3.5" r=".8"/>',
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
    const color = state.style.fill || '#f68a8d';
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
    if (!ctx) return; // rendu d’export en cours (toCanvasElement) : pas de calque d’interface
    canvas.clearContext(ctx);
    if (!this.hoverItem || state.tool !== 'livepaint') return;
    const v = canvas.viewportTransform;
    ctx.save();
    ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]);
    const p2d = new Path2D(this.hoverItem.pathData);
    ctx.fillStyle = 'rgba(246, 138, 141, 0.25)';
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

/* ============================================================================
   PULVÉRISATEUR DE SYMBOLES
   ========================================================================== */

const SymbolSprayer = {
  opts: { size: 60, variation: 40, rotate: true, density: 8, radius: 70 },
  source: null,          // objet Fabric servant de modèle (clone)
  sourceName: 'Étoile',
  session: null,         // { instances: [], timer, cursor }

  defaultSymbol() {
    return new fabric.Polygon(radialPoints({ left: -50, top: -50, width: 100, height: 100 }, 10, (i) => (i % 2 ? 0.45 : 1)), {
      fill: '#f68a8d', stroke: '#c73527', strokeWidth: 2, strokeUniform: true, strokeLineJoin: 'round',
    });
  },

  /** La sélection devient le symbole pulvérisé */
  useSelection() {
    const active = canvas.getActiveObject();
    if (!active) { toast('Sélectionnez d\'abord l\'objet à pulvériser.'); return false; }
    active.clone((c) => {
      this.source = c;
      this.sourceName = active.type === 'activeSelection' ? `${active.getObjects().length} objets` : objectLabel(active);
      this.refreshOptions();
      toast(`Symbole : ${this.sourceName}`, 'success');
    }, SERIAL_PROPS);
    return true;
  },

  refreshOptions() {
    const el = Tools.sprayer._optionsEl?.querySelector('#spray-source');
    if (el) el.textContent = this.sourceName;
  },

  spawn(c) {
    const src = this.source || this.defaultSymbol();
    const zoomR = this.opts.radius / canvas.getZoom();
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * zoomR;
    const at = new fabric.Point(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d);
    src.clone((inst) => {
      const box = Math.max(inst.width * inst.scaleX, inst.height * inst.scaleY) || 1;
      const base = this.opts.size / canvas.getZoom() / box;
      const vary = 1 + (Math.random() * 2 - 1) * (this.opts.variation / 100);
      if (inst.type === 'activeSelection') { inst = new fabric.Group(inst.getObjects()); }
      inst.set({
        scaleX: inst.scaleX * base * vary,
        scaleY: inst.scaleY * base * vary,
        angle: this.opts.rotate ? Math.random() * 360 : inst.angle,
        selectable: false, evented: false,
      });
      inst.setPositionByOrigin(at, 'center', 'center');
      inst.sprayed = true;
      if (!this.session) return;
      this.session.instances.push(inst);
      canvas.add(inst);
      canvas.requestRenderAll();
    }, SERIAL_PROPS);
  },

  /** Alt : retire les instances pulvérisées sous le pointeur */
  shred(c) {
    const r = this.opts.radius / canvas.getZoom();
    canvas.getObjects().forEach((o) => {
      if (o.type !== 'group' || !o.symbolSet) return;
      const kill = o.getObjects().filter((x) => {
        const m = fabric.util.transformPoint(x.getCenterPoint(), o.calcTransformMatrix());
        return Math.hypot(m.x - c.x, m.y - c.y) < r;
      });
      if (!kill.length) return;
      kill.forEach((x) => o.removeWithUpdate(x));
      if (!o.getObjects().length) canvas.remove(o);
      this.session.changed = true;
    });
    canvas.requestRenderAll();
  },

  start(p, e) {
    this.session = { instances: [], cursor: p, alt: e.altKey };
    const tick = () => {
      if (!this.session) return;
      if (this.session.alt) this.shred(this.session.cursor);
      else this.spawn(this.session.cursor);
    };
    tick();
    this.session.timer = setInterval(tick, 1000 / this.opts.density);
  },

  end() {
    const s = this.session;
    if (!s) return;
    clearInterval(s.timer);
    this.session = null;
    if (s.instances.length) {
      s.instances.forEach((i) => canvas.remove(i));
      s.instances.forEach((i) => i.set({ selectable: true, evented: true }));
      const group = new fabric.Group(s.instances, { name: 'Jeu de symboles' });
      group.symbolSet = true;
      canvas.add(group);
      canvas.requestRenderAll();
    }
    if (s.instances.length || s.changed) History.queue();
  },
};

Tools.sprayer = {
  cursor: 'crosshair',
  activate() {
    setInteractionMode('draw');
    if (canvas.getActiveObject()) SymbolSprayer.useSelection();
    canvas.discardActiveObject();
  },
  deactivate() { SymbolSprayer.end(); canvas.clearContext(canvas.contextTop); },
  onMouseDown(p, e) { SymbolSprayer.start(p, e); },
  onMouseMove(p) {
    if (SymbolSprayer.session) SymbolSprayer.session.cursor = p;
    const ctx = canvas.contextTop;
    if (!ctx) return; // rendu d’export en cours (toCanvasElement) : pas de calque d’interface
    canvas.clearContext(ctx);
    const v = canvas.viewportTransform;
    ctx.save();
    ctx.strokeStyle = PEN_COLOR;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(p.x * v[0] + v[4], p.y * v[3] + v[5], SymbolSprayer.opts.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  },
  onMouseUp() { SymbolSprayer.end(); },
  options() {
    const o = SymbolSprayer.opts;
    const el = html(`<div class="tool-options-body">
      <p class="field-note">Maintenez le clic et promenez la souris pour semer des symboles. Alt : effacer.</p>
      <div class="spray-source"><span class="field-label">Symbole</span><strong id="spray-source">${escapeHTML(SymbolSprayer.sourceName)}</strong></div>
      <button class="btn btn-sm" type="button" id="spray-use">Utiliser la sélection</button>
      <label class="check"><input type="checkbox" id="spray-rotate" ${o.rotate ? 'checked' : ''}> Rotation aléatoire</label>
    </div>`);
    el.append(
      optionRange({ id: 'spray-size', label: 'Taille', min: 10, max: 300, value: o.size, unit: ' px', onInput: (v) => { o.size = v; } }),
      optionRange({ id: 'spray-variation', label: 'Variation de taille', min: 0, max: 90, value: o.variation, unit: ' %', onInput: (v) => { o.variation = v; } }),
      optionRange({ id: 'spray-density', label: 'Densité (par seconde)', min: 1, max: 30, value: o.density, onInput: (v) => { o.density = v; } }),
      optionRange({ id: 'spray-radius', label: 'Diamètre du jet', min: 10, max: 300, value: o.radius, unit: ' px', onInput: (v) => { o.radius = v; } }),
    );
    el.querySelector('#spray-use').addEventListener('click', () => {
      // La sélection a été vidée en prenant l'outil : on repasse brièvement par la flèche noire
      if (!canvas.getActiveObject()) { toast('Sélectionnez l\'objet à la flèche noire (V), puis revenez au pulvérisateur.'); return; }
      SymbolSprayer.useSelection();
    });
    el.querySelector('#spray-rotate').addEventListener('change', (e) => { o.rotate = e.target.checked; });
    return el;
  },
};

TOOL_LABELS.sprayer = 'Pulvérisateur de symboles';
TYPE_LABELS.sprayer = 'Jeu de symboles';
SERIAL_PROPS.push('symbolSet', 'sprayed');

TOOL_LABELS.livepaint = 'Pot de peinture';
TYPE_LABELS.livepaint = 'Zone peinte';
SERIAL_PROPS.push('livePaint');

Hooks.on('init', () => {
  RailGroups.create('paint', {
    title: 'Peinture & symboles',
    after: $('.rail [data-group="deform"]'),
    items: [
      { tool: 'livepaint', label: 'Pot de peinture dynamique', icon: PAINT_ICONS.bucket, kbd: 'Maj K' },
      { tool: 'sprayer', label: 'Pulvérisateur de symboles', icon: PAINT_ICONS.sprayer, kbd: 'Maj S' },
    ],
  });
  Keys.add((e, { mod, key }) => {
    if (!mod && !e.altKey && e.shiftKey && key === 'k') { e.preventDefault(); setTool('livepaint'); return true; }
    if (!mod && !e.altKey && e.shiftKey && key === 's') { e.preventDefault(); setTool('sprayer'); return true; }
    return false;
  });
});
