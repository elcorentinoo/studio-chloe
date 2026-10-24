/**
 * ============================================================================
 *  Studio Chloé — Modes de fusion
 *
 *  Comme le menu « Mode de fusion » du panneau Transparence d'Illustrator :
 *  Normal, Produit, Écran, Incrustation… (globalCompositeOperation de Fabric,
 *  enregistré avec le document). Choix sous l'opacité, dans la tuile
 *  Apparence ; s'applique à toute la sélection. Export PNG / JPG / PDF : rendu
 *  par le canvas ; export SVG : propriété CSS mix-blend-mode.
 * ============================================================================
 */
'use strict';

const BLEND_MODES = [
  ['source-over', 'Normal'],
  null,
  ['darken', 'Obscurcir'],
  ['multiply', 'Produit'],
  ['color-burn', 'Densité couleur +'],
  null,
  ['lighten', 'Éclaircir'],
  ['screen', 'Écran'],
  ['color-dodge', 'Densité couleur −'],
  null,
  ['overlay', 'Incrustation'],
  ['soft-light', 'Lumière tamisée'],
  ['hard-light', 'Lumière crue'],
  null,
  ['difference', 'Différence'],
  ['exclusion', 'Exclusion'],
  null,
  ['hue', 'Teinte'],
  ['saturation', 'Saturation'],
  ['color', 'Couleur'],
  ['luminosity', 'Luminosité'],
];
const BLEND_CSS = new Set(BLEND_MODES.filter(Boolean).map(([k]) => k).filter((k) => k !== 'source-over'));

const Blend = {
  mountUI() {
    const options = BLEND_MODES.map((m) => (m ? `<option value="${m[0]}">${m[1]}</option>` : '<option disabled>──────────</option>')).join('');
    this.el = html(`
      <div class="field" id="field-blend">
        <label class="field-label" for="prop-blend">Mode de fusion</label>
        <select class="input" id="prop-blend">${options}</select>
      </div>`);
    dom.propOpacity.closest('.field').after(this.el);
    this.select = this.el.querySelector('select');
    this.select.addEventListener('change', () => {
      Properties.apply('globalCompositeOperation', this.select.value);
      History.flush();
    });
    // ↑ / ↓ changent le mode sans déclencher les raccourcis du canevas
    this.select.addEventListener('keydown', (e) => e.stopPropagation());
    Hooks.on('sync', ({ ref, hasSelection }) => {
      this.el.hidden = !hasSelection;
      if (ref) this.select.value = ref.globalCompositeOperation || 'source-over';
    });
  },

  /** Export SVG : mix-blend-mode sur un <g> autour de l'objet */
  wrap(obj, svg) {
    const mode = obj.globalCompositeOperation;
    return BLEND_CSS.has(mode) ? `<g style="mix-blend-mode:${mode}">\n${svg}</g>\n` : svg;
  },

  patchSVG() {
    const self = this;
    fabric.StaticCanvas.prototype._setSVGObject = function _setSVGObject(markup, instance, reviver) {
      markup.push(self.wrap(instance, instance.toSVG(reviver)));
    };
    fabric.Group.prototype._toSVG = function _toSVG(reviver) {
      const svg = ['<g ', 'COMMON_PARTS', ' >\n'];
      this._objects.forEach((o) => svg.push('\t\t', self.wrap(o, o.toSVG(reviver))));
      svg.push('</g>\n');
      return svg;
    };
  },
};

Hooks.on('init', () => { Blend.mountUI(); Blend.patchSVG(); });
