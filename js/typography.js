/**
 * ============================================================================
 *  Chloe’s Touch — Typographie pro (tuile Texte)
 *    - « Toutes les polices… » : catalogue complet Google Fonts (liste
 *      Fontsource, chargée à la demande), recherche, catégories, aperçu ;
 *      la police choisie est téléchargée depuis Google Fonts et ajoutée aux
 *      polices récentes du menu.
 *    - Graisse, alignement (gauche, centre, droite, justifié),
 *      interlettrage (crénage global), interlignage, casse (AA / Aa / aa).
 * ============================================================================
 */
'use strict';

const FONT_LIST_URL = 'https://api.fontsource.org/v1/fonts?type=google';
const RECENT_FONTS_KEY = 'studio-chloe-recent-fonts';
const FONT_CATEGORIES = { all: 'Toutes', 'sans-serif': 'Sans-serif', serif: 'Serif', display: 'Affichage', handwriting: 'Manuscrites', monospace: 'Monospace' };
/** Repli hors ligne : une sélection de polices Google populaires */
const FONT_FALLBACK = [
  ['Roboto', 'sans-serif'], ['Open Sans', 'sans-serif'], ['Lato', 'sans-serif'], ['Montserrat', 'sans-serif'], ['Poppins', 'sans-serif'],
  ['Raleway', 'sans-serif'], ['Nunito', 'sans-serif'], ['Work Sans', 'sans-serif'], ['Rubik', 'sans-serif'], ['Manrope', 'sans-serif'],
  ['DM Sans', 'sans-serif'], ['Karla', 'sans-serif'], ['Mulish', 'sans-serif'], ['Figtree', 'sans-serif'], ['Sora', 'sans-serif'],
  ['Merriweather', 'serif'], ['Playfair Display', 'serif'], ['Lora', 'serif'], ['PT Serif', 'serif'], ['Libre Baskerville', 'serif'],
  ['EB Garamond', 'serif'], ['Cormorant Garamond', 'serif'], ['Crimson Text', 'serif'], ['Fraunces', 'serif'], ['DM Serif Display', 'serif'],
  ['Bebas Neue', 'display'], ['Anton', 'display'], ['Abril Fatface', 'display'], ['Righteous', 'display'], ['Bungee', 'display'],
  ['Alfa Slab One', 'display'], ['Archivo Black', 'display'], ['Lobster', 'display'], ['Fredoka', 'display'], ['Shrikhand', 'display'],
  ['Pacifico', 'handwriting'], ['Dancing Script', 'handwriting'], ['Caveat', 'handwriting'], ['Satisfy', 'handwriting'], ['Great Vibes', 'handwriting'],
  ['Sacramento', 'handwriting'], ['Kalam', 'handwriting'], ['Shadows Into Light', 'handwriting'], ['Amatic SC', 'handwriting'], ['Permanent Marker', 'handwriting'],
  ['Roboto Mono', 'monospace'], ['Space Mono', 'monospace'], ['JetBrains Mono', 'monospace'], ['Fira Code', 'monospace'], ['IBM Plex Mono', 'monospace'],
].map(([family, category]) => ({ family, category }));

const FontCatalog = {
  fonts: null,
  loaded: new Set(),

  async list() {
    if (this.fonts) return this.fonts;
    try {
      const res = await fetch(FONT_LIST_URL);
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      this.fonts = data.map((f) => ({ family: f.family, category: f.category, weights: f.weights, styles: f.styles })).sort((a, b) => a.family.localeCompare(b.family));
    } catch {
      this.fonts = FONT_FALLBACK.slice().sort((a, b) => a.family.localeCompare(b.family));
      this.offline = true;
    }
    return this.fonts;
  },

  cssURL(font, { preview = false } = {}) {
    const fam = font.family.replace(/ /g, '+');
    if (preview) return `https://fonts.googleapis.com/css2?family=${fam}&text=${encodeURIComponent(font.family)}&display=swap`;
    const w = (font.weights || [400, 700]).filter((x) => [300, 400, 500, 600, 700, 800, 900].includes(x));
    const weights = w.length ? w : [400];
    const italic = (font.styles || []).includes('italic');
    const axis = italic
      ? `ital,wght@${weights.map((x) => `0,${x}`).join(';')};${weights.map((x) => `1,${x}`).join(';')}`
      : `wght@${weights.join(';')}`;
    return `https://fonts.googleapis.com/css2?family=${fam}:${axis}&display=swap`;
  },

  addLink(href) {
    if ([...document.querySelectorAll('link[data-font]')].some((l) => l.href === href)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.font = '1';
    document.head.appendChild(link);
  },

  /** Charge une police complète (toutes graisses) puis attend qu'elle soit prête */
  async load(font) {
    if (!this.loaded.has(font.family)) {
      this.addLink(this.cssURL(font));
      this.loaded.add(font.family);
    }
    try { await Promise.race([document.fonts.load(`400 40px "${font.family}"`), new Promise((r) => setTimeout(r, 4000))]); } catch { /* police de secours */ }
  },

  recent() {
    try { return JSON.parse(localStorage.getItem(RECENT_FONTS_KEY) || '[]'); } catch { return []; }
  },
  pushRecent(font) {
    const list = [font, ...this.recent().filter((f) => f.family !== font.family)].slice(0, 12);
    try { localStorage.setItem(RECENT_FONTS_KEY, JSON.stringify(list)); } catch { /* ignoré */ }
    this.syncSelect();
  },

  /** Ajoute les polices récentes (et celles du document) au menu Police */
  syncSelect(extra = []) {
    const select = dom.propFontFamily;
    let group = select.querySelector('optgroup[data-recent]');
    if (!group) {
      group = document.createElement('optgroup');
      group.label = 'Récentes et du document';
      group.dataset.recent = '1';
      select.prepend(group);
    }
    const known = new Set([...select.querySelectorAll('optgroup:not([data-recent]) option')].map((o) => o.value));
    const fams = [...new Set([...this.recent().map((f) => f.family), ...extra])].filter((f) => f && !known.has(f));
    group.replaceChildren(...fams.map((f) => {
      const o = document.createElement('option');
      o.value = f;
      o.textContent = f;
      o.style.fontFamily = `'${f}'`;
      return o;
    }));
    group.hidden = !fams.length;
  },

  /** Polices utilisées par le document mais absentes du menu : chargées automatiquement */
  ensureDocumentFonts() {
    const fams = new Set();
    const visit = (o) => { if (isText(o)) fams.add(o.fontFamily); if (o._objects) o._objects.forEach(visit); };
    canvas.getObjects().forEach(visit);
    const builtin = new Set([...dom.propFontFamily.querySelectorAll('optgroup:not([data-recent]) option')].map((o) => o.value));
    const missing = [...fams].filter((f) => f && !builtin.has(f));
    missing.forEach((family) => this.load({ family }).then(() => { fabric.util.clearFabricFontCache(family); refreshFonts(); }));
    this.syncSelect(missing);
  },

  // ---------- fenêtre « Toutes les polices »
  async open() {
    const sheet = Sheet.create({
      title: 'Toutes les polices',
      wide: true,
      body: `
        <input class="input" type="search" id="font-search" placeholder="Rechercher une police (ex. « garamond », « script »)…" autocomplete="off">
        <div class="chips" id="font-cats">${Object.entries(FONT_CATEGORIES).map(([k, l]) => `<button class="chip${k === 'all' ? ' is-active' : ''}" type="button" data-cat="${k}">${l}</button>`).join('')}</div>
        <p class="field-note" id="font-count">Chargement du catalogue…</p>
        <ul class="font-list" id="font-list"></ul>`,
    });
    sheet.el.addEventListener('close', () => sheet.el.remove());
    sheet.open();
    const fonts = await this.list();
    let cat = 'all';
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const li = en.target;
      io.unobserve(li);
      this.addLink(this.cssURL({ family: li.dataset.family }, { preview: true }));
    }), { root: sheet.$('#font-list') });
    const render = () => {
      const q = sheet.$('#font-search').value.trim().toLowerCase();
      const found = fonts.filter((f) => (cat === 'all' || f.category === cat) && (!q || f.family.toLowerCase().includes(q) || (f.category || '').includes(q)));
      sheet.$('#font-count').textContent = `${found.length} police${found.length > 1 ? 's' : ''}${this.offline ? ' (catalogue hors ligne réduit)' : ''}${found.length > 150 ? ' — 150 premières affichées, affinez la recherche' : ''}`;
      const ul = sheet.$('#font-list');
      ul.replaceChildren(...found.slice(0, 150).map((f) => {
        const li = html(`<li class="font-item" data-family="${escapeHTML(f.family)}" tabindex="0" role="button">
          <span class="font-sample"></span><small>${escapeHTML(f.family)} · ${FONT_CATEGORIES[f.category] || f.category || ''}</small></li>`);
        const sample = li.querySelector('.font-sample');
        sample.textContent = f.family;
        sample.style.fontFamily = `'${f.family}', var(--font)`;
        io.observe(li);
        const pick = async () => {
          sheet.close();
          await this.apply(f);
        };
        li.addEventListener('click', pick);
        li.addEventListener('keydown', (e) => { if (e.key === 'Enter') pick(); });
        return li;
      }));
    };
    sheet.$('#font-search').addEventListener('input', render);
    sheet.$('#font-search').addEventListener('keydown', (e) => e.stopPropagation());
    sheet.$$('[data-cat]').forEach((b) => b.addEventListener('click', () => {
      cat = b.dataset.cat;
      sheet.$$('[data-cat]').forEach((x) => x.classList.toggle('is-active', x === b));
      render();
    }));
    render();
    sheet.$('#font-search').focus();
  },

  async apply(font) {
    toast(`Chargement de ${font.family}…`);
    await this.load(font);
    this.pushRecent({ family: font.family, category: font.category });
    const texts = canvas.getActiveObjects().filter(isText);
    if (texts.length) {
      Properties.apply('fontFamily', font.family);
      texts.forEach((t) => { fabric.util.clearFabricFontCache(font.family); ensureFont(t); });
    } else {
      TEXT_DEFAULTS_DYNAMIC.fontFamily = font.family;
    }
    dom.propFontFamily.value = font.family;
    toast(`Police : ${font.family}`, 'success');
  },
};

/** Police des prochains textes (modifiable sans casser TEXT_DEFAULTS, figé) */
const TEXT_DEFAULTS_DYNAMIC = { fontFamily: null };

/* ---------- réglages typographiques ---------- */
const TypoPanel = {
  mountUI() {
    this.el = html(`
      <div class="typo-pro">
        <button class="btn btn-sm btn-block" type="button" id="font-browse">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          Toutes les polices Google…
        </button>
        <div class="field">
          <label class="field-label" for="prop-font-weight">Graisse</label>
          <select class="input" id="prop-font-weight">
            ${[[300, 'Light'], [400, 'Regular'], [500, 'Medium'], [600, 'Semibold'], [700, 'Bold'], [800, 'Extrabold'], [900, 'Black']].map(([v, l]) => `<option value="${v}">${v} · ${l}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <span class="field-label">Alignement</span>
          <div class="seg seg-4" role="group" aria-label="Alignement du texte">
            ${[['left', 'Gauche', 'M4 6h16M4 10h10M4 14h16M4 18h10'], ['center', 'Centré', 'M4 6h16M7 10h10M4 14h16M7 18h10'], ['right', 'Droite', 'M4 6h16M10 10h10M4 14h16M10 18h10'], ['justify', 'Justifié', 'M4 6h16M4 10h16M4 14h16M4 18h16']]
    .map(([k, l, d]) => `<button class="seg-btn" type="button" data-align-text="${k}" title="${l}" aria-label="${l}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg></button>`).join('')}
          </div>
        </div>
        <div class="field">
          <label class="field-label" for="prop-char-spacing">Interlettrage <output id="out-char-spacing">0</output></label>
          <input type="range" id="prop-char-spacing" min="-200" max="800" step="5" value="0">
        </div>
        <div class="field">
          <label class="field-label" for="prop-line-height">Interlignage <output id="out-line-height">1.16</output></label>
          <input type="range" id="prop-line-height" min="0.6" max="3" step="0.02" value="1.16">
        </div>
        <div class="field">
          <span class="field-label">Casse</span>
          <div class="seg" role="group" aria-label="Casse">
            <button class="seg-btn" type="button" data-case="upper" title="MAJUSCULES">AA</button>
            <button class="seg-btn" type="button" data-case="title" title="Première Lettre En Majuscule">Aa</button>
            <button class="seg-btn" type="button" data-case="lower" title="minuscules">aa</button>
          </div>
        </div>
      </div>`);
    dom.sectionText.querySelector('.field-note').closest('.field').after(this.el);
    const $e = (s) => this.el.querySelector(s);
    $e('#font-browse').addEventListener('click', () => FontCatalog.open());
    $e('#prop-font-weight').addEventListener('change', (e) => {
      Properties.apply('fontWeight', Number(e.target.value));
      canvas.getActiveObjects().filter(isText).forEach(ensureFont);
      TextStyle.sync();
    });
    this.el.querySelectorAll('[data-align-text]').forEach((b) => b.addEventListener('click', () => {
      const v = b.dataset.alignText;
      canvas.getActiveObjects().filter(isText).forEach((t) => t.set('textAlign', v));
      canvas.requestRenderAll();
      History.queue();
      this.sync();
    }));
    $e('#prop-char-spacing').addEventListener('input', (e) => {
      $e('#out-char-spacing').textContent = e.target.value;
      paintRange(e.target);
      Properties.apply('charSpacing', Number(e.target.value));
    });
    $e('#prop-line-height').addEventListener('input', (e) => {
      $e('#out-line-height').textContent = Number(e.target.value).toFixed(2);
      paintRange(e.target);
      Properties.apply('lineHeight', Number(e.target.value));
    });
    this.el.querySelectorAll('[data-case]').forEach((b) => b.addEventListener('click', () => this.setCase(b.dataset.case)));
    Hooks.on('sync', () => this.sync());
  },

  setCase(mode) {
    const texts = canvas.getActiveObjects().filter(isText);
    texts.forEach((t) => {
      const conv = (s) => (mode === 'upper' ? s.toLocaleUpperCase('fr') : mode === 'lower' ? s.toLocaleLowerCase('fr')
        : s.toLocaleLowerCase('fr').replace(/(^|[\s\-'’«(])(\p{L})/gu, (m, a, c) => a + c.toLocaleUpperCase('fr')));
      if (t.isEditing && t.selectionStart !== t.selectionEnd) {
        const a = t.selectionStart;
        const z = t.selectionEnd;
        const part = conv(t.text.slice(a, z));
        if (part.length === z - a) t.insertChars(part, null, a, z);
      } else {
        const next = conv(t.text);
        if (next.length !== t.text.length) t.styles = {}; // longueur changée (ß → SS) : styles par lettre retirés
        t.set('text', next);
      }
      t.initDimensions();
      t.setCoords();
    });
    canvas.requestRenderAll();
    if (texts.length) History.queue();
  },

  sync() {
    const t = canvas.getActiveObjects().find(isText);
    if (!t) return;
    const $e = (s) => this.el.querySelector(s);
    const w = t.fontWeight === 'bold' ? 700 : t.fontWeight === 'normal' ? 400 : Number(t.fontWeight) || 400;
    $e('#prop-font-weight').value = String(Math.round(w / 100) * 100);
    this.el.querySelectorAll('[data-align-text]').forEach((b) => b.classList.toggle('is-active', b.dataset.alignText === (t.textAlign || 'left')));
    $e('#prop-char-spacing').value = t.charSpacing || 0;
    $e('#out-char-spacing').textContent = t.charSpacing || 0;
    $e('#prop-line-height').value = t.lineHeight || 1.16;
    $e('#out-line-height').textContent = Number(t.lineHeight || 1.16).toFixed(2);
    paintRange($e('#prop-char-spacing'));
    paintRange($e('#prop-line-height'));
    // Police inconnue du menu (catalogue complet) : ajoutée aux récentes
    if (![...dom.propFontFamily.options].some((o) => o.value === t.fontFamily)) FontCatalog.syncSelect([t.fontFamily]);
    dom.propFontFamily.value = t.fontFamily;
  },
};

Hooks.on('init', () => {
  TypoPanel.mountUI();
  FontCatalog.syncSelect();
  Hooks.on('docLoaded', () => FontCatalog.ensureDocumentFonts());
  // Police choisie sans sélection : utilisée par les prochains textes
  const baseUp = Tools.text.onMouseUp;
  Tools.text.onMouseUp = function onMouseUp(p, e) {
    baseUp.call(this, p, e);
    const t = canvas.getActiveObject();
    if (TEXT_DEFAULTS_DYNAMIC.fontFamily && isText(t)) { t.set('fontFamily', TEXT_DEFAULTS_DYNAMIC.fontFamily); ensureFont(t); }
  };
});
