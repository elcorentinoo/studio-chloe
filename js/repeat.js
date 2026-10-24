/**
 * ============================================================================
 *  Studio Chloé — Répétition radiale, en grille, en miroir (modifiable)
 *
 *  Comme Objet › Répétition d'Illustrator : la sélection devient un groupe
 *  « répétition » dont le premier élément est l'original et les autres des
 *  copies placées automatiquement :
 *    - radiale : N copies tournées autour d'un centre (rayon, angle de départ) ;
 *    - grille : colonnes × lignes, espacements horizontal et vertical ;
 *    - miroir : copie symétrique (axe vertical ou horizontal, écart).
 *  Les réglages restent modifiables (tuile « Répétition » du panneau).
 *  Double-clic sur la répétition (mode isolation) : on modifie l'original et,
 *  en sortant, toutes les copies suivent. « Libérer » en fait un groupe
 *  ordinaire. Modèle : group.repeat = { kind, …réglages }.
 * ============================================================================
 */
'use strict';

const REPEAT_KINDS = {
  radial: { label: 'Radiale', defaults: { count: 8, radius: 160, start: 0 }, params: [['count', 'Copies', 2, 60, 1, ''], ['radius', 'Rayon', 0, 1200, 1, ' px'], ['start', 'Angle de départ', -180, 180, 1, '°']] },
  grid: { label: 'Grille', defaults: { cols: 3, rows: 3, gapX: 20, gapY: 20 }, params: [['cols', 'Colonnes', 1, 30, 1, ''], ['rows', 'Lignes', 1, 30, 1, ''], ['gapX', 'Espacement horizontal', -200, 400, 1, ' px'], ['gapY', 'Espacement vertical', -200, 400, 1, ' px']] },
  mirror: { label: 'Miroir', defaults: { axis: 'v', gap: 20 }, params: [['gap', 'Écart', -400, 600, 1, ' px']], toggle: ['axis', 'Axe horizontal', 'h', 'v'] },
};
const REPEAT_ICON = '<circle cx="12" cy="5" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="5" cy="12" r="2"/>';

const Repeat = {
  isRepeat(o) { return o?.type === 'group' && o.repeat && REPEAT_KINDS[o.repeat.kind]; },

  clone(o) { return new Promise((res) => o.clone(res, SERIAL_PROPS)); },

  /** Transformations des copies (matrices dans le document) à partir de la boîte de l'original */
  matrices(p, box) {
    const T = (x, y) => [1, 0, 0, 1, x, y];
    const mul = fabric.util.multiplyTransformMatrices;
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const out = [];
    if (p.kind === 'radial') {
      // l'original est en haut du cercle ; le centre est sous lui, à « rayon » de distance
      const C = { x: cx, y: cy + p.radius };
      for (let i = 0; i < p.count; i++) {
        const a = fabric.util.degreesToRadians(p.start + (360 / p.count) * i);
        const R = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
        out.push(mul(T(C.x, C.y), mul(R, T(-C.x, -C.y))));
      }
    } else if (p.kind === 'grid') {
      for (let j = 0; j < p.rows; j++) {
        for (let i = 0; i < p.cols; i++) out.push(T(i * (box.width + p.gapX), j * (box.height + p.gapY)));
      }
    } else {
      out.push(T(0, 0));
      if (p.axis === 'h') {
        const ay = box.top + box.height + p.gap / 2;
        out.push(mul(T(0, ay), mul([1, 0, 0, -1, 0, 0], T(0, -ay))));
      } else {
        const ax = box.left + box.width + p.gap / 2;
        out.push(mul(T(ax, 0), mul([-1, 0, 0, 1, 0, 0], T(-ax, 0))));
      }
    }
    return out;
  },

  /** Construit le groupe de répétition à partir de l'original (coordonnées du document) */
  async build(source, params, extra = {}) {
    const box = source.getBoundingRect(true, true);
    const m0 = source.calcTransformMatrix();
    const mats = this.matrices(params, box);
    const items = await Promise.all(mats.map(async (M, i) => {
      const c = i === 0 ? source : await this.clone(source);
      fabric.util.applyTransformToObject(c, fabric.util.multiplyTransformMatrices(M, m0));
      c.group = undefined;
      c.setCoords();
      return c;
    }));
    const g = new fabric.Group(items, { name: extra.name, opacity: extra.opacity ?? 1 });
    g.repeat = { ...params };
    ['layerId', 'assetName', 'shadow', 'globalCompositeOperation'].forEach((k) => { if (extra[k] !== undefined) g[k] = extra[k]; });
    return g;
  },

  /** Original d'une répétition, détaché du groupe (coordonnées du document) */
  sourceOf(g) {
    const src = g.getObjects()[0];
    const m = src.calcTransformMatrix();
    return new Promise((res) => src.clone((c) => { fabric.util.applyTransformToObject(c, m); c.group = undefined; res(c); }, SERIAL_PROPS));
  },

  async create(kind) {
    const objs = canvas.getActiveObjects().filter((o) => !o.excludeFromExport);
    if (!objs.length) { toast('Sélectionnez le motif à répéter.'); return null; }
    History.flush();
    canvas.discardActiveObject();
    const index = Math.min(...objs.map((o) => canvas.getObjects().indexOf(o)));
    let source;
    if (objs.length > 1) {
      objs.forEach((o) => canvas.remove(o));
      source = new fabric.Group(objs); // plusieurs objets : répétés ensemble
    } else {
      [source] = objs;
      canvas.remove(source);
    }
    const params = { kind, ...REPEAT_KINDS[kind].defaults };
    if (kind === 'radial') params.radius = Math.round(Math.max(source.getScaledHeight(), source.getScaledWidth()) * 1.6);
    const g = await this.build(source, params, { layerId: objs[0].layerId });
    canvas.insertAt(g, index);
    canvas.setActiveObject(g);
    canvas.requestRenderAll();
    History.queue();
    Properties.sync();
    toast(`Répétition ${REPEAT_KINDS[kind].label.toLowerCase()} : réglages dans le panneau, double-clic pour modifier l'original.`, 'success');
    return g;
  },

  /** Reconstruit une répétition avec de nouveaux réglages (ou un original modifié) */
  async rebuild(g, patch = {}) {
    if (!this.isRepeat(g)) return null;
    const ticket = (this.ticket = (this.ticket || 0) + 1);
    const params = { ...g.repeat, ...patch };
    const source = await this.sourceOf(g);
    const next = await this.build(source, params, { name: g.name, opacity: g.opacity, layerId: g.layerId, assetName: g.assetName, shadow: g.shadow, globalCompositeOperation: g.globalCompositeOperation });
    if (ticket !== this.ticket || !canvas.getObjects().includes(g)) return null; // une reconstruction plus récente a pris le relais
    const index = canvas.getObjects().indexOf(g);
    const wasActive = canvas.getActiveObject() === g;
    const restoring = History.restoring;
    History.restoring = true; // une seule étape, posée ensuite
    canvas.remove(g);
    canvas.insertAt(next, index);
    History.restoring = restoring;
    if (wasActive) canvas.setActiveObject(next);
    canvas.requestRenderAll();
    return next;
  },

  release() {
    const g = canvas.getActiveObject();
    if (!this.isRepeat(g)) return;
    delete g.repeat;
    History.queue();
    Properties.sync();
    toast('Répétition libérée : c\'est maintenant un groupe ordinaire.');
  },

  /* ---------- panneau ---------- */
  mountUI() {
    const row = html(`<div class="btn-row repeat-row">
      ${Object.entries(REPEAT_KINDS).map(([k, d]) => `<button class="btn btn-sm" type="button" data-repeat-new="${k}" title="Répétition ${d.label.toLowerCase()} de la sélection">${d.label}</button>`).join('')}
    </div>`);
    const label = html('<span class="swatch-caption">Répétition modifiable</span>');
    $('#section-effects').append(label, row);
    row.querySelectorAll('[data-repeat-new]').forEach((b) => b.addEventListener('click', () => this.create(b.dataset.repeatNew)));

    this.tile = html(`
      <section class="tile" id="section-repeat" hidden>
        <div class="feature-head"><div><h3>Répétition</h3><p class="field-note" id="repeat-note"></p></div>
          <svg class="repeat-icon" viewBox="0 0 24 24" aria-hidden="true">${REPEAT_ICON}</svg></div>
        <div class="seg" role="group" aria-label="Type de répétition" id="repeat-kinds">
          ${Object.entries(REPEAT_KINDS).map(([k, d]) => `<button class="seg-btn" type="button" data-repeat-kind="${k}">${d.label}</button>`).join('')}
        </div>
        <div id="repeat-params"></div>
        <button class="btn btn-sm btn-block" type="button" id="repeat-release">Libérer (groupe ordinaire)</button>
      </section>`);
    $('#section-effects').before(this.tile);
    this.tile.querySelectorAll('[data-repeat-kind]').forEach((b) => b.addEventListener('click', async () => {
      const g = canvas.getActiveObject();
      if (!this.isRepeat(g) || g.repeat.kind === b.dataset.repeatKind) return;
      const k = b.dataset.repeatKind;
      const next = await this.rebuild(g, { kind: k, ...REPEAT_KINDS[k].defaults });
      if (next) { History.queue(); Properties.sync(); }
    }));
    this.tile.querySelector('#repeat-release').addEventListener('click', () => this.release());
    Hooks.on('sync', () => this.sync());
  },

  sync() {
    const g = canvas.getActiveObject();
    const on = this.isRepeat(g);
    this.tile.hidden = !on;
    if (!on) return;
    const def = REPEAT_KINDS[g.repeat.kind];
    this.tile.querySelector('#repeat-note').textContent = `${def.label} · ${g.size()} éléments — double-clic pour modifier l'original.`;
    this.tile.querySelectorAll('[data-repeat-kind]').forEach((b) => b.classList.toggle('is-active', b.dataset.repeatKind === g.repeat.kind));
    const box = this.tile.querySelector('#repeat-params');
    box.replaceChildren(...def.params.map(([k, label, min, max, step, unit]) => {
      const f = html(`<div class="field"><label class="field-label">${label} <output>${g.repeat[k]}${unit}</output></label><input type="range" min="${min}" max="${max}" step="${step}" value="${g.repeat[k]}"></div>`);
      const r = f.querySelector('input');
      paintRange(r);
      r.addEventListener('input', () => {
        f.querySelector('output').textContent = `${r.value}${unit}`;
        paintRange(r);
        const cur = canvas.getActiveObject();
        if (this.isRepeat(cur)) this.rebuild(cur, { [k]: Number(r.value) });
      });
      r.addEventListener('change', () => setTimeout(() => History.queue(), 60));
      return f;
    }));
    if (def.toggle) {
      const [k, label, on1] = def.toggle;
      const t = html(`<label class="check"><input type="checkbox" ${g.repeat[k] === on1 ? 'checked' : ''}> ${label}</label>`);
      t.querySelector('input').addEventListener('change', async (e) => {
        const cur = canvas.getActiveObject();
        if (!this.isRepeat(cur)) return;
        await this.rebuild(cur, { [k]: e.target.checked ? def.toggle[2] : def.toggle[3] });
        History.queue();
      });
      box.appendChild(t);
    }
  },
};

SERIAL_PROPS.push('repeat');
TYPE_LABELS.repeat = 'Répétition';

Hooks.on('init', () => {
  Repeat.mountUI();
  // Isolation d'une répétition : seul l'original se modifie, les copies suivent à la sortie
  const baseEnter = Isolation.enter.bind(Isolation);
  Isolation.enter = (group) => {
    const rep = Repeat.isRepeat(group) ? { ...group.repeat } : null;
    const level = baseEnter(group);
    if (level && rep) {
      level.repeatParams = rep;
      [...level.members].slice(1).forEach((c) => c.set({ selectable: false, evented: false, opacity: (c.opacity ?? 1) * 0.5 }));
      level.copies = [...level.members].slice(1);
    }
    return level;
  };
  const baseExit = Isolation.exit.bind(Isolation);
  Isolation.exit = () => {
    const level = Isolation.active;
    if (level?.copies) level.copies.forEach((c) => c.set({ selectable: true, evented: true, opacity: (c.opacity ?? 1) * 2 }));
    const result = baseExit();
    if (result && level?.repeatParams) {
      result.repeat = level.repeatParams;
      Repeat.rebuild(result).then((next) => { if (next && !Isolation.stack.length) { History.queue(); Properties.sync(); } });
    }
    return result;
  };
});
