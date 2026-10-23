/**
 * ============================================================================
 *  Studio Chloé — Disposition
 *    1. Alignement, répartition, groupes, ordre des plans
 *    2. Guides magnétiques, grille, règles (bascules dans la pilule de zoom)
 *    3. Panneau Calques (onglet du panneau de droite)
 * ============================================================================
 */
'use strict';

/* ============================================================================
   1. ALIGNEMENT, RÉPARTITION, GROUPES, ORDRE
   ----------------------------------------------------------------------------
   - Un seul objet : alignement sur la page.
   - Plusieurs objets : alignement sur leur boîte commune.
   On dissout temporairement la sélection pour travailler en coordonnées
   absolues, puis on la recrée.
   ========================================================================== */

const ALIGN_ICONS = {
  left: '<path d="M4 3v18M8 7h10M8 12h6M8 17h12"/>',
  hcenter: '<path d="M12 3v18M6 7h12M8 12h8M5 17h14"/>',
  right: '<path d="M20 3v18M6 7h10M10 12h6M4 17h12"/>',
  top: '<path d="M3 4h18M7 8v10M12 8v6M17 8v12"/>',
  vcenter: '<path d="M3 12h18M7 6v12M12 8v8M17 5v14"/>',
  bottom: '<path d="M3 20h18M7 6v10M12 10v6M17 4v12"/>',
  distH: '<path d="M4 4v16M20 4v16M10 8h4v8h-4z"/>',
  distV: '<path d="M4 4h16M4 20h16M8 10h8v4H8z"/>',
};

const Arrange = {
  /** Plan de travail de référence pour aligner un objet seul (remplacé par js/artboards.js) */
  pageRect() { return { left: 0, top: 0, width: state.page.width, height: state.page.height }; },

  /** Boîte englobante absolue d'un objet (hors sélection) */
  rect: (o) => o.getBoundingRect(true, true),

  union(rects) {
    const l = Math.min(...rects.map((r) => r.left));
    const t = Math.min(...rects.map((r) => r.top));
    const r = Math.max(...rects.map((x) => x.left + x.width));
    const b = Math.max(...rects.map((x) => x.top + x.height));
    return { left: l, top: t, width: r - l, height: b - t };
  },

  /** Retire la sélection, applique fn(objets), puis resélectionne */
  withLoose(fn) {
    const objs = canvas.getActiveObjects();
    if (!objs.length || state.cropping) return;
    canvas.discardActiveObject();
    fn(objs);
    objs.forEach((o) => o.setCoords());
    this.reselect(objs);
    canvas.requestRenderAll();
    History.queue();
  },

  reselect(objs) {
    if (objs.length > 1) canvas.setActiveObject(new fabric.ActiveSelection(objs, { canvas }));
    else if (objs[0]) canvas.setActiveObject(objs[0]);
  },

  align(edge) {
    this.withLoose((objs) => {
      const rects = objs.map(this.rect);
      const ref = objs.length > 1
        ? this.union(rects)
        : this.pageRect(objs[0]);
      objs.forEach((o, i) => {
        const r = rects[i];
        let dx = 0;
        let dy = 0;
        if (edge === 'left') dx = ref.left - r.left;
        if (edge === 'hcenter') dx = ref.left + ref.width / 2 - (r.left + r.width / 2);
        if (edge === 'right') dx = ref.left + ref.width - (r.left + r.width);
        if (edge === 'top') dy = ref.top - r.top;
        if (edge === 'vcenter') dy = ref.top + ref.height / 2 - (r.top + r.height / 2);
        if (edge === 'bottom') dy = ref.top + ref.height - (r.top + r.height);
        o.set({ left: o.left + dx, top: o.top + dy });
      });
    });
  },

  /** Espaces égaux entre les objets (3 minimum), les extrêmes ne bougent pas */
  distribute(axis) {
    if (canvas.getActiveObjects().length < 3) return;
    const pos = axis === 'h' ? 'left' : 'top';
    const size = axis === 'h' ? 'width' : 'height';
    this.withLoose((objs) => {
      const items = objs.map((o) => ({ o, r: this.rect(o) })).sort((a, b) => a.r[pos] - b.r[pos]);
      const first = items[0].r;
      const last = items[items.length - 1].r;
      const total = last[pos] + last[size] - first[pos];
      const gap = (total - items.reduce((sum, it) => sum + it.r[size], 0)) / (items.length - 1);
      let cursor = first[pos];
      items.forEach(({ o, r }) => {
        o.set(pos, o[pos] + (cursor - r[pos]));
        cursor += r[size] + gap;
      });
    });
  },

  group() {
    const active = canvas.getActiveObject();
    if (active?.type !== 'activeSelection') return;
    const group = active.toGroup();
    group.set({ name: undefined });
    canvas.requestRenderAll();
    History.queue();
    Properties.sync();
  },

  ungroup() {
    const active = canvas.getActiveObject();
    if (active?.type !== 'group') return;
    active.toActiveSelection();
    canvas.requestRenderAll();
    History.queue();
    Properties.sync();
  },

  /** Un plan vers l'avant / l'arrière (étape par étape) */
  step(forward) {
    const obj = canvas.getActiveObject();
    if (!obj) return;
    if (forward) canvas.bringForward(obj);
    else canvas.sendBackwards(obj);
    canvas.requestRenderAll();
    History.queue();
  },

  selectAll() {
    const objs = canvas.getObjects().filter((o) => o.visible && !o.locked);
    if (!objs.length) return;
    setTool('select');
    canvas.discardActiveObject();
    this.reselect(objs);
    canvas.requestRenderAll();
  },

  /** Ajoute les boutons à la tuile « Disposition » du panneau */
  mountUI() {
    const tile = dom.sectionArrange;
    const btn = (key, title) => `<button class="icon-btn" type="button" data-align="${key}" title="${title}" aria-label="${title}" disabled><svg viewBox="0 0 24 24" aria-hidden="true">${ALIGN_ICONS[key]}</svg></button>`;
    const block = html(`
      <div class="arrange-block">
        <div class="icon-row">
          ${btn('left', 'Aligner à gauche')}${btn('hcenter', 'Centrer horizontalement')}${btn('right', 'Aligner à droite')}
          ${btn('top', 'Aligner en haut')}${btn('vcenter', 'Centrer verticalement')}${btn('bottom', 'Aligner en bas')}
        </div>
        <div class="icon-row icon-row-split">
          ${btn('distH', 'Répartir horizontalement (3 objets ou plus)')}${btn('distV', 'Répartir verticalement (3 objets ou plus)')}
          <button class="btn btn-sm" type="button" id="btn-group" disabled title="Grouper (⌘/Ctrl + G)">Grouper</button>
          <button class="btn btn-sm" type="button" id="btn-ungroup" disabled title="Dissocier (⌘/Ctrl + Maj + G)">Dissocier</button>
        </div>
        <p class="field-note" id="align-note">Un objet s'aligne sur la page, plusieurs entre eux.</p>
        <div class="btn-row">
          <button class="btn btn-sm" type="button" id="btn-forward" disabled title="Avancer d'un plan (⌘/Ctrl + ])">Avancer</button>
          <button class="btn btn-sm" type="button" id="btn-backward" disabled title="Reculer d'un plan (⌘/Ctrl + [)">Reculer</button>
        </div>
      </div>`);
    tile.querySelector('h3').after(block);
    dom.btnFront.title = 'Premier plan (⌘/Ctrl + Maj + ])';
    dom.btnBack.title = 'Arrière-plan (⌘/Ctrl + Maj + [)';

    block.querySelectorAll('[data-align]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.align;
      if (k === 'distH') this.distribute('h');
      else if (k === 'distV') this.distribute('v');
      else this.align(k);
    }));
    $('#btn-group').addEventListener('click', () => this.group());
    $('#btn-ungroup').addEventListener('click', () => this.ungroup());
    $('#btn-forward').addEventListener('click', () => this.step(true));
    $('#btn-backward').addEventListener('click', () => this.step(false));

    Hooks.on('sync', ({ objects, ref, single, hasSelection }) => {
      block.querySelectorAll('[data-align]').forEach((b) => {
        b.disabled = b.dataset.align.startsWith('dist') ? objects.length < 3 : !hasSelection;
      });
      $('#btn-group').disabled = objects.length < 2;
      $('#btn-ungroup').disabled = !(single && ref.type === 'group');
      $('#btn-forward').disabled = !hasSelection;
      $('#btn-backward').disabled = !hasSelection;
      $('#align-note').textContent = objects.length > 1
        ? 'Les objets s\'alignent entre eux.'
        : 'Un objet seul s\'aligne sur la page.';
    });
  },

  bindKeys() {
    Keys.add((e, { mod, key }) => {
      if (mod && key === 'g') {
        e.preventDefault();
        if (e.shiftKey) this.ungroup(); else this.group();
        return true;
      }
      if (mod && key === 'a') { e.preventDefault(); this.selectAll(); return true; }
      if (mod && (e.code === 'BracketRight' || e.code === 'BracketLeft')) {
        e.preventDefault();
        const fwd = e.code === 'BracketRight';
        if (e.shiftKey) bringForward(fwd); else this.step(fwd);
        return true;
      }
      // Flèches : déplacement fin (Maj = 10 px)
      if (!mod && e.key.startsWith('Arrow') && canvas.getActiveObject() && !canvas.getActiveObject().isEditing) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        const obj = canvas.getActiveObject();
        if (e.key === 'ArrowLeft') obj.left -= d;
        if (e.key === 'ArrowRight') obj.left += d;
        if (e.key === 'ArrowUp') obj.top -= d;
        if (e.key === 'ArrowDown') obj.top += d;
        obj.setCoords();
        canvas.requestRenderAll();
        History.queue();
        return true;
      }
      return false;
    });
  },
};

/* ============================================================================
   2. GUIDES MAGNÉTIQUES, GRILLE, RÈGLES
   ----------------------------------------------------------------------------
   - Guides : pendant un déplacement, les bords et centres de l'objet
     s'accrochent à ceux de la page et des autres objets (seuil 6 px écran).
   - Grille : 20 px, l'objet s'y accroche si aucun guide n'est trouvé.
   - Règles : graduées en px du document, en haut et à gauche.
   Rien de tout cela n'apparaît à l'export (state.exporting).
   ========================================================================== */

const GRID_SIZE = 20;
const SNAP_PX = 6;
const RULER_PX = 20;
const GUIDE_COLOR = '#e0457b';

const Guides = {
  prefs: { snap: true, grid: false, rulers: false },
  lines: [], // { axis: 'x' | 'y', value }

  loadPrefs() {
    try { Object.assign(this.prefs, JSON.parse(localStorage.getItem('studio-chloe-guides') || '{}')); } catch { /* ignoré */ }
  },
  savePrefs() {
    try { localStorage.setItem('studio-chloe-guides', JSON.stringify(this.prefs)); } catch { /* ignoré */ }
  },

  onMoving({ target }) {
    this.lines = [];
    if (!this.prefs.snap && !this.prefs.grid) return;
    const zoom = canvas.getZoom();
    const threshold = SNAP_PX / zoom;
    const r = target.getBoundingRect(true, true);
    const exclude = new Set([target, ...(target._objects || [])]);

    const xs = [0, state.page.width / 2, state.page.width];
    const ys = [0, state.page.height / 2, state.page.height];
    if (this.prefs.snap) {
      canvas.getObjects().forEach((o) => {
        if (exclude.has(o) || !o.visible) return;
        const b = o.getBoundingRect(true, true);
        xs.push(b.left, b.left + b.width / 2, b.left + b.width);
        ys.push(b.top, b.top + b.height / 2, b.top + b.height);
      });
    }
    Hooks.emit('snapTargets', { xs, ys }); // repères (js/guides.js)…

    const best = (edges, cands) => {
      let hit = null;
      edges.forEach((edge) => cands.forEach((c) => {
        const d = c - edge;
        if (Math.abs(d) <= threshold && (!hit || Math.abs(d) < Math.abs(hit.d))) hit = { d, value: c };
      }));
      return hit;
    };

    let dx = 0;
    let dy = 0;
    if (this.prefs.snap) {
      const hx = best([r.left, r.left + r.width / 2, r.left + r.width], xs);
      const hy = best([r.top, r.top + r.height / 2, r.top + r.height], ys);
      if (hx) { dx = hx.d; this.lines.push({ axis: 'x', value: hx.value }); }
      if (hy) { dy = hy.d; this.lines.push({ axis: 'y', value: hy.value }); }
    }
    // Grille : seulement sur l'axe où aucun guide n'a accroché
    if (this.prefs.grid) {
      if (!dx) dx = Math.round(r.left / GRID_SIZE) * GRID_SIZE - r.left;
      if (!dy) dy = Math.round(r.top / GRID_SIZE) * GRID_SIZE - r.top;
    }
    if (dx || dy) {
      target.set({ left: target.left + dx, top: target.top + dy });
      target.setCoords();
    }
  },

  clear() {
    if (!this.lines.length) return;
    this.lines = [];
    canvas.requestRenderAll();
  },

  /** Grille dessinée sur la page, sous les objets */
  drawGrid({ ctx }) {
    if (!this.prefs.grid || state.exporting) return;
    const v = canvas.viewportTransform;
    const zoom = v[0];
    let step = GRID_SIZE;
    while (step * zoom < 8) step *= 5; // pas trop serré en zoom arrière
    ctx.save();
    ctx.beginPath();
    for (let x = 0; x <= state.page.width; x += step) {
      const sx = Math.round(x * zoom + v[4]) + 0.5;
      ctx.moveTo(sx, v[5]);
      ctx.lineTo(sx, state.page.height * zoom + v[5]);
    }
    for (let y = 0; y <= state.page.height; y += step) {
      const sy = Math.round(y * zoom + v[5]) + 0.5;
      ctx.moveTo(v[4], sy);
      ctx.lineTo(state.page.width * zoom + v[4], sy);
    }
    ctx.strokeStyle = 'rgba(37, 48, 11, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  },

  /** Guides magnétiques + règles, par-dessus les objets */
  drawOverlay({ ctx }) {
    if (state.exporting) return;
    const v = canvas.viewportTransform;
    const zoom = v[0];
    const w = canvas.getWidth();
    const h = canvas.getHeight();

    if (this.lines.length) {
      ctx.save();
      ctx.strokeStyle = GUIDE_COLOR;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      this.lines.forEach(({ axis, value }) => {
        if (axis === 'x') {
          const sx = Math.round(value * zoom + v[4]) + 0.5;
          ctx.moveTo(sx, 0); ctx.lineTo(sx, h);
        } else {
          const sy = Math.round(value * zoom + v[5]) + 0.5;
          ctx.moveTo(0, sy); ctx.lineTo(w, sy);
        }
      });
      ctx.stroke();
      ctx.restore();
    }

    if (this.prefs.rulers) this.drawRulers(ctx, v, zoom, w, h);
  },

  drawRulers(ctx, v, zoom, w, h) {
    const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
    const step = steps.find((s) => s * zoom >= 50) || 5000;
    const dark = document.documentElement.dataset.theme === 'dark';
    ctx.save();
    ctx.fillStyle = dark ? 'rgba(28, 34, 17, 0.92)' : 'rgba(250, 251, 244, 0.94)';
    ctx.fillRect(0, 0, w, RULER_PX);
    ctx.fillRect(0, 0, RULER_PX, h);
    ctx.strokeStyle = dark ? 'rgba(238, 243, 220, 0.35)' : 'rgba(30, 37, 13, 0.35)';
    ctx.fillStyle = dark ? 'rgba(238, 243, 220, 0.7)' : 'rgba(30, 37, 13, 0.7)';
    ctx.font = '9px Inter, system-ui, sans-serif';
    ctx.lineWidth = 1;
    ctx.beginPath();

    // Zone de la sélection, surlignée sur les règles
    const sel = canvas.getActiveObject();
    if (sel) {
      const b = sel.getBoundingRect(true, true);
      ctx.save();
      ctx.fillStyle = 'rgba(212, 240, 76, 0.55)';
      ctx.fillRect(b.left * zoom + v[4], 0, b.width * zoom, RULER_PX);
      ctx.fillRect(0, b.top * zoom + v[5], RULER_PX, b.height * zoom);
      ctx.restore();
    }

    const startX = Math.floor((RULER_PX - v[4]) / zoom / step) * step;
    for (let x = startX; x * zoom + v[4] < w; x += step) {
      const sx = Math.round(x * zoom + v[4]) + 0.5;
      if (sx < RULER_PX) continue;
      ctx.moveTo(sx, RULER_PX); ctx.lineTo(sx, RULER_PX - 8);
      ctx.fillText(String(x), sx + 3, 10);
      const half = Math.round((x + step / 2) * zoom + v[4]) + 0.5;
      ctx.moveTo(half, RULER_PX); ctx.lineTo(half, RULER_PX - 4);
    }
    const startY = Math.floor((RULER_PX - v[5]) / zoom / step) * step;
    for (let y = startY; y * zoom + v[5] < h; y += step) {
      const sy = Math.round(y * zoom + v[5]) + 0.5;
      if (sy < RULER_PX) continue;
      ctx.moveTo(RULER_PX, sy); ctx.lineTo(RULER_PX - 8, sy);
      ctx.save();
      ctx.translate(10, sy + 3);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(String(y), -ctx.measureText(String(y)).width - 3, 0);
      ctx.restore();
      const half = Math.round((y + step / 2) * zoom + v[5]) + 0.5;
      ctx.moveTo(RULER_PX, half); ctx.lineTo(RULER_PX - 4, half);
    }
    ctx.moveTo(0, RULER_PX + 0.5); ctx.lineTo(w, RULER_PX + 0.5);
    ctx.moveTo(RULER_PX + 0.5, 0); ctx.lineTo(RULER_PX + 0.5, h);
    ctx.stroke();
    ctx.restore();
  },

  mountUI() {
    const pill = $('.zoom-pill');
    const toggles = html(`
      <div class="view-toggles" role="group" aria-label="Aides à la mise en page">
        <button class="chip chip-icon" type="button" data-guide="snap" title="Guides magnétiques" aria-label="Guides magnétiques">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v8a6 6 0 0 0 12 0V3h-4v8a2 2 0 0 1-4 0V3z"/><path d="M6 7h4M14 7h4"/></svg>
        </button>
        <button class="chip chip-icon" type="button" data-guide="grid" title="Grille (20 px)" aria-label="Grille">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16"/></svg>
        </button>
        <button class="chip chip-icon" type="button" data-guide="rulers" title="Règles" aria-label="Règles">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h18v8H3z"/><path d="M7 8v3M11 8v4M15 8v3M19 8v4"/></svg>
        </button>
        <span class="pill-sep" aria-hidden="true"></span>
      </div>`);
    pill.prepend(toggles);
    const refresh = () => toggles.querySelectorAll('[data-guide]').forEach((b) => {
      const on = Boolean(this.prefs[b.dataset.guide]);
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    toggles.querySelectorAll('[data-guide]').forEach((b) => b.addEventListener('click', () => {
      this.prefs[b.dataset.guide] = !this.prefs[b.dataset.guide];
      this.savePrefs();
      refresh();
      canvas.requestRenderAll();
    }));
    refresh();
  },

  bind() {
    this.loadPrefs();
    canvas.on('object:moving', (e) => this.onMoving(e));
    canvas.on('mouse:up', () => this.clear());
    canvas.on('before:render', (e) => this.drawGrid(e));
    canvas.on('after:render', (e) => this.drawOverlay(e));
  },
};

/* ============================================================================
   3. PANNEAU CALQUES
   ----------------------------------------------------------------------------
   Liste des objets (le plus en avant en haut) : sélection, renommage
   (double-clic), visibilité, verrouillage, réordonnancement par glisser.
   Les noms et verrous sont enregistrés (SERIAL_PROPS dans app.js).
   ========================================================================== */

const LAYER_ICONS = {
  rect: '<rect x="4" y="6" width="16" height="12" rx="1.5"/>',
  ellipse: '<circle cx="12" cy="12" r="8"/>',
  text: '<path d="M5 7V5h14v2M12 5v14M9 19h6"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>',
  path: '<path d="M4 18c4-10 8 2 16-12"/>',
  group: '<rect x="3" y="3" width="11" height="11" rx="2"/><rect x="10" y="10" width="11" height="11" rx="2"/>',
  poly: '<path d="M12 4 21 19H3z"/>',
  line: '<path d="M5 19 19 5"/>',
};
const EYE = '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>';
const EYE_OFF = '<path d="M3 3l18 18M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.1 4M6.6 6.6A17.4 17.4 0 0 0 2 12s3.6 7 10 7a9.9 9.9 0 0 0 5.4-1.6"/>';
const LOCK = '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>';
const UNLOCK = '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>';

function layerIcon(o) {
  if (isText(o)) return LAYER_ICONS.text;
  if (o.type === 'polyline') return LAYER_ICONS.line;
  if (o.type === 'polygon') return LAYER_ICONS.poly;
  return LAYER_ICONS[o.type] || LAYER_ICONS.rect;
}

const Layers = {
  pending: false,
  dragIndex: null,

  mountUI() {
    const panel = $('.panel');
    const header = panel.querySelector('.panel-header');
    header.querySelector('h2').replaceWith(html(`
      <div class="tabs panel-tabs" role="tablist">
        <button class="tab is-active" type="button" role="tab" data-panel-tab="props" aria-selected="true">Propriétés</button>
        <button class="tab" type="button" role="tab" data-panel-tab="layers" aria-selected="false">Calques</button>
      </div>`));

    // Tout le contenu existant devient l'onglet « Propriétés »
    const props = html('<div class="panel-tab" id="tab-props"></div>');
    [...panel.children].filter((c) => c !== header).forEach((c) => props.appendChild(c));
    this.tab = html(`
      <div class="panel-tab" id="tab-layers" hidden>
        <p class="panel-hint">Double-clic pour renommer · glisser pour réordonner.</p>
        <ul class="layer-list" id="layer-list" aria-label="Calques"></ul>
        <p class="panel-hint layer-empty" id="layer-empty">Aucun calque pour l'instant : tracez une forme ou importez une image.</p>
      </div>`);
    panel.append(props, this.tab);
    this.list = this.tab.querySelector('#layer-list');

    header.querySelectorAll('[data-panel-tab]').forEach((b) => b.addEventListener('click', () => this.showTab(b.dataset.panelTab)));
    this.bindList();
  },

  showTab(name) {
    $$('[data-panel-tab]').forEach((b) => {
      const on = b.dataset.panelTab === name;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
    });
    $('#tab-props').hidden = name !== 'props';
    this.tab.hidden = name !== 'layers';
    if (name === 'layers') this.render();
  },

  schedule() {
    if (this.pending || this.tab.hidden) return;
    this.pending = true;
    requestAnimationFrame(() => { this.pending = false; this.render(); });
  },

  render() {
    if (this.tab.hidden) return;
    const objs = canvas.getObjects().filter((o) => !o.excludeFromExport); // pas le cadre de rognage
    const active = new Set(canvas.getActiveObjects());
    $('#layer-empty').hidden = objs.length > 0;
    this.list.replaceChildren(...objs.map((o, index) => ({ o, index })).reverse().map(({ o, index }) => {
      const li = html(`
        <li class="layer${active.has(o) ? ' is-selected' : ''}${o.visible ? '' : ' is-hidden'}${o.locked ? ' is-locked' : ''}" draggable="true" data-index="${index}">
          <svg class="layer-type" viewBox="0 0 24 24" aria-hidden="true">${layerIcon(o)}</svg>
          <span class="layer-name"></span>
          <button class="layer-btn" type="button" data-act="visible" title="${o.visible ? 'Masquer' : 'Afficher'}" aria-label="${o.visible ? 'Masquer' : 'Afficher'}"><svg viewBox="0 0 24 24">${o.visible ? EYE : EYE_OFF}</svg></button>
          <button class="layer-btn" type="button" data-act="lock" title="${o.locked ? 'Déverrouiller' : 'Verrouiller'}" aria-label="${o.locked ? 'Déverrouiller' : 'Verrouiller'}"><svg viewBox="0 0 24 24">${o.locked ? LOCK : UNLOCK}</svg></button>
        </li>`);
      li.querySelector('.layer-name').textContent = objectLabel(o);
      return li;
    }));
  },

  objAt(li) { return canvas.getObjects()[Number(li.dataset.index)]; },

  bindList() {
    this.list.addEventListener('click', (e) => {
      const li = e.target.closest('.layer');
      if (!li) return;
      const obj = this.objAt(li);
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'visible') return this.toggleVisible(obj);
      if (act === 'lock') return this.toggleLock(obj);
      if (!obj.visible || obj.locked) return;
      setTool('select');
      // Maj / ⌘ : ajouter ou retirer de la sélection
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        const current = canvas.getActiveObjects();
        const next = current.includes(obj) ? current.filter((o) => o !== obj) : [...current, obj];
        canvas.discardActiveObject();
        Arrange.reselect(next);
      } else {
        canvas.setActiveObject(obj);
      }
      canvas.requestRenderAll();
      this.render();
    });

    this.list.addEventListener('dblclick', (e) => {
      const name = e.target.closest('.layer-name');
      if (name) this.rename(name.closest('.layer'));
    });

    // Glisser-déposer pour réordonner
    this.list.addEventListener('dragstart', (e) => {
      const li = e.target.closest('.layer');
      this.dragIndex = Number(li.dataset.index);
      e.dataTransfer.effectAllowed = 'move';
      li.classList.add('is-dragging');
    });
    this.list.addEventListener('dragover', (e) => {
      const li = e.target.closest('.layer');
      if (this.dragIndex === null || !li) return;
      e.preventDefault();
      this.list.querySelectorAll('.drop-above, .drop-below').forEach((x) => x.classList.remove('drop-above', 'drop-below'));
      const r = li.getBoundingClientRect();
      li.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-above' : 'drop-below');
    });
    this.list.addEventListener('drop', (e) => {
      const li = e.target.closest('.layer');
      if (this.dragIndex === null || !li) return;
      e.preventDefault();
      const obj = canvas.getObjects()[this.dragIndex];
      let target = Number(li.dataset.index);
      // Liste inversée : « au-dessus » dans la liste = plus en avant dans le canvas
      const above = li.classList.contains('drop-above');
      if (above && target < this.dragIndex) target += 1;
      if (!above && target > this.dragIndex) target -= 1;
      canvas.moveTo(obj, clamp(target, 0, canvas.getObjects().length - 1));
      canvas.requestRenderAll();
      History.queue();
      this.render();
    });
    this.list.addEventListener('dragend', () => { this.dragIndex = null; this.render(); });
  },

  rename(li) {
    const obj = this.objAt(li);
    const span = li.querySelector('.layer-name');
    const input = html('<input class="layer-input" type="text" maxlength="60">');
    input.value = objectLabel(obj);
    span.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      if (save) {
        obj.name = input.value.trim() || undefined; // vide : retour au nom par défaut
        History.queue();
        Properties.sync();
      }
      this.render();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
      e.stopPropagation();
    });
    input.addEventListener('blur', () => finish(true));
  },

  toggleVisible(obj) {
    obj.visible = !obj.visible;
    if (!obj.visible && canvas.getActiveObjects().includes(obj)) canvas.discardActiveObject();
    canvas.requestRenderAll();
    History.queue();
    this.render();
  },

  toggleLock(obj) {
    setLocked(obj, !obj.locked);
    canvas.requestRenderAll();
    History.queue();
    this.render();
  },

  bind() {
    ['object:added', 'object:removed', 'object:modified', 'selection:created', 'selection:updated', 'selection:cleared']
      .forEach((evt) => canvas.on(evt, () => this.schedule()));
    Hooks.on('docLoaded', () => this.schedule());
    Hooks.on('sync', () => this.schedule());
  },
};

/** Verrouille / déverrouille un objet (ni sélectionnable ni déplaçable) */
function setLocked(obj, locked) {
  obj.locked = locked || undefined;
  obj.selectable = !locked;
  obj.evented = !locked;
  if (locked && canvas.getActiveObjects().includes(obj)) canvas.discardActiveObject();
}

const $$ = (sel) => [...document.querySelectorAll(sel)];

Hooks.on('init', () => {
  Arrange.mountUI();
  Arrange.bindKeys();
  Guides.bind();
  Guides.mountUI();
  Layers.mountUI();
  Layers.bind();
});
