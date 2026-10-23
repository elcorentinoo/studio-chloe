/**
 * ============================================================================
 *  Studio Chloé — Effets « Distorsion et transformation » (tuile Effets)
 *
 *  Déformation (enveloppe simple) : arc, arche, renflement, drapeau, vague,
 *    poisson, montée, gonflement, torsion — courbure réglable, horizontale ou
 *    verticale, aperçu en direct. La sélection est déformée comme un tout
 *    (les textes sont vectorisés automatiquement, les formes subdivisées).
 *  Transformation répétée : N copies avec décalage, rotation, échelle et
 *    opacité progressifs (frises, rosaces, dégradés de copies…).
 * ============================================================================
 */
'use strict';

const WARP_STYLES = {
  arc: 'Arc', arch: 'Arche', bulge: 'Renflement', flag: 'Drapeau', wave: 'Vague',
  fish: 'Poisson', rise: 'Montée', inflate: 'Gonflement', twist: 'Torsion',
};

const Warp = {
  /** Déplacement d'un point (u, v ∈ [0,1]) dans une boîte W × H, courbure b ∈ [-1, 1] */
  map(style, u, v, b, W, H) {
    const s = 2 * u - 1;
    const t = 2 * v - 1;
    switch (style) {
      case 'arc': return [0, -b * H * 0.5 * (1 - s * s)];
      case 'arch': return [0, -b * H * 0.5 * (1 - s * s) * (1 - v)];
      case 'bulge': return [0, b * H * 0.45 * (1 - s * s) * t];
      case 'flag': return [0, b * H * 0.25 * Math.sin(2 * Math.PI * u)];
      case 'wave': return [0, b * H * 0.25 * Math.sin(2 * Math.PI * u) * (1 - Math.abs(t) * 0.6)];
      case 'fish': return [0, b * H * 0.4 * t * Math.sin(Math.PI * u) * (1 - u * 0.6)];
      case 'rise': return [0, -b * H * 0.5 * u];
      case 'inflate': return [b * W * 0.2 * s * (1 - t * t), b * H * 0.2 * t * (1 - s * s)];
      case 'twist': {
        const r = Math.min(1, Math.hypot(s, t) / Math.SQRT2);
        const a = b * Math.PI * 0.6 * (1 - r);
        const x = s * (W / 2);
        const y = t * (H / 2);
        return [x * Math.cos(a) - y * Math.sin(a) - x, x * Math.sin(a) + y * Math.cos(a) - y];
      }
      default: return [0, 0];
    }
  },

  apply(cmds, box, { style, bend, vertical }) {
    const b = bend / 100;
    return cmds.map((c) => {
      if (c[0] === 'Z') return ['Z'];
      const out = [c[0]];
      for (let k = 1; k < c.length; k += 2) {
        let x = c[k];
        let y = c[k + 1];
        if (vertical) {
          // On échange les axes : la déformation agit de haut en bas
          const u = (y - box.top) / (box.height || 1);
          const v = (x - box.left) / (box.width || 1);
          const [dy, dx] = this.map(style, u, v, b, box.height, box.width);
          x += dx;
          y += dy;
        } else {
          const u = (x - box.left) / (box.width || 1);
          const v = (y - box.top) / (box.height || 1);
          const [dx, dy] = this.map(style, u, v, b, box.width, box.height);
          x += dx;
          y += dy;
        }
        out.push(x, y);
      }
      return out;
    });
  },

  /** Feuilles vectorielles d'un objet (groupes aplatis) avec leurs commandes subdivisées */
  leaves(obj, maxLen) {
    if (obj.type === 'group') return obj.getObjects().flatMap((c) => this.leaves(c, maxLen));
    if (!Geo.canConvert(obj)) return [];
    return [{ src: obj, cmds: Liquify.densify(Liquify.toCubic(Geo.commands(obj)), maxLen) }];
  },

  async open() {
    let objs = canvas.getActiveObjects().filter((o) => !o.locked);
    if (!objs.length) { toast('Sélectionnez les objets à déformer.'); return; }
    if (objs.some(isText)) {
      await TextPro.outline(objs.filter(isText));
      objs = canvas.getActiveObjects();
    }
    const usable = objs.filter((o) => Pathfinder.usable(o));
    if (!usable.length) { toast('La déformation s\'applique aux formes, tracés, groupes vectoriels et textes.'); return; }
    canvas.discardActiveObject();
    const box = Arrange.union(usable.map((o) => o.getBoundingRect(true, true)));
    const maxLen = Math.max(box.width, box.height) / 28;
    const items = usable.map((o) => ({ obj: o, leaves: this.leaves(o, maxLen) }));
    let opts = { style: 'arc', bend: 50, vertical: false };
    let previews = [];
    const showPreview = () => {
      previews.forEach((p) => canvas.remove(p));
      previews = [];
      items.forEach(({ leaves }) => leaves.forEach(({ src, cmds }) => {
        const p = new fabric.Path(Geo.toPathData(this.apply(cmds, box, opts)), { ...Geo.styleOf(src), selectable: false, evented: false, excludeFromExport: true, fillRule: src.fillRule || 'nonzero' });
        previews.push(p);
        canvas.add(p);
      }));
      canvas.requestRenderAll();
    };
    History.flush();           // l'état actuel est enregistré avant l'aperçu…
    History.restoring = true; // …qui, lui, ne crée pas d'étapes
    usable.forEach((o) => { o.visible = false; });
    showPreview();

    const sheet = Sheet.create({
      title: 'Déformation',
      body: `
        <div class="chips" id="warp-styles">${Object.entries(WARP_STYLES).map(([k, l]) => `<button class="chip${k === 'arc' ? ' is-active' : ''}" type="button" data-warp="${k}">${l}</button>`).join('')}</div>
        <div class="chips"><button class="chip is-active" type="button" data-orient="h">Horizontale</button><button class="chip" type="button" data-orient="v">Verticale</button></div>
        <div class="field"><label class="field-label" for="warp-bend">Courbure <output id="out-warp-bend">50 %</output></label>
        <input type="range" id="warp-bend" min="-100" max="100" step="1" value="50"></div>
        <p class="field-note">Aperçu en direct sur la page. Les formes sont converties en tracés.</p>`,
      foot: '<button class="btn" type="button" data-close>Annuler</button><button class="btn btn-primary" type="button" id="warp-ok">Appliquer</button>',
    });
    sheet.el.classList.add('sheet-side');
    const bend = sheet.$('#warp-bend');
    paintRange(bend);
    sheet.$$('[data-warp]').forEach((b) => b.addEventListener('click', () => {
      opts = { ...opts, style: b.dataset.warp };
      sheet.$$('[data-warp]').forEach((x) => x.classList.toggle('is-active', x === b));
      showPreview();
    }));
    sheet.$$('[data-orient]').forEach((b) => b.addEventListener('click', () => {
      opts = { ...opts, vertical: b.dataset.orient === 'v' };
      sheet.$$('[data-orient]').forEach((x) => x.classList.toggle('is-active', x === b));
      showPreview();
    }));
    bend.addEventListener('input', () => {
      opts = { ...opts, bend: Number(bend.value) };
      sheet.$('#out-warp-bend').textContent = `${bend.value} %`;
      paintRange(bend);
      showPreview();
    });
    let applied = false;
    sheet.$('#warp-ok').addEventListener('click', () => { applied = true; sheet.close(); });
    sheet.el.addEventListener('close', () => {
      previews.forEach((p) => canvas.remove(p));
      usable.forEach((o) => { o.visible = true; });
      History.restoring = false;
      if (applied) this.commit(items, box, opts);
      else { Arrange.reselect(usable); canvas.requestRenderAll(); }
      sheet.el.remove();
    });
    sheet.open();
  },

  commit(items, box, opts) {
    const made = items.map(({ obj, leaves }) => {
      const paths = leaves.map(({ src, cmds }) => new fabric.Path(Geo.toPathData(this.apply(cmds, box, opts)), { ...Geo.styleOf(src), fillRule: src.fillRule || 'nonzero' }));
      const result = obj.type === 'group' ? new fabric.Group(paths, { name: obj.name, opacity: obj.opacity }) : paths[0];
      Geo.replace(obj, result, { select: false });
      return result;
    });
    Arrange.reselect(made);
    canvas.requestRenderAll();
    History.queue();
    toast(`Déformation « ${WARP_STYLES[opts.style]} » appliquée`, 'success');
  },
};

/* ============================================================================
   TRANSFORMATION RÉPÉTÉE
   ========================================================================== */

const RepeatTransform = {
  clones(src, n) {
    return Promise.all(Array.from({ length: n }, () => new Promise((res) => src.clone(res, SERIAL_PROPS))));
  },

  /** Transformation cumulée de la copie k autour du centre c */
  matrixFor(k, o, c) {
    const r = (o.angle * k * Math.PI) / 180;
    const s = (o.scale / 100) ** k;
    const M = fabric.util.multiplyTransformMatrices(
      [1, 0, 0, 1, c.x + o.dx * k, c.y + o.dy * k],
      fabric.util.multiplyTransformMatrices([Math.cos(r) * s, Math.sin(r) * s, -Math.sin(r) * s, Math.cos(r) * s, 0, 0], [1, 0, 0, 1, -c.x, -c.y]),
    );
    return M;
  },

  async open() {
    const src = canvas.getActiveObject();
    if (!src) { toast('Sélectionnez l\'objet à répéter.'); return; }
    const objs = canvas.getActiveObjects();
    History.flush();           // état actuel enregistré ; l'aperçu et le groupe temporaire n'en créent pas
    History.restoring = true;
    canvas.discardActiveObject();
    // Plusieurs objets : ils sont répétés ensemble (groupe temporaire)
    const base = objs.length > 1 ? new fabric.Group(objs.map((o) => { canvas.remove(o); return o; })) : objs[0];
    if (objs.length > 1) canvas.add(base);
    const center = base.getCenterPoint();
    const m0 = base.calcTransformMatrix();
    let o = { n: 6, dx: 0, dy: 0, angle: 60, scale: 100, fade: 0, pivot: 'object' };
    let previews = [];
    let busy = 0;
    const pivot = () => (o.pivot === 'page' ? { x: state.page.width / 2, y: state.page.height / 2 } : center);
    const show = async () => {
      const ticket = ++busy;
      const list = await this.clones(base, o.n);
      if (ticket !== busy) return;
      previews.forEach((p) => canvas.remove(p));
      previews = list.map((cl, i) => {
        const k = i + 1;
        fabric.util.applyTransformToObject(cl, fabric.util.multiplyTransformMatrices(this.matrixFor(k, o, pivot()), m0));
        cl.set({ opacity: (base.opacity ?? 1) * Math.max(0.02, 1 - (o.fade / 100) * (k / o.n)), selectable: false, evented: false, excludeFromExport: true });
        canvas.add(cl);
        return cl;
      });
      canvas.requestRenderAll();
    };
    show();
    const field = (id, label, min, max, step, val, unit) => `<div class="field"><label class="field-label" for="${id}">${label} <output id="out-${id}">${val}${unit}</output></label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
    const sheet = Sheet.create({
      title: 'Transformation répétée',
      body: `${field('rt-n', 'Copies', 1, 60, 1, o.n, '')}
        ${field('rt-angle', 'Rotation par copie', -180, 180, 1, o.angle, '°')}
        ${field('rt-scale', 'Échelle par copie', 50, 150, 1, o.scale, ' %')}
        ${field('rt-dx', 'Décalage horizontal', -400, 400, 1, o.dx, ' px')}
        ${field('rt-dy', 'Décalage vertical', -400, 400, 1, o.dy, ' px')}
        ${field('rt-fade', 'Fondu jusqu\'à', 0, 98, 1, o.fade, ' %')}
        <div class="chips"><button class="chip is-active" type="button" data-pivot="object">Autour de l'objet</button><button class="chip" type="button" data-pivot="page">Autour du centre de la page</button></div>`,
      foot: '<button class="btn" type="button" data-close>Annuler</button><button class="btn btn-primary" type="button" id="rt-ok">Créer les copies</button>',
    });
    sheet.el.classList.add('sheet-side');
    [['rt-n', 'n', ''], ['rt-angle', 'angle', '°'], ['rt-scale', 'scale', ' %'], ['rt-dx', 'dx', ' px'], ['rt-dy', 'dy', ' px'], ['rt-fade', 'fade', ' %']].forEach(([id, key, unit]) => {
      const input = sheet.$(`#${id}`);
      paintRange(input);
      input.addEventListener('input', () => {
        o = { ...o, [key]: Number(input.value) };
        sheet.$(`#out-${id}`).textContent = `${input.value}${unit}`;
        paintRange(input);
        show();
      });
    });
    sheet.$$('[data-pivot]').forEach((b) => b.addEventListener('click', () => {
      o = { ...o, pivot: b.dataset.pivot };
      sheet.$$('[data-pivot]').forEach((x) => x.classList.toggle('is-active', x === b));
      show();
    }));
    let ok = false;
    sheet.$('#rt-ok').addEventListener('click', () => { ok = true; sheet.close(); });
    sheet.el.addEventListener('close', () => {
      busy += 1;
      if (ok) {
        History.restoring = false;
        previews.forEach((p) => p.set({ selectable: true, evented: true, excludeFromExport: false }));
        canvas.remove(base, ...previews);
        const group = new fabric.Group([base, ...previews], { name: 'Transformation répétée' });
        canvas.add(group);
        canvas.setActiveObject(group);
        History.queue();
        toast(`${previews.length} copie${previews.length > 1 ? 's' : ''} créée${previews.length > 1 ? 's' : ''} (groupe)`, 'success');
      } else {
        previews.forEach((p) => canvas.remove(p));
        if (objs.length > 1) { canvas.remove(base); base._restoreObjectsState(); objs.forEach((x) => canvas.add(x)); }
        Arrange.reselect(objs);
        History.restoring = false; // annulé : aucune étape d'historique
      }
      canvas.requestRenderAll();
      sheet.el.remove();
    });
    sheet.open();
  },
};

Hooks.on('init', () => {
  const row = html(`<div class="btn-row effects-more">
    <button class="btn btn-sm" type="button" id="fx-warp">Déformation…</button>
    <button class="btn btn-sm" type="button" id="fx-repeat">Répétition…</button></div>`);
  $('#section-effects').appendChild(row);
  row.querySelector('#fx-warp').addEventListener('click', () => Warp.open());
  row.querySelector('#fx-repeat').addEventListener('click', () => RepeatTransform.open());
});
