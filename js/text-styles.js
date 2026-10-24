/**
 * ============================================================================
 *  Chloe’s Touch — Styles de paragraphe et de caractère (tuile Texte)
 *
 *  Comme les panneaux Styles de paragraphe / Styles de caractère d'Illustrator :
 *    - « + » crée un style à partir du texte sélectionné ;
 *    - un clic sur un style l'applique : style de paragraphe → tout le bloc
 *      de texte (police, corps, graisse, couleur, interlettrage, interlignage,
 *      alignement) ; style de caractère → lettres sélectionnées en édition,
 *      sinon tout le texte ;
 *    - les textes restent liés : « Redéfinir » (↻) reprend la mise en forme
 *      du texte sélectionné et met à jour tous les textes qui utilisent le style ;
 *    - « + » à côté du nom = le texte a été modifié localement (remplacement) ;
 *      appliquer de nouveau le style efface ces remplacements ;
 *    - double-clic pour renommer, ✕ pour supprimer (les textes gardent leur
 *      apparence, ils ne sont plus liés).
 *  Les styles sont enregistrés avec le document (Doc.extras.textStyles).
 * ============================================================================
 */
'use strict';

const PARA_PROPS = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'underline', 'fill', 'charSpacing', 'lineHeight', 'textAlign'];
const CHAR_PROPS = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'underline', 'fill'];

const TextStyles = {
  list: [], // { id, kind: 'para' | 'char', name, props }

  save() { return this.list.length ? this.list.map((s) => ({ ...s, props: { ...s.props } })) : undefined; },
  load(v) { this.list = Array.isArray(v) ? v.map((s) => ({ ...s, props: { ...s.props } })) : []; this.render(); },

  byId(id) { return this.list.find((s) => s.id === id); },

  /** Tous les textes du document, y compris dans les groupes */
  allTexts() {
    const out = [];
    const walk = (objs) => objs.forEach((o) => {
      if (isText(o)) out.push(o);
      else if (o.type === 'group') walk(o.getObjects());
    });
    walk(canvas.getObjects());
    return out;
  },

  pick(src, keys) {
    const out = {};
    keys.forEach((k) => { if (src[k] !== undefined) out[k] = src[k]; });
    return out;
  },

  /** Texte de référence : le texte sélectionné (ou en édition) */
  current() {
    const a = canvas.getActiveObject();
    if (a && isText(a)) return a;
    return canvas.getActiveObjects().find(isText) || null;
  },

  /** Mise en forme « caractère » à l'endroit du curseur / de la sélection */
  charPropsOf(t) {
    const base = this.pick(t, CHAR_PROPS);
    if (t.isEditing && t.text.length) {
      const i = Math.min(t.selectionStart, t.text.length - 1);
      Object.assign(base, this.pick(t.getStyleAtPosition(i, true) || {}, CHAR_PROPS));
    }
    return base;
  },

  create(kind) {
    const t = this.current();
    if (!t) { toast('Sélectionnez un texte pour créer un style.'); return null; }
    const n = this.list.filter((s) => s.kind === kind).length + 1;
    const style = {
      id: uid(),
      kind,
      name: kind === 'para' ? `Paragraphe ${n}` : `Caractère ${n}`,
      props: kind === 'para' ? this.pick(t, PARA_PROPS) : this.charPropsOf(t),
    };
    this.list.push(style);
    if (kind === 'para') t.paraStyle = style.id;
    else this.applyChar(style, t);
    History.queue();
    this.render();
    return style;
  },

  /** Applique un style de paragraphe (remplacements locaux effacés) */
  applyPara(style, t) {
    t.set(style.props);
    // les attributs de lettres qui contredisent le style sont retirés, sauf les styles de caractère
    Object.values(t.styles || {}).forEach((line) => Object.entries(line).forEach(([i, st]) => {
      if (st.charStyle) return;
      PARA_PROPS.forEach((k) => delete st[k]);
      if (!Object.keys(st).length) delete line[i];
    }));
    t.paraStyle = style.id;
    this.refresh(t);
  },

  /** Applique un style de caractère aux lettres sélectionnées (ou à tout le texte) */
  applyChar(style, t) {
    const [a, z] = t.isEditing && t.selectionStart !== t.selectionEnd ? [t.selectionStart, t.selectionEnd] : [0, t.text.length];
    if (z > a) t.setSelectionStyles({ ...style.props, charStyle: style.id }, a, z);
    this.refresh(t);
  },

  refresh(t) {
    ensureFont(t);
    t.initDimensions?.();
    t.dirty = true;
    t.setCoords();
    if (t.group) { t.group.addWithUpdate?.(); t.group.dirty = true; }
  },

  apply(id) {
    const style = this.byId(id);
    const texts = canvas.getActiveObjects().filter(isText);
    if (!style || !texts.length) return;
    texts.forEach((t) => (style.kind === 'para' ? this.applyPara(style, t) : this.applyChar(style, t)));
    canvas.requestRenderAll();
    History.queue();
    Properties.sync();
  },

  /** Redéfinir : le style reprend la mise en forme du texte sélectionné ; tous les textes liés suivent */
  redefine(id) {
    const style = this.byId(id);
    const t = this.current();
    if (!style || !t) { toast('Sélectionnez un texte mis en forme pour redéfinir le style.'); return; }
    style.props = style.kind === 'para' ? this.pick(t, PARA_PROPS) : this.charPropsOf(t);
    this.propagate(style);
    if (style.kind === 'para') t.paraStyle = style.id;
    toast(`Style « ${style.name} » redéfini.`);
  },

  /** Met à jour tous les textes qui utilisent le style */
  propagate(style) {
    this.allTexts().forEach((t) => {
      if (style.kind === 'para' && t.paraStyle === style.id) { t.set(style.props); this.refresh(t); }
      if (style.kind === 'char') {
        let hit = false;
        Object.values(t.styles || {}).forEach((line) => Object.values(line).forEach((st) => {
          if (st.charStyle === style.id) { Object.assign(st, style.props); hit = true; }
        }));
        if (hit) this.refresh(t);
      }
    });
    canvas.requestRenderAll();
    History.queue();
    this.render();
  },

  remove(id) {
    this.list = this.list.filter((s) => s.id !== id);
    this.allTexts().forEach((t) => {
      if (t.paraStyle === id) delete t.paraStyle;
      Object.values(t.styles || {}).forEach((line) => Object.values(line).forEach((st) => { if (st.charStyle === id) delete st.charStyle; }));
    });
    History.queue();
    this.render();
  },

  rename(id, name) {
    const s = this.byId(id);
    if (!s || !name.trim()) return;
    s.name = name.trim().slice(0, 40);
    History.queue();
    this.render();
  },

  /** Le texte s'écarte-t-il de son style de paragraphe ? */
  overridden(t, style) {
    const same = (a, b) => (typeof a === 'number' || typeof b === 'number' ? Math.abs(Number(a) - Number(b)) < 0.001 : String(a) === String(b));
    if (PARA_PROPS.some((k) => k in style.props && !same(t[k], style.props[k]))) return true;
    return Object.values(t.styles || {}).some((line) => Object.values(line).some((st) => !st.charStyle && PARA_PROPS.some((k) => k in st)));
  },

  /** Style de caractère présent à l'endroit du curseur */
  charAt(t) {
    if (!t?.isEditing || !t.text.length) return null;
    return (t.getStyleAtPosition(Math.min(t.selectionStart, t.text.length - 1)) || {}).charStyle || null;
  },

  /* ---------- Interface ---------- */
  mountUI() {
    this.el = html(`
      <div class="field text-styles" id="text-styles">
        ${['para', 'char'].map((kind) => `
          <div class="ts-head">
            <span class="field-label">${kind === 'para' ? 'Styles de paragraphe' : 'Styles de caractère'}</span>
            <button class="icon-btn icon-btn-sm" type="button" data-ts-new="${kind}" title="Nouveau style ${kind === 'para' ? 'de paragraphe' : 'de caractère'} à partir de la sélection" aria-label="Nouveau style"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
          </div>
          <div class="ts-list" data-ts-list="${kind}"></div>`).join('')}
      </div>`);
    dom.sectionText.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const nw = e.target.closest('[data-ts-new]');
      if (nw) { this.create(nw.dataset.tsNew); return; }
      const row = e.target.closest('[data-ts]');
      if (!row) return;
      const id = row.dataset.ts;
      if (e.target.closest('[data-ts-redefine]')) this.redefine(id);
      else if (e.target.closest('[data-ts-remove]')) this.remove(id);
      else if (e.target.closest('[data-ts-apply]')) {
        // 2ᵉ clic d'un double-clic (la liste a été redessinée entre-temps) : renommer
        if (e.detail >= 2) this.startRename(id); else this.apply(id);
      }
    });
    Hooks.on('sync', () => this.render());
    canvas.on('text:selection:changed', () => this.render());
    Doc.extras.textStyles = { save: () => this.save(), load: (v) => this.load(v) };
  },

  startRename(id) {
    const btn = this.el.querySelector(`[data-ts="${id}"] [data-ts-apply]`);
    if (!btn) return;
    const input = html(`<input class="input ts-rename" type="text" value="${escapeHTML(this.byId(id).name)}" aria-label="Nom du style">`);
    btn.replaceWith(input);
    input.focus();
    input.select();
    let finished = false;
    const done = (ok) => { if (finished) return; finished = true; if (ok) this.rename(id, input.value); else this.render(); };
    input.addEventListener('keydown', (k) => { k.stopPropagation(); if (k.key === 'Enter') done(true); if (k.key === 'Escape') done(false); });
    input.addEventListener('blur', () => done(true));
  },

  render() {
    if (!this.el) return;
    const t = this.current();
    const charHere = this.charAt(t);
    ['para', 'char'].forEach((kind) => {
      const box = this.el.querySelector(`[data-ts-list="${kind}"]`);
      const styles = this.list.filter((s) => s.kind === kind);
      box.innerHTML = styles.length ? styles.map((s) => {
        const active = kind === 'para' ? t?.paraStyle === s.id : charHere === s.id;
        const plus = active && kind === 'para' && this.overridden(t, s) ? '<span class="ts-override" title="Modifié localement : cliquez pour revenir au style">+</span>' : '';
        const p = s.props;
        const preview = `font-family:'${escapeHTML(p.fontFamily || 'Inter')}';font-weight:${escapeHTML(String(p.fontWeight || 400))};font-style:${p.fontStyle === 'italic' ? 'italic' : 'normal'}`;
        return `<div class="ts-row${active ? ' is-active' : ''}" data-ts="${s.id}">
          <button class="ts-apply" type="button" data-ts-apply title="Appliquer (double-clic : renommer)" style="${preview}">${escapeHTML(s.name)}${plus}</button>
          <span class="ts-meta">${Math.round(p.fontSize || 0) || ''}</span>
          <button class="icon-btn icon-btn-sm" type="button" data-ts-redefine title="Redéfinir à partir de la sélection" aria-label="Redéfinir"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg></button>
          <button class="icon-btn icon-btn-sm" type="button" data-ts-remove title="Supprimer le style" aria-label="Supprimer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </div>`;
      }).join('') : `<p class="field-note">${kind === 'para' ? 'Aucun style : « + » enregistre la mise en forme du texte sélectionné.' : 'Aucun style : « + » enregistre la mise en forme des lettres sélectionnées.'}</p>`;
    });
  },
};

SERIAL_PROPS.push('paraStyle');

Hooks.on('init', () => TextStyles.mountUI());
