/**
 * ============================================================================
 *  Studio Chloé — Motifs (remplissage « Motif » de la tuile Apparence)
 *
 *  - 4 motifs prêts à l'emploi (pois, rayures, damier, vagues) aux couleurs
 *    de la marque ;
 *  - « Créer depuis la sélection » : le dessin sélectionné devient un motif
 *    répétable (enregistré dans le document) ;
 *  - réglages par objet : échelle, espacement, angle.
 *  Rendu : fabric.Pattern (image de la tuile, répétée). Les réglages sont
 *  gardés dans obj.patternFill = { id, scale, spacing, angle }.
 * ============================================================================
 */
'use strict';

const BUILTIN_PATTERNS = [
  { id: 'dots', name: 'Pois', draw: (c, s) => { c.fillStyle = '#d4f04c'; c.fillRect(0, 0, s, s); c.fillStyle = '#25300b'; c.beginPath(); c.arc(s / 2, s / 2, s * 0.18, 0, Math.PI * 2); c.fill(); } },
  { id: 'stripes', name: 'Rayures', draw: (c, s) => { c.fillStyle = '#f4f2e4'; c.fillRect(0, 0, s, s); c.fillStyle = '#7c9425'; c.fillRect(0, 0, s, s / 2); } },
  { id: 'checker', name: 'Damier', draw: (c, s) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, s, s); c.fillStyle = '#25300b'; c.fillRect(0, 0, s / 2, s / 2); c.fillRect(s / 2, s / 2, s / 2, s / 2); } },
  { id: 'waves', name: 'Vagues', draw: (c, s) => { c.fillStyle = '#e8f6a8'; c.fillRect(0, 0, s, s); c.strokeStyle = '#7c9425'; c.lineWidth = s / 10; c.beginPath(); c.moveTo(0, s / 2); c.bezierCurveTo(s / 4, s * 0.2, s / 4, s * 0.2, s / 2, s / 2); c.bezierCurveTo(s * 0.75, s * 0.8, s * 0.75, s * 0.8, s, s / 2); c.stroke(); } },
];

const Patterns = {
  list: [],       // motifs du document { id, name, src, w, h }
  cache: {},      // id → HTMLImageElement de la tuile de base

  save() { return this.list.length ? this.list.map((p) => ({ ...p })) : undefined; },
  load(v) { this.list = Array.isArray(v) ? v.map((p) => ({ ...p })) : []; this.renderList(); },

  builtin() {
    return BUILTIN_PATTERNS.map((b) => {
      if (!b.src) {
        const c = document.createElement('canvas');
        c.width = 48;
        c.height = 48;
        b.draw(c.getContext('2d'), 48);
        b.src = c.toDataURL('image/png');
        b.w = 48;
        b.h = 48;
      }
      return { id: b.id, name: b.name, src: b.src, w: b.w, h: b.h, builtin: true };
    });
  },
  all() { return [...this.builtin(), ...this.list]; },
  byId(id) { return this.all().find((p) => p.id === id); },

  image(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  },

  /** Tuile avec espacement (image prête pour fabric.Pattern) */
  async tile(def, spacing) {
    if (!spacing) return this.image(def.src);
    const base = await this.image(def.src);
    const c = document.createElement('canvas');
    c.width = Math.round(def.w + spacing);
    c.height = Math.round(def.h + spacing);
    c.getContext('2d').drawImage(base, spacing / 2, spacing / 2, def.w, def.h);
    return this.image(c.toDataURL('image/png'));
  },

  async applyTo(objs, settings) {
    const def = this.byId(settings.id);
    if (!def) return;
    const img = await this.tile(def, settings.spacing || 0);
    const s = (settings.scale || 100) / 100;
    const a = ((settings.angle || 0) * Math.PI) / 180;
    objs.forEach((o) => {
      if (isImage(o)) return;
      const pattern = new fabric.Pattern({
        source: img, repeat: 'repeat',
        patternTransform: [Math.cos(a) * s, Math.sin(a) * s, -Math.sin(a) * s, Math.cos(a) * s, 0, 0],
      });
      const target = o.type === 'group' ? o.getObjects() : [o];
      target.forEach((t) => { t.set('fill', pattern); t.patternFill = { ...settings }; });
      o.dirty = true;
    });
    canvas.requestRenderAll();
    History.queue();
  },

  async createFromSelection() {
    const active = canvas.getActiveObject();
    if (!active) { toast('Sélectionnez le dessin à transformer en motif.'); return; }
    const url = active.toDataURL({ format: 'png', multiplier: 2 });
    const img = await this.image(url);
    const k = 160 / Math.max(img.width, img.height); // tuile raisonnable (redimensionnée par l'échelle)
    const c = document.createElement('canvas');
    c.width = Math.max(4, Math.round(img.width * Math.min(1, k)));
    c.height = Math.max(4, Math.round(img.height * Math.min(1, k)));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const def = { id: uid(), name: `Motif ${this.list.length + 1}`, src: c.toDataURL('image/png'), w: c.width, h: c.height };
    this.list.push(def);
    this.renderList();
    History.queue();
    toast(`« ${def.name} » créé : sélectionnez une forme puis choisissez-le dans Remplissage → Motif.`, 'success', 5000);
    return def;
  },

  // ---------- interface (onglet « Motif » du remplissage)
  mountUI() {
    const tabs = $('#row-gradient .tabs');
    const btn = html('<button class="tab" type="button" data-fill-mode="pattern">Motif</button>');
    tabs.appendChild(btn);
    this.el = html(`
      <div class="pattern-controls" hidden>
        <div class="pattern-grid" id="pattern-grid"></div>
        <button class="btn btn-sm" type="button" id="pattern-new">+ Créer depuis la sélection</button>
        <label class="field-label" for="pattern-scale">Échelle <output id="out-pattern-scale">100 %</output></label>
        <input type="range" id="pattern-scale" min="10" max="400" step="5" value="100">
        <label class="field-label" for="pattern-spacing">Espacement <output id="out-pattern-spacing">0 px</output></label>
        <input type="range" id="pattern-spacing" min="0" max="120" step="1" value="0">
        <label class="field-label" for="pattern-angle">Angle <output id="out-pattern-angle">0°</output></label>
        <input type="range" id="pattern-angle" min="0" max="359" step="1" value="0">
      </div>`);
    $('#row-gradient').appendChild(this.el);
    btn.addEventListener('click', () => {
      const objs = canvas.getActiveObjects().filter((o) => !isImage(o));
      if (!objs.length) { toast('Sélectionnez un objet pour lui appliquer un motif.'); return; }
      this.applyTo(objs, this.settings()).then(() => Properties.sync());
    });
    this.el.querySelector('#pattern-new').addEventListener('click', async () => {
      // Le dessin sélectionné devient le motif ; il faudra ensuite choisir la forme à remplir
      await this.createFromSelection();
    });
    ['scale', 'spacing', 'angle'].forEach((k) => {
      const input = this.el.querySelector(`#pattern-${k}`);
      input.addEventListener('input', () => {
        this.outputs();
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          const objs = canvas.getActiveObjects().filter((o) => this.isPattern(o.fill) || o.type === 'group');
          if (objs.length) this.applyTo(objs, this.settings());
        }, 60);
      });
    });
    this.renderList();
    // Accès direct (sans passer par le remplissage du dessin source) : tuile Effets
    const fxBtn = html('<button class="btn btn-sm btn-block" type="button" id="fx-pattern" title="Le dessin sélectionné devient un motif de remplissage">Créer un motif depuis la sélection</button>');
    $('#section-effects').appendChild(fxBtn);
    fxBtn.addEventListener('click', () => this.createFromSelection());
    Hooks.on('sync', (info) => this.sync(info));
  },

  selected: 'dots',
  settings() {
    const v = (k) => Number(this.el.querySelector(`#pattern-${k}`).value);
    return { id: this.selected, scale: v('scale'), spacing: v('spacing'), angle: v('angle') };
  },
  outputs() {
    const $e = (s) => this.el.querySelector(s);
    $e('#out-pattern-scale').textContent = `${$e('#pattern-scale').value} %`;
    $e('#out-pattern-spacing').textContent = `${$e('#pattern-spacing').value} px`;
    $e('#out-pattern-angle').textContent = `${$e('#pattern-angle').value}°`;
    ['#pattern-scale', '#pattern-spacing', '#pattern-angle'].forEach((id) => paintRange($e(id)));
  },

  isPattern: (fill) => Boolean(fill && typeof fill === 'object' && fill.source && !fill.colorStops),

  renderList() {
    const grid = this.el?.querySelector('#pattern-grid');
    if (!grid) return;
    grid.replaceChildren(...this.all().map((p) => {
      const b = html(`<button class="pattern-swatch${p.id === this.selected ? ' is-active' : ''}" type="button" title="${escapeHTML(p.name)}" aria-label="${escapeHTML(p.name)}"></button>`);
      b.style.backgroundImage = `url(${p.src})`;
      b.addEventListener('click', () => {
        this.selected = p.id;
        this.renderList();
        const objs = canvas.getActiveObjects().filter((o) => !isImage(o));
        if (objs.length) this.applyTo(objs, this.settings()).then(() => Properties.sync());
      });
      if (!p.builtin) {
        b.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.list = this.list.filter((x) => x !== p);
          this.renderList();
          History.queue();
          toast(`Motif « ${p.name} » retiré de la liste`);
        });
        b.title += ' — clic droit : retirer';
      }
      return b;
    }));
  },

  sync({ ref, hasSelection }) {
    const fill = ref?.type === 'group' ? ref.getObjects()[0]?.fill : ref?.fill;
    const on = hasSelection && this.isPattern(fill);
    const tabs = $('#row-gradient .tabs');
    if (on) {
      tabs.querySelectorAll('[data-fill-mode]').forEach((b) => b.classList.toggle('is-active', b.dataset.fillMode === 'pattern'));
      $('#row-gradient .gradient-controls').hidden = true;
      dom.hexFill.textContent = 'Motif';
      const pf = (ref.type === 'group' ? ref.getObjects()[0] : ref).patternFill;
      if (pf) {
        this.selected = pf.id;
        this.el.querySelector('#pattern-scale').value = pf.scale ?? 100;
        this.el.querySelector('#pattern-spacing').value = pf.spacing ?? 0;
        this.el.querySelector('#pattern-angle').value = pf.angle ?? 0;
        this.renderList();
      }
    } else {
      tabs.querySelector('[data-fill-mode="pattern"]').classList.remove('is-active');
    }
    this.el.hidden = !on;
    this.outputs();
  },
};

SERIAL_PROPS.push('patternFill');

Hooks.on('init', () => {
  Doc.extras.patterns = { save: () => Patterns.save(), load: (v) => Patterns.load(v) };
  Patterns.mountUI();
});
