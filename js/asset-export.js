/**
 * ============================================================================
 *  Studio Chloé — Exporter les éléments (multi-tailles), ⌘⌥E
 *
 *  Comme le panneau Exportation des éléments d'Illustrator :
 *    - « + Ajouter la sélection » : chaque objet sélectionné devient un
 *      élément (nom modifiable, retiré d'un clic) ; il reste marqué dans le
 *      document (obj.assetName) ;
 *    - réglages d'export : autant de tailles que voulu (échelle 0,5× à 4×,
 *      suffixe « @2x », format PNG / JPG / WebP / SVG), préréglages
 *      iOS, Android, Web ;
 *    - « Exporter » : chaque élément seul (sans ce qui l'entoure), recadré au
 *      plus juste, fond transparent (blanc en JPG) ; un seul fichier se
 *      télécharge tel quel, plusieurs partent dans un ZIP (JSZip).
 *  Accès : fenêtre Exporter › « Éléments multi-tailles… » ou ⌘⌥E.
 * ============================================================================
 */
'use strict';

const ASSET_FORMATS = { png: 'PNG', jpeg: 'JPG', webp: 'WebP', svg: 'SVG' };
const ASSET_PRESETS = {
  web: { label: 'Web', sizes: [[1, '', 'png'], [2, '@2x', 'png']] },
  ios: { label: 'iOS', sizes: [[1, '', 'png'], [2, '@2x', 'png'], [3, '@3x', 'png']] },
  android: { label: 'Android', sizes: [[1, '-mdpi', 'png'], [1.5, '-hdpi', 'png'], [2, '-xhdpi', 'png'], [3, '-xxhdpi', 'png'], [4, '-xxxhdpi', 'png']] },
  svg: { label: 'SVG seul', sizes: [[1, '', 'svg']] },
};

const AssetExport = {
  sizes: [{ scale: 1, suffix: '', format: 'png' }, { scale: 2, suffix: '@2x', format: 'png' }],

  assets() { return canvas.getObjects().filter((o) => o.assetName && !o.excludeFromExport); },

  add() {
    const objs = canvas.getActiveObjects().filter((o) => !o.excludeFromExport);
    if (!objs.length) { toast('Sélectionnez les objets à exporter comme éléments.'); return []; }
    let n = this.assets().length;
    objs.forEach((o) => {
      if (o.assetName) return;
      n += 1;
      o.assetName = (o.name || `element-${n}`).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || `element-${n}`;
    });
    History.queue();
    this.render();
    return objs;
  },

  remove(o) { delete o.assetName; History.queue(); this.render(); },

  /** Zone d'un élément (document), contour et ombre compris */
  area(o) {
    // coins réels (valable aussi dans une sélection multiple, où les positions sont relatives)
    const d = o._getNonTransformedDimensions();
    const m = o.calcTransformMatrix();
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => fabric.util.transformPoint({ x: (sx * d.x) / 2, y: (sy * d.y) / 2 }, m));
    const b = fabric.util.makeBoundingBoxFromPoints(pts);
    const sh = o.shadow ? Math.abs(o.shadow.blur || 0) + Math.max(Math.abs(o.shadow.offsetX || 0), Math.abs(o.shadow.offsetY || 0)) : 0;
    const pad = 1 + sh;
    return { left: Math.floor(b.left - pad), top: Math.floor(b.top - pad), width: Math.ceil(b.width + pad * 2), height: Math.ceil(b.height + pad * 2) };
  },

  /** Exécute fn avec l'élément seul visible (et seul exporté en SVG) */
  alone(o, fn) {
    const saved = canvas.getObjects().map((x) => [x, x.visible, x.excludeFromExport]);
    canvas.getObjects().forEach((x) => { if (x !== o) { x.visible = false; x.excludeFromExport = true; } });
    try { return fn(); } finally { saved.forEach(([x, v, ex]) => { x.visible = v; x.excludeFromExport = ex; }); canvas.requestRenderAll(); }
  },

  render1(o, size) {
    const area = this.area(o);
    if (size.format === 'svg') {
      return this.alone(o, () => {
        const svg = canvas.toSVG({ viewBox: { x: area.left, y: area.top, width: area.width, height: area.height }, width: area.width * size.scale, height: area.height * size.scale });
        return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(typeof SvgOptimizer !== 'undefined' && SvgOptimizer.enabled ? SvgOptimizer.run(svg) : svg)))}`;
      });
    }
    return this.alone(o, () => Exporter.toDataURL({ format: size.format, multiplier: size.scale, transparent: size.format !== 'jpeg', area, quality: 0.92 }));
  },

  files() {
    const out = [];
    const used = new Set();
    this.assets().forEach((o) => this.sizes.forEach((s) => {
      const ext = s.format === 'jpeg' ? 'jpg' : s.format;
      let name = `${o.assetName}${s.suffix}.${ext}`;
      for (let k = 2; used.has(name); k++) name = `${o.assetName}${s.suffix}-${k}.${ext}`;
      used.add(name);
      out.push({ name, url: this.render1(o, s) });
    }));
    return out;
  },

  async export() {
    if (!this.assets().length) { toast('Ajoutez d\'abord des éléments (sélection puis « + Ajouter la sélection »).'); return null; }
    if (!this.sizes.length) { toast('Ajoutez au moins une taille d\'export.'); return null; }
    if (typeof Isolation !== 'undefined') Isolation.exitAll();
    canvas.discardActiveObject();
    const files = this.files();
    if (files.length === 1) { downloadURL(files[0].url, files[0].name); return files; }
    try {
      await loadScript(JSZIP_URL);
      const zip = new window.JSZip();
      files.forEach((f) => zip.file(f.name, f.url.split(',')[1], { base64: true }));
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      downloadURL(url, exportFileName('zip').replace('studio-chloe', 'elements'));
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      files.forEach((f) => downloadURL(f.url, f.name)); // hors ligne : un fichier par taille
    }
    toast(`${files.length} fichiers exportés.`, 'success');
    return files;
  },

  open() {
    if (!this.sheet) this.build();
    this.render();
    this.sheet.open();
  },

  build() {
    this.sheet = Sheet.create({
      title: 'Exporter les éléments',
      wide: true,
      body: `
        <div class="asset-cols">
          <div>
            <div class="feature-head"><h3 class="sheet-section">Éléments</h3><button class="btn btn-sm" type="button" id="asset-add">+ Ajouter la sélection</button></div>
            <ul class="asset-list" id="asset-list"></ul>
          </div>
          <div>
            <h3 class="sheet-section">Tailles et formats</h3>
            <div class="chips" id="asset-presets">${Object.entries(ASSET_PRESETS).map(([k, p]) => `<button class="chip" type="button" data-preset="${k}">${p.label}</button>`).join('')}</div>
            <ul class="asset-sizes" id="asset-sizes"></ul>
            <button class="btn btn-sm" type="button" id="asset-size-add">+ Ajouter une taille</button>
          </div>
        </div>`,
      foot: '<span class="field-note" id="asset-count"></span><button class="btn" type="button" data-close>Fermer</button><button class="btn btn-primary" type="button" id="asset-go">Exporter</button>',
    });
    const { $, $$ } = this.sheet;
    $('#asset-add').addEventListener('click', () => this.add());
    $('#asset-size-add').addEventListener('click', () => {
      const last = this.sizes[this.sizes.length - 1] || { scale: 1, format: 'png' };
      const scale = Math.min(4, last.scale + 1);
      this.sizes.push({ scale, suffix: `@${scale}x`, format: last.format });
      this.renderSizes();
    });
    $$('[data-preset]').forEach((b) => b.addEventListener('click', () => {
      this.sizes = ASSET_PRESETS[b.dataset.preset].sizes.map(([scale, suffix, format]) => ({ scale, suffix, format }));
      this.renderSizes();
    }));
    $('#asset-go').addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      try { await this.export(); } finally { $('#asset-go').disabled = false; }
    });
    this.sheet.el.addEventListener('keydown', (e) => e.stopPropagation());
  },

  render() {
    if (!this.sheet) return;
    const ul = this.sheet.$('#asset-list');
    const list = this.assets();
    ul.replaceChildren(...list.map((o) => {
      const li = html(`<li class="asset-item">
        <img alt="" width="44" height="44">
        <input class="input input-sm" type="text" maxlength="60" aria-label="Nom du fichier">
        <button class="layer-btn" type="button" title="Retirer des éléments" aria-label="Retirer"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </li>`);
      try { li.querySelector('img').src = this.render1(o, { scale: Math.min(1, 88 / Math.max(this.area(o).width, this.area(o).height)), format: 'png' }); } catch { /* aperçu facultatif */ }
      const input = li.querySelector('input');
      input.value = o.assetName;
      input.addEventListener('change', () => { o.assetName = input.value.trim().replace(/[\\/:*?"<>|]+/g, '-') || o.assetName; History.queue(); this.render(); });
      li.querySelector('button').addEventListener('click', () => this.remove(o));
      return li;
    }));
    if (!list.length) ul.replaceChildren(html('<li class="field-note">Aucun élément : sélectionnez des objets sur la page puis « + Ajouter la sélection ».</li>'));
    this.renderSizes();
  },

  renderSizes() {
    const ul = this.sheet.$('#asset-sizes');
    ul.replaceChildren(...this.sizes.map((s, i) => {
      const li = html(`<li class="asset-size">
        <select class="input input-sm" data-k="scale" aria-label="Échelle">${[0.5, 0.75, 1, 1.5, 2, 3, 4].map((v) => `<option value="${v}"${v === s.scale ? ' selected' : ''}>${String(v).replace('.', ',')}×</option>`).join('')}</select>
        <input class="input input-sm" type="text" data-k="suffix" maxlength="20" placeholder="suffixe" aria-label="Suffixe">
        <select class="input input-sm" data-k="format" aria-label="Format">${Object.entries(ASSET_FORMATS).map(([k, l]) => `<option value="${k}"${k === s.format ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <button class="layer-btn" type="button" title="Retirer cette taille" aria-label="Retirer"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </li>`);
      li.querySelector('[data-k="suffix"]').value = s.suffix;
      li.querySelectorAll('[data-k]').forEach((el) => el.addEventListener('change', () => {
        const k = el.dataset.k;
        s[k] = k === 'scale' ? Number(el.value) : el.value;
        this.count();
      }));
      li.querySelector('button').addEventListener('click', () => { this.sizes.splice(i, 1); this.renderSizes(); });
      return li;
    }));
    this.count();
  },

  count() {
    const n = this.assets().length * this.sizes.length;
    this.sheet.$('#asset-count').textContent = n ? `${n} fichier${n > 1 ? 's' : ''} à exporter` : '';
  },

  save() { return { sizes: this.sizes.map((s) => ({ ...s })) }; },
  load(v) { if (Array.isArray(v?.sizes) && v.sizes.length) this.sizes = v.sizes.map((s) => ({ ...s })); this.render(); },
};

SERIAL_PROPS.push('assetName');

Hooks.on('init', () => {
  Doc.extras.assetExport = { save: () => AssetExport.save(), load: (v) => AssetExport.load(v) };
  // Bouton dans la fenêtre Exporter
  const baseBuild = ExportDialog.build.bind(ExportDialog);
  ExportDialog.build = () => {
    baseBuild();
    const btn = html('<button class="btn" type="button" id="export-assets" title="Exporter des éléments séparés en plusieurs tailles (⌘⌥E)">Éléments multi-tailles…</button>');
    ExportDialog.sheet.foot.prepend(btn);
    btn.addEventListener('click', () => { ExportDialog.sheet.close(); AssetExport.open(); });
  };
  Keys.add((e, { mod }) => {
    if (mod && e.altKey && !e.shiftKey && e.code === 'KeyE') { e.preventDefault(); AssetExport.open(); return true; }
    return false;
  });
});
