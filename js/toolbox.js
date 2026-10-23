/**
 * ============================================================================
 *  Studio Chloé — Boîte à outils : menus d'outils du rail & options d'outil
 *
 *  RailGroups.create(id, { title, after, items }) — bouton du rail qui ouvre
 *    un menu de plusieurs outils (comme les formes) ; il prend l'icône du
 *    dernier outil utilisé. items : [{ tool, label, icon, kbd }]
 *  RailGroups.add(id, item) — ajoute un outil à un menu existant
 *
 *  Options d'outil : un outil peut déclarer `options()` qui renvoie un élément
 *  DOM (construit une fois) ; il s'affiche en tête du panneau tant que
 *  l'outil est actif (tolérance de la baguette, rangées d'une grille…).
 *
 *  PaperKit : paper.js (MIT) chargé à la demande pour les opérations
 *  booléennes et le lissage. PaperKit.ready() → Promise<paper>
 * ============================================================================
 */
'use strict';

const PAPER_URL = 'https://cdn.jsdelivr.net/npm/paper@0.12.17/dist/paper-core.min.js';

const RailGroups = {
  groups: {},

  create(id, { title, after, items = [] }) {
    const first = items[0];
    const btn = html(`
      <button class="rail-btn has-more" type="button" data-group="${id}" data-tool="${first.tool}" title="${escapeHTML(title)} — cliquez à nouveau pour les autres outils" aria-label="${escapeHTML(title)}" aria-haspopup="menu" aria-expanded="false">
        <svg viewBox="0 0 24 24" aria-hidden="true">${first.icon}</svg>
      </button>`);
    const menu = html(`<div class="flyout" role="menu" aria-label="${escapeHTML(title)}" data-group-menu="${id}" hidden><div class="flyout-title">${escapeHTML(title)}</div></div>`);
    document.body.appendChild(menu);
    after.after(btn);
    const group = { id, title, btn, menu, items: [], last: first.tool };
    this.groups[id] = group;
    items.forEach((it) => this.add(id, it));

    btn.addEventListener('click', () => {
      if (group.items.some((it) => it.tool === state.tool)) this.toggle(group);
      else setTool(group.last);
    });
    dom.toolButtons = document.querySelectorAll('[data-tool]');
    return group;
  },

  add(id, item) {
    const group = this.groups[id];
    group.items.push(item);
    const el = html(`<button class="flyout-item" type="button" role="menuitem" data-tool="${item.tool}"><svg viewBox="0 0 24 24" aria-hidden="true">${item.icon}</svg><span>${escapeHTML(item.label)}</span>${item.kbd ? `<kbd>${escapeHTML(item.kbd)}</kbd>` : ''}</button>`);
    group.menu.appendChild(el);
    el.addEventListener('click', () => { setTool(item.tool); this.toggle(group, false); });
    dom.toolButtons = document.querySelectorAll('[data-tool]');
  },

  toggle(group, open = group.menu.hidden) {
    Object.values(this.groups).forEach((g) => { if (g !== group) { g.menu.hidden = true; g.btn.setAttribute('aria-expanded', 'false'); } });
    if (open) {
      const r = group.btn.getBoundingClientRect();
      group.menu.hidden = false;
      group.menu.style.left = `${r.right + 14}px`;
      group.menu.style.top = `${clamp(r.top - 8, 8, window.innerHeight - group.menu.offsetHeight - 8)}px`;
    } else {
      group.menu.hidden = true;
    }
    group.btn.setAttribute('aria-expanded', String(open));
  },

  /** Le bouton du menu prend l'icône et le nom du dernier outil choisi */
  reflect(name) {
    Object.values(this.groups).forEach((g) => {
      const item = g.items.find((it) => it.tool === name);
      if (!item) return;
      g.last = name;
      g.btn.dataset.tool = name;
      g.btn.querySelector('svg').innerHTML = item.icon;
      g.btn.title = `${item.label}${item.kbd ? ` (${item.kbd})` : ''} — cliquez à nouveau pour les autres outils`;
      g.btn.classList.add('is-active');
    });
  },

  bind() {
    document.addEventListener('pointerdown', (e) => {
      if (e.target.closest('[data-group], [data-group-menu]')) return;
      Object.values(this.groups).forEach((g) => this.toggle(g, false));
    });
    window.addEventListener('resize', () => Object.values(this.groups).forEach((g) => this.toggle(g, false)));
    Hooks.on('tool', (name) => this.reflect(name));
  },
};

const ToolOptions = {
  mount() {
    this.tile = html(`
      <section class="tile tile-tool" id="section-tool" hidden>
        <div class="feature-head"><h3 id="tool-options-title">Outil</h3></div>
        <div class="tool-options" id="tool-options"></div>
      </section>`);
    $('#panel-hint').after(this.tile);
    this.box = this.tile.querySelector('#tool-options');
    Hooks.on('tool', () => this.refresh());
  },
  refresh() {
    const tool = Tools[state.tool];
    const el = tool?.options ? (tool._optionsEl ||= tool.options()) : null;
    this.tile.hidden = !el;
    if (!el) return;
    this.tile.querySelector('#tool-options-title').textContent = TOOL_LABELS[state.tool] || 'Outil';
    if (this.box.firstElementChild !== el) this.box.replaceChildren(el);
    tool.syncOptions?.();
  },
};

/**
 * paper.js à la demande (opérations booléennes, lissage, décalage…).
 * Un projet paper invisible sert uniquement aux calculs.
 */
const PaperKit = {
  promise: null,
  ready() {
    this.promise ||= loadScript(PAPER_URL).then(() => {
      const scope = new window.paper.PaperScope();
      scope.setup(new scope.Size(1, 1));
      scope.settings.insertItems = false;
      this.scope = scope;
      return scope;
    }).catch((err) => { this.promise = null; throw err; });
    return this.promise;
  },
  /** Objet Fabric → PathItem paper (coordonnées du document) */
  fromObject(obj) {
    const d = Geo.toPathData(Geo.commands(obj));
    return this.scope.PathItem.create(d);
  },
  /** PathItem paper → fabric.Path (style donné) ou null si vide */
  toFabric(item, style = {}) {
    if (!item) return null;
    const d = item.pathData;
    if (!d || !/[LHVCSQTAZlhvcsqtaz]/.test(d)) return null;
    return new fabric.Path(d, { strokeUniform: true, ...style });
  },
};

/** Petite fabrique de champs d'options (curseur avec valeur affichée) */
function optionRange({ id, label, min, max, step = 1, value, unit = '', onInput }) {
  const el = html(`
    <div class="field">
      <label class="field-label" for="${id}">${escapeHTML(label)} <output id="out-${id}"></output></label>
      <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}">
    </div>`);
  const input = el.querySelector('input');
  const out = el.querySelector('output');
  const show = () => { out.textContent = `${input.value}${unit}`; paintRange(input); };
  input.addEventListener('input', () => { show(); onInput?.(Number(input.value)); });
  show();
  el.set = (v) => { input.value = v; show(); };
  return el;
}

Hooks.on('init', () => {
  RailGroups.bind();
  ToolOptions.mount();
});
