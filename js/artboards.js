/**
 * ============================================================================
 *  Chloe’s Touch — Plans de travail multiples
 *
 *  Le plan n° 1 est la page habituelle (state.page, en 0,0 ; son format se
 *  change avec « Changer de format »). On peut en ajouter d'autres :
 *    - tuile « Page » : liste des plans (renommer, taille, aller à, supprimer),
 *      bouton « Ajouter un plan de travail » ;
 *    - outil Plan de travail (Maj + O) : glisser dans le vide crée un plan,
 *      glisser un plan le déplace AVEC son contenu ;
 *    - export (⌘E) : un plan précis, ou « Tous les plans » → PDF multipage,
 *      ou ZIP d'images / de SVG.
 *  Un objet seul s'aligne sur le plan qui le contient.
 *  Enregistrés avec le document (Doc.extras.artboards).
 * ============================================================================
 */
'use strict';

const ARTBOARD_GAP = 80;
const ARTBOARD_ICON = '<rect x="5" y="5" width="14" height="14" rx="1"/><path d="M5 2v3M2 5h3M19 2v3M22 5h-3M5 22v-3M2 19h3M19 22v-3M22 19h-3"/>';

const Artboards = {
  list: [],          // plans supplémentaires { id, name, left, top, width, height }
  mainName: 'Plan de travail 1',

  save() { return this.list.length || this.mainName !== 'Plan de travail 1' ? { main: this.mainName, list: this.list.map((a) => ({ ...a })) } : undefined; },
  load(v) {
    this.list = Array.isArray(v?.list) ? v.list.map((a) => ({ ...a })) : [];
    this.mainName = v?.main || 'Plan de travail 1';
    this.renderList();
  },

  all() {
    return [{ id: 'main', name: this.mainName, left: 0, top: 0, width: state.page.width, height: state.page.height, main: true }, ...this.list];
  },
  byId(id) { return this.all().find((a) => a.id === id); },

  /** Plan qui contient le point p (sinon le plan principal) */
  at(p) {
    return this.list.slice().reverse().find((a) => p.x >= a.left && p.x <= a.left + a.width && p.y >= a.top && p.y <= a.top + a.height) || this.all()[0];
  },

  rect(a) { return { left: a.left, top: a.top, width: a.width, height: a.height }; },

  add(size = state.page) {
    const right = Math.max(...this.all().map((a) => a.left + a.width));
    const ab = { id: uid(), name: `Plan de travail ${this.all().length + 1}`, left: right + ARTBOARD_GAP, top: 0, width: Math.round(size.width), height: Math.round(size.height) };
    this.list.push(ab);
    this.changed();
    this.zoomTo(ab);
    return ab;
  },

  remove(id) {
    this.list = this.list.filter((a) => a.id !== id);
    this.changed();
  },

  changed() {
    canvas.requestRenderAll();
    this.renderList();
    History.queue();
  },

  zoomTo(a) {
    const zoom = clamp(Math.min((canvas.getWidth() - FIT_MARGIN * 2) / a.width, (canvas.getHeight() - FIT_MARGIN * 2) / a.height), ZOOM_MIN, ZOOM_MAX);
    canvas.setViewportTransform([zoom, 0, 0, zoom, (canvas.getWidth() - a.width * zoom) / 2 - a.left * zoom, (canvas.getHeight() - a.height * zoom) / 2 - a.top * zoom]);
    state.autoFit = a.main && !this.list.length;
    Viewport.afterChange();
  },

  fitAll() {
    const all = this.all();
    const l = Math.min(...all.map((a) => a.left));
    const t = Math.min(...all.map((a) => a.top));
    const r = Math.max(...all.map((a) => a.left + a.width));
    const b = Math.max(...all.map((a) => a.top + a.height));
    this.zoomTo({ left: l, top: t, width: r - l, height: b - t });
  },

  // ---------- dessin : pages blanches supplémentaires et noms
  drawBoards({ ctx }) {
    if (state.exporting || !this.list.length) return;
    const v = canvas.viewportTransform;
    ctx.save();
    ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]);
    ctx.shadowColor = 'rgba(74, 22, 24, 0.18)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = CANVAS_BG;
    this.list.forEach((a) => ctx.fillRect(a.left, a.top, a.width, a.height));
    ctx.restore();
  },

  drawLabels({ ctx }) {
    if (state.exporting || !this.list.length) return;
    const v = canvas.viewportTransform;
    const dark = document.documentElement.dataset.theme === 'dark';
    ctx.save();
    ctx.font = '500 11px Inter, system-ui, sans-serif';
    ctx.fillStyle = dark ? 'rgba(238, 243, 220, 0.75)' : 'rgba(42, 18, 20, 0.65)';
    this.all().forEach((a, i) => {
      const x = a.left * v[0] + v[4];
      const y = a.top * v[3] + v[5] - 8;
      ctx.fillText(`${i + 1} · ${a.name}`, x, y);
      if (this.drag?.board === a || this.hover === a) {
        ctx.strokeStyle = '#d9474f';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, a.top * v[3] + v[5], a.width * v[0], a.height * v[3]);
      }
    });
    ctx.restore();
  },

  // ---------- panneau (dans la tuile « Page »)
  mountUI() {
    const tile = $('#section-page');
    this.el = html(`
      <div class="artboards">
        <span class="field-label">Plans de travail</span>
        <ul class="slice-list artboard-list" id="artboard-list"></ul>
        <div class="btn-row">
          <button class="btn btn-sm" type="button" id="ab-add">+ Ajouter un plan</button>
          <button class="btn btn-sm" type="button" id="ab-fit" title="Voir tous les plans">Tout voir</button>
        </div>
      </div>`);
    tile.appendChild(this.el);
    this.el.querySelector('#ab-add').addEventListener('click', () => this.add());
    this.el.querySelector('#ab-fit').addEventListener('click', () => this.fitAll());
    this.renderList();
  },

  renderList() {
    const ul = this.el?.querySelector('#artboard-list');
    if (!ul) return;
    ul.replaceChildren(...this.all().map((a, i) => {
      const li = html(`<li class="slice-item artboard-item">
        <button class="slice-num ab-go" type="button" title="Aller à ce plan" aria-label="Aller au plan ${i + 1}">${i + 1}</button>
        <input class="slice-name" type="text" maxlength="40" aria-label="Nom du plan">
        ${a.main ? `<small>${a.width}×${a.height}</small>` : '<button class="layer-btn" type="button" data-del title="Supprimer le plan" aria-label="Supprimer"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>'}
        ${a.main ? '' : `<span class="ab-dims"><input class="ab-size" type="number" min="16" max="10000" value="${a.width}" aria-label="Largeur"><small>×</small><input class="ab-size" type="number" min="16" max="10000" value="${a.height}" aria-label="Hauteur"><small>px</small></span>`}
      </li>`);
      const name = li.querySelector('.slice-name');
      name.value = a.name;
      name.addEventListener('keydown', (e) => e.stopPropagation());
      name.addEventListener('change', () => {
        const v = name.value.trim() || `Plan de travail ${i + 1}`;
        if (a.main) this.mainName = v; else a.name = v;
        this.changed();
      });
      li.querySelector('.ab-go').addEventListener('click', () => this.zoomTo(a));
      const sizes = li.querySelectorAll('.ab-size');
      sizes.forEach((inp, k) => {
        inp.addEventListener('keydown', (e) => e.stopPropagation());
        inp.addEventListener('change', () => {
          const v = clamp(Math.round(Number(inp.value) || 0), 16, 10000);
          if (k === 0) a.width = v; else a.height = v;
          this.changed();
        });
      });
      li.querySelector('[data-del]')?.addEventListener('click', () => this.remove(a.id));
      return li;
    }));
  },

  // ---------- export
  svgFor(area) {
    return Exporter.withPage(() => canvas.toSVG({ width: area.width, height: area.height, viewBox: { x: area.left, y: area.top, width: area.width, height: area.height } }));
  },

  async exportAll({ format, scale, transparent }) {
    const boards = this.all();
    const safe = (s) => s.replace(/[^\p{L}\p{N}_-]+/gu, '-');
    if (format === 'pdf') {
      await loadScript(JSPDF_URL);
      const { jsPDF } = window.jspdf;
      const dpi = state.page.dpi || 96;
      let doc = null;
      boards.forEach((a) => {
        const wPt = (a.width * 72) / dpi;
        const hPt = (a.height * 72) / dpi;
        const orient = wPt >= hPt ? 'landscape' : 'portrait';
        if (!doc) doc = new jsPDF({ orientation: orient, unit: 'pt', format: [wPt, hPt], compress: true });
        else doc.addPage([wPt, hPt], orient);
        const fmt = transparent ? 'png' : 'jpeg';
        const url = Exporter.toDataURL({ format: fmt, multiplier: scale, transparent, area: this.rect(a), quality: 0.95 });
        doc.addImage(url, fmt === 'png' ? 'PNG' : 'JPEG', 0, 0, wPt, hPt, undefined, 'FAST');
      });
      doc.save(exportFileName('pdf'));
      return;
    }
    const files = boards.map((a, i) => {
      const base = `${String(i + 1).padStart(2, '0')}-${safe(a.name)}`;
      if (format === 'svg') return { name: `${base}.svg`, data: this.svgFor(this.rect(a)), text: true };
      const url = Exporter.toDataURL({ format, multiplier: scale, transparent, area: this.rect(a) });
      return { name: `${base}.${format === 'jpeg' ? 'jpg' : format}`, data: url.split(',')[1] };
    });
    try {
      await loadScript(JSZIP_URL);
      const zip = new window.JSZip();
      files.forEach((f) => zip.file(f.name, f.data, f.text ? {} : { base64: true }));
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      downloadURL(url, exportFileName('zip').replace('chloes-touch', 'plans-de-travail'));
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      files.forEach((f, i) => setTimeout(() => {
        const href = f.text ? URL.createObjectURL(new Blob([f.data], { type: 'image/svg+xml' })) : `data:image/${format};base64,${f.data}`;
        downloadURL(href, f.name);
      }, i * 250));
    }
  },

  /** Ajoute le choix du plan à la fenêtre d'export */
  extendExport() {
    const ED = ExportDialog;
    const baseBuild = ED.build.bind(ED);
    const baseArea = ED.area.bind(ED);
    const baseRefresh = ED.refresh.bind(ED);
    const baseRun = ED.run.bind(ED);
    ED.build = () => {
      baseBuild();
      const chips = ED.sheet.$('[data-area="page"]').parentElement;
      ED.abChips = html('<div class="chips" id="export-artboards"></div>');
      chips.after(ED.abChips);
    };
    ED.area = () => {
      const a = ED.opts.area;
      if (a === 'all') return this.rect(this.all()[0]);
      if (a?.startsWith('ab:')) return this.rect(this.byId(a.slice(3)) || this.all()[0]);
      return baseArea();
    };
    ED.refresh = () => {
      const boards = this.all();
      if (ED.opts.area?.startsWith('ab:') && !this.byId(ED.opts.area.slice(3))) ED.opts.area = 'page';
      if (!this.list.length && ED.opts.area === 'all') ED.opts.area = 'page';
      ED.abChips.hidden = !this.list.length;
      ED.abChips.replaceChildren(...(this.list.length ? [
        ...boards.slice(1).map((a, i) => html(`<button class="chip" type="button" data-area="ab:${a.id}">${i + 2} · ${escapeHTML(a.name)}</button>`)),
        html('<button class="chip" type="button" data-area="all">Tous les plans</button>'),
      ] : []));
      ED.abChips.querySelectorAll('[data-area]').forEach((b) => b.addEventListener('click', () => { ED.opts.area = b.dataset.area; ED.refresh(); }));
      baseRefresh();
      ED.sheet.$('[data-area="page"]').textContent = this.list.length ? `1 · ${this.mainName}` : 'Page entière';
      if (ED.opts.area === 'all') ED.sheet.$('#export-size').textContent = `${boards.length} plans · ${ED.opts.format === 'pdf' ? 'un PDF de plusieurs pages' : 'un fichier ZIP'}`;
    };
    ED.run = async () => {
      if (ED.opts.area === 'all') {
        if (!Exporter.ensureContent()) return;
        const btn = ED.sheet.$('#export-go');
        btn.disabled = true;
        try { await this.exportAll(ED.opts); ED.sheet.close(); } catch (err) { console.error(err); toast(err.message || 'L\'export a échoué.', 'error'); } finally { btn.disabled = false; }
        return;
      }
      if (ED.opts.format === 'svg' && ED.opts.area?.startsWith('ab:')) {
        const url = URL.createObjectURL(new Blob([this.svgFor(ED.area())], { type: 'image/svg+xml;charset=utf-8' }));
        downloadURL(url, exportFileName('svg'));
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        ED.sheet.close();
        return;
      }
      await baseRun();
    };
  },
};

/* ---------- outil Plan de travail ---------- */
Tools.artboard = {
  cursor: 'crosshair',
  activate() { setInteractionMode('draw'); canvas.discardActiveObject(); canvas.requestRenderAll(); },
  deactivate() { cancelDrawing(); Artboards.drag = null; Artboards.hover = null; canvas.requestRenderAll(); },
  onMouseDown(p) {
    const hit = Artboards.list.slice().reverse().find((a) => p.x >= a.left && p.x <= a.left + a.width && p.y >= a.top && p.y <= a.top + a.height);
    if (hit) {
      // Le plan emporte les objets dont le centre est dessus
      const riders = canvas.getObjects().filter((o) => {
        const c = o.getCenterPoint();
        return c.x >= hit.left && c.x <= hit.left + hit.width && c.y >= hit.top && c.y <= hit.top + hit.height;
      });
      Artboards.drag = { board: hit, start: p, from: { left: hit.left, top: hit.top }, riders: riders.map((o) => ({ o, left: o.left, top: o.top })) };
      return;
    }
    Tools.quickcrop.onMouseDown.call(this, p);
  },
  onMouseMove(p, e) {
    const d = Artboards.drag;
    if (d) {
      const dx = Math.round(p.x - d.start.x);
      const dy = Math.round(p.y - d.start.y);
      d.board.left = d.from.left + dx;
      d.board.top = d.from.top + dy;
      d.riders.forEach((r) => { r.o.set({ left: r.left + dx, top: r.top + dy }); r.o.setCoords(); });
      canvas.requestRenderAll();
      return;
    }
    if (state.drawing) { Tools.quickcrop.onMouseMove.call(this, p, e); return; }
    const over = Artboards.list.find((a) => p.x >= a.left && p.x <= a.left + a.width && p.y >= a.top && p.y <= a.top + a.height) || null;
    if (over !== Artboards.hover) { Artboards.hover = over; canvas.requestRenderAll(); }
  },
  onMouseUp(p, e) {
    if (Artboards.drag) { Artboards.drag = null; Artboards.changed(); return; }
    if (!state.drawing) return;
    const { origin } = state.drawing;
    const box = getDragBox(origin, p, e.shiftKey);
    cancelDrawing();
    if (box.width < 16 || box.height < 16) return;
    const ab = { id: uid(), name: `Plan de travail ${Artboards.all().length + 1}`, ...Slices.round(box) };
    Artboards.list.push(ab);
    Artboards.changed();
  },
  options() {
    return html('<p class="field-note">Glissez dans le vide pour créer un plan de travail. Glissez un plan pour le déplacer avec son contenu. Le plan n° 1 (la page) reste en place : changez sa taille avec « Changer de format ».</p>');
  },
};

TOOL_LABELS.artboard = 'Plan de travail';

Hooks.on('init', () => {
  Doc.extras.artboards = { save: () => Artboards.save(), load: (v) => Artboards.load(v) };
  Artboards.mountUI();
  Artboards.extendExport();
  RailGroups.add('data', { tool: 'artboard', label: 'Plan de travail', icon: ARTBOARD_ICON, kbd: 'Maj O' });
  canvas.on('before:render', (e) => Artboards.drawBoards(e));
  canvas.on('after:render', (e) => Artboards.drawLabels(e));
  // Un objet seul s'aligne sur le plan qui le contient
  Arrange.pageRect = (obj) => Artboards.rect(Artboards.at(obj.getCenterPoint()));
  Hooks.on('snapTargets', ({ xs, ys }) => {
    Artboards.list.forEach((a) => {
      xs.push(a.left, a.left + a.width / 2, a.left + a.width);
      ys.push(a.top, a.top + a.height / 2, a.top + a.height);
    });
  });
  Hooks.on('change', () => Artboards.renderList());
  Keys.add((e, { mod, key }) => {
    if (!mod && !e.altKey && e.shiftKey && key === 'o') { e.preventDefault(); setTool('artboard'); return true; }
    if (mod && e.altKey && key === '0') { e.preventDefault(); Artboards.fitAll(); return true; }
    return false;
  });
});
