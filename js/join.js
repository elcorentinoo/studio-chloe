/**
 * ============================================================================
 *  Studio Chloé — Joindre (⌘J) et Moyenne (⌘⌥J)
 *
 *  Joindre : un tracé ouvert sélectionné se ferme ; plusieurs tracés ouverts
 *    (tracés, polylignes, lignes) sont reliés par leurs extrémités les plus
 *    proches (segment droit, ou fusion si elles se touchent) pour n'en faire
 *    qu'un. Le style du premier tracé est conservé.
 *  Moyenne : rapproche les extrémités à relier (les deux bouts d'un tracé seul,
 *    sinon les extrémités les plus proches de deux tracés) au point moyen —
 *    horizontalement, verticalement ou les deux. Les poignées suivent.
 *    ⌘⌥⇧J : moyenne + joindre en une fois.
 *  Boutons dans la tuile Disposition.
 * ============================================================================
 */
'use strict';

const Join = {
  isOpenPath(o) {
    if (!o || o.locked || !['path', 'polyline', 'line'].includes(o.type)) return false;
    const cmds = Geo.commands(o);
    return cmds.length > 1 && !cmds.some((c) => c[0] === 'Z') && cmds.filter((c) => c[0] === 'M').length === 1;
  },

  /** Sous-tracé unique (coordonnées du document) d'un tracé ouvert */
  subOf(o) { return FxGeo.split(Geo.commands(o))[0]; },

  endPoint(s) { return s.segs[s.segs.length - 1].end; },

  reverse(s) {
    const pts = [s.start, ...s.segs.map((g) => g.end)];
    const segs = [];
    for (let i = s.segs.length - 1; i >= 0; i--) {
      const g = s.segs[i];
      segs.push({ c: g.c, ctrl: g.ctrl.slice().reverse().map((p) => ({ ...p })), end: { ...pts[i] } });
    }
    return { start: { ...this.endPoint(s) }, segs, closed: false };
  },

  dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); },

  /** Oriente a et b pour que la fin de a rejoigne le début de b (paire la plus proche) */
  orient(a, b) {
    const options = [
      [a, b], [a, this.reverse(b)], [this.reverse(a), b], [this.reverse(a), this.reverse(b)],
    ];
    return options.reduce((best, pair) => (this.dist(this.endPoint(pair[0]), pair[1].start) < this.dist(this.endPoint(best[0]), best[1].start) ? pair : best));
  },

  targets() { return canvas.getActiveObjects().filter((o) => this.isOpenPath(o)); },

  join() {
    const objs = this.targets();
    if (!objs.length) { toast('Sélectionnez un ou plusieurs tracés ouverts à joindre.'); return null; }
    let subs = objs.map((o) => this.subOf(o));
    let cur = subs.shift();
    // Relie à chaque fois le tracé restant le plus proche
    while (subs.length) {
      let bestI = 0;
      let bestPair = null;
      subs.forEach((s, i) => {
        const pair = this.orient(cur, s);
        const d = this.dist(this.endPoint(pair[0]), pair[1].start);
        if (!bestPair || d < bestPair.d) { bestPair = { pair, d }; bestI = i; }
      });
      const [a, b] = bestPair.pair;
      const segs = a.segs.slice();
      if (bestPair.d > 0.5) segs.push({ c: 'L', ctrl: [], end: { ...b.start } });
      cur = { start: a.start, segs: segs.concat(b.segs), closed: false };
      subs.splice(bestI, 1);
    }
    // Un seul tracé (ou extrémités confondues) : on ferme
    if (objs.length === 1 || this.dist(cur.start, this.endPoint(cur)) <= 0.5) {
      if (this.dist(cur.start, this.endPoint(cur)) <= 0.5) Object.assign(this.endPoint(cur), cur.start); // extrémités confondues
      cur.closed = true;
    }
    const first = objs[0];
    const style = Geo.styleOf(first);
    if (!cur.closed && first.type !== 'path') style.fill = null;
    const path = new fabric.Path(Geo.toPathData(FxGeo.join([cur])), { ...style, strokeUniform: first.strokeUniform });
    if (first.liveFx) path.liveFx = first.liveFx.map((f) => ({ ...f }));
    const index = Math.min(...objs.map((o) => canvas.getObjects().indexOf(o)));
    canvas.discardActiveObject();
    objs.forEach((o) => canvas.remove(o));
    canvas.insertAt(path, index);
    path.setCoords();
    canvas.setActiveObject(path);
    canvas.requestRenderAll();
    History.queue();
    Properties.sync();
    toast(cur.closed ? 'Tracé fermé.' : `${objs.length} tracés joints.`, 'success');
    return path;
  },

  /** Moyenne des extrémités : axis = 'h' | 'v' | 'both' */
  average(axis = 'both') {
    const objs = this.targets();
    if (!objs.length) { toast('Sélectionnez un tracé ouvert (ou deux) pour faire la moyenne de leurs extrémités.'); return null; }
    const subs = objs.map((o) => this.subOf(o));
    let ends; // [{ sub, which: 'start' | 'end' }]
    if (subs.length === 1) ends = [{ s: subs[0], which: 'start' }, { s: subs[0], which: 'end' }];
    else {
      let best = null;
      ['start', 'end'].forEach((wa) => ['start', 'end'].forEach((wb) => {
        const pa = wa === 'start' ? subs[0].start : this.endPoint(subs[0]);
        const pb = wb === 'start' ? subs[1].start : this.endPoint(subs[1]);
        const d = this.dist(pa, pb);
        if (!best || d < best.d) best = { d, list: [{ s: subs[0], which: wa }, { s: subs[1], which: wb }] };
      }));
      ends = best.list;
    }
    const pt = (e) => (e.which === 'start' ? e.s.start : this.endPoint(e.s));
    const mx = ends.reduce((t, e) => t + pt(e).x, 0) / ends.length;
    const my = ends.reduce((t, e) => t + pt(e).y, 0) / ends.length;
    ends.forEach((e) => {
      const p = pt(e);
      const dx = axis === 'v' ? 0 : mx - p.x;
      const dy = axis === 'h' ? 0 : my - p.y;
      p.x += dx;
      p.y += dy;
      // la poignée attachée à ce point suit
      const seg = e.which === 'start' ? e.s.segs[0] : e.s.segs[e.s.segs.length - 1];
      if (seg.c !== 'L' && seg.ctrl.length) {
        const h = e.which === 'start' ? seg.ctrl[0] : seg.ctrl[seg.ctrl.length - 1];
        if (seg.c === 'C') { h.x += dx; h.y += dy; }
      }
    });
    const out = objs.map((o, i) => {
      const path = new fabric.Path(Geo.toPathData(FxGeo.join([subs[i]])), { ...Geo.styleOf(o), fill: o.type === 'path' ? o.fill : null, strokeUniform: o.strokeUniform });
      ['liveFx', 'arrowStart', 'arrowEnd', 'arrowScale', 'widthProfile'].forEach((k) => { if (o[k] !== undefined) path[k] = o[k]; });
      Geo.replace(o, path, { select: false });
      return path;
    });
    Arrange.reselect(out);
    canvas.requestRenderAll();
    History.queue();
    return out;
  },

  averageMenu(anchor) {
    const pop = openPopover(anchor, `
      <p class="flyout-title">Moyenne des extrémités</p>
      <button class="flyout-item" type="button" data-avg="h">Horizontale <small>(même X)</small></button>
      <button class="flyout-item" type="button" data-avg="v">Verticale <small>(même Y)</small></button>
      <button class="flyout-item" type="button" data-avg="both">Les deux <kbd>⌘⌥J</kbd></button>
      <div class="flyout-sep"></div>
      <button class="flyout-item" type="button" data-avg="join">Moyenne et joindre <kbd>⌘⌥⇧J</kbd></button>`);
    pop.addEventListener('click', (e) => {
      const k = e.target.closest('[data-avg]')?.dataset.avg;
      if (!k) return;
      closePopover();
      if (k === 'join') { this.average('both'); this.join(); } else this.average(k);
    });
  },

  mountUI() {
    const row = html(`<div class="btn-row" id="join-row">
      <button class="btn btn-sm" type="button" id="btn-join" disabled title="Joindre les tracés ouverts / fermer un tracé (⌘/Ctrl + J)">Joindre</button>
      <button class="btn btn-sm" type="button" id="btn-average" disabled title="Moyenne des extrémités (⌘/Ctrl + Alt + J)">Moyenne…</button>
    </div>`);
    dom.sectionArrange.querySelector('.arrange-block').appendChild(row);
    row.querySelector('#btn-join').addEventListener('click', () => this.join());
    row.querySelector('#btn-average').addEventListener('click', (e) => this.averageMenu(e.currentTarget));
    Hooks.on('sync', () => {
      const ok = this.targets().length > 0;
      row.querySelector('#btn-join').disabled = !ok;
      row.querySelector('#btn-average').disabled = !ok;
    });
    Keys.add((e, { mod, key }) => {
      if (!mod || (key !== 'j' && e.code !== 'KeyJ')) return false;
      e.preventDefault();
      if (e.altKey && e.shiftKey) { this.average('both'); this.join(); } else if (e.altKey) this.average('both'); else this.join();
      return true;
    });
  },
};

Hooks.on('init', () => Join.mountUI());
