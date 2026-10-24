/**
 * ============================================================================
 *  Chloe’s Touch — Import / export avancés
 *    - Glisser-déposer (ou bouton Importer) de fichiers SVG : ils arrivent en
 *      vrais vecteurs (groupe de formes modifiables).
 *    - Ouvrir des PDF et des .ai récents (enregistrés « compatibles PDF ») :
 *      pdf.js (Mozilla, Apache-2.0) ; chaque page devient un plan de travail ;
 *      contenu importé en vecteurs (opérateur SVG de pdf.js) ou, au choix,
 *      en image haute définition.
 *    - Export SVG optimisé : nombres arrondis, styles par défaut et
 *      commentaires retirés (case « SVG optimisé » de la fenêtre d'export).
 * ============================================================================
 */
'use strict';

const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

const isSVGFile = (f) => f.type === 'image/svg+xml' || /\.svg$/i.test(f.name);
const isPDFFile = (f) => f.type === 'application/pdf' || /\.(pdf|ai)$/i.test(f.name);

/* ---------- SVG ---------- */
const SVGImport = {
  /** Place un SVG (texte) centré sur le point donné, au plus 60 % de la vue */
  place(text, point = Viewport.center(), name = 'SVG importé') {
    return new Promise((resolve, reject) => {
      fabric.loadSVGFromString(text, (objects, options) => {
        if (!objects?.length) { reject(new Error('SVG vide ou illisible.')); return; }
        const obj = fabric.util.groupSVGElements(objects.filter(Boolean), options);
        const view = Viewport.visibleBounds();
        const scale = Math.min(1, (view.width * IMAGE_MAX_RATIO) / (obj.width || 1), (view.height * IMAGE_MAX_RATIO) / (obj.height || 1));
        obj.set({ scaleX: scale, scaleY: scale, name });
        obj.setPositionByOrigin(new fabric.Point(point.x, point.y), 'center', 'center');
        canvas.add(obj);
        resolve(obj);
      });
    });
  },
};

/* ---------- PDF / AI ---------- */
const PdfImport = {
  async lib() {
    await loadScript(PDFJS_URL);
    const lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    return lib;
  },

  /** Demande le mode d'import, puis importe */
  ask(file) {
    return new Promise((resolve) => {
      const sheet = Sheet.create({
        title: `Ouvrir « ${file.name} »`,
        body: `<p class="field-note">Chaque page devient un plan de travail.</p>
          <div class="grid-cards grid-cards-sm">
            <button class="card-btn is-active" type="button" data-mode="vector"><strong>Vecteurs</strong><small>Formes et textes modifiables (expérimental)</small></button>
            <button class="card-btn" type="button" data-mode="image"><strong>Image</strong><small>Rendu fidèle haute définition</small></button>
          </div>`,
        foot: '<button class="btn btn-primary" type="button" id="pdf-go">Importer</button>',
      });
      let mode = 'vector';
      sheet.$$('[data-mode]').forEach((b) => b.addEventListener('click', () => {
        mode = b.dataset.mode;
        sheet.$$('[data-mode]').forEach((x) => x.classList.toggle('is-active', x === b));
      }));
      sheet.$('#pdf-go').addEventListener('click', () => { sheet.close(); resolve(mode); });
      sheet.el.addEventListener('close', () => { sheet.el.remove(); resolve(null); });
      sheet.open();
    });
  },

  async open(file, forcedMode) {
    const mode = forcedMode || await this.ask(file);
    if (!mode) return;
    toast('Lecture du PDF…', 'info', 8000);
    try {
      const lib = await this.lib();
      const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      const empty = !canvas.getObjects().length && !Artboards.list.length;
      const placed = [];
      for (let n = 1; n <= pdf.numPages; n += 1) {
        const page = await pdf.getPage(n);
        const vp = page.getViewport({ scale: 1 });
        const w = Math.round(vp.width);
        const h = Math.round(vp.height);
        let board;
        if (empty && n === 1) {
          state.page = { width: w, height: h };
          Artboards.mainName = `${file.name.replace(/\.[^.]+$/, '')} — p. 1`;
          board = Artboards.all()[0];
        } else {
          const right = Math.max(...Artboards.all().map((a) => a.left + a.width));
          board = { id: uid(), name: `${file.name.replace(/\.[^.]+$/, '')} — p. ${n}`, left: right + ARTBOARD_GAP, top: 0, width: w, height: h };
          Artboards.list.push(board);
        }
        let obj = null;
        if (mode === 'vector') {
          try { obj = await this.vectorPage(lib, page, vp); } catch (err) { console.warn('[PDF] vecteurs indisponibles, repli en image', err); }
        }
        if (obj) {
          // Vecteurs : coordonnées de la page (1 pt = 1 px), simplement décalées sur le plan
          obj.set({ left: obj.left + board.left, top: obj.top + board.top });
        } else {
          obj = await this.imagePage(page);
          obj.set({ scaleX: vp.width / obj.width, scaleY: vp.height / obj.height, strokeWidth: 0 });
          obj.set({ left: board.left, top: board.top, originX: 'left', originY: 'top' });
        }
        obj.set({ name: `Page ${n}` });
        canvas.add(obj);
        obj.setCoords();
        placed.push(obj);
      }
      updateStatus();
      Artboards.renderList();
      Page.sync?.();
      canvas.requestRenderAll();
      History.queue();
      if (Artboards.list.length) Artboards.fitAll(); else Viewport.fit();
      toast(`${pdf.numPages} page${pdf.numPages > 1 ? 's' : ''} importée${pdf.numPages > 1 ? 's' : ''}`, 'success');
    } catch (err) {
      console.error('[PDF]', err);
      toast(/password/i.test(err?.name || '') ? 'PDF protégé par mot de passe : impossible de l\'ouvrir.' : 'Ce fichier n\'a pas pu être lu (un .ai doit être enregistré avec « Créer un fichier compatible PDF »).', 'error', 7000);
    }
  },

  async vectorPage(lib, page, vp) {
    if (!lib.SVGGraphics) throw new Error('SVGGraphics absent');
    const ops = await page.getOperatorList();
    const gfx = new lib.SVGGraphics(page.commonObjs, page.objs);
    gfx.embedFonts = true;
    const svgEl = await gfx.getSVG(ops, vp);
    const text = new XMLSerializer().serializeToString(svgEl);
    return new Promise((resolve, reject) => {
      fabric.loadSVGFromString(text, (objects, options) => {
        const list = (objects || []).filter(Boolean);
        if (!list.length) { reject(new Error('page vide')); return; }
        resolve(new fabric.Group(list));
      });
    });
  },

  async imagePage(page) {
    const vp = page.getViewport({ scale: 2 });
    const c = document.createElement('canvas');
    c.width = Math.ceil(vp.width);
    c.height = Math.ceil(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    return loadFabricImage(c.toDataURL('image/png'));
  },
};

/* ---------- SVG optimisé ---------- */
const SvgOptimizer = {
  enabled: true,
  DEFAULTS: [
    'stroke-dasharray: none;', 'stroke-dashoffset: 0;', 'stroke-linejoin: miter;', 'stroke-miterlimit: 4;',
    'fill-rule: nonzero;', 'opacity: 1;', 'stroke-linecap: butt;', 'stroke: none;', 'stroke-width: 0;',
  ],
  run(svg) {
    let out = svg
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<desc>Created with Fabric\.js[^<]*<\/desc>/g, '')
      .replace(/-?\d+\.\d{3,}/g, (n) => String(Math.round(Number(n) * 100) / 100))
      .replace(/transform="matrix\(1 0 0 1 (-?[\d.]+) (-?[\d.]+)\)"/g, 'transform="translate($1 $2)"')
      .replace(/ transform="translate\(0 0\)"/g, '');
    this.DEFAULTS.forEach((d) => { out = out.split(` ${d}`).join('').split(d).join(''); });
    out = out
      .replace(/ style="\s*"/g, '')
      .replace(/>\s+</g, '><')
      .replace(/\n\s*\n/g, '\n');
    return out;
  },
};

Hooks.on('init', () => {
  // Formats acceptés par le bouton Importer
  dom.fileInput.accept = 'image/png,image/jpeg,image/webp,image/svg+xml,.svg,application/pdf,.pdf,.ai';
  dom.btnImport.title = 'Importer une image, un SVG, un PDF ou un .ai (I)';
  const overlay = $('.drop-overlay span:last-child');
  if (overlay) overlay.textContent = 'Déposez une image, un SVG, un PDF ou un .ai';

  // Les SVG et PDF passent par leurs importeurs, le reste par l'import d'images
  const baseImport = ImageImporter.importFiles.bind(ImageImporter);
  ImageImporter.importFiles = async (fileList, dropPoint = null) => {
    const files = [...fileList];
    const svgs = files.filter(isSVGFile);
    const pdfs = files.filter(isPDFFile);
    const images = files.filter((f) => !isSVGFile(f) && !isPDFFile(f));
    const placed = [];
    for (const [i, f] of svgs.entries()) {
      try {
        const p = dropPoint ? { x: dropPoint.x + i * 24, y: dropPoint.y + i * 24 } : undefined;
        placed.push(await SVGImport.place(await f.text(), p, f.name.replace(/\.svg$/i, '')));
      } catch (err) { console.error(err); toast(`Impossible de lire « ${f.name} ».`, 'error'); }
    }
    if (placed.length) { setTool('select'); Arrange.reselect(placed); canvas.requestRenderAll(); refreshFonts(); }
    for (const f of pdfs) await PdfImport.open(f);
    if (images.length) await baseImport(images, dropPoint);
  };

  // Export SVG optimisé (réglage de la fenêtre d'export)
  const baseToSVG = Exporter.toSVG.bind(Exporter);
  Exporter.toSVG = (transparent) => {
    const svg = baseToSVG(transparent);
    return SvgOptimizer.enabled ? SvgOptimizer.run(svg) : svg;
  };
  const baseSvgFor = Artboards.svgFor.bind(Artboards);
  Artboards.svgFor = (area) => {
    const svg = baseSvgFor(area);
    return SvgOptimizer.enabled ? SvgOptimizer.run(svg) : svg;
  };
  const ED = ExportDialog;
  const baseBuild = ED.build.bind(ED);
  const baseRefresh = ED.refresh.bind(ED);
  ED.build = () => {
    baseBuild();
    const row = html('<label class="check check-strong" id="export-svgopt-row"><input type="checkbox" id="export-svgopt" checked> SVG optimisé (fichier plus léger)</label>');
    ED.sheet.$('#export-transp-row').after(row);
    row.querySelector('input').addEventListener('change', (e) => { SvgOptimizer.enabled = e.target.checked; });
  };
  ED.refresh = () => {
    baseRefresh();
    ED.sheet.$('#export-svgopt-row').hidden = ED.opts.format !== 'svg';
    ED.sheet.$('#export-svgopt').checked = SvgOptimizer.enabled;
  };
});
