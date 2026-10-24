/**
 * ============================================================================
 *  Chloe’s Touch — Symboles & couleurs globales (onglet « Symboles » du panneau)
 *
 *  Couleurs globales : une couleur nommée, liée aux objets qui l'utilisent.
 *    Modifier la couleur globale recolore aussitôt tous ces objets.
 *    Clic sur la pastille : remplissage de la sélection (Maj : contour).
 *    Aussi proposées dans les nuanciers de la tuile Apparence.
 *  Symboles : un dessin réutilisable. Chaque copie posée (« instance ») est
 *    liée à l'original : « Redéfinir » remplace l'original par la sélection
 *    et met à jour toutes les instances (taille, rotation, place conservées).
 *  Données enregistrées avec le document (Doc.extras.globalColors / symbols).
 * ============================================================================
 */
'use strict';

const GlobalColors = {
  list: [], // { id, name, color }

  save() { return this.list.length ? this.list.map((c) => ({ ...c })) : undefined; },
  load(v) { this.list = Array.isArray(v) ? v.map((c) => ({ ...c })) : []; Symbols.render(); },

  /** Parcourt tous les objets (y compris dans les groupes) */
  each(fn) {
    const visit = (o) => { fn(o); if (o._objects) o._objects.forEach(visit); };
    canvas.getObjects().forEach(visit);
  },

  add() {
    const color = toHex(canvas.getActiveObject()?.fill) || dom.propFill.value || state.style.fill || '#f68a8d';
    const g = { id: uid(), name: `Couleur ${this.list.length + 1}`, color };
    this.list.push(g);
    this.changed();
    return g;
  },

  apply(g, prop = 'fill') {
    const objs = canvas.getActiveObjects();
    if (!objs.length) { state.style[prop] = g.color; Properties.sync(); return; }
    const link = (o) => {
      if (o.type === 'group') { o.getObjects().forEach(link); o.dirty = true; return; }
      if (prop === 'fill' && isImage(o)) return;
      o.set(prop, g.color);
      o[prop === 'fill' ? 'fillGlobal' : 'strokeGlobal'] = g.id;
    };
    objs.forEach(link);
    canvas.requestRenderAll();
    History.queue();
    Properties.sync();
  },

  /** Nouvelle valeur de couleur : tous les objets liés suivent */
  update(g, color) {
    g.color = color;
    let n = 0;
    this.each((o) => {
      if (o.fillGlobal === g.id) { o.set('fill', color); n += 1; }
      if (o.strokeGlobal === g.id) { o.set('stroke', color); n += 1; }
      if (o.group) o.group.dirty = true;
    });
    canvas.requestRenderAll();
    this.renderSwatches();
    return n;
  },

  remove(g) {
    this.list = this.list.filter((x) => x !== g);
    this.each((o) => { if (o.fillGlobal === g.id) delete o.fillGlobal; if (o.strokeGlobal === g.id) delete o.strokeGlobal; });
    this.changed();
  },

  changed() { Symbols.render(); this.renderSwatches(); History.queue(); },

  /** Pastilles dans les nuanciers de la tuile Apparence */
  renderSwatches() {
    let row = $('#swatches-global-row');
    if (!row) {
      row = html('<div id="swatches-global-row"><span class="swatch-caption">Couleurs globales</span><div class="swatch-row" id="swatches-global"></div></div>');
      $('#swatches-brand').after(row);
      row.addEventListener('click', (e) => {
        const b = e.target.closest('[data-global]');
        if (!b) return;
        e.stopPropagation();
        const g = this.list.find((x) => x.id === b.dataset.global);
        if (g) this.apply(g, e.shiftKey ? 'stroke' : 'fill');
      });
    }
    row.hidden = !this.list.length;
    row.querySelector('#swatches-global').innerHTML = this.list.map((g) => `<button class="swatch swatch-global" type="button" data-global="${g.id}" style="--c:${g.color}" title="${escapeHTML(g.name)} (globale) — clic : remplissage · Maj + clic : contour" aria-label="${escapeHTML(g.name)}"></button>`).join('');
  },
};

const Symbols = {
  list: [], // { id, name, objects: [JSON], w, h }

  save() { return this.list.length ? this.list.map((s) => ({ ...s })) : undefined; },
  load(v) { this.list = Array.isArray(v) ? v.map((s) => ({ ...s })) : []; this.render(); },

  /** Objets JSON d'une sélection, recentrés sur l'origine (repère du symbole) */
  capture(objs) {
    return new Promise((resolve) => {
      const sel = objs.length > 1 ? canvas.getActiveObject() : objs[0];
      sel.clone((clone) => {
        const group = clone.type === 'activeSelection' ? new fabric.Group(clone.getObjects()) : (clone.type === 'group' ? clone : new fabric.Group([clone]));
        group.set({ left: 0, top: 0, angle: 0, scaleX: 1, scaleY: 1, flipX: false, flipY: false, skewX: 0, skewY: 0 });
        const json = group.toObject(SERIAL_PROPS);
        resolve({ objects: json.objects, w: group.width, h: group.height });
      }, SERIAL_PROPS);
    });
  },

  /** Nouveau groupe-instance à partir de l'original */
  instance(sym) {
    return new Promise((resolve) => {
      fabric.util.enlivenObjects(JSON.parse(JSON.stringify(sym.objects)), (objs) => {
        const g = new fabric.Group(objs, { name: sym.name });
        g.symbolId = sym.id;
        resolve(g);
      });
    });
  },

  async create() {
    const objs = canvas.getActiveObjects();
    if (!objs.length) { toast('Sélectionnez le dessin à transformer en symbole.'); return; }
    const data = await this.capture(objs);
    const sym = { id: uid(), name: `Symbole ${this.list.length + 1}`, ...data };
    this.list.push(sym);
    // La sélection devient la première instance (même place, même taille)
    const active = canvas.getActiveObject();
    const box = active.getBoundingRect(true, true);
    const index = Math.min(...objs.map((o) => canvas.getObjects().indexOf(o)));
    canvas.discardActiveObject();
    objs.forEach((o) => canvas.remove(o));
    const inst = await this.instance(sym);
    inst.setPositionByOrigin(new fabric.Point(box.left + box.width / 2, box.top + box.height / 2), 'center', 'center');
    canvas.insertAt(inst, Math.max(0, index));
    canvas.setActiveObject(inst);
    canvas.requestRenderAll();
    this.changed();
    toast(`« ${sym.name} » créé : posez d'autres instances depuis l'onglet Symboles.`, 'success');
  },

  async place(sym) {
    const inst = await this.instance(sym);
    const c = Viewport.center();
    inst.setPositionByOrigin(new fabric.Point(c.x, c.y), 'center', 'center');
    setTool('select');
    canvas.add(inst);
    canvas.setActiveObject(inst);
    canvas.requestRenderAll();
    History.queue();
  },

  /** Toutes les instances (même imbriquées dans des groupes) : [{ obj, parent }] */
  instancesOf(sym) {
    const out = [];
    const visit = (o, parent) => {
      if (o.symbolId === sym.id) { out.push({ obj: o, parent }); return; }
      if (o._objects) o._objects.forEach((c) => visit(c, o));
    };
    canvas.getObjects().forEach((o) => visit(o, null));
    return out;
  },

  /** Redéfinit l'original à partir de la sélection : toutes les instances suivent */
  async redefine(sym) {
    const objs = canvas.getActiveObjects();
    if (!objs.length) { toast('Sélectionnez le nouveau dessin, puis « Redéfinir ».'); return; }
    if (objs.length === 1 && objs[0].symbolId === sym.id) { toast('Sélectionnez un dessin modifié (pas une instance du même symbole).'); return; }
    Object.assign(sym, await this.capture(objs));
    const n = await this.refreshInstances(sym);
    this.changed();
    toast(`Symbole mis à jour (${n} instance${n > 1 ? 's' : ''})`, 'success');
  },

  async refreshInstances(sym) {
    const list = this.instancesOf(sym);
    for (const { obj, parent } of list) {
      const neu = await this.instance(sym);
      neu.set({ scaleX: obj.scaleX, scaleY: obj.scaleY, angle: obj.angle, flipX: obj.flipX, flipY: obj.flipY, skewX: obj.skewX, skewY: obj.skewY, opacity: obj.opacity, name: obj.name, shadow: obj.shadow, sprayed: obj.sprayed });
      neu.setPositionByOrigin(obj.getCenterPoint(), 'center', 'center');
      if (parent) {
        const i = parent._objects.indexOf(obj);
        parent._objects[i] = neu;
        neu.group = parent;
        parent.dirty = true;
      } else {
        const i = canvas.getObjects().indexOf(obj);
        const wasActive = canvas.getActiveObjects().includes(obj);
        if (wasActive) canvas.discardActiveObject();
        canvas.remove(obj);
        canvas.insertAt(neu, i);
        neu.setCoords();
      }
    }
    canvas.requestRenderAll();
    return list.length;
  },

  /** Pose une copie NON liée de l'original, à modifier puis « Redéfinir » */
  async edit(sym) {
    const inst = await this.instance(sym);
    delete inst.symbolId;
    const c = Viewport.center();
    inst.setPositionByOrigin(new fabric.Point(c.x, c.y), 'center', 'center');
    canvas.add(inst);
    canvas.setActiveObject(inst);
    Arrange.ungroup();
    toast(`Modifiez ce dessin, sélectionnez-le puis « Redéfinir » sur « ${sym.name} ».`, 'info', 6000);
  },

  remove(sym) {
    this.instancesOf(sym).forEach(({ obj }) => { delete obj.symbolId; });
    this.list = this.list.filter((s) => s !== sym);
    this.changed();
  },

  changed() { this.render(); History.queue(); },

  thumb(sym) {
    // Aperçu SVG rapide de l'original
    try {
      const sc = new fabric.StaticCanvas(null, { width: 64, height: 64, renderOnAddRemove: false });
      return new Promise((resolve) => {
        fabric.util.enlivenObjects(JSON.parse(JSON.stringify(sym.objects)), (objs) => {
          const g = new fabric.Group(objs);
          const k = 56 / Math.max(g.width, g.height, 1);
          g.set({ scaleX: k, scaleY: k });
          g.setPositionByOrigin(new fabric.Point(32, 32), 'center', 'center');
          sc.add(g);
          sc.renderAll();
          resolve(sc.toDataURL());
          sc.dispose();
        });
      });
    } catch { return Promise.resolve(''); }
  },

  // ---------- onglet du panneau
  mountUI() {
    const tabs = $('.panel-tabs');
    tabs.appendChild(html('<button class="tab" type="button" role="tab" data-panel-tab="symbols" aria-selected="false">Symboles</button>'));
    tabs.lastElementChild.addEventListener('click', () => Layers.showTab('symbols'));
    this.tab = html(`
      <div class="panel-tab" id="tab-symbols" hidden>
        <section class="tile">
          <div class="feature-head"><h3>Couleurs globales</h3><button class="btn btn-sm" type="button" id="gc-add" title="Crée une couleur globale à partir du remplissage actuel">+ Nouvelle</button></div>
          <p class="field-note">Modifiez une couleur globale : tous les objets qui l'utilisent changent avec elle.</p>
          <ul class="slice-list" id="gc-list"></ul>
        </section>
        <section class="tile">
          <div class="feature-head"><h3>Symboles</h3><button class="btn btn-sm" type="button" id="sym-add" title="La sélection devient un symbole réutilisable">+ Depuis la sélection</button></div>
          <p class="field-note">Posez des instances liées ; « Redéfinir » remplace l'original par la sélection et met à jour toutes les instances.</p>
          <ul class="symbol-list" id="sym-list"></ul>
        </section>
      </div>`);
    $('.panel').appendChild(this.tab);
    this.tab.querySelector('#gc-add').addEventListener('click', () => GlobalColors.add());
    this.tab.querySelector('#sym-add').addEventListener('click', () => this.create());
    this.render();
  },

  async render() {
    if (!this.tab) return;
    const gl = this.tab.querySelector('#gc-list');
    gl.replaceChildren(...GlobalColors.list.map((g) => {
      const li = html(`<li class="slice-item">
        <button class="swatch swatch-global" type="button" style="--c:${g.color}" title="Appliquer (Maj : au contour)" aria-label="Appliquer"></button>
        <input class="slice-name" type="text" maxlength="30" aria-label="Nom">
        <input type="color" class="gc-color" value="${g.color}" aria-label="Modifier la couleur globale">
        <button class="layer-btn" type="button" data-del title="Supprimer" aria-label="Supprimer"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </li>`);
      const name = li.querySelector('.slice-name');
      name.value = g.name;
      name.addEventListener('keydown', (e) => e.stopPropagation());
      name.addEventListener('change', () => { g.name = name.value.trim() || g.name; GlobalColors.changed(); });
      li.querySelector('.swatch').addEventListener('click', (e) => GlobalColors.apply(g, e.shiftKey ? 'stroke' : 'fill'));
      const color = li.querySelector('.gc-color');
      color.addEventListener('input', () => { GlobalColors.update(g, color.value); li.querySelector('.swatch').style.setProperty('--c', color.value); });
      color.addEventListener('change', () => History.queue());
      li.querySelector('[data-del]').addEventListener('click', () => GlobalColors.remove(g));
      return li;
    }));
    if (!GlobalColors.list.length) gl.replaceChildren(html('<li class="field-note">Aucune couleur globale.</li>'));

    const sl = this.tab.querySelector('#sym-list');
    const items = await Promise.all(this.list.map(async (sym) => {
      const li = html(`<li class="symbol-item">
        <img alt="" width="48" height="48">
        <div class="symbol-body">
          <input class="slice-name" type="text" maxlength="30" aria-label="Nom du symbole">
          <div class="symbol-actions">
            <button class="chip" type="button" data-act="place">Placer</button>
            <button class="chip" type="button" data-act="edit">Modifier</button>
            <button class="chip" type="button" data-act="redefine" title="Remplacer l'original par la sélection">Redéfinir</button>
            <button class="chip" type="button" data-act="del" title="Supprimer (les instances deviennent des groupes ordinaires)">×</button>
          </div>
        </div>
      </li>`);
      li.querySelector('img').src = await this.thumb(sym);
      const name = li.querySelector('.slice-name');
      name.value = sym.name;
      name.addEventListener('keydown', (e) => e.stopPropagation());
      name.addEventListener('change', () => { sym.name = name.value.trim() || sym.name; this.changed(); });
      li.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
        const act = b.dataset.act;
        if (act === 'place') this.place(sym);
        if (act === 'edit') this.edit(sym);
        if (act === 'redefine') this.redefine(sym);
        if (act === 'del') this.remove(sym);
      }));
      return li;
    }));
    sl.replaceChildren(...items);
    if (!this.list.length) sl.replaceChildren(html('<li class="field-note">Aucun symbole : sélectionnez un dessin puis « Depuis la sélection ».</li>'));
  },
};

SERIAL_PROPS.push('fillGlobal', 'strokeGlobal', 'symbolId');
TYPE_LABELS.symbol = 'Symbole';

Hooks.on('init', () => {
  Doc.extras.globalColors = { save: () => GlobalColors.save(), load: (v) => GlobalColors.load(v) };
  Doc.extras.symbols = { save: () => Symbols.save(), load: (v) => Symbols.load(v) };
  Symbols.mountUI();
  GlobalColors.renderSwatches();
  // Un réglage manuel de la couleur rompt le lien avec la couleur globale
  const baseApply = Properties.apply.bind(Properties);
  Properties.apply = (prop, value) => {
    if (prop === 'fill' || prop === 'stroke') {
      const key = prop === 'fill' ? 'fillGlobal' : 'strokeGlobal';
      const unlink = (o) => { delete o[key]; if (o._objects) o._objects.forEach(unlink); };
      canvas.getActiveObjects().forEach(unlink);
    }
    baseApply(prop, value);
  };
  Hooks.on('docLoaded', () => GlobalColors.renderSwatches());
});
