/**
 * ============================================================================
 *  Studio Chloé — Formats de page & exports
 *    1. Formats prédéfinis (réseaux sociaux, impression, écran) ou sur mesure
 *    2. Redimensionnement magique : le contenu s'adapte au nouveau format
 *       (sur la page actuelle, ou dans une copie du projet)
 *    3. Fenêtre d'export : PNG, JPG, WebP, SVG, PDF · 1× à 4× · page ou sélection
 * ============================================================================
 */
'use strict';

const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

/** dpi : 300 pour l'impression (taille physique correcte dans le PDF), 96 sinon */
const PAGE_FORMATS = [
  { group: 'Réseaux sociaux', label: 'Post Instagram', w: 1080, h: 1080 },
  { group: 'Réseaux sociaux', label: 'Instagram portrait', w: 1080, h: 1350 },
  { group: 'Réseaux sociaux', label: 'Story · Reel · TikTok', w: 1080, h: 1920 },
  { group: 'Réseaux sociaux', label: 'Épingle Pinterest', w: 1000, h: 1500 },
  { group: 'Réseaux sociaux', label: 'Post Facebook · LinkedIn', w: 1200, h: 630 },
  { group: 'Réseaux sociaux', label: 'Miniature YouTube', w: 1280, h: 720 },
  { group: 'Réseaux sociaux', label: 'Bannière LinkedIn', w: 1584, h: 396 },
  { group: 'Impression', label: 'A4 portrait', w: 2480, h: 3508, dpi: 300 },
  { group: 'Impression', label: 'A4 paysage', w: 3508, h: 2480, dpi: 300 },
  { group: 'Impression', label: 'A5 flyer', w: 1748, h: 2480, dpi: 300 },
  { group: 'Impression', label: 'Carte de visite', w: 1004, h: 650, dpi: 300 },
  { group: 'Impression', label: 'Carte postale', w: 1748, h: 1240, dpi: 300 },
  { group: 'Écran', label: 'Présentation 16:9', w: 1920, h: 1080 },
  { group: 'Écran', label: 'Fond d\'écran mobile', w: 1170, h: 2532 },
  { group: 'Écran', label: 'En-tête d\'e-mail', w: 600, h: 200 },
];

/** Libellé du format actuel (ou « Sur mesure ») */
function pageFormatLabel(page = state.page) {
  return PAGE_FORMATS.find((f) => f.w === page.width && f.h === page.height)?.label || 'Sur mesure';
}

/* ============================================================================
   1–2. FORMATS & REDIMENSIONNEMENT MAGIQUE
   ========================================================================== */

const PageFormat = {
  selected: null,

  /**
   * Adapte tous les objets d'une page old → new :
   * - les « fonds » (≥ 90 % de la page) sont étirés pour couvrir la nouvelle page
   *   (les images en gardant leurs proportions) ;
   * - les autres objets gardent leur position relative et sont mis à l'échelle
   *   uniformément (le plus petit des deux rapports), pour ne jamais déborder.
   */
  magicResize(oldPage, newPage) {
    const kx = newPage.width / oldPage.width;
    const ky = newPage.height / oldPage.height;
    const k = Math.min(kx, ky);
    canvas.discardActiveObject();
    canvas.getObjects().forEach((o) => {
      const b = o.getBoundingRect(true, true);
      const c = o.getCenterPoint();
      const target = new fabric.Point(c.x * kx, c.y * ky);
      const isBackground = b.width >= oldPage.width * 0.9 && b.height >= oldPage.height * 0.9;
      if (isBackground && isImage(o)) {
        const cover = Math.max(kx, ky);
        o.set({ scaleX: o.scaleX * cover, scaleY: o.scaleY * cover });
      } else if (isBackground && !isText(o)) {
        o.set({ scaleX: o.scaleX * kx, scaleY: o.scaleY * ky });
      } else {
        o.set({ scaleX: o.scaleX * k, scaleY: o.scaleY * k });
      }
      o.setPositionByOrigin(target, 'center', 'center');
      o.setCoords();
    });
  },

  /** Applique un format à la page courante */
  apply(format, { adapt = true } = {}) {
    const next = { width: Math.round(format.w), height: Math.round(format.h), ...(format.dpi ? { dpi: format.dpi } : {}) };
    if (adapt && canvas.getObjects().length) this.magicResize(state.page, next);
    state.page = next;
    Viewport.fit();
    updateStatus();
    canvas.requestRenderAll();
    History.commit();
    Page.sync();
    toast(`Format : ${pageFormatLabel()} (${next.width} × ${next.height})`, 'success');
  },

  /** Crée une copie du projet dans ce format (redimensionnement magique) */
  async duplicateAs(format) {
    if (!window.Projects?.createFromDoc) return toast('Les projets ne sont pas disponibles.', 'error');
    const original = Doc.serialize();
    const name = `${Projects.currentName()} — ${format.label || `${format.w} × ${format.h}`}`;
    this.apply(format, { adapt: true });
    const resized = Doc.serialize();
    // On restaure l'original, puis on ouvre la copie
    await Projects.saveNow(original);
    await Projects.createFromDoc(resized, name);
    toast('Copie créée dans le nouveau format', 'success');
  },

  open() {
    if (!this.sheet) this.build();
    this.selected = PAGE_FORMATS.find((f) => f.w === state.page.width && f.h === state.page.height) || null;
    this.sheet.$('#format-w').value = state.page.width;
    this.sheet.$('#format-h').value = state.page.height;
    this.highlight();
    this.sheet.open();
  },

  build() {
    const groups = [...new Set(PAGE_FORMATS.map((f) => f.group))];
    const card = (f, i) => {
      const ratio = f.w / f.h;
      const pw = ratio >= 1 ? 34 : Math.round(34 * ratio);
      const ph = ratio >= 1 ? Math.round(34 / ratio) : 34;
      return `<button class="card-btn" type="button" data-format="${i}">
        <span class="ratio-box"><span style="width:${pw}px;height:${ph}px"></span></span>
        ${escapeHTML(f.label)}<small>${f.w} × ${f.h}</small></button>`;
    };
    this.sheet = Sheet.create({
      title: 'Format de la page',
      body: `
        ${groups.map((g) => `<div><h3 class="sheet-section">${g}</h3><div class="grid-cards">
          ${PAGE_FORMATS.map((f, i) => (f.group === g ? card(f, i) : '')).join('')}</div></div>`).join('')}
        <div>
          <h3 class="sheet-section">Sur mesure (px)</h3>
          <div class="custom-size">
            <input class="input" type="number" id="format-w" min="16" max="10000" aria-label="Largeur">
            <button class="chip chip-icon" type="button" id="format-swap" title="Inverser largeur et hauteur" aria-label="Inverser">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg>
            </button>
            <input class="input" type="number" id="format-h" min="16" max="10000" aria-label="Hauteur">
          </div>
        </div>
        <label class="check check-strong"><input type="checkbox" id="format-adapt" checked> Adapter le contenu au nouveau format (redimensionnement magique)</label>`,
      foot: `
        <button class="btn" type="button" id="format-copy">Créer une copie dans ce format</button>
        <button class="btn btn-primary" type="button" id="format-apply">Appliquer</button>`,
    });
    const $s = this.sheet.$;
    this.sheet.$$('[data-format]').forEach((b) => b.addEventListener('click', () => {
      this.selected = PAGE_FORMATS[Number(b.dataset.format)];
      $s('#format-w').value = this.selected.w;
      $s('#format-h').value = this.selected.h;
      this.highlight();
    }));
    ['#format-w', '#format-h'].forEach((id) => $s(id).addEventListener('input', () => { this.selected = null; this.highlight(); }));
    $s('#format-swap').addEventListener('click', () => {
      const w = $s('#format-w').value;
      $s('#format-w').value = $s('#format-h').value;
      $s('#format-h').value = w;
      this.selected = null;
      this.highlight();
    });
    const chosen = () => {
      const w = clamp(Number($s('#format-w').value) || 0, 16, 10000);
      const h = clamp(Number($s('#format-h').value) || 0, 16, 10000);
      return this.selected && this.selected.w === w && this.selected.h === h ? this.selected : { w, h, label: `${w} × ${h}` };
    };
    $s('#format-apply').addEventListener('click', () => {
      this.apply(chosen(), { adapt: $s('#format-adapt').checked });
      this.sheet.close();
    });
    $s('#format-copy').addEventListener('click', () => {
      this.sheet.close();
      this.duplicateAs(chosen());
    });
  },

  highlight() {
    this.sheet.$$('[data-format]').forEach((b) => {
      b.classList.toggle('is-active', PAGE_FORMATS[Number(b.dataset.format)] === this.selected);
    });
  },
};

/** Tuile « Page » du panneau (visible sans sélection) */
const Page = {
  mount() {
    this.el = html(`
      <section class="tile" id="section-page">
        <div class="feature-head">
          <div>
            <h3>Page</h3>
            <p class="field-note" id="page-format-note"></p>
          </div>
        </div>
        <button class="btn btn-block" type="button" id="btn-page-format">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h16M9 4v16"/></svg>
          Changer de format
        </button>
      </section>`);
    $('#panel-hint').after(this.el);
    this.el.querySelector('#btn-page-format').addEventListener('click', () => PageFormat.open());
    // La taille de la page dans la barre d'état ouvre aussi la fenêtre
    const status = dom.statusSize.closest('.status-item');
    status.classList.add('is-clickable');
    status.setAttribute('role', 'button');
    status.tabIndex = 0;
    status.title = 'Changer le format de la page';
    status.addEventListener('click', () => PageFormat.open());
    status.addEventListener('keydown', (e) => { if (e.key === 'Enter') PageFormat.open(); });
    Hooks.on('sync', ({ hasSelection }) => { this.el.hidden = hasSelection || Boolean(state.cropping); this.sync(); });
    Hooks.on('docLoaded', () => this.sync());
  },
  sync() {
    this.el.querySelector('#page-format-note').textContent = `${pageFormatLabel()} · ${state.page.width} × ${state.page.height} px`;
  },
};

/* ============================================================================
   3. EXPORTS
   ========================================================================== */

const EXPORT_FORMATS = {
  png: { label: 'PNG', note: 'Transparence possible' },
  jpeg: { label: 'JPG', note: 'Léger, idéal photo' },
  webp: { label: 'WebP', note: 'Très léger, web' },
  svg: { label: 'SVG', note: 'Vectoriel' },
  pdf: { label: 'PDF', note: 'Impression' },
};

const ExportDialog = {
  opts: { format: 'png', scale: 2, area: 'page', transparent: false },

  open() {
    if (!this.sheet) this.build();
    if (state.cropping) Cropper.cancel();
    const print = Boolean(state.page.dpi);
    this.opts.scale = print ? 1 : this.opts.scale;
    this.opts.area = canvas.getActiveObject() && this.opts.area === 'selection' ? 'selection' : 'page';
    this.opts.transparent = dom.exportTransparent.checked;
    this.refresh();
    this.sheet.open();
  },

  build() {
    this.sheet = Sheet.create({
      title: 'Exporter',
      body: `
        <div><h3 class="sheet-section">Format</h3><div class="grid-cards grid-cards-sm">
          ${Object.entries(EXPORT_FORMATS).map(([k, f]) => `<button class="card-btn" type="button" data-export="${k}"><strong>${f.label}</strong><small>${f.note}</small></button>`).join('')}
        </div></div>
        <div id="export-scale-row"><h3 class="sheet-section">Résolution</h3><div class="chips" id="export-scales">
          ${[1, 2, 3, 4].map((m) => `<button class="chip" type="button" data-scale="${m}">${m}×</button>`).join('')}
        </div><p class="field-note" id="export-size"></p></div>
        <div><h3 class="sheet-section">Zone</h3><div class="chips">
          <button class="chip" type="button" data-area="page">Page entière</button>
          <button class="chip" type="button" data-area="selection" id="export-area-sel">Sélection seulement</button>
        </div></div>
        <label class="check check-strong" id="export-transp-row"><input type="checkbox" id="export-transp"> Fond transparent</label>`,
      foot: '<button class="btn btn-primary" type="button" id="export-go">Télécharger</button>',
    });
    const { $, $$ } = this.sheet;
    $$('[data-export]').forEach((b) => b.addEventListener('click', () => { this.opts.format = b.dataset.export; this.refresh(); }));
    $$('[data-scale]').forEach((b) => b.addEventListener('click', () => { this.opts.scale = Number(b.dataset.scale); this.refresh(); }));
    $$('[data-area]').forEach((b) => b.addEventListener('click', () => { this.opts.area = b.dataset.area; this.refresh(); }));
    $('#export-transp').addEventListener('change', (e) => {
      this.opts.transparent = e.target.checked;
      dom.exportTransparent.checked = e.target.checked; // même réglage que l'interrupteur de la barre
    });
    $('#export-go').addEventListener('click', () => this.run());
  },

  area() {
    if (this.opts.area !== 'selection') return Exporter.pageArea();
    const b = canvas.getActiveObject().getBoundingRect(true, true);
    const pad = 2;
    return { left: b.left - pad, top: b.top - pad, width: b.width + pad * 2, height: b.height + pad * 2 };
  },

  refresh() {
    const { $, $$ } = this.sheet;
    const { format, scale, transparent } = this.opts;
    const hasSel = Boolean(canvas.getActiveObject());
    if (!hasSel && this.opts.area === 'selection') this.opts.area = 'page';
    $$('[data-export]').forEach((b) => b.classList.toggle('is-active', b.dataset.export === format));
    $$('[data-scale]').forEach((b) => b.classList.toggle('is-active', Number(b.dataset.scale) === scale));
    $$('[data-area]').forEach((b) => b.classList.toggle('is-active', b.dataset.area === this.opts.area));
    $('#export-area-sel').disabled = !hasSel;
    $('#export-scale-row').hidden = format === 'svg';
    $('#export-transp-row').hidden = format === 'jpeg';
    $('#export-transp').checked = transparent;
    const a = this.area();
    $('#export-size').textContent = `${Math.round(a.width * scale)} × ${Math.round(a.height * scale)} px`;
  },

  async run() {
    if (!Exporter.ensureContent()) return;
    const { format, scale, transparent } = this.opts;
    const area = this.area();
    const btn = this.sheet.$('#export-go');
    btn.disabled = true;
    try {
      if (format === 'svg') {
        Exporter.svg();
      } else if (format === 'pdf') {
        await this.pdf(area, scale, transparent);
      } else {
        let url = Exporter.toDataURL({ format, multiplier: scale, transparent, area });
        // Safari ne sait pas toujours encoder le WebP : repli en PNG
        if (format === 'webp' && !url.startsWith('data:image/webp')) {
          toast('WebP non pris en charge par ce navigateur : export en PNG.');
          downloadURL(url, exportFileName('png'));
        } else {
          downloadURL(url, exportFileName(format === 'jpeg' ? 'jpg' : format));
        }
      }
      this.sheet.close();
    } catch (err) {
      console.error(err);
      toast(err.message || "L'export a échoué.", 'error');
    } finally {
      btn.disabled = false;
    }
  },

  /** PDF d'une page à la taille réelle (300 dpi pour les formats d'impression) */
  async pdf(area, scale, transparent) {
    toast('Préparation du PDF…');
    await loadScript(JSPDF_URL);
    const { jsPDF } = window.jspdf;
    const dpi = state.page.dpi || 96;
    const wPt = (area.width * 72) / dpi;
    const hPt = (area.height * 72) / dpi;
    const doc = new jsPDF({ orientation: wPt >= hPt ? 'landscape' : 'portrait', unit: 'pt', format: [wPt, hPt], compress: true });
    const fmt = transparent ? 'png' : 'jpeg';
    const url = Exporter.toDataURL({ format: fmt, multiplier: scale, transparent, area, quality: 0.95 });
    doc.addImage(url, fmt === 'png' ? 'PNG' : 'JPEG', 0, 0, wPt, hPt, undefined, 'FAST');
    doc.save(exportFileName('pdf'));
  },
};

Hooks.on('init', () => {
  Page.mount();
  // La puce « SVG » de la barre devient « Formats » (tous les formats d'export)
  dom.btnExportSvg.textContent = 'Formats';
  dom.btnExportSvg.title = 'PNG, JPG, WebP, SVG, PDF · résolution · sélection seule';
  dom.btnExportSvg.replaceWith(dom.btnExportSvg.cloneNode(true)); // retire l'ancien écouteur
  dom.btnExportSvg = $('#btn-export-svg');
  dom.btnExportSvg.addEventListener('click', () => ExportDialog.open());

  Keys.add((e, { mod, key }) => {
    if (mod && !e.altKey && key === 'e') { e.preventDefault(); ExportDialog.open(); return true; }
    return false;
  });
});
