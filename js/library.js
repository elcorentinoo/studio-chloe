/**
 * ============================================================================
 *  Studio Chloé — Bibliothèque
 *    1. Modèles prêts à l'emploi (ouverts dans un nouveau projet)
 *    2. Icônes (Lucide, ~200, recherche en français)
 *    3. Stickers (créations originales aux couleurs de la marque)
 *    4. Vectorisation d'une image (bitmap → formes vectorielles)
 * ============================================================================
 */
'use strict';

const IMAGETRACER_URL = 'https://cdn.jsdelivr.net/npm/imagetracerjs@1.2.6/imagetracer_v1.2.6.js';
const LIB = { lime: '#d4f04c', olive: '#25300b', moss: '#7c9425', cream: '#f4f2e4', pink: '#e0457b', ink: '#1e1e1e', white: '#ffffff' };

/* ============================================================================
   1. MODÈLES
   ----------------------------------------------------------------------------
   Chaque modèle est un petit document (page + objets au format JSON Fabric),
   construit avec les aides R (rectangle), C (cercle), T (texte), P (polygone).
   ========================================================================== */

const R = (left, top, width, height, fill, extra = {}) => ({ type: 'rect', left, top, width, height, fill, strokeWidth: 0, ...extra });
const C = (cx, cy, r, fill, extra = {}) => ({ type: 'circle', left: cx - r, top: cy - r, radius: r, fill, strokeWidth: 0, ...extra });
const T = (text, left, top, opts = {}) => ({
  type: 'textbox', text, left, top,
  width: opts.width || 900,
  fontFamily: opts.font || 'Outfit',
  fontSize: opts.size || 48,
  fontWeight: opts.weight || 'normal',
  fontStyle: opts.style || 'normal',
  fill: opts.fill || LIB.olive,
  textAlign: opts.align || 'left',
  lineHeight: opts.lineHeight || 1.1,
  charSpacing: opts.spacing || 0,
  styles: [], // obligatoire avec Fabric 5.3 (sinon erreur à l'enregistrement)
  ...(opts.extra || {}),
});
const P = (points, fill, extra = {}) => ({ type: 'polygon', points, fill, strokeWidth: 0, ...extra });
const starPoints = (cx, cy, r1, r2, n) => Array.from({ length: n * 2 }, (_, i) => {
  const a = -Math.PI / 2 + (i * Math.PI) / n;
  const r = i % 2 ? r2 : r1;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
});
const linear = (c1, c2, angle = 90) => {
  const a = (angle * Math.PI) / 180;
  return { type: 'linear', gradientUnits: 'percentage', coords: { x1: 0.5 - Math.cos(a) / 2, y1: 0.5 - Math.sin(a) / 2, x2: 0.5 + Math.cos(a) / 2, y2: 0.5 + Math.sin(a) / 2 }, colorStops: [{ offset: 0, color: c1 }, { offset: 1, color: c2 }] };
};
/** Zone photo : rectangle en pointillés à remplacer (glisser une image dessus) */
const photoSlot = (left, top, width, height, label = 'Glissez une photo ici') => ([
  R(left, top, width, height, 'rgba(37,48,11,0.06)', { stroke: LIB.moss, strokeWidth: 3, strokeDashArray: [14, 10], rx: 24, ry: 24, name: 'Zone photo' }),
  T(label, left, top + height / 2 - 20, { width, size: Math.max(22, Math.round(width / 22)), fill: LIB.moss, align: 'center', font: 'Inter' }),
]);

const TEMPLATES = [
  {
    name: 'Citation', tags: 'post instagram', page: { width: 1080, height: 1080 },
    objects: [
      R(0, 0, 1080, 1080, LIB.cream, { name: 'Fond' }),
      C(900, 170, 260, LIB.lime),
      T('“', 110, 150, { font: 'Playfair Display', size: 300, fill: LIB.moss, width: 200 }),
      T('La simplicité est la sophistication suprême.', 120, 420, { font: 'Playfair Display', style: 'italic', size: 76, width: 840, lineHeight: 1.15 }),
      R(120, 760, 90, 6, LIB.olive),
      T('Léonard de Vinci', 120, 795, { font: 'Inter', size: 32, fill: LIB.moss, width: 600 }),
    ],
  },
  {
    name: 'Soldes', tags: 'promo post instagram', page: { width: 1080, height: 1080 },
    objects: [
      R(0, 0, 1080, 1080, LIB.olive, { name: 'Fond' }),
      P(starPoints(540, 470, 420, 330, 18), LIB.lime),
      T('SOLDES', 140, 250, { font: 'Bebas Neue', size: 230, fill: LIB.olive, width: 800, align: 'center' }),
      T('-50 %', 140, 470, { font: 'Archivo Black', size: 170, fill: LIB.olive, width: 800, align: 'center' }),
      T('sur toute la boutique · jusqu\'au 30 novembre', 140, 930, { font: 'Inter', size: 34, fill: LIB.cream, width: 800, align: 'center' }),
    ],
  },
  {
    name: 'Story événement', tags: 'story reel', page: { width: 1080, height: 1920 },
    objects: [
      R(0, 0, 1080, 1920, linear(LIB.lime, LIB.moss), { name: 'Fond' }),
      C(980, 220, 300, 'rgba(255,255,255,0.25)'),
      C(80, 1700, 360, 'rgba(37,48,11,0.18)'),
      T('SOIRÉE', 90, 420, { font: 'Bebas Neue', size: 260, width: 900 }),
      T('D\'AUTOMNE', 90, 640, { font: 'Bebas Neue', size: 200, fill: LIB.cream, width: 900 }),
      T('Samedi 15 novembre · 19 h', 90, 900, { font: 'Inter', size: 50, weight: 'bold', width: 900 }),
      R(90, 1440, 900, 260, 'rgba(255,255,255,0.88)', { rx: 48, ry: 48 }),
      T('Infos & réservations\nlien en bio', 150, 1490, { font: 'Outfit', size: 56, width: 780, lineHeight: 1.2 }),
    ],
  },
  {
    name: 'Nouveau produit', tags: 'instagram portrait lancement', page: { width: 1080, height: 1350 },
    objects: [
      R(0, 0, 1080, 1350, LIB.cream, { name: 'Fond' }),
      ...photoSlot(90, 90, 900, 760),
      R(90, 900, 230, 64, LIB.lime, { rx: 32, ry: 32 }),
      T('NOUVEAU', 90, 914, { font: 'Inter', size: 30, weight: 'bold', width: 230, align: 'center', spacing: 120 }),
      T('Collection Printemps', 90, 990, { font: 'Playfair Display', size: 92, width: 900 }),
      R(90, 1180, 330, 84, LIB.olive, { rx: 42, ry: 42 }),
      T('Découvrir  →', 90, 1203, { font: 'Outfit', size: 36, fill: LIB.lime, width: 330, align: 'center' }),
    ],
  },
  {
    name: 'Miniature YouTube', tags: 'vidéo', page: { width: 1280, height: 720 },
    objects: [
      R(0, 0, 1280, 720, LIB.ink, { name: 'Fond' }),
      ...photoSlot(760, 60, 460, 600, 'Votre visage ici'),
      R(60, 150, 640, 190, LIB.lime, { rx: 20, ry: 20, angle: -3 }),
      T('5 ASTUCES', 80, 168, { font: 'Archivo Black', size: 130, fill: LIB.olive, width: 640, extra: { angle: -3 } }),
      T('pour des visuels pro\nen 10 minutes', 70, 400, { font: 'Outfit', size: 64, weight: 'bold', fill: LIB.white, width: 660 }),
      C(690, 600, 50, LIB.pink),
    ],
  },
  {
    name: 'Carte de visite', tags: 'impression', page: { width: 1004, height: 650, dpi: 300 },
    objects: [
      R(0, 0, 1004, 650, LIB.white, { name: 'Fond' }),
      R(0, 0, 300, 650, LIB.olive),
      T('CM', 0, 260, { font: 'Outfit', size: 110, weight: 'bold', fill: LIB.lime, width: 300, align: 'center' }),
      T('Chloé Martin', 360, 150, { font: 'Outfit', size: 70, weight: 'bold', width: 600 }),
      T('Designer graphique', 360, 240, { font: 'Inter', size: 34, fill: LIB.moss, width: 600 }),
      R(360, 320, 70, 5, LIB.lime),
      T('06 12 34 56 78\nbonjour@studio-chloe.fr\nstudio-chloe.fr', 360, 370, { font: 'Inter', size: 30, width: 600, lineHeight: 1.5 }),
    ],
  },
  {
    name: 'Invitation anniversaire', tags: 'impression a5 fête', page: { width: 1748, height: 2480, dpi: 300 },
    objects: [
      R(0, 0, 1748, 2480, LIB.cream, { name: 'Fond' }),
      ...[[200, 260, 70, LIB.lime], [1500, 380, 50, LIB.pink], [1350, 2150, 90, LIB.lime], [260, 2050, 44, LIB.moss], [1580, 1250, 36, LIB.pink], [140, 1150, 30, LIB.lime]]
        .map(([x, y, r, c]) => C(x, y, r, c)),
      T('Joyeux', 174, 640, { font: 'Pacifico', size: 260, fill: LIB.moss, width: 1400, align: 'center' }),
      T('anniversaire', 174, 930, { font: 'Pacifico', size: 230, width: 1400, align: 'center' }),
      T('Léa fête ses 30 ans !', 174, 1380, { font: 'Playfair Display', style: 'italic', size: 110, width: 1400, align: 'center' }),
      T('Samedi 12 décembre · 20 h\n14 rue des Lilas, Lyon', 174, 1640, { font: 'Inter', size: 72, width: 1400, align: 'center', lineHeight: 1.4 }),
    ],
  },
  {
    name: 'Épingle recette', tags: 'pinterest', page: { width: 1000, height: 1500 },
    objects: [
      R(0, 0, 1000, 1500, LIB.white, { name: 'Fond' }),
      ...photoSlot(0, 0, 1000, 900, 'Photo du plat'),
      R(70, 820, 860, 560, LIB.cream, { rx: 36, ry: 36 }),
      T('RECETTE FACILE', 120, 880, { font: 'Inter', size: 30, weight: 'bold', fill: LIB.moss, width: 760, spacing: 160 }),
      T('Tarte fine aux pommes & caramel', 120, 940, { font: 'Playfair Display', size: 84, width: 760, lineHeight: 1.1 }),
      T('20 min · 4 personnes', 120, 1260, { font: 'Inter', size: 36, width: 760 }),
    ],
  },
  {
    name: 'Bannière LinkedIn', tags: 'bannière profil', page: { width: 1584, height: 396 },
    objects: [
      R(0, 0, 1584, 396, LIB.olive, { name: 'Fond' }),
      P([{ x: 1000, y: 0 }, { x: 1584, y: 0 }, { x: 1584, y: 396 }, { x: 760, y: 396 }], LIB.lime),
      T('Design graphique & identité visuelle', 560, 110, { font: 'Outfit', size: 64, weight: 'bold', fill: LIB.cream, width: 560 }),
      T('studio-chloe.fr', 1080, 290, { font: 'Inter', size: 36, weight: 'bold', fill: LIB.olive, width: 440, align: 'right' }),
    ],
  },
];

/* ============================================================================
   3. STICKERS (SVG, couleurs de la marque — recolorables via le panneau)
   ========================================================================== */

const STICKERS = [
  { name: 'Forme organique', svg: `<svg viewBox="0 0 200 200"><path fill="${LIB.lime}" d="M156 38c22 20 30 56 18 86s-44 56-78 58-64-20-72-50 4-66 30-86 80-28 102-8z"/></svg>` },
  { name: 'Badge Nouveau', svg: `<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="92" fill="${LIB.olive}"/><circle cx="100" cy="100" r="80" fill="none" stroke="${LIB.lime}" stroke-width="3" stroke-dasharray="6 6"/><text x="100" y="112" text-anchor="middle" font-family="Outfit" font-weight="bold" font-size="34" fill="${LIB.lime}">NOUVEAU</text></svg>` },
  { name: 'Étiquette promo', svg: `<svg viewBox="0 0 200 200"><path fill="${LIB.pink}" d="${starPoints(100, 100, 96, 80, 16).map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')}Z"/><text x="100" y="118" text-anchor="middle" font-family="Archivo Black" font-size="50" fill="${LIB.white}">-30%</text></svg>` },
  { name: 'Bulle', svg: `<svg viewBox="0 0 220 180"><path fill="${LIB.white}" stroke="${LIB.olive}" stroke-width="6" d="M30 20h160a20 20 0 0 1 20 20v80a20 20 0 0 1-20 20H90l-40 30 6-30H30a20 20 0 0 1-20-20V40a20 20 0 0 1 20-20z"/><text x="110" y="92" text-anchor="middle" font-family="Outfit" font-size="34" fill="${LIB.olive}">Coucou !</text></svg>` },
  { name: 'Ruban', svg: `<svg viewBox="0 0 300 100"><path fill="${LIB.moss}" d="M0 30h40v50H0l14-25z M300 30h-40v50h40l-14-25z"/><rect x="30" y="18" width="240" height="56" rx="4" fill="${LIB.olive}"/><text x="150" y="56" text-anchor="middle" font-family="Outfit" font-weight="bold" font-size="28" fill="${LIB.lime}">MEILLEURE VENTE</text></svg>` },
  { name: 'Étincelle', svg: `<svg viewBox="0 0 200 200"><path fill="${LIB.lime}" stroke="${LIB.olive}" stroke-width="5" stroke-linejoin="round" d="M100 10c8 52 38 82 90 90-52 8-82 38-90 90-8-52-38-82-90-90 52-8 82-38 90-90z"/></svg>` },
  { name: 'Soulignement', svg: `<svg viewBox="0 0 300 60"><path fill="none" stroke="${LIB.pink}" stroke-width="10" stroke-linecap="round" d="M10 40c40-24 70-24 100-6s60 18 90 0 60-20 90-4"/></svg>` },
  { name: 'Flèche dessinée', svg: `<svg viewBox="0 0 200 160"><path fill="none" stroke="${LIB.olive}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" d="M20 140c10-60 50-100 140-104M130 14l32 22-26 30"/></svg>` },
  { name: 'Trois cœurs', svg: `<svg viewBox="0 0 220 120"><g fill="${LIB.pink}"><path d="M40 98 12 70a18 18 0 0 1 28-24 18 18 0 0 1 28 24z"/><path d="M110 60 76 26a22 22 0 0 1 34-28 22 22 0 0 1 34 28z" transform="translate(0 40)"/><path d="M180 98l-28-28a18 18 0 0 1 28-24 18 18 0 0 1 28 24z"/></g></svg>` },
  { name: 'Ticket', svg: `<svg viewBox="0 0 280 120"><path fill="${LIB.lime}" d="M10 10h260v35a15 15 0 0 0 0 30v35H10V75a15 15 0 0 0 0-30z"/><path stroke="${LIB.olive}" stroke-width="3" stroke-dasharray="8 6" d="M200 18v84"/><text x="105" y="72" text-anchor="middle" font-family="Bebas Neue" font-size="46" fill="${LIB.olive}">ENTRÉE</text></svg>` },
  { name: 'Cadre arrondi', svg: `<svg viewBox="0 0 200 200"><rect x="10" y="10" width="180" height="180" rx="36" fill="none" stroke="${LIB.olive}" stroke-width="8"/><rect x="26" y="26" width="148" height="148" rx="24" fill="none" stroke="${LIB.lime}" stroke-width="4"/></svg>` },
  { name: 'Pastille', svg: `<svg viewBox="0 0 240 90"><rect x="5" y="5" width="230" height="80" rx="40" fill="${LIB.olive}"/><circle cx="45" cy="45" r="16" fill="${LIB.lime}"/><text x="140" y="56" text-anchor="middle" font-family="Inter" font-weight="bold" font-size="28" fill="${LIB.cream}">EN DIRECT</text></svg>` },
];

/* ============================================================================
   FENÊTRE BIBLIOTHÈQUE
   ========================================================================== */

/** Ajoute un SVG au centre de la vue, à la taille voulue (px du document) */
function insertSVG(svg, { size = 220, name } = {}) {
  return new Promise((resolve) => {
    fabric.loadSVGFromString(svg, (objects, options) => {
      const obj = fabric.util.groupSVGElements(objects, options);
      const scale = size / Math.max(obj.width, obj.height);
      const c = Viewport.center();
      obj.set({ scaleX: scale, scaleY: scale, name });
      obj.setPositionByOrigin(new fabric.Point(c.x, c.y), 'center', 'center');
      setTool('select');
      canvas.add(obj);
      canvas.setActiveObject(obj);
      canvas.requestRenderAll();
      refreshFonts();
      resolve(obj);
    });
  });
}

const Library = {
  tab: 'templates',
  thumbs: {},

  open(tab = this.tab) {
    if (!this.sheet) this.build();
    this.show(tab);
    this.sheet.open();
  },

  build() {
    this.sheet = Sheet.create({
      title: 'Bibliothèque',
      wide: true,
      body: `
        <div class="tabs" role="tablist">
          <button class="tab" type="button" data-lib-tab="templates">Modèles</button>
          <button class="tab" type="button" data-lib-tab="icons">Icônes</button>
          <button class="tab" type="button" data-lib-tab="stickers">Stickers</button>
        </div>
        <div data-lib-panel="templates">
          <p class="field-note">Un modèle s'ouvre dans un nouveau projet : votre travail actuel est conservé.</p>
          <div class="template-grid" id="template-grid"></div>
        </div>
        <div data-lib-panel="icons" hidden>
          <input class="input" type="search" id="icon-search" placeholder="Rechercher : cœur, café, flèche, fête…" aria-label="Rechercher une icône">
          <div class="icon-grid" id="icon-grid"></div>
          <p class="field-note">Icônes Lucide (licence ISC). Couleur : celle du contour actuel — modifiable ensuite.</p>
        </div>
        <div data-lib-panel="stickers" hidden>
          <div class="sticker-grid" id="sticker-grid"></div>
        </div>`,
    });
    const { $, $$ } = this.sheet;
    $$('[data-lib-tab]').forEach((b) => b.addEventListener('click', () => this.show(b.dataset.libTab)));
    $('#icon-search').addEventListener('input', (e) => this.renderIcons(e.target.value));

    // Icônes
    this.renderIcons('');
    $('#icon-grid').addEventListener('click', (e) => {
      const b = e.target.closest('[data-icon]');
      if (!b) return;
      const [, inner] = ICON_LIBRARY[b.dataset.icon];
      const color = state.style.stroke || state.style.fill || LIB.olive;
      insertSVG(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`,
        { size: 160, name: `Icône ${b.title}` });
      this.sheet.close();
    });

    // Stickers
    $('#sticker-grid').innerHTML = STICKERS.map((s, i) => `<button class="card-btn sticker-card" type="button" data-sticker="${i}" title="${escapeHTML(s.name)}">${s.svg.replace('<svg ', '<svg aria-hidden="true" ')}<small>${escapeHTML(s.name)}</small></button>`).join('');
    $('#sticker-grid').addEventListener('click', (e) => {
      const b = e.target.closest('[data-sticker]');
      if (!b) return;
      const s = STICKERS[Number(b.dataset.sticker)];
      insertSVG(s.svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '), { size: 260, name: s.name });
      this.sheet.close();
    });

    // Modèles
    $('#template-grid').innerHTML = TEMPLATES.map((t, i) => `
      <button class="template-card" type="button" data-template="${i}">
        <span class="template-thumb" style="aspect-ratio:${t.page.width}/${t.page.height}"><img alt="" data-thumb="${i}"></span>
        <span class="template-name">${escapeHTML(t.name)}</span>
        <small>${t.page.width} × ${t.page.height}</small>
      </button>`).join('');
    $('#template-grid').addEventListener('click', (e) => {
      const b = e.target.closest('[data-template]');
      if (b) this.useTemplate(TEMPLATES[Number(b.dataset.template)]);
    });
  },

  show(tab) {
    this.tab = tab;
    this.sheet.$$('[data-lib-tab]').forEach((b) => b.classList.toggle('is-active', b.dataset.libTab === tab));
    this.sheet.$$('[data-lib-panel]').forEach((p) => { p.hidden = p.dataset.libPanel !== tab; });
    if (tab === 'templates') this.renderThumbs();
    if (tab === 'icons') setTimeout(() => this.sheet.$('#icon-search').focus(), 50);
  },

  renderIcons(query) {
    const q = query.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const match = (name, kw) => !q || `${name} ${kw}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q);
    const list = Object.entries(ICON_LIBRARY).filter(([n, [kw]]) => match(n, kw));
    this.sheet.$('#icon-grid').innerHTML = list.length
      ? list.map(([n, [kw, inner]]) => `<button class="icon-cell" type="button" data-icon="${n}" title="${escapeHTML(kw.split(' ')[0])}"><svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg></button>`).join('')
      : '<p class="field-note">Aucune icône ne correspond.</p>';
  },

  /** Document JSON d'un modèle (format attendu par Doc) */
  templateDoc(t) {
    return JSON.stringify({ version: fabric.version, objects: t.objects, page: t.page });
  },

  async renderThumbs() {
    const fonts = new Set(TEMPLATES.flatMap((t) => t.objects.filter((o) => o.type === 'textbox').map((o) => `${o.fontStyle} ${o.fontWeight} 40px "${o.fontFamily}"`)));
    await Promise.all([...fonts].map((f) => document.fonts.load(f).catch(() => null)));
    TEMPLATES.forEach((t, i) => {
      const img = this.sheet.$(`[data-thumb="${i}"]`);
      if (this.thumbs[i]) { img.src = this.thumbs[i]; return; }
      const sc = new fabric.StaticCanvas(null, { width: t.page.width, height: t.page.height, backgroundColor: '#ffffff', enableRetinaScaling: false });
      sc.loadFromJSON({ objects: t.objects }, () => {
        this.thumbs[i] = sc.toDataURL({ format: 'jpeg', quality: 0.85, multiplier: 360 / Math.max(t.page.width, t.page.height) });
        img.src = this.thumbs[i];
        sc.dispose();
      });
    });
  },

  async useTemplate(t) {
    this.sheet.close();
    const doc = this.templateDoc(t);
    if (window.Projects?.createFromDoc) await Projects.createFromDoc(doc, t.name);
    else Doc.open(doc);
    toast(`Modèle « ${t.name} » ouvert : cliquez sur un texte pour le modifier`, 'success', 4500);
  },
};

/* ============================================================================
   4. VECTORISATION D'IMAGE
   ----------------------------------------------------------------------------
   ImageTracer (domaine public) transforme l'image en aplats de couleur
   vectoriels. L'image est réduite à 600 px avant traitement (rapide), le
   résultat est remis à la taille et à la place de l'image d'origine.
   ========================================================================== */

const Vectorizer = {
  opts: { colors: 4, detail: 'normal', removeBg: true },

  open() {
    const img = canvas.getActiveObject();
    if (!isImage(img)) return;
    if (!this.sheet) this.build();
    this.refresh();
    this.sheet.open();
  },

  build() {
    this.sheet = Sheet.create({
      title: 'Vectoriser l\'image',
      body: `
        <p class="field-note">Transforme la photo ou le logo en formes vectorielles : nettes à toutes les tailles, recolorables, exportables en SVG.</p>
        <div><h3 class="sheet-section">Nombre de couleurs</h3><div class="chips">
          ${[2, 4, 8, 16].map((n) => `<button class="chip" type="button" data-colors="${n}">${n}${n === 2 ? ' (logo)' : n === 16 ? ' (illustration)' : ''}</button>`).join('')}
        </div></div>
        <div><h3 class="sheet-section">Détail</h3><div class="chips">
          <button class="chip" type="button" data-detail="simple">Simplifié</button>
          <button class="chip" type="button" data-detail="normal">Normal</button>
          <button class="chip" type="button" data-detail="fin">Fin</button>
        </div></div>
        <label class="check check-strong"><input type="checkbox" id="vector-bg"> Retirer le fond (couleur des coins)</label>`,
      foot: '<button class="btn btn-primary" type="button" id="vector-go">Vectoriser</button>',
    });
    const { $, $$ } = this.sheet;
    $$('[data-colors]').forEach((b) => b.addEventListener('click', () => { this.opts.colors = Number(b.dataset.colors); this.refresh(); }));
    $$('[data-detail]').forEach((b) => b.addEventListener('click', () => { this.opts.detail = b.dataset.detail; this.refresh(); }));
    $('#vector-bg').addEventListener('change', (e) => { this.opts.removeBg = e.target.checked; });
    $('#vector-go').addEventListener('click', () => this.run());
  },

  refresh() {
    const { $$, $ } = this.sheet;
    $$('[data-colors]').forEach((b) => b.classList.toggle('is-active', Number(b.dataset.colors) === this.opts.colors));
    $$('[data-detail]').forEach((b) => b.classList.toggle('is-active', b.dataset.detail === this.opts.detail));
    $('#vector-bg').checked = this.opts.removeBg;
  },

  async run() {
    const img = canvas.getActiveObject();
    if (!isImage(img)) return;
    const btn = this.sheet.$('#vector-go');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-inline"></span> Vectorisation…';
    try {
      await loadScript(IMAGETRACER_URL);
      // Pixels de la zone visible de l'image, réduits
      const el = img._originalElement || img.getElement();
      const maxSide = { simple: 400, normal: 600, fin: 900 }[this.opts.detail];
      const ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * ratio));
      const h = Math.max(1, Math.round(img.height * ratio));
      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      const ctx = off.getContext('2d');
      ctx.drawImage(el, img.cropX, img.cropY, img.width, img.height, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h);
      await new Promise((r) => setTimeout(r, 30)); // laisse le bouton se redessiner

      const omit = { simple: 16, normal: 8, fin: 4 }[this.opts.detail];
      const svg = window.ImageTracer.imagedataToSVG(data, {
        numberofcolors: this.opts.colors, pathomit: omit, ltres: 1, qtres: 1,
        colorquantcycles: 3, strokewidth: 0, roundcoords: 1, viewbox: true, linefilter: this.opts.detail !== 'fin',
      });
      const corner = [...data.data.slice(0, 3)];
      const group = await new Promise((resolve) => {
        fabric.loadSVGFromString(svg, (objects, options) => {
          let objs = objects.filter((o) => o.opacity !== 0 && o.fill !== 'none');
          if (this.opts.removeBg) {
            objs = objs.filter((o) => {
              const c = new fabric.Color(o.fill).getSource();
              const near = Math.hypot(c[0] - corner[0], c[1] - corner[1], c[2] - corner[2]) < 40;
              return !(near && o.width * o.height > w * h * 0.25);
            });
          }
          resolve(fabric.util.groupSVGElements(objs, { ...options, width: w, height: h }));
        });
      });

      // Même place, même taille affichée, même rotation que l'image
      const center = img.getCenterPoint();
      group.set({
        scaleX: (img.width * img.scaleX) / w,
        scaleY: (img.height * img.scaleY) / h,
        angle: img.angle,
        flipX: img.flipX,
        flipY: img.flipY,
        opacity: img.opacity,
        name: 'Image vectorisée',
      });
      group.setPositionByOrigin(center, 'center', 'center');
      const index = canvas.getObjects().indexOf(img);
      canvas.discardActiveObject();
      canvas.remove(img);
      canvas.insertAt(group, index);
      canvas.setActiveObject(group);
      canvas.requestRenderAll();
      this.sheet.close();
      toast(`Image vectorisée (${group.getObjects().length} formes)`, 'success');
    } catch (err) {
      console.error(err);
      toast(err.message || 'La vectorisation a échoué.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Vectoriser';
    }
  },
};

/* ============================================================================
   BRANCHEMENT
   ========================================================================== */

Hooks.on('init', () => {
  const group = dom.btnCropTool.closest('.rail-group');
  const btn = html(`
    <button class="rail-btn" id="btn-library" type="button" title="Bibliothèque : modèles, icônes, stickers (K)" aria-label="Bibliothèque">
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="3.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="m17.5 13.5 1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z"/></svg>
    </button>`);
  group.appendChild(btn);
  btn.addEventListener('click', () => Library.open());

  // Vectoriser : bouton dans la tuile Image
  const vbtn = html(`
    <button class="btn btn-block" id="btn-vectorize" type="button" disabled>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20 10 4l4 10 2-4 4 10"/><circle cx="10" cy="4" r="1.6"/><circle cx="16" cy="10" r="1.6"/></svg>
      Vectoriser
    </button>`);
  dom.btnCrop.after(vbtn);
  vbtn.addEventListener('click', () => Vectorizer.open());
  Hooks.on('sync', ({ ref, single }) => {
    vbtn.disabled = !(single && isImage(ref)) || state.isRemovingBg;
    vbtn.hidden = Boolean(state.cropping);
  });

  Keys.add((e, { mod, key }) => {
    if (!mod && !e.altKey && key === 'k') { e.preventDefault(); Library.open(); return true; }
    return false;
  });
});
