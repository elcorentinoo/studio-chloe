/**
 * ============================================================================
 *  Chloe’s Touch — Mode isolation
 *
 *  Comme dans Illustrator : double-clic sur un groupe (flèche noire) pour
 *  travailler à l'intérieur. Le reste du document s'estompe et devient
 *  inaccessible ; les éléments du groupe se sélectionnent, se déplacent et se
 *  modifient un par un ; ce que l'on dessine pendant l'isolation rejoint le
 *  groupe. On peut isoler un groupe dans le groupe (double-clic encore).
 *  Flèche blanche (A) : un clic sur un élément d'un groupe (même imbriqué)
 *  ouvre les niveaux nécessaires et édite directement ses points.
 *  Sortie : Échap (sans sélection), double-clic dans le vide ou le bouton du
 *  bandeau. Toutes les modifications faites dans le groupe forment UNE étape
 *  d'historique (⌘Z dans l'isolation : on sort, puis on annule cette étape).
 * ============================================================================
 */
'use strict';

const Isolation = {
  stack: [], // niveaux { group, index, others: [[obj, opacity, selectable, evented]], members: Set, history }

  get active() { return this.stack[this.stack.length - 1] || null; },

  canIsolate(obj) {
    return obj?.type === 'group' && !obj.locked && !obj.chart;
  },

  enter(group) {
    if (!this.canIsolate(group) || state.cropping) return null;
    History.flush();
    const level = { group, index: canvas.getObjects().indexOf(group), history: History.restoring, members: new Set() };
    History.restoring = true; // pas d'étapes intermédiaires pendant l'isolation
    canvas.discardActiveObject();
    // Le reste du document s'estompe et ne réagit plus
    level.others = canvas.getObjects().filter((o) => o !== group).map((o) => [o, o.opacity, o.selectable, o.evented]);
    level.others.forEach(([o]) => o.set({ opacity: (o.opacity ?? 1) * 0.28, selectable: false, evented: false }));
    // Les éléments du groupe deviennent des objets indépendants, à la même place
    const children = group.getObjects();
    level.clip = group.clipPath || null;
    if (level.clip) level.clipMatrix = fabric.util.multiplyTransformMatrices(group.calcTransformMatrix(), level.clip.calcTransformMatrix());
    group._restoreObjectsState();
    canvas.remove(group);
    children.forEach((c, i) => {
      c.group = undefined;
      canvas.insertAt(c, level.index + i);
      c.setCoords();
      level.members.add(c);
    });
    this.stack.push(level);
    this.renderBanner();
    canvas.requestRenderAll();
    Properties.sync();
    return level;
  },

  exit() {
    const level = this.stack.pop();
    if (!level) return null;
    canvas.discardActiveObject();
    const all = canvas.getObjects();
    const members = all.filter((o) => level.members.has(o));
    const first = members.length ? all.indexOf(members[0]) : level.index;
    members.forEach((o) => canvas.remove(o));
    let result = null;
    if (members.length) {
      const g = level.group;
      result = new fabric.Group(members, {
        name: g.name, opacity: g.opacity, shadow: g.shadow, visible: g.visible,
        globalCompositeOperation: g.globalCompositeOperation,
      });
      ['clipMask', 'appearance', 'symbolSet', 'quickCrop', 'cid', 'repeat', 'layerId', 'liveFx', 'graphicStyle', 'assetName'].forEach((k) => { if (g[k] !== undefined) result[k] = g[k]; });
      // Le masque garde sa place à l'écran dans le nouveau groupe
      if (level.clip) {
        const inv = fabric.util.invertTransform(result.calcTransformMatrix());
        fabric.util.applyTransformToObject(level.clip, fabric.util.multiplyTransformMatrices(inv, level.clipMatrix));
        result.clipPath = level.clip;
      }
      // Un symbole modifié n'est plus une instance liée
      canvas.insertAt(result, Math.min(first, canvas.getObjects().length));
      result.setCoords();
    }
    level.others.forEach(([o, opacity, selectable, evented]) => o.set({ opacity, selectable, evented }));
    History.restoring = level.history;
    if (!this.stack.length) History.commit();
    else this.active.members.add(result); // groupe imbriqué : il redevient membre du niveau parent
    if (result) canvas.setActiveObject(result);
    this.renderBanner();
    canvas.requestRenderAll();
    Properties.sync();
    return result;
  },

  exitAll() { while (this.stack.length) this.exit(); },

  /** Chaîne [groupe, sous-groupe…, élément] sous le point p (coordonnées du parent du groupe) */
  pick(group, p) {
    const local = fabric.util.transformPoint(p, fabric.util.invertTransform(group.calcOwnMatrix()));
    const pt = new fabric.Point(local.x, local.y);
    const kids = group.getObjects();
    for (let i = kids.length - 1; i >= 0; i--) {
      const k = kids[i];
      if (!k.visible || !k.containsPoint(pt, null, true, true)) continue;
      if (k.type === 'group' && !k.chart) {
        const sub = this.pick(k, pt);
        return sub.length ? [group, ...sub] : [group, k];
      }
      return [group, k];
    }
    return [];
  },

  renderBanner() {
    let bar = $('#isolation-bar');
    if (!this.stack.length) { bar?.remove(); dom.stage.classList.remove('is-isolated'); return; }
    if (!bar) {
      bar = html('<div class="isolation-bar" id="isolation-bar" role="status"></div>');
      dom.stage.appendChild(bar);
      bar.addEventListener('click', (e) => {
        const lvl = e.target.closest('[data-level]')?.dataset.level;
        if (lvl === undefined) return;
        while (this.stack.length > Number(lvl)) this.exit();
      });
    }
    dom.stage.classList.add('is-isolated');
    const crumbs = ['Document', ...this.stack.map((l) => objectLabel(l.group))];
    bar.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="11" height="11" rx="2"/><rect x="10" y="10" width="11" height="11" rx="2"/></svg>
      ${crumbs.map((c, i) => (i < crumbs.length - 1
    ? `<button type="button" data-level="${i}">${escapeHTML(c)}</button><span aria-hidden="true">›</span>`
    : `<strong>${escapeHTML(c)}</strong>`)).join('')}
      <button class="chip" type="button" data-level="${this.stack.length - 1}">Quitter l'isolation <kbd>Échap</kbd></button>`;
  },

  bind() {
    canvas.on('mouse:dblclick', ({ target }) => {
      if (state.tool !== 'select' || state.cropping) return;
      if (target && this.canIsolate(target)) { this.enter(target); return; }
      if (!target && this.stack.length) this.exit();
    });
    // Flèche blanche sur un groupe : on entre (automatiquement) jusqu'à
    // l'élément visé, qui passe directement en édition des points
    canvas.on('mouse:down:before', ({ e }) => {
      if (state.tool !== 'direct' || state.cropping) return;
      const target = canvas.findTarget(e);
      if (!target) {
        // clic dans le vide : on quitte les niveaux ouverts par la flèche blanche
        while (this.active?.auto) this.exit();
        return;
      }
      if (!this.canIsolate(target)) return;
      const p = canvas.getPointer(e);
      const chain = this.pick(target, p);
      if (!chain.length) return;
      chain.slice(0, -1).forEach((g) => { const lvl = this.enter(g); if (lvl) lvl.auto = true; });
      const leaf = chain[chain.length - 1];
      canvas.setActiveObject(leaf); // la flèche blanche lance l'édition des points (direct.js)
      if (!PathEditor.obj && canvas.getObjects().includes(leaf)) DirectSelect.edit(leaf);
      // Fabric a déjà mémorisé le groupe sous le pointeur : on lui indique la nouvelle cible
      canvas._target = canvas.getActiveObject() || null;
      canvas.requestRenderAll();
    });
    // Ce que l'on crée pendant l'isolation rejoint le groupe
    canvas.on('object:added', ({ target }) => {
      const lvl = this.active;
      if (lvl && !target.excludeFromExport && !lvl.others.some(([o]) => o === target)) lvl.members.add(target);
    });
    Keys.add((e) => {
      if (e.key === 'Escape' && this.stack.length && !canvas.getActiveObject() && !state.drawing) {
        e.preventDefault();
        this.exit();
        return true;
      }
      return false;
    });
    // ⌘Z dans l'isolation : on sort (une étape), puis on annule cette étape
    const baseUndo = History.undo;
    History.undo = (...args) => {
      if (this.stack.length && !(state.tool === 'pen' && Tools.pen.points.length) && !PathEditor.obj) {
        this.exitAll();
        History.flush();
      }
      return baseUndo(...args);
    };
    // Avant d'exporter, d'ouvrir un autre projet ou de quitter : on sort de l'isolation
    const guard = (owner, method) => {
      const base = owner?.[method];
      if (typeof base !== 'function') return;
      owner[method] = (...args) => { this.exitAll(); return base.apply(owner, args); };
    };
    if (typeof ExportDialog !== 'undefined') guard(ExportDialog, 'open');
    guard(Exporter, 'png');
    guard(Exporter, 'svg');
    guard(Doc, 'open');
    window.addEventListener('pagehide', () => this.exitAll());
    Hooks.on('docLoaded', () => { if (!History.restoring) this.stack = []; this.renderBanner(); });
  },
};

TYPE_LABELS.isolation = 'Groupe isolé';

Hooks.on('init', () => Isolation.bind());
