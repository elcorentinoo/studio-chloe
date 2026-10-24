/**
 * ============================================================================
 *  Chloe’s Touch — Rognage rapide (Maj + C)
 *
 *  Tracez un cadre : les éléments qu'il touche sont rognés à ce cadre.
 *    - si des objets étaient sélectionnés avant d'activer l'outil, seuls eux
 *      sont rognés (« éléments spécifiques ») ; sinon tous ceux touchés ;
 *    - image droite (0°, 90°…) : vrai rognage non destructif (cropX / cropY),
 *      réajustable ensuite avec le rognage classique (C) ;
 *    - autres objets (formes, textes, groupes, images tournées) : masque
 *      rectangulaire attaché à l'objet (clipPath) — il suit l'objet quand on
 *      le déplace, et « Retirer le rognage » le supprime.
 * ============================================================================
 */
'use strict';

const QuickCrop = {
  targets: null, // objets choisis avant d'activer l'outil (ou null = tous)

  /** Cadre (document) → coins dans le repère local de l'objet */
  localCorners(obj, box) {
    const inv = fabric.util.invertTransform(obj.calcTransformMatrix());
    return [
      { x: box.left, y: box.top }, { x: box.left + box.width, y: box.top },
      { x: box.left + box.width, y: box.top + box.height }, { x: box.left, y: box.top + box.height },
    ].map((p) => fabric.util.transformPoint(p, inv));
  },

  intersects(obj, box) {
    const b = obj.getBoundingRect(true, true);
    return b.left < box.left + box.width && b.left + b.width > box.left && b.top < box.top + box.height && b.top + b.height > box.top;
  },

  /** Image droite : rognage réel (même calcul que Cropper.apply) */
  cropImage(img, box) {
    const pts = this.localCorners(img, box);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const x0 = Math.max(-img.width / 2, Math.min(...xs));
    const x1 = Math.min(img.width / 2, Math.max(...xs));
    const y0 = Math.max(-img.height / 2, Math.min(...ys));
    const y1 = Math.min(img.height / 2, Math.max(...ys));
    if (x1 - x0 < 2 || y1 - y0 < 2) return false;
    const matrix = img.calcTransformMatrix();
    const center = fabric.util.transformPoint({ x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, matrix);
    img.set({
      cropX: img.cropX + (x0 + img.width / 2),
      cropY: img.cropY + (y0 + img.height / 2),
      width: x1 - x0,
      height: y1 - y0,
    });
    img.setPositionByOrigin(center, 'center', 'center');
    img.setCoords();
    return true;
  },

  /** Autres objets : masque rectangulaire dans le repère de l'objet */
  clipObject(obj, box) {
    const pts = this.localCorners(obj, box);
    const clip = new fabric.Polygon(pts, { strokeWidth: 0, fill: '#000', objectCaching: false });
    clip.quickCrop = true; // repère notre masque (bouton « Retirer le rognage »)
    if (obj.clipPath && !obj.clipPath.quickCrop) toast('Le masque existant de l\'objet est remplacé par le rognage.');
    obj.set({ clipPath: clip, dirty: true });
    obj.setCoords();
    return true;
  },

  apply(box) {
    const pool = (this.targets || canvas.getObjects()).filter((o) => canvas.getObjects().includes(o)
      && o.visible && !o.locked && !o.excludeFromExport && this.intersects(o, box));
    if (!pool.length) { toast('Le cadre ne touche aucun élément.'); return []; }
    const done = pool.filter((o) => {
      const straight = Math.abs(((o.angle || 0) % 90 + 90) % 90) < 0.01 && !o.skewX && !o.skewY;
      if (isImage(o) && straight && !o.clipPath) return this.cropImage(o, box);
      return this.clipObject(o, box);
    });
    return done;
  },

  release(objs = canvas.getActiveObjects()) {
    const list = objs.filter((o) => o.clipPath?.quickCrop);
    list.forEach((o) => o.set({ clipPath: null, dirty: true }));
    if (!list.length) return;
    canvas.requestRenderAll();
    History.queue();
    Properties.sync();
    toast('Rognage retiré', 'success');
  },
};

Tools.quickcrop = {
  cursor: 'crosshair',
  activate() {
    const sel = canvas.getActiveObjects();
    QuickCrop.targets = sel.length ? sel : null;
    canvas.discardActiveObject();
    setInteractionMode('draw');
    toast(QuickCrop.targets
      ? `Tracez le cadre : ${sel.length} élément${sel.length > 1 ? 's' : ''} sélectionné${sel.length > 1 ? 's' : ''} sera rogné.`
      : 'Tracez le cadre : les éléments touchés seront rognés.');
  },
  deactivate() {
    cancelDrawing();
    QuickCrop.targets = null;
  },
  onMouseDown(p) {
    const rect = new fabric.Rect({
      left: p.x, top: p.y, width: 0, height: 0,
      fill: 'rgba(246, 138, 141, 0.16)', stroke: '#d9474f', strokeWidth: 1.5, strokeDashArray: [6, 4],
      strokeUniform: true, selectable: false, evented: false, excludeFromExport: true,
    });
    state.drawing = { obj: rect, origin: p }; // l'historique ignore le cadre
    canvas.add(rect);
  },
  onMouseMove(p, e) {
    if (!state.drawing) return;
    const { obj, origin } = state.drawing;
    obj.set(getDragBox(origin, p, e.shiftKey));
    canvas.requestRenderAll();
  },
  onMouseUp(p, e) {
    if (!state.drawing) return;
    const { origin } = state.drawing;
    const box = getDragBox(origin, p, e.shiftKey);
    cancelDrawing();
    if (box.width < MIN_DRAG_SIZE || box.height < MIN_DRAG_SIZE) return;
    const done = QuickCrop.apply(box);
    setTool('select');
    if (done.length) {
      Arrange.reselect(done);
      canvas.requestRenderAll();
      History.queue();
      toast(`${done.length} élément${done.length > 1 ? 's' : ''} rogné${done.length > 1 ? 's' : ''} — ⌘Z pour annuler`, 'success');
    }
  },
};

TOOL_LABELS.quickcrop = 'Rognage rapide';
SERIAL_PROPS.push('quickCrop'); // le masque de rognage reste reconnaissable après annulation / rechargement

Hooks.on('init', () => {
  const btn = html(`
    <button class="rail-btn" data-tool="quickcrop" type="button" title="Rognage rapide : tracez un cadre sur les éléments à rogner (Maj + C)" aria-label="Rognage rapide">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/><path d="M13 9.5 11 13h3l-2 3.5" stroke-width="1.6"/></svg>
    </button>`);
  dom.btnCropTool.after(btn);
  btn.addEventListener('click', () => setTool('quickcrop'));
  dom.toolButtons = document.querySelectorAll('[data-tool]');

  // « Retirer le rognage » dans la tuile Disposition (objets rognés par masque)
  const rel = html('<button class="btn btn-sm btn-block" type="button" id="btn-quickcrop-release" hidden>Retirer le rognage</button>');
  $('#btn-flip-h').closest('.btn-row').after(rel);
  rel.addEventListener('click', () => QuickCrop.release());
  Hooks.on('sync', ({ objects }) => { rel.hidden = !objects.some((o) => o.clipPath?.quickCrop); });

  Keys.add((e, { mod, key }) => {
    if (!mod && !e.altKey && e.shiftKey && key === 'c') { e.preventDefault(); setTool('quickcrop'); return true; }
    return false;
  });
});
