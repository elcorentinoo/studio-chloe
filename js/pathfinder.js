/**
 * ============================================================================
 *  Chloe’s Touch — Pathfinder (tuile du panneau, 2 objets ou plus)
 *
 *  Opérations booléennes avec paper.js (chargé à la demande) :
 *    Unir · Soustraire le premier plan · Intersecter · Exclure
 *    Diviser (toutes les zones deviennent des formes séparées, groupées)
 *    Soustraire l'arrière-plan · Rogner (la forme du dessus découpe les autres)
 *  Les formes (rectangles, ellipses, étoiles…), tracés et groupes vectoriels
 *  sont acceptés ; le résultat est un tracé vectoriel au style de la forme
 *  de référence (celle du dessus, ou du dessous pour « Soustraire »).
 *  Raccourcis : ⌘/Ctrl + Maj + U (unir), ⌘/Ctrl + Maj + - (soustraire).
 * ============================================================================
 */
'use strict';

const PF_ICONS = {
  unite: '<path d="M4 4h10v6h6v10H10v-6H4z" fill="currentColor" fill-opacity=".35"/>',
  minusFront: '<path d="M4 4h10v6h-4v4H4z" fill="currentColor" fill-opacity=".35"/><path d="M10 10h10v10H10z" stroke-dasharray="2 2"/>',
  intersect: '<path d="M4 4h10v10H4z" stroke-dasharray="2 2"/><path d="M10 10h10v10H10z" stroke-dasharray="2 2"/><path d="M10 10h4v4h-4z" fill="currentColor" fill-opacity=".5"/>',
  exclude: '<path d="M4 4h10v6h-4v4H4zM14 14v-4h6v10H10v-6z" fill="currentColor" fill-opacity=".35"/>',
  divide: '<path d="M4 4h10v10H4zM10 10h10v10H10z"/><path d="M10 10h4v4h-4z" fill="currentColor" fill-opacity=".5"/>',
  minusBack: '<path d="M4 4h10v10H4z" stroke-dasharray="2 2"/><path d="M14 10h6v10H10v-6h4z" fill="currentColor" fill-opacity=".35"/>',
  crop: '<path d="M4 4h10v10H4z" stroke-dasharray="2 2"/><path d="M10 10h4v4h-4z" fill="currentColor" fill-opacity=".5"/><path d="M10 10h10v10H10z"/>',
};
const PF_LABELS = {
  unite: 'Unir', minusFront: 'Soustraire', intersect: 'Intersecter', exclude: 'Exclure',
  divide: 'Diviser', minusBack: 'Soustraire l\'arrière-plan', crop: 'Rogner',
};

const Pathfinder = {
  /** L'objet peut-il entrer dans une opération ? (groupes : si tous leurs éléments le peuvent) */
  usable(obj) {
    if (Geo.canConvert(obj)) return true;
    return obj.type === 'group' && obj.getObjects().length > 0 && obj.getObjects().every((c) => this.usable(c));
  },

  /** Objet → PathItem paper (un groupe devient l'union de ses éléments) */
  item(obj) {
    if (obj.type === 'group') {
      return obj.getObjects().map((c) => this.item(c)).reduce((a, b) => a.unite(b, { insert: false }));
    }
    const it = PaperKit.fromObject(obj);
    // Formes ouvertes (lignes) : refermées pour l'opération
    if (it.closed === false) it.closed = true;
    return it;
  },

  styleOf(obj) {
    const src = obj.type === 'group' ? obj.getObjects().find((c) => !c._objects) || obj.getObjects()[0] : obj;
    const s = Geo.styleOf(src);
    delete s.name;
    return { ...s, opacity: obj.opacity ?? 1, shadow: obj.shadow || src.shadow };
  },

  isEmpty(item) {
    return !item || !item.pathData || Math.abs(item.area || 0) < 0.01;
  },

  /** Sépare un résultat composé en îlots (contour extérieur + ses trous) */
  islands(item) {
    const paper = PaperKit.scope;
    if (!item.children) return [item];
    const kids = [...item.children].filter((c) => Math.abs(c.area) > 0.01);
    if (kids.length <= 1) return kids.length ? [kids[0]] : [];
    const outerDir = kids.slice().sort((a, b) => Math.abs(b.area) - Math.abs(a.area))[0].clockwise;
    const outers = kids.filter((c) => c.clockwise === outerDir);
    const holes = kids.filter((c) => c.clockwise !== outerDir);
    return outers.map((o) => {
      const mine = holes.filter((h) => o.contains(h.interiorPoint) && !outers.some((o2) => o2 !== o && Math.abs(o2.area) < Math.abs(o.area) && o2.contains(h.interiorPoint)));
      return mine.length ? new paper.CompoundPath({ children: [o, ...mine].map((c) => c.clone({ insert: false })), insert: false }) : o.clone({ insert: false });
    });
  },

  makePath(item, style) {
    return new fabric.Path(item.pathData, { ...style, fillRule: 'evenodd', strokeUniform: true });
  },

  async run(op) {
    const objs = canvas.getActiveObjects().filter((o) => !o.locked);
    if (objs.length < 2) { toast('Sélectionnez au moins deux formes.'); return; }
    const bad = objs.filter((o) => !this.usable(o));
    if (bad.length) { toast('Le Pathfinder accepte les formes, tracés et groupes vectoriels (vectorisez d\'abord textes et images).', 'error', 5000); return; }
    try { await PaperKit.ready(); } catch { toast('Pathfinder indisponible : paper.js n\'a pas pu être chargé.', 'error'); return; }

    // Ordre d'empilement : du dessous vers le dessus
    const all = canvas.getObjects();
    const list = objs.slice().sort((a, b) => all.indexOf(a) - all.indexOf(b));
    canvas.discardActiveObject();
    const items = list.map((o) => this.item(o));
    const top = list[list.length - 1];
    const bottom = list[0];
    const indexTop = all.indexOf(top);
    let results = []; // [{ item, style }]

    if (op === 'unite') {
      results = [{ item: items.reduce((a, b) => a.unite(b, { insert: false })), style: this.styleOf(top) }];
    } else if (op === 'intersect') {
      results = [{ item: items.reduce((a, b) => a.intersect(b, { insert: false })), style: this.styleOf(top) }];
    } else if (op === 'exclude') {
      results = [{ item: items.reduce((a, b) => a.exclude(b, { insert: false })), style: this.styleOf(top) }];
    } else if (op === 'minusFront') {
      const rest = items.slice(1).reduce((a, b) => a.unite(b, { insert: false }));
      results = [{ item: items[0].subtract(rest, { insert: false }), style: this.styleOf(bottom) }];
    } else if (op === 'minusBack') {
      const rest = items.slice(0, -1).reduce((a, b) => a.unite(b, { insert: false }));
      results = [{ item: items[items.length - 1].subtract(rest, { insert: false }), style: this.styleOf(top) }];
    } else if (op === 'crop') {
      const knife = items[items.length - 1];
      results = items.slice(0, -1).map((it, i) => ({ item: it.intersect(knife, { insert: false }), style: this.styleOf(list[i]) }));
    } else if (op === 'divide') {
      results = this.divideFaces(items.map((item, i) => ({ item, style: this.styleOf(list[i]) })));
    }

    results = results.filter((r) => !this.isEmpty(r.item));
    // Diviser / rogner : chaque îlot devient une forme à part
    if (op === 'divide' || op === 'crop') {
      results = results.flatMap((r) => this.islands(r.item).map((item) => ({ item, style: r.style })));
    }
    list.forEach((o) => canvas.remove(o));
    if (!results.length) {
      canvas.requestRenderAll();
      History.queue();
      toast('Le résultat est vide : les formes ne se chevauchent pas.');
      return;
    }
    const paths = results.map((r) => this.makePath(r.item, r.style));
    const at = Math.min(indexTop - (list.length - 1), canvas.getObjects().length);
    let created;
    if (paths.length > 1 && op === 'divide') {
      created = new fabric.Group(paths, { name: 'Formes divisées' });
      canvas.insertAt(created, Math.max(0, at));
    } else {
      paths.forEach((p, i) => canvas.insertAt(p, Math.max(0, at + i)));
      created = paths;
    }
    Arrange.reselect(Array.isArray(created) ? created : [created]);
    canvas.requestRenderAll();
    History.queue();
    toast(`${PF_LABELS[op]} : ${paths.length} forme${paths.length > 1 ? 's' : ''}`, 'success');
  },

  /** Découpe en zones : chaque zone prend le style de la forme la plus en avant qui la couvre */
  divideFaces(layers) {
    let faces = [];
    layers.forEach(({ item, style }) => {
      const next = [];
      let rest = item;
      faces.forEach((f) => {
        const inter = f.item.intersect(item, { insert: false });
        const outside = f.item.subtract(item, { insert: false });
        if (!this.isEmpty(outside)) next.push({ item: outside, style: f.style });
        if (!this.isEmpty(inter)) next.push({ item: inter, style });
        rest = rest.subtract(f.item, { insert: false });
      });
      if (!this.isEmpty(rest)) next.push({ item: rest, style });
      faces = next;
    });
    return faces;
  },

  mountUI() {
    this.el = html(`
      <section class="tile" id="section-pathfinder" hidden>
        <div class="feature-head"><h3>Pathfinder</h3></div>
        <div class="pf-grid">
          ${Object.keys(PF_LABELS).map((k) => `<button class="icon-btn pf-btn" type="button" data-pf="${k}" title="${PF_LABELS[k]}" aria-label="${PF_LABELS[k]}"><svg viewBox="0 0 24 24" aria-hidden="true">${PF_ICONS[k]}</svg><span>${PF_LABELS[k].replace(' l\'arrière-plan', ' arrière')}</span></button>`).join('')}
        </div>
      </section>`);
    dom.sectionArrange.before(this.el);
    this.el.querySelectorAll('[data-pf]').forEach((b) => b.addEventListener('click', () => this.run(b.dataset.pf)));
    Hooks.on('sync', ({ objects }) => {
      this.el.hidden = objects.length < 2 || Boolean(state.cropping);
    });
    Keys.add((e, { mod, key }) => {
      if (mod && e.shiftKey && !e.altKey && key === 'u') { e.preventDefault(); this.run('unite'); return true; }
      if (mod && e.shiftKey && !e.altKey && (key === '-' || key === '_' || e.code === 'Minus')) { e.preventDefault(); this.run('minusFront'); return true; }
      return false;
    });
  },
};

Hooks.on('init', () => Pathfinder.mountUI());
