/**
 * ============================================================================
 *  Chloe’s Touch — Masques d'écrêtage
 *
 *  ⌘/Ctrl + 7       Créer le masque : l'objet du DESSUS (forme, tracé ou
 *                   texte) découpe les objets sélectionnés en dessous.
 *                   Le résultat est un « Groupe de masques » (clipPath
 *                   Fabric) : la forme-masque devient un tracé transparent.
 *  ⌘/Ctrl + Alt + 7 Libérer le masque : on retrouve les objets et la forme.
 *  Tuile « Masque » : inverser le masque, le libérer.
 * ============================================================================
 */
'use strict';

const ClipMask = {
  canBeMask(obj) {
    return Geo.canConvert(obj) || isText(obj) || (obj.type === 'group' && obj.getObjects().every((c) => Geo.canConvert(c) || isText(c)));
  },

  make() {
    const objs = canvas.getActiveObjects().filter((o) => !o.locked);
    if (objs.length < 2) { toast('Sélectionnez la forme-masque (au-dessus) et les objets à masquer.'); return; }
    const all = canvas.getObjects();
    const list = objs.slice().sort((a, b) => all.indexOf(a) - all.indexOf(b));
    const mask = list[list.length - 1];
    if (!this.canBeMask(mask)) { toast('Le masque doit être une forme, un tracé ou un texte placé au-dessus des objets.', 'error', 5000); return; }
    const contents = list.slice(0, -1);
    canvas.discardActiveObject();
    const index = all.indexOf(contents[contents.length - 1]);
    contents.forEach((o) => canvas.remove(o));
    canvas.remove(mask);
    const group = new fabric.Group(contents, { name: 'Groupe de masques' });
    const gc = group.getCenterPoint();
    const mc = mask.getCenterPoint();
    mask.maskOpacity = mask.opacity;
    mask.set({ opacity: 1, absolutePositioned: false });
    mask.setPositionByOrigin(new fabric.Point(mc.x - gc.x, mc.y - gc.y), 'center', 'center');
    group.clipPath = mask;
    group.clipMask = true;
    canvas.insertAt(group, Math.max(0, Math.min(index, canvas.getObjects().length)));
    canvas.setActiveObject(group);
    canvas.requestRenderAll();
    History.queue();
    Properties.sync();
    toast('Masque créé — ⌘/Ctrl + Alt + 7 pour le libérer', 'success');
  },

  release(group = canvas.getActiveObject()) {
    if (!group?.clipMask || !group.clipPath) { toast('Sélectionnez un groupe de masques.'); return; }
    const clip = group.clipPath;
    const index = canvas.getObjects().indexOf(group);
    const matrix = fabric.util.multiplyTransformMatrices(group.calcTransformMatrix(), clip.calcTransformMatrix());
    group.clipPath = null;
    canvas.discardActiveObject();
    // Les objets reprennent leur place absolue
    const items = group.getObjects();
    group._restoreObjectsState();
    canvas.remove(group);
    items.forEach((o, i) => { o.group = undefined; canvas.insertAt(o, index + i); o.setCoords(); });
    fabric.util.applyTransformToObject(clip, matrix);
    clip.set({ opacity: clip.maskOpacity ?? 1, inverted: false });
    delete clip.maskOpacity;
    canvas.insertAt(clip, index + items.length);
    clip.setCoords();
    Arrange.reselect([...items, clip]);
    canvas.requestRenderAll();
    History.queue();
    Properties.sync();
    toast('Masque libéré', 'success');
  },

  invert(on) {
    const g = canvas.getActiveObject();
    if (!g?.clipMask || !g.clipPath) return;
    g.clipPath.inverted = on;
    g.dirty = true;
    canvas.requestRenderAll();
    History.queue();
  },

  mountUI() {
    this.el = html(`
      <section class="tile" id="section-mask" hidden>
        <div class="feature-head"><h3>Masque d'écrêtage</h3></div>
        <label class="check"><input type="checkbox" id="mask-invert"> Inverser le masque (garder l'extérieur)</label>
        <button class="btn btn-sm btn-block" type="button" id="mask-release">Libérer le masque <kbd>⌘⌥7</kbd></button>
      </section>`);
    dom.sectionArrange.before(this.el);
    this.el.querySelector('#mask-release').addEventListener('click', () => this.release());
    this.el.querySelector('#mask-invert').addEventListener('change', (e) => this.invert(e.target.checked));
    // Bouton « Créer un masque » dans la tuile Disposition
    const make = html('<button class="btn btn-sm btn-block" type="button" id="mask-make" hidden title="L\'objet du dessus découpe les autres (⌘/Ctrl + 7)">Créer un masque d\'écrêtage</button>');
    $('#btn-flip-h').closest('.btn-row').after(make);
    make.addEventListener('click', () => this.make());
    Hooks.on('sync', ({ objects, ref, single }) => {
      const isMask = single && ref?.clipMask && ref.clipPath;
      this.el.hidden = !isMask;
      if (isMask) this.el.querySelector('#mask-invert').checked = Boolean(ref.clipPath.inverted);
      make.hidden = objects.length < 2;
    });
    Keys.add((e, { mod }) => {
      if (mod && e.code === 'Digit7') {
        e.preventDefault();
        if (e.altKey) this.release(); else this.make();
        return true;
      }
      return false;
    });
  },
};

SERIAL_PROPS.push('clipMask', 'maskOpacity');
TYPE_LABELS.mask = 'Groupe de masques';

Hooks.on('init', () => ClipMask.mountUI());
