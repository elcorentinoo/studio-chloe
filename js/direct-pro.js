/**
 * ============================================================================
 *  Studio Chloé — Flèche blanche perfectionnée (édition des points)
 *
 *  Comme la Sélection directe d'Illustrator, pendant l'édition des points
 *  (flèche blanche A, ou double-clic avec la flèche noire) :
 *    - un clic sur un point le sélectionne (plein) ; Maj + clic en ajoute /
 *      en retire ; les poignées ne s'affichent que pour les points choisis ;
 *    - glisser un point sélectionné déplace tous les points sélectionnés ;
 *    - rectangle de sélection : glisser dans le vide sélectionne les points
 *      qu'il entoure (Maj : ajoute) ;
 *    - flèches du clavier : déplacent les points choisis (Maj : 10 px) ;
 *    - Suppr / ⌫ : supprime les points choisis ;
 *    - ⌘A : tous les points du tracé ;
 *    - flèche blanche : un clic sur le tracé lui-même sélectionne tous ses
 *      points, et le glisser déplace la forme.
 * ============================================================================
 */
'use strict';

const DirectPro = {
  sel: new Set(), // clés « ci_k » des points d'ancrage choisis
  marquee: null,  // { a: point écran, b, obj, add }

  key(pt) { return `${pt.ci}_${pt.k}`; },

  anchors(obj) { return PathEditor.describe(obj).filter((pt) => pt.kind === 'anchor'); },

  selectAll(obj) { this.sel = new Set(this.anchors(obj).map((pt) => this.key(pt))); },

  isVisibleHandle(pt) {
    return [pt.anchor, pt.anchor2].some((a) => a && this.sel.has(`${a.ci}_${a.k}`));
  },

  /** Déplace des coordonnées (repère du tracé) sans traiter deux fois un même point */
  moveKeys(obj, keys, dx, dy, done = new Set()) {
    keys.forEach((key) => {
      const [ci, k] = key.split('_').map(Number);
      const list = [[ci, k], ...PathEditor.linked(obj, ci)];
      list.forEach(([c, kk]) => {
        const id = `${c}_${kk}`;
        if (done.has(id)) return;
        done.add(id);
        obj.path[c][kk] += dx;
        obj.path[c][kk + 1] += dy;
      });
    });
    obj.dirty = true;
  },

  /** Flèches du clavier : déplacement des points choisis, en px du document */
  nudge(dxDoc, dyDoc) {
    const obj = PathEditor.obj;
    if (!obj || !this.sel.size) return false;
    const m = fabric.util.invertTransform(obj.calcTransformMatrix());
    const d = fabric.util.transformPoint({ x: dxDoc, y: dyDoc }, [m[0], m[1], m[2], m[3], 0, 0]);
    this.moveKeys(obj, [...this.sel], d.x, d.y);
    PathEditor.refit(obj);
    canvas.requestRenderAll();
    History.queue();
    return true;
  },

  /** Supprime les points choisis (la courbe se referme sur les voisins) */
  deleteSelected() {
    const obj = PathEditor.obj;
    if (!obj || !this.sel.size) return false;
    const pts = [...this.sel].map((key) => { const [ci, k] = key.split('_').map(Number); return { x: obj.path[ci][k], y: obj.path[ci][k + 1] }; });
    const same = (a, b) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
    let subs = Anchors.parse(obj.path).map((s) => ({ ...s, anchors: s.anchors.filter((a) => !pts.some((p) => same(p, a.p))) }));
    subs = subs.filter((s) => s.anchors.length >= 2);
    this.sel.clear();
    PathEditor.stop();
    if (!subs.length) {
      canvas.remove(obj);
      canvas.requestRenderAll();
      History.queue();
      Properties.sync();
      return true;
    }
    Anchors.write(obj, subs);
    PathEditor.start(obj);
    canvas.requestRenderAll();
    History.queue();
    return true;
  },

  /** Points d'ancrage du tracé dans un rectangle écran */
  keysInRect(obj, a, b) {
    const x0 = Math.min(a.x, b.x); const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y); const y1 = Math.max(a.y, b.y);
    return this.anchors(obj).filter((pt) => {
      const s = PathEditor.toScreen(obj, obj.path[pt.ci][pt.k], obj.path[pt.ci][pt.k + 1]);
      return s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1;
    }).map((pt) => this.key(pt));
  },

  renderMarquee() {
    const ctx = canvas.contextTop;
    if (!ctx || !this.marquee) return;
    canvas.clearContext(ctx);
    const { a, b } = this.marquee;
    ctx.save();
    ctx.fillStyle = 'rgba(212, 240, 76, 0.15)';
    ctx.strokeStyle = '#7c9425';
    ctx.setLineDash([4, 3]);
    ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    ctx.strokeRect(Math.min(a.x, b.x) + 0.5, Math.min(a.y, b.y) + 0.5, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    ctx.restore();
  },

  screenOf(e) {
    const r = canvas.upperCanvasEl.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  },

  /** Commandes d'objets convertibles touchés par le rectangle (pour démarrer une édition) */
  objectInRect(a, b) {
    const inv = fabric.util.invertTransform(canvas.viewportTransform);
    const p0 = fabric.util.transformPoint(a, inv);
    const p1 = fabric.util.transformPoint(b, inv);
    const box = { left: Math.min(p0.x, p1.x), top: Math.min(p0.y, p1.y), right: Math.max(p0.x, p1.x), bottom: Math.max(p0.y, p1.y) };
    return canvas.getObjects().filter((o) => o.visible && !o.locked && o.selectable !== false && Geo.canConvert(o)).reverse().find((o) => {
      return Geo.commands(o).some((c) => c[0] !== 'Z' && c[c.length - 2] >= box.left && c[c.length - 2] <= box.right && c[c.length - 1] >= box.top && c[c.length - 1] <= box.bottom);
    }) || null;
  },

  patch() {
    const self = this;
    // Contrôles : sélection des points, déplacement groupé, poignées des points choisis seulement
    const baseMake = PathEditor.makeControl.bind(PathEditor);
    PathEditor.makeControl = (pt) => {
      const ctrl = baseMake(pt);
      const baseAction = ctrl.actionHandler;
      const baseRender = ctrl.render;
      if (pt.kind === 'anchor') {
        ctrl.mouseDownHandler = (eventData) => {
          const key = self.key(pt);
          if (eventData.shiftKey) { if (self.sel.has(key)) self.sel.delete(key); else self.sel.add(key); }
          else if (!self.sel.has(key)) self.sel = new Set([key]);
          canvas.requestRenderAll();
          return false;
        };
        ctrl.actionHandler = (eventData, transform, x, y) => {
          const obj = transform.target;
          const cmd = obj.path[pt.ci];
          const before = { x: cmd[pt.k], y: cmd[pt.k + 1] };
          const res = baseAction(eventData, transform, x, y); // ce point et ses poignées
          const dx = cmd[pt.k] - before.x;
          const dy = cmd[pt.k + 1] - before.y;
          const others = [...self.sel].filter((k) => k !== self.key(pt));
          if (others.length && (dx || dy)) {
            const done = new Set([[pt.ci, pt.k], ...PathEditor.linked(obj, pt.ci)].map(([c, k]) => `${c}_${k}`));
            self.moveKeys(obj, others, dx, dy, done);
          }
          return res;
        };
        ctrl.render = (ctx, left, top, styleOverride, obj) => {
          if (!self.sel.has(self.key(pt))) { baseRender(ctx, left, top, styleOverride, obj); return; }
          ctx.save();
          ctx.fillStyle = '#25300b';
          ctx.strokeStyle = '#d4f04c';
          ctx.lineWidth = 1.5;
          ctx.fillRect(left - 5.5, top - 5.5, 11, 11);
          ctx.strokeRect(left - 5.5, top - 5.5, 11, 11);
          ctx.restore();
        };
      } else {
        ctrl.getVisibility = () => self.isVisibleHandle(pt);
      }
      return ctrl;
    };

    // Nouvelle édition : aucun point choisi (comme dans Illustrator)
    const baseStart = PathEditor.start.bind(PathEditor);
    PathEditor.start = (obj) => {
      if (PathEditor.obj !== obj) self.sel = new Set();
      return baseStart(obj);
    };
    const baseStop = PathEditor.stop.bind(PathEditor);
    PathEditor.stop = () => {
      if (!self.keepSel) self.sel = new Set();
      return baseStop();
    };
  },

  bind() {
    const self = this;
    let editingBefore = null;
    let selBefore = new Set();
    // avant que Fabric ne vide la sélection (clic dans le vide) : on retient l'édition en cours
    canvas.on('mouse:down:before', () => { editingBefore = PathEditor.obj; selBefore = new Set(self.sel); });

    // Flèche blanche : clic sur le tracé = tous ses points ; clic dans le vide = rectangle de sélection
    canvas.on('mouse:down', (opt) => {
      if (state.tool !== 'direct' || opt.e.button > 0) return;
      const corner = canvas._currentTransform?.corner;
      if (opt.target && opt.target === PathEditor.obj && !corner) {
        self.selectAll(opt.target);
        opt.target.set({ lockMovementX: false, lockMovementY: false });
        canvas.requestRenderAll();
        return;
      }
      if (!opt.target) {
        const prev = editingBefore && canvas.getObjects().includes(editingBefore) ? editingBefore : null;
        const a = self.screenOf(opt.e);
        self.marquee = { a, b: a, obj: prev, add: opt.e.shiftKey, prevSel: selBefore };
      }
    });
    canvas.on('mouse:move', (opt) => {
      if (!self.marquee) return;
      self.marquee.b = self.screenOf(opt.e);
      self.renderMarquee();
    });
    canvas.on('mouse:up', () => {
      const m = self.marquee;
      if (!m) return;
      self.marquee = null;
      canvas.clearContext(canvas.contextTop);
      if (Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y) < 4) { canvas.requestRenderAll(); return; } // simple clic dans le vide
      let obj = m.obj;
      if (!obj || !self.keysInRect(obj, m.a, m.b).length) {
        const hit = self.objectInRect(m.a, m.b);
        if (hit) obj = hit;
      }
      if (!obj) { canvas.requestRenderAll(); return; }
      const path = DirectSelect.editable(obj);
      if (!path) return;
      self.keepSel = true;
      if (PathEditor.obj !== path) PathEditor.start(path);
      else canvas.setActiveObject(path);
      self.keepSel = false;
      path.set({ lockMovementX: true, lockMovementY: true });
      const keys = self.keysInRect(path, m.a, m.b);
      self.sel = new Set([...(m.add && m.obj === path ? m.prevSel : []), ...keys]);
      canvas.requestRenderAll();
    });
    canvas.on('after:render', () => { if (self.marquee) self.renderMarquee(); });

    // Clavier : prioritaire sur les raccourcis des objets
    Keys.handlers.unshift((e, { mod, key }) => {
      if (!PathEditor.obj || document.activeElement?.matches?.('input, textarea, select, [contenteditable]')) return false;
      if (mod && key === 'a') { e.preventDefault(); self.selectAll(PathEditor.obj); canvas.requestRenderAll(); return true; }
      if (!self.sel.size) return false;
      const step = e.shiftKey ? 10 : 1;
      const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (arrows[e.key] && !mod) { e.preventDefault(); self.nudge(...arrows[e.key]); return true; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !mod) { e.preventDefault(); self.deleteSelected(); return true; }
      return false;
    });
  },
};

DirectPro.patch();
Hooks.on('init', () => DirectPro.bind());
