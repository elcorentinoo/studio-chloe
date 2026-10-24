/**
 * ============================================================================
 *  Studio Chloé — Calques en dossiers (onglet Calques)
 *
 *  Comme les calques d'Illustrator : « + Nouveau calque » crée un dossier ;
 *  le premier dossier reçoit tous les objets existants. Chaque dossier se
 *  replie / déplie, se renomme (double-clic), se masque (œil) ou se verrouille
 *  (cadenas) d'un coup, et se réordonne par glisser-déposer. Les objets se
 *  glissent d'un dossier à l'autre (ou sur la ligne d'un dossier) ; ce que l'on
 *  dessine va dans le calque actif (surligné). Supprimer un calque supprime
 *  son contenu (⌘Z pour revenir). Les objets d'un calque restent groupés dans
 *  l'ordre d'empilement : avancer / reculer agit à l'intérieur du calque.
 *  Modèle : obj.layerId + Doc.extras.layerFolders = { list, active }
 *           (list du bas vers le haut).
 * ============================================================================
 */
'use strict';

const FOLDER_ICON = '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>';

const LayerFolders = {
  list: [], // { id, name, visible, locked, open }
  active: null,
  dragFolder: null,

  get enabled() { return this.list.length > 0; },
  byId(id) { return this.list.find((f) => f.id === id); },

  save() { return this.enabled ? { list: this.list.map((f) => ({ ...f })), active: this.active } : undefined; },
  load(v) {
    this.list = Array.isArray(v?.list) ? v.list.map((f) => ({ ...f })) : [];
    this.active = this.byId(v?.active) ? v.active : this.list[this.list.length - 1]?.id || null;
    this.apply();
  },

  /** Les objets ordinaires (ni cadre de rognage, ni aperçu, ni repère) */
  members() { return canvas.getObjects().filter((o) => !o.excludeFromExport); },

  folderOf(o) {
    if (!this.enabled || !o || o.excludeFromExport) return null;
    return this.byId(o.layerId) || null;
  },

  /** Range les objets par calque (ordre interne conservé) et rattache les orphelins */
  normalize() {
    if (!this.enabled || History.restoring || (typeof Isolation !== 'undefined' && Isolation.stack.length)) return;
    const rank = new Map(this.list.map((f, i) => [f.id, i]));
    const fallback = this.active || this.list[this.list.length - 1].id;
    canvas.getObjects().forEach((o) => { if (!o.excludeFromExport && !rank.has(o.layerId)) o.layerId = fallback; });
    const objs = canvas._objects;
    const before = objs.slice();
    objs.sort((a, b) => (a.excludeFromExport ? Infinity : rank.get(a.layerId)) - (b.excludeFromExport ? Infinity : rank.get(b.layerId)));
    if (objs.some((o, i) => o !== before[i])) canvas.requestRenderAll();
  },

  /** Masquage / verrouillage des dossiers appliqués aux objets */
  apply() {
    if (!this.enabled) return;
    canvas.getObjects().forEach((o) => {
      if (o.excludeFromExport) return;
      const f = this.folderOf(o);
      const blocked = Boolean(f && (!f.visible || f.locked));
      o.selectable = !blocked && !o.locked;
      o.evented = !blocked && !o.locked;
    });
    const hiddenActive = canvas.getActiveObjects().some((o) => o.selectable === false);
    if (hiddenActive) canvas.discardActiveObject();
    canvas.requestRenderAll();
  },

  create() {
    let first = false;
    if (!this.enabled) {
      first = true;
      this.list.push({ id: uid(), name: 'Calque 1', visible: true, locked: false, open: true });
      this.members().forEach((o) => { o.layerId = this.list[0].id; });
    }
    const n = this.list.length + 1;
    const f = { id: uid(), name: `Calque ${n}`, visible: true, locked: false, open: true };
    // nouveau calque juste au-dessus du calque actif
    const at = this.list.findIndex((x) => x.id === this.active);
    this.list.splice(at < 0 ? this.list.length : at + 1, 0, f);
    this.active = f.id;
    this.normalize();
    History.queue();
    Layers.render();
    if (first) toast('Calques en dossiers activés : vos objets sont dans « Calque 1 ».');
    return f;
  },

  remove(id) {
    const f = this.byId(id);
    if (!f) return;
    canvas.discardActiveObject();
    canvas.getObjects().filter((o) => o.layerId === id && !o.excludeFromExport).forEach((o) => canvas.remove(o));
    this.list = this.list.filter((x) => x.id !== id);
    if (this.active === id) this.active = this.list[this.list.length - 1]?.id || null;
    if (!this.enabled) canvas.getObjects().forEach((o) => { delete o.layerId; });
    History.queue();
    Layers.render();
    Properties.sync();
  },

  toggle(id, key) {
    const f = this.byId(id);
    if (!f) return;
    f[key] = !f[key];
    this.apply();
    History.queue();
    Layers.render();
    Properties.sync();
  },

  /** Place un objet dans un calque (au sommet du calque) */
  moveTo(obj, id) {
    if (!obj || !this.byId(id) || obj.layerId === id) return;
    obj.layerId = id;
    canvas.bringToFront(obj); // le tri le ramène au sommet de son nouveau calque
    this.normalize();
    this.apply();
  },

  rename(row, id) {
    const f = this.byId(id);
    const span = row.querySelector('.layer-name');
    const input = html('<input class="layer-input" type="text" maxlength="60">');
    input.value = f.name;
    span.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      if (ok && input.value.trim()) { f.name = input.value.trim(); History.queue(); }
      Layers.render();
    };
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    input.addEventListener('blur', () => finish(true));
  },

  /* ---------- affichage de l'onglet ---------- */
  objectRow(o, index, active) {
    const li = html(`
      <li class="layer layer-child${active.has(o) ? ' is-selected' : ''}${o.visible ? '' : ' is-hidden'}${o.locked ? ' is-locked' : ''}" draggable="true" data-index="${index}" data-folder="${o.layerId || ''}">
        <svg class="layer-type" viewBox="0 0 24 24" aria-hidden="true">${layerIcon(o)}</svg>
        <span class="layer-name"></span>
        <button class="layer-btn" type="button" data-act="visible" title="${o.visible ? 'Masquer' : 'Afficher'}" aria-label="${o.visible ? 'Masquer' : 'Afficher'}"><svg viewBox="0 0 24 24">${o.visible ? EYE : EYE_OFF}</svg></button>
        <button class="layer-btn" type="button" data-act="lock" title="${o.locked ? 'Déverrouiller' : 'Verrouiller'}" aria-label="${o.locked ? 'Déverrouiller' : 'Verrouiller'}"><svg viewBox="0 0 24 24">${o.locked ? LOCK : UNLOCK}</svg></button>
      </li>`);
    li.querySelector('.layer-name').textContent = objectLabel(o);
    return li;
  },

  render(baseRender) {
    if (!this.enabled) {
      baseRender();
      this.footer.querySelector('#folder-del').hidden = true;
      return;
    }
    const all = canvas.getObjects();
    const active = new Set(canvas.getActiveObjects());
    $('#layer-empty').hidden = true;
    const rows = [];
    this.list.slice().reverse().forEach((f) => {
      const objs = all.map((o, index) => ({ o, index })).filter(({ o }) => !o.excludeFromExport && o.layerId === f.id).reverse();
      const hasSel = objs.some(({ o }) => active.has(o));
      const row = html(`
        <li class="layer-folder${f.id === this.active ? ' is-active' : ''}${f.visible ? '' : ' is-hidden'}${f.locked ? ' is-locked' : ''}${hasSel ? ' has-selection' : ''}" draggable="true" data-folder-row="${f.id}">
          <button class="layer-btn folder-chevron" type="button" data-fact="open" aria-label="${f.open ? 'Replier' : 'Déplier'}" aria-expanded="${f.open}"><svg viewBox="0 0 24 24"><path d="${f.open ? 'm6 9 6 6 6-6' : 'm9 6 6 6-6 6'}"/></svg></button>
          <svg class="layer-type" viewBox="0 0 24 24" aria-hidden="true">${FOLDER_ICON}</svg>
          <span class="layer-name"></span>
          <small class="folder-count">${objs.length}</small>
          <button class="layer-btn" type="button" data-fact="visible" title="${f.visible ? 'Masquer le calque' : 'Afficher le calque'}" aria-label="Afficher / masquer le calque"><svg viewBox="0 0 24 24">${f.visible ? EYE : EYE_OFF}</svg></button>
          <button class="layer-btn" type="button" data-fact="locked" title="${f.locked ? 'Déverrouiller le calque' : 'Verrouiller le calque'}" aria-label="Verrouiller le calque"><svg viewBox="0 0 24 24">${f.locked ? LOCK : UNLOCK}</svg></button>
        </li>`);
      row.querySelector('.layer-name').textContent = f.name;
      rows.push(row);
      if (f.open) objs.forEach(({ o, index }) => rows.push(this.objectRow(o, index, active)));
    });
    Layers.list.replaceChildren(...rows);
    this.footer.querySelector('#folder-del').hidden = false;
  },

  mountUI() {
    this.footer = html(`<div class="btn-row folder-actions">
      <button class="btn btn-sm" type="button" id="folder-new" title="Nouveau calque au-dessus du calque actif">+ Nouveau calque</button>
      <button class="btn btn-sm" type="button" id="folder-del" title="Supprimer le calque actif et son contenu" hidden>Supprimer le calque</button>
    </div>`);
    Layers.tab.appendChild(this.footer);
    this.footer.querySelector('#folder-new').addEventListener('click', () => this.create());
    this.footer.querySelector('#folder-del').addEventListener('click', () => this.remove(this.active));

    const baseRender = Layers.render.bind(Layers);
    Layers.render = () => {
      if (Layers.tab.hidden) return;
      this.render(baseRender);
    };

    const list = Layers.list;
    list.addEventListener('click', (e) => {
      const row = e.target.closest('[data-folder-row]');
      if (!row) {
        // un clic sur un objet rend son calque actif
        const li = e.target.closest('.layer-child');
        if (li?.dataset.folder && this.byId(li.dataset.folder)) this.active = li.dataset.folder;
        return;
      }
      const id = row.dataset.folderRow;
      const act = e.target.closest('[data-fact]')?.dataset.fact;
      if (act === 'open') { this.byId(id).open = !this.byId(id).open; Layers.render(); return; }
      if (act === 'visible' || act === 'locked') { this.toggle(id, act); return; }
      // 2ᵉ clic d'un double-clic (la ligne a été redessinée) : renommer
      if (e.detail >= 2 && e.target.closest('.layer-name')) { this.rename(row, id); return; }
      this.active = id;
      Layers.render();
    });
    list.addEventListener('dblclick', (e) => {
      const row = e.target.closest('[data-folder-row]');
      if (!row) return;
      e.stopImmediatePropagation(); // pas le renommage d'objet du panneau de base
      if (e.target.closest('.layer-name')) this.rename(row, row.dataset.folderRow);
    }, true);
    // Glisser : dossiers entre eux, objets vers un dossier
    list.addEventListener('dragstart', (e) => {
      const row = e.target.closest('[data-folder-row]');
      if (!row) return;
      e.stopImmediatePropagation();
      this.dragFolder = row.dataset.folderRow;
      Layers.dragIndex = null;
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('is-dragging');
    }, true);
    list.addEventListener('dragover', (e) => {
      const row = e.target.closest('[data-folder-row]');
      if (!row || (this.dragFolder === null && Layers.dragIndex === null)) return;
      e.preventDefault();
      list.querySelectorAll('.drop-above, .drop-below, .drop-into').forEach((x) => x.classList.remove('drop-above', 'drop-below', 'drop-into'));
      if (this.dragFolder) {
        const r = row.getBoundingClientRect();
        row.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-above' : 'drop-below');
      } else row.classList.add('drop-into');
    });
    list.addEventListener('drop', (e) => {
      const row = e.target.closest('[data-folder-row]');
      const childRow = e.target.closest('.layer-child');
      if (row) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const id = row.dataset.folderRow;
        if (this.dragFolder && this.dragFolder !== id) {
          const moving = this.byId(this.dragFolder);
          this.list = this.list.filter((f) => f !== moving);
          const at = this.list.findIndex((f) => f.id === id);
          // liste affichée du haut vers le bas, modèle du bas vers le haut
          this.list.splice(row.classList.contains('drop-above') ? at + 1 : at, 0, moving);
          this.normalize();
        } else if (Layers.dragIndex !== null) {
          this.moveTo(canvas.getObjects()[Layers.dragIndex], id);
        }
        this.dragFolder = null;
        Layers.dragIndex = null;
        canvas.requestRenderAll();
        History.queue();
        Layers.render();
        return;
      }
      // objet déposé parmi les objets d'un autre calque : il en prend le calque
      if (childRow && Layers.dragIndex !== null) {
        const obj = canvas.getObjects()[Layers.dragIndex];
        if (obj && childRow.dataset.folder && obj.layerId !== childRow.dataset.folder) obj.layerId = childRow.dataset.folder;
        this.apply();
      }
    }, true);
    list.addEventListener('dragend', () => { this.dragFolder = null; });

    // Tout ce qui est créé va dans le calque actif
    canvas.on('object:added', ({ target }) => {
      if (!this.enabled || target.excludeFromExport || History.restoring) return;
      if (!this.byId(target.layerId)) target.layerId = this.active || this.list[this.list.length - 1].id;
      this.normalize();
    });
    // Avant chaque étape d'historique, les calques sont remis en ordre
    const baseQueue = History.queue.bind(History);
    History.queue = (...args) => { this.normalize(); return baseQueue(...args); };
    Hooks.on('docLoaded', () => this.apply());
    Doc.extras.layerFolders = { save: () => this.save(), load: (v) => this.load(v) };
  },
};

SERIAL_PROPS.push('layerId');

// Les objets d'un calque masqué ne s'affichent pas et ne s'exportent pas
{
  const proto = fabric.Object.prototype;
  const baseRender = proto.render;
  proto.render = function render(ctx) {
    const f = !this.group && LayerFolders.folderOf(this);
    if (f && !f.visible) return;
    baseRender.call(this, ctx);
  };
  const baseSetSVG = fabric.StaticCanvas.prototype._setSVGObject;
  fabric.StaticCanvas.prototype._setSVGObject = function setSVGObject(markup, instance, reviver) {
    const f = LayerFolders.folderOf(instance);
    if (f && !f.visible) return;
    baseSetSVG.call(this, markup, instance, reviver);
  };
}

Hooks.on('init', () => LayerFolders.mountUI());
