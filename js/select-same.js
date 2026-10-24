/**
 * ============================================================================
 *  Studio Chloé — Sélection › Même
 *
 *  Comme le menu Sélection › Même d'Illustrator : à partir de la sélection,
 *  sélectionne tous les objets qui partagent exactement le même remplissage,
 *  contour, épaisseur, opacité, mode de fusion, type d'objet, police ou
 *  symbole. Aussi : inverser la sélection, tout désélectionner.
 *  Accès : bouton « Sélectionner » en tête du panneau Propriétés.
 *  (La baguette magique, elle, sélectionne avec une tolérance.)
 * ============================================================================
 */
'use strict';

const SelectSame = {
  /** Critères : clé → { label, value(obj), when?(obj) } */
  criteria: {
    fill: { label: 'Même remplissage', value: (o) => MagicWand.colorOf(o, 'fill') },
    stroke: { label: 'Même couleur de contour', value: (o) => MagicWand.colorOf(o, 'stroke') },
    fillStroke: { label: 'Même remplissage et contour', value: (o) => `${MagicWand.colorOf(o, 'fill')}|${MagicWand.colorOf(o, 'stroke')}` },
    strokeWidth: { label: 'Même épaisseur de contour', value: (o) => (o.stroke ? Math.round((o.strokeWidth || 0) * 100) / 100 : 0) },
    opacity: { label: 'Même opacité', value: (o) => Math.round((o.opacity ?? 1) * 100) },
    blend: { label: 'Même mode de fusion', value: (o) => o.globalCompositeOperation || 'source-over' },
    type: { label: "Même type d'objet", value: (o) => (o.symbolId ? 'symbol' : o.shapeKind ? `${o.type}:${o.shapeKind}` : o.type) },
    font: { label: 'Même police', value: (o) => `${o.fontFamily}|${o.fontWeight}`, when: (o) => /text/.test(o.type) },
    symbol: { label: 'Même symbole', value: (o) => o.symbolId, when: (o) => Boolean(o.symbolId) },
  },

  /** Objets que l'on peut sélectionner (hors repères, objets verrouillés, objets estompés de l'isolation) */
  candidates() {
    return canvas.getObjects().filter((o) => o.visible && !o.locked && !o.excludeFromExport && o.selectable !== false && o.evented !== false);
  },

  select(key) {
    const c = this.criteria[key];
    const refs = canvas.getActiveObjects().filter((o) => !c.when || c.when(o));
    if (!refs.length) { toast('Sélectionnez d’abord un objet de référence.'); return []; }
    const wanted = new Set(refs.map((o) => c.value(o)));
    const found = this.candidates().filter((o) => (!c.when || c.when(o)) && wanted.has(c.value(o)));
    this.apply(found);
    toast(`${found.length} objet${found.length > 1 ? 's' : ''} sélectionné${found.length > 1 ? 's' : ''}.`);
    return found;
  },

  inverse() {
    const current = new Set(canvas.getActiveObjects());
    const found = this.candidates().filter((o) => !current.has(o));
    this.apply(found);
    return found;
  },

  apply(objs) {
    if (state.tool !== 'select') setTool('select');
    canvas.discardActiveObject();
    if (objs.length) Arrange.reselect(objs);
    canvas.requestRenderAll();
    Properties.sync();
  },

  openMenu(anchor) {
    const objs = canvas.getActiveObjects();
    const item = (key, label) => `<button class="flyout-item" type="button" data-same="${key}">${label}</button>`;
    const items = Object.entries(this.criteria)
      .filter(([, c]) => !c.when || objs.some((o) => c.when(o)))
      .map(([k, c]) => item(k, c.label)).join('');
    const pop = openPopover(anchor, `
      <p class="flyout-title">Sélectionner les objets de…</p>
      ${objs.length ? items : '<p class="panel-hint">Sélectionnez un objet de référence.</p>'}
      <div class="flyout-sep"></div>
      ${item('all', 'Tout sélectionner <kbd>⌘A</kbd>')}
      ${item('inverse', 'Inverser la sélection')}
      ${objs.length ? item('none', 'Tout désélectionner') : ''}`);
    pop.classList.add('same-menu');
    pop.addEventListener('click', (e) => {
      const key = e.target.closest('[data-same]')?.dataset.same;
      if (!key) return;
      closePopover();
      if (key === 'all') Arrange.selectAll();
      else if (key === 'inverse') this.inverse();
      else if (key === 'none') { canvas.discardActiveObject(); canvas.requestRenderAll(); Properties.sync(); }
      else this.select(key);
    });
  },

  mountUI() {
    const btn = html(`<button class="chip select-same-btn" type="button" id="btn-select-same" title="Sélectionner les objets semblables (Sélection › Même)" aria-haspopup="menu">
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/><path d="M15 7h4M7 15v4M17 5v4"/></svg>Sélectionner</button>`);
    dom.selType.after(btn);
    btn.addEventListener('click', () => this.openMenu(btn));
  },
};

Hooks.on('init', () => SelectSame.mountUI());
