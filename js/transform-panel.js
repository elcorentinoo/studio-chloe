/**
 * ============================================================================
 *  Chloe’s Touch — Panneau Transformation (tuile en tête du panneau)
 *
 *  Comme le panneau Transformation d'Illustrator :
 *    - point de référence à 9 positions (coins, milieux, centre) ;
 *    - X, Y : position de ce point, en px du document ;
 *    - L, H : largeur et hauteur de l'objet (cadenas : proportions liées) ;
 *    - angle de rotation, autour du point de référence.
 *  Les valeurs suivent l'objet en direct pendant qu'on le déplace.
 *  Entrée valide, ↑ / ↓ ajoutent 1 (Maj : 10). On peut taper un calcul
 *  simple : « 120+30 », « 300/2 ».
 * ============================================================================
 */
'use strict';

const TransformPanel = {
  ref: { x: 0.5, y: 0.5 }, // point de référence (0 = gauche / haut, 1 = droite / bas)
  lock: true,

  target() {
    const o = canvas.getActiveObject();
    return o && !state.cropping && !o.isEditing ? o : null;
  },

  /** Taille propre de l'objet (avant rotation), contour compris */
  size(o) { return { w: o.getScaledWidth(), h: o.getScaledHeight() }; },

  /** Point de référence en coordonnées du document */
  refPoint(o) {
    const d = o._getTransformedDimensions(); // taille × échelle, contour compris, sans rotation
    const sx = o.flipX ? -1 : 1;
    const sy = o.flipY ? -1 : 1;
    const local = { x: (this.ref.x - 0.5) * d.x * sx, y: (this.ref.y - 0.5) * d.y * sy };
    const c = o.getCenterPoint();
    const a = fabric.util.degreesToRadians(o.angle || 0);
    return { x: c.x + local.x * Math.cos(a) - local.y * Math.sin(a), y: c.y + local.x * Math.sin(a) + local.y * Math.cos(a) };
  },

  /** Modifie l'objet sans que le point de référence ne bouge */
  keepRef(o, change) {
    const before = this.refPoint(o);
    change();
    const after = this.refPoint(o);
    o.set({ left: o.left + before.x - after.x, top: o.top + before.y - after.y });
    o.setCoords();
  },

  /** « 120+30 » → 150 (opérations simples seulement) */
  evaluate(raw) {
    const txt = String(raw).replace(/,/g, '.').replace(/\s/g, '').replace(/px|°/g, '');
    if (!/^[-+*/().\d]+$/.test(txt)) return NaN;
    try { return Function(`"use strict";return (${txt});`)(); } catch { return NaN; }
  },

  set(field, value) {
    const o = this.target();
    if (!o || !Number.isFinite(value)) { this.sync(); return; }
    if (field === 'x' || field === 'y') {
      const p = this.refPoint(o);
      if (field === 'x') o.set({ left: o.left + value - p.x }); else o.set({ top: o.top + value - p.y });
      o.setCoords();
    } else if (field === 'w' || field === 'h') {
      const { w, h } = this.size(o);
      const v = Math.max(0.5, value);
      const k = field === 'w' ? v / (w || 1) : v / (h || 1);
      this.keepRef(o, () => {
        if (this.lock) o.set({ scaleX: o.scaleX * k, scaleY: o.scaleY * k });
        else if (field === 'w') o.set({ scaleX: o.scaleX * k });
        else o.set({ scaleY: o.scaleY * k });
      });
    } else if (field === 'angle') {
      this.keepRef(o, () => o.set({ angle: ((value % 360) + 360) % 360 }));
    }
    canvas.requestRenderAll();
    canvas.fire('object:modified', { target: o, action: 'transformPanel' });
    this.sync();
  },

  mountUI() {
    const field = (k, label, title) => `<label class="tf-field" title="${title}"><span>${label}</span><input class="input" type="text" inputmode="decimal" data-tf="${k}" aria-label="${title}"></label>`;
    this.el = html(`
      <section class="tile tile-transform" id="section-transform" hidden>
        <div class="tf-grid">
          <div class="tf-ref" role="group" aria-label="Point de référence">
            ${[0, 0.5, 1].map((y) => [0, 0.5, 1].map((x) => `<button type="button" data-ref="${x},${y}" aria-label="Référence ${x * 100} % / ${y * 100} %"></button>`).join('')).join('')}
          </div>
          <div class="tf-fields">
            ${field('x', 'X', 'Position horizontale du point de référence')}
            ${field('y', 'Y', 'Position verticale du point de référence')}
            ${field('w', 'L', 'Largeur')}
            ${field('h', 'H', 'Hauteur')}
          </div>
          <div class="tf-side">
            <button class="icon-btn tf-lock" type="button" id="tf-lock" title="Lier largeur et hauteur" aria-label="Lier largeur et hauteur"></button>
            ${field('angle', '∠', 'Angle de rotation (°)')}
          </div>
        </div>
      </section>`);
    $('#panel-hint').after(this.el);
    this.el.querySelectorAll('[data-ref]').forEach((b) => b.addEventListener('click', () => {
      const [x, y] = b.dataset.ref.split(',').map(Number);
      this.ref = { x, y };
      this.sync();
    }));
    this.el.querySelector('#tf-lock').addEventListener('click', () => { this.lock = !this.lock; this.sync(); });
    this.el.querySelectorAll('[data-tf]').forEach((input) => {
      const commit = () => this.set(input.dataset.tf, this.evaluate(input.value));
      input.addEventListener('change', commit);
      input.addEventListener('keydown', (e) => {
        e.stopPropagation(); // pas de raccourcis d'outils pendant la saisie
        if (e.key === 'Enter') { e.preventDefault(); commit(); input.select(); }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const step = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
          const v = this.evaluate(input.value);
          if (Number.isFinite(v)) { input.value = this.fmt(v + step); commit(); }
        }
      });
      input.addEventListener('focus', () => input.select());
    });
    Hooks.on('sync', () => this.sync());
    ['object:moving', 'object:scaling', 'object:rotating', 'object:skewing', 'object:modified'].forEach((evt) => canvas.on(evt, () => this.sync()));
  },

  fmt(n) { return String(Math.round(n * 100) / 100).replace('.', ','); },

  sync() {
    const o = this.target();
    this.el.hidden = !o;
    if (!o) return;
    const p = this.refPoint(o);
    const { w, h } = this.size(o);
    const values = { x: p.x, y: p.y, w, h, angle: o.angle || 0 };
    this.el.querySelectorAll('[data-tf]').forEach((input) => {
      if (document.activeElement !== input) input.value = this.fmt(values[input.dataset.tf]);
    });
    this.el.querySelectorAll('[data-ref]').forEach((b) => b.classList.toggle('is-active', b.dataset.ref === `${this.ref.x},${this.ref.y}`));
    const lock = this.el.querySelector('#tf-lock');
    lock.classList.toggle('is-active', this.lock);
    lock.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${this.lock
      ? '<path d="M9 7a3 3 0 0 1 6 0v3M9 17a3 3 0 0 0 6 0v-3M12 9v6"/>'
      : '<path d="M9 7a3 3 0 0 1 6 0v2M9 17a3 3 0 0 0 6 0v-2"/>'}</svg>`;
  },
};

Hooks.on('init', () => TransformPanel.mountUI());
