/**
 * ============================================================================
 *  Chloe’s Touch — Flèche noire / Flèche blanche
 *
 *  Flèche noire (V) — Sélection : objets et groupes entiers (déplacer,
 *    redimensionner, faire pivoter). C'est l'outil « select » d'app.js.
 *  Flèche blanche (A) — Sélection directe : un clic sur une forme affiche ses
 *    points d'ancrage et leurs poignées (PathEditor de pen.js) ; la forme ne se
 *    déplace pas, seuls les points bougent. Rectangles, ellipses, polygones,
 *    étoiles, lignes… sont convertis en tracé au premier clic (comme les
 *    « formes dynamiques » d'Illustrator), ⌘Z pour revenir en arrière.
 *  Double-clic avec la flèche noire sur ces mêmes formes : édition des points.
 * ============================================================================
 */
'use strict';

const DirectSelect = {
  /** Prépare un objet pour l'édition des points (conversion en tracé si besoin) */
  editable(obj) {
    if (!obj || obj.locked || !Geo.canConvert(obj)) return null;
    if (obj.type === 'path') return obj;
    const path = Geo.toPath(obj);
    Geo.replace(obj, path, { select: false });
    toast('Forme convertie en tracé : ses points sont modifiables (⌘Z pour annuler).');
    return path;
  },

  /** Démarre l'édition des points sur obj (flèche blanche ou double-clic) */
  edit(obj) {
    const path = this.editable(obj);
    if (!path) return false;
    if (PathEditor.obj === path) return true;
    PathEditor.start(path);
    if (state.tool === 'direct') path.set({ lockMovementX: true, lockMovementY: true });
    return true;
  },

  bind() {
    // Flèche blanche : la sélection d'une forme lance l'édition de ses points
    const onSelect = () => {
      if (state.tool !== 'direct') return;
      const objs = canvas.getActiveObjects();
      if (objs.length !== 1 || objs[0] === PathEditor.obj) return;
      this.edit(objs[0]);
    };
    canvas.on('selection:created', onSelect);
    canvas.on('selection:updated', onSelect);

    // Flèche noire : double-clic sur une forme non-tracé → édition des points
    canvas.on('mouse:dblclick', ({ target }) => {
      if (state.tool !== 'select' || state.cropping || PathEditor.obj) return;
      if (target && target.type !== 'path' && Geo.canConvert(target)) this.edit(target);
    });

    // En sortie d'édition, le tracé redevient déplaçable
    const stop = PathEditor.stop.bind(PathEditor);
    PathEditor.stop = () => {
      const obj = PathEditor.obj;
      stop();
      if (obj) obj.set({ lockMovementX: false, lockMovementY: false });
    };
  },
};

Tools.direct = {
  cursor: 'default',
  activate() {
    setInteractionMode('select');
    canvas.selection = false; // pas de rectangle de sélection : on vise une forme
    const active = canvas.getActiveObjects();
    if (active.length === 1) DirectSelect.edit(active[0]);
  },
  deactivate() { PathEditor.stop(); },
};

TOOL_LABELS.select = 'Sélection';
TOOL_LABELS.direct = 'Sélection directe';
SHORTCUTS.a = 'direct';

Hooks.on('init', () => {
  // Bouton « flèche blanche » juste après la flèche noire
  const black = $('.rail [data-tool="select"]');
  black.classList.add('rail-btn-arrow-black');
  black.title = 'Sélection — flèche noire : objets et groupes (V)';
  const white = html(`
    <button class="rail-btn rail-btn-arrow-white" data-tool="direct" type="button" title="Sélection directe — flèche blanche : points et poignées (A)" aria-label="Sélection directe">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 3.5 18 11l-5.6 1.7L10 18.5z"/></svg>
    </button>`);
  black.after(white);
  white.addEventListener('click', () => setTool('direct'));
  dom.toolButtons = document.querySelectorAll('[data-tool]'); // l'état actif suit le nouveau bouton
  DirectSelect.bind();
});
