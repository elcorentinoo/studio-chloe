/**
 * ============================================================================
 *  Chloe’s Touch — Formes dynamiques (angles modifiables comme dans Illustrator)
 *
 *  Rectangles : un widget rond apparaît dans chaque angle de la forme
 *  sélectionnée. Glisser un widget vers l'intérieur arrondit les 4 angles ;
 *  avec Alt, seulement cet angle. Dans le panneau (sous « Arrondi des
 *  coins ») : rayon de chaque angle et type d'angle — arrondi, inversé,
 *  chanfrein. La forme reste un rectangle (redimensionnable sans déformer les
 *  angles au-delà de la moitié du petit côté) ; le Pathfinder, la flèche
 *  blanche, les effets et l'export SVG utilisent le contour réel.
 *  Modèle : rect.cornerRadii = [haut-gauche, haut-droit, bas-droit, bas-gauche]
 *           rect.cornerType = 'round' | 'inverted' | 'chamfer'
 * ============================================================================
 */
'use strict';

const CORNER_TYPES = { round: 'Arrondi', inverted: 'Inversé', chamfer: 'Chanfrein' };
const hasCorners = (o) => o?.type === 'rect' && Array.isArray(o.cornerRadii) && (o.cornerRadii.some((r) => r > 0));

const DynamicShapes = {
  /** Commandes locales d'un rectangle à angles dynamiques */
  rectCommands(o) {
    const w = o.width / 2;
    const h = o.height / 2;
    const V = [{ x: -w, y: -h }, { x: w, y: -h }, { x: w, y: h }, { x: -w, y: h }];
    const max = Math.min(w, h);
    const type = o.cornerType || 'round';
    const corners = V.map((v, i) => {
      const r = Math.max(0, Math.min(max, Number(o.cornerRadii[i]) || 0));
      const P = V[(i + 3) % 4];
      const N = V[(i + 1) % 4];
      const lu = Math.hypot(P.x - v.x, P.y - v.y) || 1;
      const lv = Math.hypot(N.x - v.x, N.y - v.y) || 1;
      const u = { x: (P.x - v.x) / lu, y: (P.y - v.y) / lu };
      const w2 = { x: (N.x - v.x) / lv, y: (N.y - v.y) / lv };
      const A = { x: v.x + u.x * r, y: v.y + u.y * r };
      const B = { x: v.x + w2.x * r, y: v.y + w2.y * r };
      let seg = null;
      if (r > 0 && type === 'round') seg = ['C', A.x - u.x * r * KAPPA, A.y - u.y * r * KAPPA, B.x - w2.x * r * KAPPA, B.y - w2.y * r * KAPPA, B.x, B.y];
      else if (r > 0 && type === 'inverted') seg = ['C', A.x + w2.x * r * KAPPA, A.y + w2.y * r * KAPPA, B.x + u.x * r * KAPPA, B.y + u.y * r * KAPPA, B.x, B.y];
      else if (r > 0) seg = ['L', B.x, B.y];
      return { A, B, seg };
    });
    const cmds = [['M', corners[0].B.x, corners[0].B.y]];
    for (let k = 1; k <= 4; k++) {
      const c = corners[k % 4];
      cmds.push(['L', c.A.x, c.A.y]);
      if (c.seg) cmds.push(c.seg);
    }
    cmds.push(['Z']);
    return cmds;
  },

  set(o, radii, type) {
    const max = Math.min(o.width, o.height) / 2;
    o.cornerRadii = radii.map((r) => Math.round(Math.max(0, Math.min(max, r)) * 100) / 100);
    if (type) o.cornerType = type;
    // l'arrondi uniforme classique reste lisible par le curseur « Arrondi des coins »
    o.set({ rx: 0, ry: 0 });
    o.dirty = true;
    o._fxCache = null;
  },

  /* ---------- widgets sur le canevas ---------- */
  screenScale(o) {
    const z = canvas.getZoom();
    const s = o.getObjectScaling();
    return { x: z * Math.abs(s.scaleX), y: z * Math.abs(s.scaleY) };
  },

  widgetLocal(o, i) {
    const w = o.width / 2;
    const h = o.height / 2;
    const sx = i === 0 || i === 3 ? 1 : -1; // vers l'intérieur
    const sy = i < 2 ? 1 : -1;
    const V = [{ x: -w, y: -h }, { x: w, y: -h }, { x: w, y: h }, { x: -w, y: h }][i];
    const r = Math.min(Math.min(w, h), (o.cornerRadii?.[i] ?? o.rx) || 0);
    const sc = this.screenScale(o);
    const k = (o.cornerType || 'round') === 'round' ? 0.3 : 0.5;
    return { x: V.x + sx * (r * k + 14 / sc.x), y: V.y + sy * (r * k + 14 / sc.y) };
  },

  makeControl(i) {
    const self = this;
    return new fabric.Control({
      actionName: 'cornerRadius',
      cursorStyle: 'pointer',
      sizeX: 14,
      sizeY: 14,
      getVisibility(o) {
        if (state.cropping || state.tool !== 'select' || o.excludeFromExport || o.locked || o.group) return false;
        const sc = self.screenScale(o);
        return o.width * sc.x > 44 && o.height * sc.y > 44; // pas sur les toutes petites formes
      },
      positionHandler(dim, finalMatrix, o) {
        const m = fabric.util.multiplyTransformMatrices(canvas.viewportTransform, o.calcTransformMatrix());
        return fabric.util.transformPoint(self.widgetLocal(o, i), m);
      },
      actionHandler(eventData, transform, x, y) {
        const o = transform.target;
        const p = fabric.util.transformPoint({ x, y }, fabric.util.invertTransform(o.calcTransformMatrix()));
        const w = o.width / 2;
        const h = o.height / 2;
        const V = [{ x: -w, y: -h }, { x: w, y: -h }, { x: w, y: h }, { x: -w, y: h }][i];
        const sc = self.screenScale(o);
        const k = (o.cornerType || 'round') === 'round' ? 0.3 : 0.5;
        const inset = (Math.abs(p.x - V.x) - 14 / sc.x + Math.abs(p.y - V.y) - 14 / sc.y) / 2;
        const r = Math.max(0, inset / k);
        const radii = o.cornerRadii ? o.cornerRadii.slice() : [o.rx || 0, o.rx || 0, o.rx || 0, o.rx || 0];
        if (eventData.altKey) radii[i] = r; else radii.fill(r);
        self.set(o, radii);
        return true;
      },
      render(ctx, left, top) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(left, top, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#d9474f';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(left, top, 2, 0, Math.PI * 2);
        ctx.fillStyle = '#d9474f';
        ctx.fill();
        ctx.restore();
      },
    });
  },

  patch() {
    // Contour réel utilisé partout (Pathfinder, flèche blanche, effets…)
    const baseLocal = Geo.localCommands.bind(Geo);
    Geo.localCommands = (o) => (hasCorners(o) ? this.rectCommands(o) : baseLocal(o));
    const proto = fabric.Rect.prototype;
    const baseRender = proto._render;
    proto._render = function render(ctx) {
      if (!hasCorners(this) || FxGeo.derived(this)) { baseRender.call(this, ctx); return; }
      ctx.beginPath();
      DynamicShapes.rectCommands(this).forEach((c) => {
        if (c[0] === 'M') ctx.moveTo(c[1], c[2]);
        else if (c[0] === 'L') ctx.lineTo(c[1], c[2]);
        else if (c[0] === 'C') ctx.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
        else ctx.closePath();
      });
      this._renderPaintInOrder(ctx);
    };
    const baseSVG = proto.toSVG;
    proto.toSVG = function toSVG(reviver) {
      if (!hasCorners(this) || FxGeo.derived(this)) return baseSVG.call(this, reviver);
      return this._createBaseSVGMarkup(['<path ', 'COMMON_PARTS', `d="${Geo.toPathData(DynamicShapes.rectCommands(this))}" />\n`], { reviver });
    };
    // Widgets d'angle sur tous les rectangles
    proto.controls = { ...fabric.Object.prototype.controls };
    [0, 1, 2, 3].forEach((i) => { proto.controls[`corner${i}`] = this.makeControl(i); });
  },

  /* ---------- panneau ---------- */
  mountUI() {
    this.el = html(`
      <div class="field corner-pro" id="corner-pro" hidden>
        <div class="corner-grid">
          ${[[0, '↖'], [1, '↗'], [3, '↙'], [2, '↘']].map(([i, a]) => `<label class="tf-field" title="Rayon de l'angle ${['haut gauche', 'haut droit', 'bas droit', 'bas gauche'][i]}"><span>${a}</span><input class="input" type="number" min="0" step="1" data-corner="${i}" aria-label="Rayon ${a}"></label>`).join('')}
        </div>
        <div class="seg" role="group" aria-label="Type d'angle">
          ${Object.entries(CORNER_TYPES).map(([k, l]) => `<button class="seg-btn" type="button" data-corner-type="${k}">${l}</button>`).join('')}
        </div>
        <p class="field-note">Glissez les ronds dans les angles de la forme (Alt : un seul angle).</p>
      </div>`);
    const row = $('#row-radius');
    row.after(this.el);
    // Le curseur classique remet les 4 angles au même rayon
    $('#prop-radius').addEventListener('input', (e) => {
      canvas.getActiveObjects().filter((o) => o.type === 'rect' && o.cornerRadii).forEach((o) => {
        const r = Number(e.target.value);
        this.set(o, [r, r, r, r]);
      });
      canvas.requestRenderAll();
      this.sync();
    });
    this.el.querySelectorAll('[data-corner]').forEach((input) => {
      input.addEventListener('keydown', (e) => e.stopPropagation());
      input.addEventListener('change', () => {
        const i = Number(input.dataset.corner);
        canvas.getActiveObjects().filter((o) => o.type === 'rect').forEach((o) => {
          const radii = o.cornerRadii ? o.cornerRadii.slice() : [o.rx || 0, o.rx || 0, o.rx || 0, o.rx || 0];
          radii[i] = Number(input.value) || 0;
          this.set(o, radii);
        });
        canvas.requestRenderAll();
        History.queue();
        this.sync();
      });
    });
    this.el.querySelectorAll('[data-corner-type]').forEach((b) => b.addEventListener('click', () => {
      canvas.getActiveObjects().filter((o) => o.type === 'rect').forEach((o) => {
        const radii = o.cornerRadii ? o.cornerRadii.slice() : [o.rx || 0, o.rx || 0, o.rx || 0, o.rx || 0];
        this.set(o, radii, b.dataset.cornerType);
      });
      canvas.requestRenderAll();
      History.queue();
      this.sync();
    }));
    Hooks.on('sync', () => this.sync());
    canvas.on('object:modified', ({ action }) => { if (action === 'cornerRadius') this.sync(); });
  },

  sync() {
    const rects = canvas.getActiveObjects().filter((o) => o.type === 'rect');
    this.el.hidden = !rects.length || Boolean(state.cropping);
    if (!rects.length) return;
    const o = rects[0];
    const radii = o.cornerRadii || [o.rx || 0, o.rx || 0, o.rx || 0, o.rx || 0];
    this.el.querySelectorAll('[data-corner]').forEach((input) => {
      if (document.activeElement !== input) input.value = Math.round(radii[Number(input.dataset.corner)]);
    });
    this.el.querySelectorAll('[data-corner-type]').forEach((b) => b.classList.toggle('is-active', b.dataset.cornerType === (o.cornerType || 'round')));
    // le curseur « Arrondi des coins » affiche le premier angle
    const slider = $('#prop-radius');
    if (o.cornerRadii && document.activeElement !== slider) {
      slider.value = Math.round(radii[0]);
      $('#out-radius').textContent = `${slider.value} px`;
      paintRange(slider);
    }
  },
};

SERIAL_PROPS.push('cornerRadii', 'cornerType');
TYPE_LABELS.rect = TYPE_LABELS.rect || 'Rectangle';

DynamicShapes.patch();
Hooks.on('init', () => DynamicShapes.mountUI());
