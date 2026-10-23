/**
 * ============================================================================
 *  Studio Chloé — Panneau Aspect : plusieurs fonds et contours empilés
 *
 *  Comme le panneau Aspect d'Illustrator : un même objet peut avoir, en plus
 *  de son remplissage et de son contour habituels, des couches
 *  supplémentaires dessinées DESSOUS (ex. un gros contour lime sous un fin
 *  contour olive = double contour ; un 2e fond décalé par l'opacité…).
 *  L'objet reste un seul objet (sélection, export SVG, historique).
 *  Modèle : obj.appearance = [{ kind: 'fill' | 'stroke', color, width, opacity }]
 *  (index 0 = couche la plus basse).
 * ============================================================================
 */
'use strict';

const APPEARANCE_TYPES = ['rect', 'ellipse', 'circle', 'triangle', 'polygon', 'polyline', 'path', 'line', 'i-text', 'text', 'textbox'];
const hasAppearance = (o) => Array.isArray(o?.appearance) && o.appearance.length > 0;

{
  const proto = fabric.Object.prototype;
  const baseDraw = proto.drawObject;
  /** Applique une couche (props temporaires), exécute fn, puis restaure */
  const withLayer = (obj, layer, fn) => {
    const saved = { fill: obj.fill, stroke: obj.stroke, strokeWidth: obj.strokeWidth, strokeDashArray: obj.strokeDashArray };
    if (layer.kind === 'fill') Object.assign(obj, { fill: layer.color, stroke: null, strokeWidth: 0 });
    else Object.assign(obj, { fill: null, stroke: layer.color, strokeWidth: layer.width ?? 4, strokeDashArray: null });
    try { return fn(); } finally { Object.assign(obj, saved); }
  };

  proto.drawObject = function drawObject(ctx, forClipping) {
    if (!forClipping && hasAppearance(this) && !this._appearanceBusy) {
      this._appearanceBusy = true;
      try {
        this.appearance.forEach((layer) => withLayer(this, layer, () => {
          ctx.save();
          ctx.globalAlpha *= layer.opacity ?? 1;
          this._render(ctx);
          ctx.restore();
        }));
      } finally { this._appearanceBusy = false; }
    }
    return baseDraw.call(this, ctx, forClipping);
  };

  const baseShould = proto.shouldCache;
  proto.shouldCache = function shouldCache() {
    if (hasAppearance(this)) { this.ownCaching = false; return false; }
    return baseShould.call(this);
  };

  // Export SVG : chaque couche devient une copie de l'objet, sous l'objet
  APPEARANCE_TYPES.forEach((type) => {
    const klass = fabric.util.getKlass(type === 'i-text' ? 'IText' : type.charAt(0).toUpperCase() + type.slice(1));
    if (!klass || klass.prototype._appearanceSVG) return;
    const baseSVG = klass.prototype.toSVG;
    klass.prototype._appearanceSVG = true;
    klass.prototype.toSVG = function toSVG(reviver) {
      if (!hasAppearance(this) || this._appearanceBusy) return baseSVG.call(this, reviver);
      this._appearanceBusy = true;
      try {
        const layers = this.appearance.map((layer) => withLayer(this, layer, () => {
          const op = this.opacity;
          this.opacity = (op ?? 1) * (layer.opacity ?? 1);
          try { return baseSVG.call(this, reviver); } finally { this.opacity = op; }
        }));
        return layers.join('') + baseSVG.call(this, reviver);
      } finally { this._appearanceBusy = false; }
    };
  });
}

const AppearancePanel = {
  target() {
    const objs = canvas.getActiveObjects();
    return objs.length === 1 && APPEARANCE_TYPES.includes(objs[0].type) ? objs[0] : null;
  },

  changed(obj) {
    obj.dirty = true;
    canvas.requestRenderAll();
    History.queue();
    this.render();
  },

  add(kind) {
    const obj = this.target();
    if (!obj) return;
    const list = obj.appearance ? obj.appearance.map((l) => ({ ...l })) : [];
    // Nouvelle couche : sous les autres, visible tout de suite
    const base = kind === 'stroke'
      ? { kind, color: '#d4f04c', width: Math.max(8, (obj.strokeWidth || 2) * 3), opacity: 1 }
      : { kind, color: '#25300b', opacity: 0.35 };
    list.unshift(base);
    obj.appearance = list;
    this.changed(obj);
  },

  mountUI() {
    this.el = html(`
      <section class="tile" id="section-appearance-stack" hidden>
        <div class="feature-head"><div><h3>Aspect</h3><p class="field-note">Fonds et contours supplémentaires, dessinés sous l'objet.</p></div></div>
        <ul class="appearance-list" id="appearance-list"></ul>
        <div class="btn-row">
          <button class="btn btn-sm" type="button" id="ap-add-stroke">+ Contour</button>
          <button class="btn btn-sm" type="button" id="ap-add-fill">+ Fond</button>
        </div>
      </section>`);
    $('#section-effects').before(this.el);
    this.el.querySelector('#ap-add-stroke').addEventListener('click', () => this.add('stroke'));
    this.el.querySelector('#ap-add-fill').addEventListener('click', () => this.add('fill'));
    Hooks.on('sync', () => this.render());
  },

  render() {
    const obj = this.target();
    this.el.hidden = !obj || Boolean(state.cropping);
    if (!obj) return;
    const ul = this.el.querySelector('#appearance-list');
    const layers = obj.appearance || [];
    // Affichage du haut vers le bas : l'objet lui-même, puis ses couches
    const baseRow = html(`<li class="ap-item ap-base"><span class="ap-kind">Objet</span><small>Ses réglages habituels</small></li>`);
    const rows = layers.map((l, i) => ({ l, i })).reverse().map(({ l, i }) => {
      const li = html(`<li class="ap-item">
        <span class="ap-kind">${l.kind === 'stroke' ? 'Contour' : 'Fond'}</span>
        <input type="color" value="${toHex(l.color) || '#000000'}" aria-label="Couleur de la couche">
        ${l.kind === 'stroke' ? `<input class="ab-size" type="number" min="0" max="400" step="1" value="${Math.round(l.width ?? 4)}" aria-label="Épaisseur" title="Épaisseur (px)">` : ''}
        <input class="ap-opacity" type="range" min="5" max="100" value="${Math.round((l.opacity ?? 1) * 100)}" aria-label="Opacité" title="Opacité">
        <button class="layer-btn" type="button" data-up title="Monter" aria-label="Monter"><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg></button>
        <button class="layer-btn" type="button" data-del title="Retirer" aria-label="Retirer"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </li>`);
      const set = (patch, record = false) => {
        obj.appearance = obj.appearance.map((x, k) => (k === i ? { ...x, ...patch } : x));
        obj.dirty = true;
        canvas.requestRenderAll();
        if (record) History.queue();
      };
      li.querySelector('input[type=color]').addEventListener('input', (e) => set({ color: e.target.value }));
      li.querySelector('input[type=color]').addEventListener('change', () => History.queue());
      li.querySelector('.ab-size')?.addEventListener('change', (e) => set({ width: clamp(Number(e.target.value) || 0, 0, 400) }, true));
      li.querySelector('.ab-size')?.addEventListener('keydown', (e) => e.stopPropagation());
      const op = li.querySelector('.ap-opacity');
      paintRange(op);
      op.addEventListener('input', () => { paintRange(op); set({ opacity: Number(op.value) / 100 }); });
      op.addEventListener('change', () => History.queue());
      li.querySelector('[data-up]').addEventListener('click', () => {
        if (i >= obj.appearance.length - 1) return;
        const a = obj.appearance.slice();
        [a[i], a[i + 1]] = [a[i + 1], a[i]];
        obj.appearance = a;
        this.changed(obj);
      });
      li.querySelector('[data-del]').addEventListener('click', () => {
        obj.appearance = obj.appearance.filter((_, k) => k !== i);
        if (!obj.appearance.length) obj.appearance = undefined;
        this.changed(obj);
      });
      return li;
    });
    ul.replaceChildren(baseRow, ...rows);
  },
};

SERIAL_PROPS.push('appearance');

Hooks.on('init', () => AppearancePanel.mountUI());
