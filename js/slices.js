/**
 * ============================================================================
 *  Chloe’s Touch — Outil Tranches (menu « Graphiques & tranches »)
 *
 *  Découpez la page en zones d'export, comme les tranches d'Illustrator :
 *    - tracez un cadre = une tranche (numérotée, nommable) ;
 *    - cliquez sur une tranche pour la sélectionner, glissez-la pour la
 *      déplacer, Suppr pour l'effacer ;
 *    - « Exporter les tranches » : un PNG (ou JPG) par tranche, réunis dans
 *      un fichier ZIP (JSZip, chargé à la demande) ;
 *    - « Découper en grille » : crée N × M tranches sur la page.
 *  Les tranches sont enregistrées avec le document mais jamais exportées
 *  comme dessin (Doc.extras.slices).
 * ============================================================================
 */
'use strict';

const JSZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
const SLICE_ICON = '<path d="M5 3v15a3 3 0 0 0 3 3h13"/><path d="M3 7h14v14"/><path d="m21 3-9 9"/>';
const SLICE_COLOR = '#e0457b';

const Slices = {
  list: [],         // { id, name, left, top, width, height }
  selected: null,
  drag: null,
  opts: { format: 'png', scale: 1 },

  save() { return this.list.length ? this.list.map((s) => ({ ...s })) : undefined; },
  load(v) {
    this.list = Array.isArray(v) ? v.map((s) => ({ ...s })) : [];
    this.selected = null;
    this.renderList();
  },

  nextName() {
    let n = this.list.length + 1;
    while (this.list.some((s) => s.name === `Tranche ${n}`)) n += 1;
    return `Tranche ${n}`;
  },

  add(box) {
    const s = { id: uid(), name: this.nextName(), ...this.round(box) };
    this.list.push(s);
    this.selected = s;
    this.changed();
    return s;
  },

  round(b) {
    return { left: Math.round(b.left), top: Math.round(b.top), width: Math.max(1, Math.round(b.width)), height: Math.max(1, Math.round(b.height)) };
  },

  remove(s) {
    this.list = this.list.filter((x) => x !== s);
    if (this.selected === s) this.selected = null;
    this.changed();
  },

  grid(rows, cols) {
    const { width: W, height: H } = state.page;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        this.list.push({ id: uid(), name: this.nextName(), ...this.round({ left: (W * c) / cols, top: (H * r) / rows, width: W / cols, height: H / rows }) });
      }
    }
    this.changed();
  },

  changed() {
    canvas.requestRenderAll();
    this.renderList();
    History.queue();
  },

  at(p) {
    return [...this.list].reverse().find((s) => p.x >= s.left && p.x <= s.left + s.width && p.y >= s.top && p.y <= s.top + s.height) || null;
  },

  // ---------- dessin (visible seulement avec l'outil Tranches, ou si demandé)
  draw({ ctx }) {
    if (state.exporting || !this.list.length) return;
    const show = state.tool === 'slice' || this.alwaysShow;
    if (!show) return;
    const v = canvas.viewportTransform;
    ctx.save();
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    this.list.forEach((s, i) => {
      const x = Math.round(s.left * v[0] + v[4]) + 0.5;
      const y = Math.round(s.top * v[3] + v[5]) + 0.5;
      const w = s.width * v[0];
      const h = s.height * v[3];
      const sel = s === this.selected;
      ctx.strokeStyle = SLICE_COLOR;
      ctx.lineWidth = sel ? 2 : 1;
      ctx.setLineDash(sel ? [] : [5, 3]);
      ctx.fillStyle = sel ? 'rgba(224, 69, 123, 0.10)' : 'rgba(224, 69, 123, 0.04)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      const label = `${i + 1} · ${s.name}`;
      const tw = ctx.measureText(label).width + 10;
      ctx.setLineDash([]);
      ctx.fillStyle = SLICE_COLOR;
      ctx.fillRect(x, y, tw, 18);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x + 5, y + 13);
    });
    ctx.restore();
  },

  // ---------- export
  async exportAll() {
    if (!this.list.length) { toast('Aucune tranche : tracez-en avec l\'outil Tranches.'); return; }
    const fmt = this.opts.format;
    const ext = fmt === 'jpeg' ? 'jpg' : 'png';
    const files = this.list.map((s, i) => ({
      name: `${String(i + 1).padStart(2, '0')}-${(s.name || 'tranche').replace(/[^\p{L}\p{N}_-]+/gu, '-')}.${ext}`,
      url: Exporter.toDataURL({ format: fmt, multiplier: this.opts.scale, area: { left: s.left, top: s.top, width: s.width, height: s.height } }),
    }));
    try {
      await loadScript(JSZIP_URL);
      const zip = new window.JSZip();
      files.forEach((f) => zip.file(f.name, f.url.split(',')[1], { base64: true }));
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      downloadURL(url, exportFileName('zip').replace('chloes-touch', 'tranches'));
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast(`${files.length} tranche${files.length > 1 ? 's' : ''} exportée${files.length > 1 ? 's' : ''} (ZIP)`, 'success');
    } catch {
      // Sans JSZip (hors ligne) : un téléchargement par tranche
      files.forEach((f, i) => setTimeout(() => downloadURL(f.url, f.name), i * 250));
      toast(`${files.length} fichier${files.length > 1 ? 's' : ''} téléchargé${files.length > 1 ? 's' : ''}`, 'success');
    }
  },

  // ---------- panneau
  renderList() {
    const ul = Tools.slice._optionsEl?.querySelector('#slice-list');
    if (!ul) return;
    ul.replaceChildren(...this.list.map((s, i) => {
      const li = html(`<li class="slice-item${s === this.selected ? ' is-selected' : ''}">
        <span class="slice-num">${i + 1}</span>
        <input class="slice-name" type="text" maxlength="40" aria-label="Nom de la tranche">
        <small>${s.width}×${s.height}</small>
        <button class="layer-btn" type="button" data-del title="Supprimer" aria-label="Supprimer"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </li>`);
      const input = li.querySelector('input');
      input.value = s.name;
      input.addEventListener('change', () => { s.name = input.value.trim() || `Tranche ${i + 1}`; this.changed(); });
      input.addEventListener('keydown', (e) => e.stopPropagation());
      input.addEventListener('focus', () => { this.selected = s; canvas.requestRenderAll(); });
      li.querySelector('[data-del]').addEventListener('click', () => this.remove(s));
      return li;
    }));
    Tools.slice._optionsEl.querySelector('#slice-empty').hidden = this.list.length > 0;
  },
};

Tools.slice = {
  cursor: 'crosshair',
  activate() { setInteractionMode('draw'); canvas.discardActiveObject(); Slices.renderList(); canvas.requestRenderAll(); },
  deactivate() { cancelDrawing(); Slices.drag = null; canvas.requestRenderAll(); },
  onMouseDown(p) {
    const hit = Slices.at(p);
    if (hit) {
      Slices.selected = hit;
      Slices.drag = { slice: hit, start: p, from: { left: hit.left, top: hit.top }, moved: false };
      Slices.renderList();
      canvas.requestRenderAll();
      return;
    }
    Slices.selected = null;
    Tools.quickcrop.onMouseDown.call(this, p);
  },
  onMouseMove(p, e) {
    const d = Slices.drag;
    if (d) {
      d.moved = true;
      d.slice.left = Math.round(d.from.left + p.x - d.start.x);
      d.slice.top = Math.round(d.from.top + p.y - d.start.y);
      canvas.requestRenderAll();
      return;
    }
    Tools.quickcrop.onMouseMove.call(this, p, e);
  },
  onMouseUp(p, e) {
    const d = Slices.drag;
    Slices.drag = null;
    if (d) { if (d.moved) Slices.changed(); return; }
    if (!state.drawing) return;
    const { origin } = state.drawing;
    const box = getDragBox(origin, p, e.shiftKey);
    cancelDrawing();
    if (box.width < MIN_DRAG_SIZE || box.height < MIN_DRAG_SIZE) { canvas.requestRenderAll(); Slices.renderList(); return; }
    Slices.add(box);
  },
  options() {
    const el = html(`<div class="tool-options-body">
      <p class="field-note">Tracez des cadres sur la page : chaque tranche devient une image à l'export. Glissez une tranche pour la déplacer, Suppr pour l'effacer.</p>
      <ul class="slice-list" id="slice-list"></ul>
      <p class="field-note" id="slice-empty">Aucune tranche pour l'instant.</p>
      <div class="btn-row"><button class="btn btn-sm" type="button" id="slice-grid">Découper en grille…</button><button class="btn btn-sm" type="button" id="slice-clear">Tout effacer</button></div>
      <div class="chips"><button class="chip is-active" type="button" data-sfmt="png">PNG</button><button class="chip" type="button" data-sfmt="jpeg">JPG</button>
        <button class="chip is-active" type="button" data-sscale="1">1×</button><button class="chip" type="button" data-sscale="2">2×</button><button class="chip" type="button" data-sscale="3">3×</button></div>
      <button class="btn btn-primary btn-block" type="button" id="slice-export">Exporter les tranches (ZIP)</button>
    </div>`);
    el.querySelector('#slice-export').addEventListener('click', () => Slices.exportAll());
    el.querySelector('#slice-clear').addEventListener('click', () => { if (Slices.list.length) { Slices.list = []; Slices.selected = null; Slices.changed(); } });
    el.querySelector('#slice-grid').addEventListener('click', () => {
      const v = prompt('Découper la page en grille : rangées × colonnes', '2 × 2');
      const m = v && v.match(/(\d+)\D+(\d+)/);
      if (m) Slices.grid(clamp(Number(m[1]), 1, 20), clamp(Number(m[2]), 1, 20));
    });
    el.querySelectorAll('[data-sfmt]').forEach((b) => b.addEventListener('click', () => {
      Slices.opts.format = b.dataset.sfmt;
      el.querySelectorAll('[data-sfmt]').forEach((x) => x.classList.toggle('is-active', x === b));
    }));
    el.querySelectorAll('[data-sscale]').forEach((b) => b.addEventListener('click', () => {
      Slices.opts.scale = Number(b.dataset.sscale);
      el.querySelectorAll('[data-sscale]').forEach((x) => x.classList.toggle('is-active', x === b));
    }));
    return el;
  },
};

TOOL_LABELS.slice = 'Tranches';

Hooks.on('init', () => {
  Doc.extras.slices = { save: () => Slices.save(), load: (v) => Slices.load(v) };
  RailGroups.add('data', { tool: 'slice', label: 'Tranches (zones d\'export)', icon: SLICE_ICON });
  canvas.on('after:render', (e) => Slices.draw(e));
  Keys.add((e) => {
    if (state.tool === 'slice' && Slices.selected && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      Slices.remove(Slices.selected);
      return true;
    }
    return false;
  });
});
