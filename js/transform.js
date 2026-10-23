/**
 * ============================================================================
 *  Studio Chloé — Transformations
 *    1. Miroir / symétrie (Maj + H horizontal, Maj + V vertical)
 *       - un objet : retourné sur place (autour de son centre)
 *       - plusieurs objets : la sélection entière est retournée autour de son
 *         centre commun (positions ET objets inversés, comme dans Illustrator)
 * ============================================================================
 */
'use strict';

const MIRROR_ICONS = {
  h: '<path d="M12 3v18" stroke-dasharray="2 2"/><path d="M9 6 3 18h6zM15 6l6 12h-6z"/>',
  v: '<path d="M3 12h18" stroke-dasharray="2 2"/><path d="M6 9 18 3v6zM6 15l12 6v-6z"/>',
};

const Mirror = {
  /**
   * Retourne un objet autour d'un axe (coordonnées du document).
   * Calcul : F·(T·R·S·K) = T'·R(−θ)·S(flip inversé)·K — l'angle change de signe,
   * l'inclinaison est conservée, le centre est symétrisé par rapport à l'axe.
   */
  flipObject(obj, axis, at) {
    const c = obj.getCenterPoint();
    const center = axis === 'h'
      ? new fabric.Point(2 * at - c.x, c.y)
      : new fabric.Point(c.x, 2 * at - c.y);
    obj.set({
      angle: (360 - (obj.angle || 0)) % 360,
      [axis === 'h' ? 'flipX' : 'flipY']: !obj[axis === 'h' ? 'flipX' : 'flipY'],
    });
    obj.setPositionByOrigin(center, 'center', 'center');
    obj.setCoords();
  },

  /** Miroir de la sélection : 'h' (gauche ↔ droite) ou 'v' (haut ↔ bas) */
  flip(axis) {
    const objs = canvas.getActiveObjects();
    if (!objs.length || state.cropping) return;
    if (objs.some((o) => o.locked)) return;
    Arrange.withLoose((list) => {
      const box = Arrange.union(list.map(Arrange.rect));
      const at = axis === 'h' ? box.left + box.width / 2 : box.top + box.height / 2;
      list.forEach((o) => this.flipObject(o, axis, at));
    });
    canvas.fire('object:modified', { target: canvas.getActiveObject(), action: 'flip' });
    Properties.sync();
  },

  mountUI() {
    const row = html(`
      <div class="btn-row mirror-row">
        <button class="btn btn-sm" type="button" id="btn-flip-h" disabled title="Miroir horizontal (Maj + H)">
          <svg viewBox="0 0 24 24" aria-hidden="true">${MIRROR_ICONS.h}</svg> Miroir H
        </button>
        <button class="btn btn-sm" type="button" id="btn-flip-v" disabled title="Miroir vertical (Maj + V)">
          <svg viewBox="0 0 24 24" aria-hidden="true">${MIRROR_ICONS.v}</svg> Miroir V
        </button>
      </div>`);
    // Sous les boutons Avancer / Reculer de la tuile Disposition
    $('#btn-forward').closest('.btn-row').after(row);
    $('#btn-flip-h').addEventListener('click', () => this.flip('h'));
    $('#btn-flip-v').addEventListener('click', () => this.flip('v'));
    Hooks.on('sync', ({ hasSelection }) => {
      $('#btn-flip-h').disabled = !hasSelection;
      $('#btn-flip-v').disabled = !hasSelection;
    });
    Keys.add((e, { mod, key }) => {
      if (!mod && !e.altKey && e.shiftKey && (key === 'h' || key === 'v') && canvas.getActiveObjects().length) {
        e.preventDefault();
        this.flip(key);
        return true;
      }
      return false;
    });
  },
};

Hooks.on('init', () => {
  Mirror.mountUI();
});
