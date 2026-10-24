/**
 * ============================================================================
 *  Chloe’s Touch — Décalage du tracé (Offset Path)
 *
 *  Tuile Disposition → « Décalage du tracé… » : crée une copie agrandie
 *  (distance positive) ou rétrécie (négative) de chaque forme sélectionnée,
 *  placée juste sous l'original, comme dans Illustrator. Un tracé ouvert
 *  devient le contour fermé qui l'entoure.
 *  Calcul paper.js : union (ou soustraction) de la forme et d'une bande de
 *  largeur 2 × distance le long de son bord → jointures arrondies.
 * ============================================================================
 */
'use strict';

const OffsetPath = {
  isClosedShape(obj) {
    return obj.type === 'group' ? obj.getObjects().every((c) => this.isClosedShape(c)) : LivePaint.isClosed(obj);
  },

  /** Bande le long du bord (ou du trait) de l'objet, rayon r */
  band(obj, r) {
    const leaves = obj.type === 'group' ? obj.getObjects().flatMap((c) => (c.type === 'group' ? c.getObjects() : [c])) : [obj];
    const parts = [];
    leaves.forEach((o) => {
      WidthProfile.sample(Geo.commands(o)).forEach((s) => parts.push(Eraser.shape(s.pts, r)));
    });
    return parts.reduce((a, b) => a.unite(b, { insert: false }));
  },

  offset(obj, d) {
    const r = Math.abs(d);
    const band = this.band(obj, r);
    if (!this.isClosedShape(obj)) return band;
    const base = Pathfinder.item(obj);
    return d > 0 ? base.unite(band, { insert: false }) : base.subtract(band, { insert: false });
  },

  async run(d) {
    const objs = canvas.getActiveObjects().filter((o) => !o.locked && Pathfinder.usable(o));
    if (!objs.length) { toast('Sélectionnez une forme ou un tracé (vectorisez d\'abord un texte).'); return; }
    if (!d) return;
    try { await PaperKit.ready(); } catch { toast('Indisponible : paper.js n\'a pas pu être chargé.', 'error'); return; }
    canvas.discardActiveObject();
    const made = [];
    objs.forEach((obj) => {
      const item = this.offset(obj, d);
      if (Pathfinder.isEmpty(item)) return;
      const style = Pathfinder.styleOf(obj);
      if (!this.isClosedShape(obj)) Object.assign(style, { fill: obj.stroke || style.fill, stroke: null, strokeWidth: 0 });
      const p = Pathfinder.makePath(item, { ...style, name: `${objectLabel(obj)} (décalage ${d > 0 ? '+' : ''}${d})` });
      canvas.insertAt(p, canvas.getObjects().indexOf(obj));
      made.push(p);
    });
    if (!made.length) { Arrange.reselect(objs); toast('Le décalage est plus grand que la forme : résultat vide.'); return; }
    Arrange.reselect(made);
    canvas.requestRenderAll();
    History.queue();
    toast(`Décalage de ${d} px créé sous ${made.length > 1 ? 'les formes' : 'la forme'}`, 'success');
  },

  open() {
    if (!canvas.getActiveObjects().some((o) => Pathfinder.usable(o))) { toast('Sélectionnez une forme ou un tracé.'); return; }
    const sheet = Sheet.create({
      title: 'Décalage du tracé',
      body: `<div class="field"><label class="field-label" for="offset-d">Distance (px) — négative pour rétrécir</label>
        <input class="input" type="number" id="offset-d" value="10" step="1"></div>
        <p class="field-note">La copie décalée est placée sous l'original. Les angles sont arrondis.</p>`,
      foot: '<button class="btn btn-primary" type="button" id="offset-ok">Créer</button>',
    });
    const go = () => { const d = Number(sheet.$('#offset-d').value) || 0; sheet.close(); this.run(d); };
    sheet.$('#offset-ok').addEventListener('click', go);
    sheet.el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    sheet.el.addEventListener('close', () => sheet.el.remove());
    sheet.open();
    sheet.$('#offset-d').select();
  },
};

Hooks.on('init', () => {
  const btn = html('<button class="btn btn-sm btn-block" type="button" id="btn-offset" hidden>Décalage du tracé…</button>');
  $('#btn-flip-h').closest('.btn-row').after(btn);
  btn.addEventListener('click', () => OffsetPath.open());
  Hooks.on('sync', ({ objects }) => { btn.hidden = !objects.some((o) => Pathfinder.usable(o)); });
});
