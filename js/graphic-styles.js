/**
 * ============================================================================
 *  Studio Chloé — Styles graphiques (onglet Symboles)
 *
 *  Comme le panneau Styles graphiques d'Illustrator : « + Depuis la sélection »
 *  enregistre toute l'apparence de l'objet sélectionné — remplissage (couleur
 *  ou dégradé), contour (couleur, épaisseur, pointillés, extrémités,
 *  jointures), opacité, mode de fusion, ombre, fonds / contours du panneau
 *  Aspect et effets modifiables. Un clic sur la vignette l'applique à la
 *  sélection (dans un groupe : à chaque élément). Les objets restent liés :
 *  « Redéfinir » reprend l'apparence de la sélection et met à jour tous les
 *  objets qui utilisent le style. Enregistrés avec le document.
 * ============================================================================
 */
'use strict';

const GS_PROPS = ['fill', 'stroke', 'strokeWidth', 'strokeDashArray', 'strokeLineCap', 'strokeLineJoin', 'opacity', 'shadow', 'globalCompositeOperation', 'appearance', 'liveFx'];

const GraphicStyles = {
  list: [], // { id, name, props }
  thumbs: new Map(),

  save() { return this.list.length ? JSON.parse(JSON.stringify(this.list)) : undefined; },
  load(v) { this.list = Array.isArray(v) ? JSON.parse(JSON.stringify(v)) : []; this.thumbs.clear(); this.render(); },
  byId(id) { return this.list.find((s) => s.id === id); },

  /** Apparence sérialisable d'un objet (les motifs ne sont pas repris) */
  capture(o) {
    const props = {};
    GS_PROPS.forEach((k) => {
      const v = o[k];
      if (v === undefined) return;
      if (v instanceof fabric.Pattern) return;
      if (v && typeof v === 'object' && typeof v.toObject === 'function') props[k] = v.toObject();
      else props[k] = v === null ? null : JSON.parse(JSON.stringify(v));
    });
    if (!('shadow' in props)) props.shadow = null;
    if (!('appearance' in props)) props.appearance = null;
    if (!('liveFx' in props)) props.liveFx = null;
    return props;
  },

  /** Objets réels (vivants) à partir des propriétés enregistrées */
  live(props) {
    const out = {};
    Object.entries(props).forEach(([k, v]) => {
      if ((k === 'fill' || k === 'stroke') && v && typeof v === 'object' && v.colorStops) out[k] = new fabric.Gradient(JSON.parse(JSON.stringify(v)));
      else if (k === 'shadow') out[k] = v ? new fabric.Shadow(v) : null;
      else if (k === 'appearance' || k === 'liveFx') out[k] = Array.isArray(v) && v.length ? JSON.parse(JSON.stringify(v)) : undefined;
      else out[k] = Array.isArray(v) ? v.slice() : v;
    });
    return out;
  },

  /** Applique un style à un objet (groupes : à chaque élément) */
  applyTo(o, style) {
    if (o.type === 'group' && !o.symbolId) { o.getObjects().forEach((c) => this.applyTo(c, style)); o.dirty = true; return; }
    if (isImage(o)) return;
    const live = this.live(style.props);
    if (isText(o) && !live.fill) delete live.fill; // un texte reste visible
    Object.entries(live).forEach(([k, v]) => { if (v === undefined) delete o[k]; else o[k] = v; });
    o.graphicStyle = style.id;
    o._fxCache = null;
    o.dirty = true;
    o.setCoords?.();
  },

  create() {
    const o = canvas.getActiveObject();
    if (!o || o.type === 'activeSelection' || isImage(o)) { toast('Sélectionnez un objet dont vous voulez enregistrer l\'apparence.'); return null; }
    const src = o.type === 'group' ? o.getObjects().find((c) => !isImage(c) && c.type !== 'group') : o;
    if (!src) return null;
    const style = { id: uid(), name: `Style ${this.list.length + 1}`, props: this.capture(src) };
    this.list.push(style);
    if (o.type !== 'group') o.graphicStyle = style.id;
    History.queue();
    this.render();
    toast(`« ${style.name} » enregistré : cliquez sa vignette pour l'appliquer.`, 'success');
    return style;
  },

  apply(id) {
    const style = this.byId(id);
    const objs = canvas.getActiveObjects();
    if (!style) return;
    if (!objs.length) { toast('Sélectionnez les objets à styliser.'); return; }
    objs.forEach((o) => this.applyTo(o, style));
    canvas.requestRenderAll();
    History.queue();
    Properties.sync();
  },

  /** Tous les objets du document liés au style (y compris dans les groupes) */
  linked(id) {
    const out = [];
    const walk = (list) => list.forEach((o) => { if (o.graphicStyle === id) out.push(o); if (o.type === 'group') walk(o.getObjects()); });
    walk(canvas.getObjects());
    return out;
  },

  redefine(id) {
    const style = this.byId(id);
    const o = canvas.getActiveObject();
    if (!style || !o || o.type === 'activeSelection' || isImage(o)) { toast('Sélectionnez un objet pour redéfinir le style.'); return; }
    const src = o.type === 'group' ? o.getObjects().find((c) => !isImage(c) && c.type !== 'group') : o;
    style.props = this.capture(src);
    this.thumbs.delete(id);
    this.linked(id).forEach((x) => this.applyTo(x, style));
    if (o.type !== 'group') o.graphicStyle = id;
    canvas.getObjects().forEach((x) => { if (x.type === 'group') x.dirty = true; });
    canvas.requestRenderAll();
    History.queue();
    this.render();
  },

  remove(id) {
    this.list = this.list.filter((s) => s.id !== id);
    this.linked(id).forEach((o) => { delete o.graphicStyle; });
    History.queue();
    this.render();
  },

  /** Vignette : carré arrondi dessiné avec le style */
  thumb(style) {
    if (this.thumbs.has(style.id)) return this.thumbs.get(style.id);
    const el = document.createElement('canvas');
    const sc = new fabric.StaticCanvas(el, { width: 56, height: 56, enableRetinaScaling: false, renderOnAddRemove: false });
    const live = this.live(style.props);
    const sw = Math.min(8, live.strokeWidth || 0);
    const r = new fabric.Rect({ width: 30, height: 30, rx: 6, ry: 6, left: 28, top: 28, originX: 'center', originY: 'center', fill: '#d4f04c' });
    Object.entries(live).forEach(([k, v]) => { if (v !== undefined) r[k] = v; });
    r.strokeWidth = sw;
    if (live.liveFx) r.liveFx = live.liveFx.map((f) => ({ ...f, size: Math.min(f.size ?? 0, 5), radius: Math.min(f.radius ?? 0, 8), blur: Math.min(f.blur ?? 0, 10) }));
    sc.add(r);
    sc.renderAll();
    const url = el.toDataURL('image/png');
    sc.dispose();
    this.thumbs.set(style.id, url);
    return url;
  },

  mountUI() {
    this.tile = html(`
      <section class="tile" id="section-gstyles">
        <div class="feature-head"><h3>Styles graphiques</h3><button class="btn btn-sm" type="button" id="gs-add" title="Enregistre toute l'apparence de l'objet sélectionné">+ Depuis la sélection</button></div>
        <p class="field-note">Un clic applique le style à la sélection ; « Redéfinir » met à jour tous les objets qui l'utilisent.</p>
        <ul class="gs-grid" id="gs-list"></ul>
      </section>`);
    $('#tab-symbols').appendChild(this.tile);
    this.tile.querySelector('#gs-add').addEventListener('click', () => this.create());
    this.tile.addEventListener('click', (e) => {
      const item = e.target.closest('[data-gs]');
      if (!item) return;
      const id = item.dataset.gs;
      const act = e.target.closest('[data-gs-act]')?.dataset.gsAct;
      if (act === 'redefine') this.redefine(id);
      else if (act === 'del') this.remove(id);
      else if (e.target.closest('.gs-thumb')) this.apply(id);
    });
    Doc.extras.graphicStyles = { save: () => this.save(), load: (v) => this.load(v) };
    Hooks.on('sync', () => this.mark());
    this.render();
  },

  /** Surligne le style de l'objet sélectionné */
  mark() {
    const id = canvas.getActiveObject()?.graphicStyle;
    this.tile?.querySelectorAll('[data-gs]').forEach((li) => li.classList.toggle('is-active', li.dataset.gs === id));
  },

  render() {
    if (!this.tile) return;
    const ul = this.tile.querySelector('#gs-list');
    if (!this.list.length) { ul.replaceChildren(html('<li class="field-note">Aucun style : mettez un objet en forme puis « Depuis la sélection ».</li>')); return; }
    ul.replaceChildren(...this.list.map((s) => {
      const li = html(`<li class="gs-item" data-gs="${s.id}">
        <button class="gs-thumb" type="button" title="Appliquer « ${escapeHTML(s.name)} »"><img alt="" width="56" height="56"></button>
        <input class="gs-name" type="text" maxlength="30" aria-label="Nom du style">
        <div class="gs-actions">
          <button class="layer-btn" type="button" data-gs-act="redefine" title="Redéfinir à partir de la sélection" aria-label="Redéfinir"><svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg></button>
          <button class="layer-btn" type="button" data-gs-act="del" title="Supprimer le style" aria-label="Supprimer"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </div>
      </li>`);
      li.querySelector('img').src = this.thumb(s);
      const name = li.querySelector('.gs-name');
      name.value = s.name;
      name.addEventListener('keydown', (e) => e.stopPropagation());
      name.addEventListener('change', () => { s.name = name.value.trim() || s.name; History.queue(); });
      return li;
    }));
    this.mark();
  },
};

SERIAL_PROPS.push('graphicStyle');

Hooks.on('init', () => GraphicStyles.mountUI());
