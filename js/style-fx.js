/**
 * ============================================================================
 *  Chloe’s Touch — Couleurs & effets
 *    1. Pipette (API EyeDropper, ou lecture d'un pixel du canvas)
 *    2. Nuanciers : palette de marque, couleurs du document, couleurs enregistrées
 *    3. Remplissage en dégradé (linéaire, 2 couleurs, angle)
 *    4. Coins arrondis (rectangles)
 *    5. Ombre portée (tuile « Effets »)
 *    6. Filtres photo (tuile « Image ») : préréglages + réglages fins
 * ============================================================================
 */
'use strict';

// Les filtres WebGL acceptent des images jusqu'à 4096 px (les imports sont limités à cette taille)
fabric.textureSize = 4096;

const BRAND_SWATCHES = ['#f68a8d', '#d9474f', '#c73527', '#fbf3f1', '#ffffff', '#1e1e1e', '#e0457b', '#3d7be0'];
const SWATCH_KEY = 'studio-chloe-swatches';
const PIPETTE_ICON = '<path d="m14.5 4.5 5 5M17 2l5 5-3 3-5-5zM14 7l-9.5 9.5L3 21l4.5-1.5L17 10"/>';

/* ============================================================================
   1. PIPETTE
   ========================================================================== */

const Pipette = {
  target: null, // 'fill' | 'stroke' en mode lecture de pixel

  async pick(prop) {
    // Chrome / Edge : pipette du système, n'importe où à l'écran
    if (window.EyeDropper) {
      try {
        const { sRGBHex } = await new window.EyeDropper().open();
        this.apply(prop, sRGBHex);
      } catch { /* annulé par Échap */ }
      return;
    }
    // Autres navigateurs : un clic sur le canvas lit la couleur du pixel
    this.target = prop;
    dom.stage.classList.add('is-picking');
    toast('Cliquez sur la couleur à prélever (Échap pour annuler)');
  },

  cancel() {
    this.target = null;
    dom.stage.classList.remove('is-picking');
  },

  apply(prop, hex) {
    Properties.apply(prop, hex);
    if (prop in state.style) state.style[prop] = hex;
    Properties.sync();
    toast(`Couleur ${hex.toUpperCase()} appliquée`, 'success');
  },

  bind() {
    // Écoute en capture sur le conteneur : le clic n'atteint pas Fabric
    canvas.wrapperEl.addEventListener('mousedown', (e) => {
      if (!this.target) return;
      e.preventDefault();
      e.stopPropagation();
      const r = canvas.lowerCanvasEl.getBoundingClientRect();
      const ratio = canvas.lowerCanvasEl.width / r.width;
      const px = canvas.getContext().getImageData(
        Math.round((e.clientX - r.left) * ratio), Math.round((e.clientY - r.top) * ratio), 1, 1).data;
      const hex = `#${[px[0], px[1], px[2]].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
      const prop = this.target;
      this.cancel();
      this.apply(prop, hex);
    }, true);
    Keys.add((e) => {
      if (e.key === 'Escape' && this.target) { this.cancel(); return true; }
      return false;
    });
  },
};

/* ============================================================================
   2. NUANCIERS
   ========================================================================== */

const Swatches = {
  saved: [],

  load() {
    try { this.saved = JSON.parse(localStorage.getItem(SWATCH_KEY) || '[]'); } catch { this.saved = []; }
  },
  persist() {
    try { localStorage.setItem(SWATCH_KEY, JSON.stringify(this.saved)); } catch { /* ignoré */ }
  },

  /** Couleurs unies utilisées dans le document (8 max) */
  documentColors() {
    const set = new Set();
    const visit = (o) => {
      if (o._objects) o._objects.forEach(visit);
      [o.fill, o.stroke].forEach((c) => { const h = toHex(c); if (h) set.add(h); });
    };
    canvas.getObjects().forEach(visit);
    return [...set].slice(0, 8);
  },

  swatch(color, kind) {
    return `<button class="swatch" type="button" data-color="${color}" data-kind="${kind}" style="--c:${color}" title="${color.toUpperCase()} — clic : remplissage · Maj + clic : contour${kind === 'saved' ? ' · clic droit : retirer' : ''}" aria-label="Couleur ${color}"></button>`;
  },

  render() {
    const docColors = this.documentColors();
    this.el.querySelector('#swatches-brand').innerHTML = BRAND_SWATCHES.map((c) => this.swatch(c, 'brand')).join('');
    this.el.querySelector('#swatches-doc').innerHTML = docColors.map((c) => this.swatch(c, 'doc')).join('');
    this.el.querySelector('#swatches-doc-row').hidden = !docColors.length;
    this.el.querySelector('#swatches-saved').innerHTML = this.saved.map((c) => this.swatch(c, 'saved')).join('')
      + '<button class="swatch swatch-add" type="button" id="swatch-add" title="Enregistrer la couleur de remplissage actuelle" aria-label="Enregistrer la couleur">+</button>';
  },

  mountUI() {
    this.el = html(`
      <div class="field swatches">
        <span class="field-label">Nuanciers</span>
        <div class="swatch-row" id="swatches-brand"></div>
        <div id="swatches-doc-row"><span class="swatch-caption">Dans ce document</span><div class="swatch-row" id="swatches-doc"></div></div>
        <div><span class="swatch-caption">Mes couleurs</span><div class="swatch-row" id="swatches-saved"></div></div>
      </div>`);
    dom.sectionAppearance.appendChild(this.el);

    this.el.addEventListener('click', (e) => {
      if (e.target.id === 'swatch-add') {
        const c = dom.propFill.value.toLowerCase();
        if (!this.saved.includes(c)) { this.saved = [c, ...this.saved].slice(0, 16); this.persist(); }
        this.render();
        return;
      }
      const sw = e.target.closest('[data-color]');
      if (!sw) return;
      const prop = e.shiftKey ? 'stroke' : 'fill';
      Properties.apply(prop, sw.dataset.color);
      Properties.sync();
    });
    this.el.addEventListener('contextmenu', (e) => {
      const sw = e.target.closest('[data-kind="saved"]');
      if (!sw) return;
      e.preventDefault();
      this.saved = this.saved.filter((c) => c !== sw.dataset.color);
      this.persist();
      this.render();
    });
    this.load();
    this.render();
  },
};

/* ============================================================================
   3. DÉGRADÉS
   ========================================================================== */

function makeGradient(c1, c2, angleDeg) {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(a) / 2;
  const dy = Math.sin(a) / 2;
  return new fabric.Gradient({
    type: 'linear',
    gradientUnits: 'percentage', // suit la taille de l'objet
    coords: { x1: 0.5 - dx, y1: 0.5 - dy, x2: 0.5 + dx, y2: 0.5 + dy },
    colorStops: [{ offset: 0, color: c1 }, { offset: 1, color: c2 }],
  });
}

const isGradient = (fill) => Boolean(fill && typeof fill === 'object' && fill.colorStops);

function readGradient(fill) {
  const { x1, y1, x2, y2 } = fill.coords;
  const stops = [...fill.colorStops].sort((a, b) => a.offset - b.offset);
  return {
    c1: toHex(stops[0]?.color) || '#f68a8d',
    c2: toHex(stops[stops.length - 1]?.color) || '#c73527',
    angle: Math.round((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI + 360) % 360,
  };
}

const GradientFill = {
  mountUI() {
    this.el = html(`
      <div class="field" id="row-gradient">
        <div class="tabs tabs-sm" role="group" aria-label="Type de remplissage">
          <button class="tab is-active" type="button" data-fill-mode="solid">Uni</button>
          <button class="tab" type="button" data-fill-mode="gradient">Dégradé</button>
        </div>
        <div class="gradient-controls" hidden>
          <div class="gradient-preview" id="gradient-preview"></div>
          <div class="color-row">
            <span class="swatch-caption">Vers</span>
            <input type="color" id="prop-fill-2" aria-label="Seconde couleur du dégradé" value="#c73527">
            <span class="hex" id="hex-fill-2">#C73527</span>
          </div>
          <label class="field-label" for="prop-gradient-angle">Angle <output id="out-gradient-angle">90°</output></label>
          <input type="range" id="prop-gradient-angle" min="0" max="359" step="1" value="90">
        </div>
      </div>`);
    dom.rowFill.after(this.el);
    this.c2 = this.el.querySelector('#prop-fill-2');
    this.angle = this.el.querySelector('#prop-gradient-angle');

    this.el.querySelectorAll('[data-fill-mode]').forEach((b) => b.addEventListener('click', () => {
      const objs = this.targets();
      if (!objs.length) return toast('Sélectionnez un objet pour lui appliquer un dégradé.');
      if (b.dataset.fillMode === 'gradient') this.apply();
      else {
        objs.forEach((o) => o.set('fill', dom.propFill.value));
        canvas.requestRenderAll();
        History.queue();
      }
      Properties.sync();
    }));

    // La 1re couleur du dégradé est le sélecteur « Remplissage » : on intercepte son événement
    dom.propFill.addEventListener('input', (e) => {
      if (!this.isOn()) return;
      e.stopImmediatePropagation();
      dom.hexFill.textContent = 'Dégradé';
      this.apply();
    }, { capture: true });
    this.c2.addEventListener('input', () => this.apply());
    this.angle.addEventListener('input', () => this.apply());
  },

  targets() { return canvas.getActiveObjects().filter((o) => !isImage(o) && o.type !== 'polyline'); },
  isOn() { return this.targets().some((o) => isGradient(o.fill)); },

  apply() {
    const angle = Number(this.angle.value);
    this.el.querySelector('#out-gradient-angle').textContent = `${angle}°`;
    this.el.querySelector('#hex-fill-2').textContent = this.c2.value.toUpperCase();
    paintRange(this.angle);
    this.targets().forEach((o) => o.set('fill', makeGradient(dom.propFill.value, this.c2.value, angle)));
    this.preview(dom.propFill.value, this.c2.value, angle);
    canvas.requestRenderAll();
    History.queue();
  },

  preview(c1, c2, angle) {
    this.el.querySelector('#gradient-preview').style.background = `linear-gradient(${angle + 90}deg, ${c1}, ${c2})`;
  },

  sync({ ref, hasSelection }) {
    const grad = hasSelection && isGradient(ref?.fill);
    this.el.hidden = !hasSelection || isImage(ref) || ref?.type === 'polyline';
    this.el.querySelectorAll('[data-fill-mode]').forEach((b) => {
      b.classList.toggle('is-active', (b.dataset.fillMode === 'gradient') === grad);
    });
    this.el.querySelector('.gradient-controls').hidden = !grad;
    if (grad) {
      const g = readGradient(ref.fill);
      dom.propFill.value = g.c1;
      dom.propFillNone.checked = false;
      dom.hexFill.textContent = 'Dégradé';
      this.c2.value = g.c2;
      this.angle.value = g.angle;
      this.el.querySelector('#hex-fill-2').textContent = g.c2.toUpperCase();
      this.el.querySelector('#out-gradient-angle').textContent = `${g.angle}°`;
      paintRange(this.angle);
      this.preview(g.c1, g.c2, g.angle);
    }
  },
};

/* ============================================================================
   4. COINS ARRONDIS
   ========================================================================== */

const CornerRadius = {
  mountUI() {
    this.el = html(`
      <div class="field" id="row-radius" hidden>
        <label class="field-label" for="prop-radius">Arrondi des coins <output id="out-radius">0 px</output></label>
        <input type="range" id="prop-radius" min="0" max="200" step="1" value="0">
      </div>`);
    dom.propOpacity.closest('.field').after(this.el);
    this.input = this.el.querySelector('#prop-radius');
    this.input.addEventListener('input', () => {
      const r = Number(this.input.value);
      this.el.querySelector('#out-radius').textContent = `${r} px`;
      paintRange(this.input);
      canvas.getActiveObjects().filter((o) => o.type === 'rect').forEach((o) => {
        const max = Math.min(o.width, o.height) / 2;
        o.set({ rx: Math.min(r, max), ry: Math.min(r, max) });
      });
      canvas.requestRenderAll();
      History.queue();
    });
  },
  sync({ objects, ref }) {
    const rects = objects.filter((o) => o.type === 'rect');
    this.el.hidden = !rects.length;
    if (rects.length) {
      this.input.value = Math.round(ref.rx || 0);
      this.el.querySelector('#out-radius').textContent = `${this.input.value} px`;
      paintRange(this.input);
    }
  },
};

/* ============================================================================
   5. OMBRE PORTÉE
   ========================================================================== */

const Effects = {
  mountUI() {
    this.el = html(`
      <section class="tile" id="section-effects">
        <h3>Effets</h3>
        <label class="check check-strong"><input type="checkbox" id="prop-shadow"> Ombre portée</label>
        <div class="shadow-controls" hidden>
          <div class="color-row">
            <input type="color" id="prop-shadow-color" value="#c73527" aria-label="Couleur de l'ombre">
            <span class="hex" id="hex-shadow">#C73527</span>
          </div>
          <label class="field-label" for="prop-shadow-blur">Flou <output id="out-shadow-blur">20 px</output></label>
          <input type="range" id="prop-shadow-blur" min="0" max="80" step="1" value="20">
          <label class="field-label" for="prop-shadow-distance">Distance <output id="out-shadow-distance">10 px</output></label>
          <input type="range" id="prop-shadow-distance" min="0" max="80" step="1" value="10">
          <label class="field-label" for="prop-shadow-opacity">Intensité <output id="out-shadow-opacity">35 %</output></label>
          <input type="range" id="prop-shadow-opacity" min="5" max="100" step="1" value="35">
        </div>
      </section>`);
    dom.sectionAppearance.after(this.el);
    this.toggle = this.el.querySelector('#prop-shadow');
    this.controls = this.el.querySelector('.shadow-controls');
    this.inputs = {
      color: this.el.querySelector('#prop-shadow-color'),
      blur: this.el.querySelector('#prop-shadow-blur'),
      distance: this.el.querySelector('#prop-shadow-distance'),
      opacity: this.el.querySelector('#prop-shadow-opacity'),
    };
    this.toggle.addEventListener('change', () => this.apply());
    Object.values(this.inputs).forEach((i) => i.addEventListener('input', () => this.apply()));
  },

  readOutputs() {
    const { color, blur, distance, opacity } = this.inputs;
    this.el.querySelector('#hex-shadow').textContent = color.value.toUpperCase();
    this.el.querySelector('#out-shadow-blur').textContent = `${blur.value} px`;
    this.el.querySelector('#out-shadow-distance').textContent = `${distance.value} px`;
    this.el.querySelector('#out-shadow-opacity').textContent = `${opacity.value} %`;
    [blur, distance, opacity].forEach(paintRange);
  },

  apply() {
    const objs = canvas.getActiveObjects();
    this.controls.hidden = !this.toggle.checked;
    this.readOutputs();
    if (!objs.length) return;
    const { color, blur, distance, opacity } = this.inputs;
    const d = Number(distance.value) / Math.SQRT2; // direction : bas-droite (45°)
    const c = new fabric.Color(color.value);
    c.setAlpha(Number(opacity.value) / 100);
    objs.forEach((o) => o.set('shadow', this.toggle.checked
      ? new fabric.Shadow({ color: c.toRgba(), blur: Number(blur.value), offsetX: d, offsetY: d })
      : null));
    canvas.requestRenderAll();
    History.queue();
  },

  sync({ ref, hasSelection }) {
    this.el.classList.toggle('is-disabled', !hasSelection || Boolean(state.cropping));
    const sh = hasSelection ? ref?.shadow : null;
    this.toggle.checked = Boolean(sh);
    this.controls.hidden = !sh;
    if (sh) {
      const c = new fabric.Color(sh.color);
      this.inputs.color.value = `#${c.toHex().toLowerCase()}`;
      this.inputs.opacity.value = Math.round(c.getAlpha() * 100);
      this.inputs.blur.value = Math.round(sh.blur);
      this.inputs.distance.value = Math.round(Math.hypot(sh.offsetX, sh.offsetY));
    }
    this.readOutputs();
  },
};

/* ============================================================================
   6. FILTRES PHOTO
   ----------------------------------------------------------------------------
   Les filtres Fabric sont enregistrés avec l'image (historique, projets) et
   réappliqués au chargement. Préréglage + 4 réglages fins.
   ========================================================================== */

const F = fabric.Image.filters;
const FILTER_PRESETS = {
  none: { label: 'Original', make: () => null },
  bw: { label: 'N&B', make: () => new F.Grayscale() },
  sepia: { label: 'Sépia', make: () => new F.Sepia() },
  vintage: { label: 'Vintage', make: () => new F.Vintage() },
  polaroid: { label: 'Polaroid', make: () => new F.Polaroid() },
  techni: { label: 'Éclatant', make: () => new F.Technicolor() },
};
const FILTER_SLIDERS = {
  brightness: { label: 'Luminosité', cls: 'Brightness', min: -60, max: 60 },
  contrast: { label: 'Contraste', cls: 'Contrast', min: -60, max: 60 },
  saturation: { label: 'Saturation', cls: 'Saturation', min: -100, max: 100 },
  blur: { label: 'Flou', cls: 'Blur', min: 0, max: 60 },
};

const PhotoFilters = {
  timer: null,

  mountUI() {
    const sliders = Object.entries(FILTER_SLIDERS).map(([k, s]) => `
      <label class="field-label" for="filter-${k}">${s.label} <output id="out-filter-${k}">0</output></label>
      <input type="range" id="filter-${k}" data-filter="${k}" min="${s.min}" max="${s.max}" step="1" value="0">`).join('');
    this.el = html(`
      <div class="photo-filters" id="image-filters" hidden>
        <span class="field-label">Retouche</span>
        <div class="chips" id="filter-presets">
          ${Object.entries(FILTER_PRESETS).map(([k, p]) => `<button class="chip" type="button" data-preset="${k}">${p.label}</button>`).join('')}
        </div>
        ${sliders}
        <button class="btn btn-sm" type="button" id="btn-filters-reset">Réinitialiser</button>
      </div>`);
    dom.btnRemoveBg.after(this.el);
    this.el.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
      this.el.querySelectorAll('[data-preset]').forEach((x) => x.classList.toggle('is-active', x === b));
      this.apply();
    }));
    this.el.querySelectorAll('[data-filter]').forEach((i) => i.addEventListener('input', () => {
      this.outputs();
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.apply(), 40);
    }));
    this.el.querySelector('#btn-filters-reset').addEventListener('click', () => {
      this.el.querySelectorAll('[data-filter]').forEach((i) => { i.value = 0; });
      this.el.querySelectorAll('[data-preset]').forEach((x) => x.classList.toggle('is-active', x.dataset.preset === 'none'));
      this.apply();
    });
  },

  outputs() {
    this.el.querySelectorAll('[data-filter]').forEach((i) => {
      this.el.querySelector(`#out-filter-${i.dataset.filter}`).textContent = i.value;
      paintRange(i);
    });
  },

  apply() {
    const img = canvas.getActiveObject();
    if (!isImage(img)) return;
    const preset = this.el.querySelector('[data-preset].is-active')?.dataset.preset || 'none';
    const filters = [FILTER_PRESETS[preset].make()];
    this.el.querySelectorAll('[data-filter]').forEach((i) => {
      const v = Number(i.value) / 100;
      if (!v) return;
      const k = i.dataset.filter;
      const prop = k; // brightness / contrast / saturation / blur
      filters.push(new F[FILTER_SLIDERS[k].cls]({ [prop]: k === 'blur' ? v * 0.5 : v }));
    });
    img.filters = filters.filter(Boolean);
    img.applyFilters();
    canvas.requestRenderAll();
    this.outputs();
    History.queue();
  },

  sync({ ref, single }) {
    const show = single && isImage(ref) && !state.cropping;
    this.el.hidden = !show;
    if (!show) return;
    const filters = ref.filters || [];
    const presetKey = Object.keys(FILTER_PRESETS).find((k) => {
      const f = FILTER_PRESETS[k].make();
      return f && filters.some((x) => x.type === f.type);
    }) || 'none';
    this.el.querySelectorAll('[data-preset]').forEach((x) => x.classList.toggle('is-active', x.dataset.preset === presetKey));
    Object.entries(FILTER_SLIDERS).forEach(([k, s]) => {
      const f = filters.find((x) => x.type === s.cls);
      const v = f ? f[k] : 0;
      this.el.querySelector(`#filter-${k}`).value = Math.round((k === 'blur' ? v * 2 : v) * 100);
    });
    this.outputs();
  },
};

/* ============================================================================
   BRANCHEMENT
   ========================================================================== */

/** Bouton pipette ajouté à une ligne de couleur */
function addPipetteButton(row, prop) {
  const btn = html(`<button class="icon-btn icon-btn-sm" type="button" title="Pipette : prélever une couleur" aria-label="Pipette"><svg viewBox="0 0 24 24" aria-hidden="true">${PIPETTE_ICON}</svg></button>`);
  row.querySelector('.hex').after(btn);
  btn.addEventListener('click', () => Pipette.pick(prop));
}

Hooks.on('init', () => {
  addPipetteButton(dom.rowFill, 'fill');
  addPipetteButton($('#row-stroke'), 'stroke');
  Pipette.bind();
  GradientFill.mountUI();
  CornerRadius.mountUI();
  Swatches.mountUI();
  Effects.mountUI();
  PhotoFilters.mountUI();

  Hooks.on('sync', (info) => {
    GradientFill.sync(info);
    CornerRadius.sync(info);
    Effects.sync(info);
    PhotoFilters.sync(info);
  });
  // Les couleurs du document suivent les modifications
  let t = null;
  const refresh = () => { clearTimeout(t); t = setTimeout(() => Swatches.render(), 300); };
  ['object:added', 'object:removed', 'object:modified'].forEach((evt) => canvas.on(evt, refresh));
  Hooks.on('docLoaded', refresh);
  Hooks.on('change', refresh);
});
