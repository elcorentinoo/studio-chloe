/**
 * ============================================================================
 *  Chloe’s Touch — Dégradés avancés
 *    1. Dégradés de couleur : linéaire OU radial, avec autant d'arrêts
 *       intermédiaires que voulu (couleur + position), dans l'onglet
 *       « Dégradé » du remplissage.
 *    2. Dégradé de formes (« Blend » d'Illustrator) : entre deux formes,
 *       N étapes intermédiaires qui interpolent le contour, les couleurs,
 *       l'épaisseur et l'opacité (tuile Effets → « Dégradé de formes… »).
 * ============================================================================
 */
'use strict';

/* ============================================================================
   1. DÉGRADÉS DE COULEUR
   ========================================================================== */

const GradientPro = {
  type: 'linear',
  middle: [], // arrêts intermédiaires { offset, color }

  build(c1, c2, angle) {
    const stops = [{ offset: 0, color: c1 }, ...this.middle.map((s) => ({ ...s })), { offset: 1, color: c2 }].sort((a, b) => a.offset - b.offset);
    if (this.type === 'radial') {
      return new fabric.Gradient({
        type: 'radial', gradientUnits: 'percentage',
        coords: { x1: 0.5, y1: 0.5, r1: 0, x2: 0.5, y2: 0.5, r2: 0.5 },
        colorStops: stops,
      });
    }
    const a = (angle * Math.PI) / 180;
    const dx = Math.cos(a) / 2;
    const dy = Math.sin(a) / 2;
    return new fabric.Gradient({
      type: 'linear', gradientUnits: 'percentage',
      coords: { x1: 0.5 - dx, y1: 0.5 - dy, x2: 0.5 + dx, y2: 0.5 + dy },
      colorStops: stops,
    });
  },

  css(c1, c2, angle) {
    const stops = [{ offset: 0, color: c1 }, ...this.middle, { offset: 1, color: c2 }].sort((a, b) => a.offset - b.offset)
      .map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ');
    return this.type === 'radial' ? `radial-gradient(circle, ${stops})` : `linear-gradient(${angle + 90}deg, ${stops})`;
  },

  mountUI() {
    const box = $('#row-gradient .gradient-controls');
    this.el = html(`
      <div class="gradient-pro">
        <div class="chips">
          <button class="chip" type="button" data-gtype="linear">Linéaire</button>
          <button class="chip" type="button" data-gtype="radial">Radial</button>
        </div>
        <span class="swatch-caption">Arrêts intermédiaires</span>
        <ul class="appearance-list" id="gradient-stops"></ul>
        <button class="btn btn-sm" type="button" id="gradient-add-stop">+ Arrêt de couleur</button>
      </div>`);
    box.querySelector('.gradient-preview').after(this.el);
    this.el.querySelectorAll('[data-gtype]').forEach((b) => b.addEventListener('click', () => {
      this.type = b.dataset.gtype;
      GradientFill.apply();
      this.render();
    }));
    this.el.querySelector('#gradient-add-stop').addEventListener('click', () => {
      // Nouvel arrêt au milieu du plus grand intervalle
      const offs = [0, ...this.middle.map((s) => s.offset), 1].sort((a, b) => a - b);
      let best = 0;
      for (let i = 1; i < offs.length; i += 1) if (offs[i] - offs[i - 1] > offs[best + 1] - offs[best]) best = i - 1;
      this.middle.push({ offset: Math.round(((offs[best] + offs[best + 1]) / 2) * 100) / 100, color: '#e0457b' });
      GradientFill.apply();
      this.render();
    });

    // Remplacement de l'application / lecture du dégradé de style-fx.js
    GradientFill.apply = function apply() {
      const angle = Number(this.angle.value);
      this.el.querySelector('#out-gradient-angle').textContent = `${angle}°`;
      this.el.querySelector('#hex-fill-2').textContent = this.c2.value.toUpperCase();
      paintRange(this.angle);
      this.targets().forEach((o) => o.set('fill', GradientPro.build(dom.propFill.value, this.c2.value, angle)));
      this.preview(dom.propFill.value, this.c2.value, angle);
      canvas.requestRenderAll();
      History.queue();
    };
    GradientFill.preview = function preview(c1, c2, angle) {
      this.el.querySelector('#gradient-preview').style.background = GradientPro.css(c1, c2, angle);
      const angleRow = this.angle.previousElementSibling;
      this.angle.hidden = GradientPro.type === 'radial';
      if (angleRow) angleRow.hidden = GradientPro.type === 'radial';
    };
    Hooks.on('sync', ({ ref, hasSelection }) => {
      const fill = hasSelection ? ref?.fill : null;
      if (fill && typeof fill === 'object' && fill.colorStops) {
        this.type = fill.type === 'radial' ? 'radial' : 'linear';
        const stops = [...fill.colorStops].sort((a, b) => a.offset - b.offset);
        this.middle = stops.slice(1, -1).map((s) => ({ offset: s.offset, color: toHex(s.color) || '#000000' }));
        GradientFill.preview(toHex(stops[0].color) || '#000000', toHex(stops[stops.length - 1].color) || '#000000', Number(GradientFill.angle.value));
      } else {
        // Objet sans dégradé : un futur dégradé repart de deux couleurs, linéaire
        this.type = 'linear';
        this.middle = [];
      }
      this.render();
    });
  },

  render() {
    this.el.querySelectorAll('[data-gtype]').forEach((b) => b.classList.toggle('is-active', b.dataset.gtype === this.type));
    const ul = this.el.querySelector('#gradient-stops');
    ul.replaceChildren(...this.middle.map((s, i) => {
      const li = html(`<li class="ap-item">
        <input type="color" value="${s.color}" aria-label="Couleur de l'arrêt">
        <input class="ap-opacity" type="range" min="1" max="99" value="${Math.round(s.offset * 100)}" aria-label="Position">
        <small class="stop-pos">${Math.round(s.offset * 100)} %</small>
        <button class="layer-btn" type="button" data-del title="Retirer" aria-label="Retirer"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </li>`);
      const pos = li.querySelector('.ap-opacity');
      paintRange(pos);
      li.querySelector('input[type=color]').addEventListener('input', (e) => { s.color = e.target.value; GradientFill.apply(); });
      pos.addEventListener('input', () => {
        s.offset = Number(pos.value) / 100;
        li.querySelector('.stop-pos').textContent = `${pos.value} %`;
        paintRange(pos);
        GradientFill.apply();
      });
      li.querySelector('[data-del]').addEventListener('click', () => { this.middle.splice(i, 1); GradientFill.apply(); this.render(); });
      return li;
    }));
  },
};

/* ============================================================================
   2. DÉGRADÉ DE FORMES
   ========================================================================== */

const ShapeBlend = {
  N: 96,

  /** Contour principal d'une forme, rééchantillonné en N points réguliers */
  outline(obj) {
    const sub = WidthProfile.sample(Geo.commands(obj))[0];
    if (!sub) return null;
    const pts = sub.pts;
    const len = [0];
    for (let i = 1; i < pts.length; i += 1) len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const total = len[len.length - 1] || 1;
    const count = sub.closed ? this.N : this.N + 1;
    const out = [];
    let j = 1;
    for (let k = 0; k < count; k += 1) {
      const d = (total * k) / this.N;
      while (j < len.length - 1 && len[j] < d) j += 1;
      const seg = len[j] - len[j - 1] || 1;
      const r = clamp((d - len[j - 1]) / seg, 0, 1);
      out.push({ x: pts[j - 1].x + (pts[j].x - pts[j - 1].x) * r, y: pts[j - 1].y + (pts[j].y - pts[j - 1].y) * r });
    }
    return { pts: out, closed: sub.closed };
  },

  /** Aligne b sur a (décalage circulaire et sens) pour une transition sans torsion */
  align(a, b) {
    if (!a.closed || !b.closed) return b.pts;
    const center = (p) => p.reduce((s, q) => ({ x: s.x + q.x / p.length, y: s.y + q.y / p.length }), { x: 0, y: 0 });
    const ca = center(a.pts);
    const cb = center(b.pts);
    const A = a.pts.map((p) => ({ x: p.x - ca.x, y: p.y - ca.y }));
    const n = b.pts.length;
    let best = { cost: Infinity, pts: b.pts };
    [b.pts, b.pts.slice().reverse()].forEach((cand) => {
      const B = cand.map((p) => ({ x: p.x - cb.x, y: p.y - cb.y }));
      for (let s = 0; s < n; s += 2) {
        let cost = 0;
        for (let i = 0; i < n; i += 4) {
          const q = B[(i + s) % n];
          cost += (A[i].x - q.x) ** 2 + (A[i].y - q.y) ** 2;
        }
        if (cost < best.cost) best = { cost, pts: cand.map((_, i) => cand[(i + s) % n]) };
      }
    });
    return best.pts;
  },

  mix(c1, c2, t) {
    const h1 = toHex(c1);
    const h2 = toHex(c2);
    if (!h1 || !h2) return t < 0.5 ? c1 : c2;
    const a = new fabric.Color(h1).getSource();
    const b = new fabric.Color(h2).getSource();
    const m = a.map((v, i) => Math.round(v + (b[i] - v) * t));
    return `#${m.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  },

  steps(objA, objB, n) {
    const a = this.outline(objA);
    const b = this.outline(objB);
    if (!a || !b) return [];
    const B = this.align(a, b);
    const closed = a.closed && b.closed;
    const out = [];
    for (let k = 1; k <= n; k += 1) {
      const t = k / (n + 1);
      const pts = a.pts.map((p, i) => ({ x: p.x + (B[i].x - p.x) * t, y: p.y + (B[i].y - p.y) * t }));
      const style = {
        fill: closed ? this.mix(objA.fill, objB.fill, t) : null,
        stroke: this.mix(objA.stroke, objB.stroke, t),
        strokeWidth: (objA.strokeWidth || 0) + ((objB.strokeWidth || 0) - (objA.strokeWidth || 0)) * t,
        opacity: (objA.opacity ?? 1) + ((objB.opacity ?? 1) - (objA.opacity ?? 1)) * t,
        strokeUniform: true, strokeLineJoin: 'round',
      };
      out.push(closed ? new fabric.Polygon(pts, style) : new fabric.Polyline(pts, style));
    }
    return out;
  },

  open() {
    const objs = canvas.getActiveObjects().filter((o) => Geo.canConvert(o));
    if (objs.length !== 2) { toast('Sélectionnez exactement deux formes ou tracés.'); return; }
    const all = canvas.getObjects();
    const [A, B] = objs.slice().sort((x, y) => all.indexOf(x) - all.indexOf(y));
    History.flush();
    History.restoring = true;
    canvas.discardActiveObject();
    let n = 8;
    let previews = [];
    const show = () => {
      previews.forEach((p) => canvas.remove(p));
      previews = this.steps(A, B, n);
      const index = canvas.getObjects().indexOf(A);
      previews.forEach((p, i) => { p.set({ selectable: false, evented: false }); canvas.insertAt(p, index + 1 + i); });
      canvas.requestRenderAll();
    };
    show();
    const sheet = Sheet.create({
      title: 'Dégradé de formes',
      body: `<div class="field"><label class="field-label" for="blend-n">Étapes intermédiaires <output id="out-blend-n">8</output></label>
        <input type="range" id="blend-n" min="1" max="60" step="1" value="8"></div>
        <p class="field-note">Le contour, les couleurs, l'épaisseur et l'opacité passent progressivement d'une forme à l'autre.</p>`,
      foot: '<button class="btn" type="button" data-close>Annuler</button><button class="btn btn-primary" type="button" id="blend-ok">Créer</button>',
    });
    sheet.el.classList.add('sheet-side');
    const input = sheet.$('#blend-n');
    paintRange(input);
    input.addEventListener('input', () => { n = Number(input.value); sheet.$('#out-blend-n').textContent = n; paintRange(input); show(); });
    let ok = false;
    sheet.$('#blend-ok').addEventListener('click', () => { ok = true; sheet.close(); });
    sheet.el.addEventListener('close', () => {
      if (ok) {
        History.restoring = false;
        const index = canvas.getObjects().indexOf(A);
        canvas.remove(A, B, ...previews);
        previews.forEach((p) => p.set({ selectable: true, evented: true }));
        const group = new fabric.Group([A, ...previews, B], { name: 'Dégradé de formes' });
        canvas.insertAt(group, Math.max(0, index));
        canvas.setActiveObject(group);
        History.queue();
        toast(`Dégradé de formes : ${n} étape${n > 1 ? 's' : ''}`, 'success');
      } else {
        previews.forEach((p) => canvas.remove(p));
        Arrange.reselect([A, B]);
        History.restoring = false;
      }
      canvas.requestRenderAll();
      sheet.el.remove();
    });
    sheet.open();
  },
};

Hooks.on('init', () => {
  GradientPro.mountUI();
  const btn = html('<button class="btn btn-sm btn-block" type="button" id="fx-blend" title="Sélectionnez deux formes">Dégradé de formes…</button>');
  $('#section-effects').appendChild(btn);
  btn.addEventListener('click', () => ShapeBlend.open());
});
