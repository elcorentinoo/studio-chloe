/**
 * ============================================================================
 *  Studio Chloé — Lignes & formes particulières (menu des formes)
 *    Arc            — quart d'ellipse tracé du point de départ à la souris
 *                     (Alt : courbure inversée, Maj : arc de cercle)
 *    Spirale        — depuis le centre ; nombre de segments et décroissance
 *                     réglables (Alt : sens inverse)
 *    Grille rectangulaire — rangées / colonnes réglables
 *    Grille polaire — cercles concentriques / secteurs réglables
 *  Options dans le panneau quand l'outil est actif. Chaque forme est un seul
 *  tracé vectoriel (fabric.Path), éditable ensuite à la flèche blanche.
 * ============================================================================
 */
'use strict';

const SHAPE_OPTS = {
  spiralSegments: 10, spiralDecay: 80,
  gridRows: 5, gridCols: 5,
  polarRings: 5, polarSectors: 6,
};

const SHAPE_PLUS_ICONS = {
  arc: '<path d="M5 19C5 10.7 10.7 5 19 5"/>',
  spiral: '<path d="M12 12.5c.8 0 1.3-.6 1.3-1.3 0-1.5-1.4-2.4-2.8-2.2-2 .3-3 2.3-2.6 4.1.6 2.6 3.4 3.8 5.8 3.1 3.2-.9 4.6-4.5 3.6-7.5C16 5.1 12 3.6 8.4 4.8 4.1 6.3 2.4 11 3.8 15c1.6 4.8 7 6.8 11.4 5.2"/>',
  rectgrid: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16"/>',
  polargrid: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/><path d="M12 3.5v17M3.5 12h17"/>',
};

const f3 = (n) => Math.round(n * 1000) / 1000;

/** Forme « tracé » : les données SVG sont recalculées pendant le glisser */
function pathShape(kind, dFromDrag, { open = false } = {}) {
  return {
    lineLike: open,
    create: (p) => {
      const s = shapeStyle();
      return new fabric.Path(`M ${p.x} ${p.y} L ${p.x + 0.01} ${p.y + 0.01}`, {
        ...s,
        stroke: s.stroke || s.fill || '#25300b',
        strokeWidth: Math.max(1, s.strokeWidth),
        fill: open ? null : s.fill,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        shapeKind: kind,
      });
    },
    update: (obj, b, drag) => {
      const d = dFromDrag(b, drag);
      if (!d) return;
      obj._setPath(d, {});
      obj.setCoords();
      obj.dirty = true;
    },
  };
}

/** Arc (quart d'ellipse) de a vers z */
function arcPath(b, drag) {
  let a = drag.origin;
  let z = drag.pointer;
  if (drag.click) { a = { x: b.left, y: b.top }; z = { x: b.left + b.width, y: b.top + b.height }; }
  if (drag.constrain) {
    const size = Math.max(Math.abs(z.x - a.x), Math.abs(z.y - a.y));
    z = { x: a.x + Math.sign(z.x - a.x || 1) * size, y: a.y + Math.sign(z.y - a.y || 1) * size };
  }
  const k = KAPPA;
  // Centre de l'ellipse : (a.x, z.y) — Alt : (z.x, a.y) pour la courbure inverse
  const c1 = drag.alt ? { x: a.x + (z.x - a.x) * k, y: a.y } : { x: a.x, y: a.y + (z.y - a.y) * k };
  const c2 = drag.alt ? { x: z.x, y: z.y - (z.y - a.y) * k } : { x: z.x - (z.x - a.x) * k, y: z.y };
  return `M ${f3(a.x)} ${f3(a.y)} C ${f3(c1.x)} ${f3(c1.y)} ${f3(c2.x)} ${f3(c2.y)} ${f3(z.x)} ${f3(z.y)}`;
}

/** Spirale logarithmique, approchée par des courbes de Bézier (un quart de tour chacune) */
function spiralPath(b, drag) {
  const c = drag.origin;
  const p = drag.pointer;
  const R = Math.max(1, Math.hypot(p.x - c.x, p.y - c.y));
  const theta = Math.atan2(p.y - c.y, p.x - c.x);
  const n = SHAPE_OPTS.spiralSegments;
  const decay = SHAPE_OPTS.spiralDecay / 100;
  const dir = drag.alt ? -1 : 1;
  const q = Math.PI / 2;
  const k = Math.log(decay) / q;                 // r(t) = R · e^(k·t)
  const at = (t) => {
    const r = R * Math.exp(k * t);
    const a = theta + dir * t;
    const u = { x: Math.cos(a), y: Math.sin(a) };
    const du = { x: -Math.sin(a) * dir, y: Math.cos(a) * dir };
    return { p: { x: c.x + r * u.x, y: c.y + r * u.y }, d: { x: r * (k * u.x + du.x), y: r * (k * u.y + du.y) } };
  };
  let d = '';
  for (let i = 0; i < n; i += 1) {
    const s = at(i * q);
    const e = at((i + 1) * q);
    if (!i) d += `M ${f3(s.p.x)} ${f3(s.p.y)}`;
    const h = q / 3;
    d += ` C ${f3(s.p.x + s.d.x * h)} ${f3(s.p.y + s.d.y * h)} ${f3(e.p.x - e.d.x * h)} ${f3(e.p.y - e.d.y * h)} ${f3(e.p.x)} ${f3(e.p.y)}`;
  }
  return d;
}

function rectGridPath(b) {
  const { left: x, top: y, width: w, height: h } = b;
  if (w < 1 || h < 1) return null;
  let d = `M ${f3(x)} ${f3(y)} L ${f3(x + w)} ${f3(y)} L ${f3(x + w)} ${f3(y + h)} L ${f3(x)} ${f3(y + h)} Z`;
  for (let i = 1; i < SHAPE_OPTS.gridCols; i += 1) {
    const gx = x + (w * i) / SHAPE_OPTS.gridCols;
    d += ` M ${f3(gx)} ${f3(y)} L ${f3(gx)} ${f3(y + h)}`;
  }
  for (let j = 1; j < SHAPE_OPTS.gridRows; j += 1) {
    const gy = y + (h * j) / SHAPE_OPTS.gridRows;
    d += ` M ${f3(x)} ${f3(gy)} L ${f3(x + w)} ${f3(gy)}`;
  }
  return d;
}

function polarGridPath(b) {
  const cx = b.left + b.width / 2;
  const cy = b.top + b.height / 2;
  const RX = b.width / 2;
  const RY = b.height / 2;
  if (RX < 1 || RY < 1) return null;
  let d = '';
  for (let i = 1; i <= SHAPE_OPTS.polarRings; i += 1) {
    const rx = (RX * i) / SHAPE_OPTS.polarRings;
    const ry = (RY * i) / SHAPE_OPTS.polarRings;
    const kx = rx * KAPPA;
    const ky = ry * KAPPA;
    d += ` M ${f3(cx + rx)} ${f3(cy)} C ${f3(cx + rx)} ${f3(cy + ky)} ${f3(cx + kx)} ${f3(cy + ry)} ${f3(cx)} ${f3(cy + ry)}`
      + ` C ${f3(cx - kx)} ${f3(cy + ry)} ${f3(cx - rx)} ${f3(cy + ky)} ${f3(cx - rx)} ${f3(cy)}`
      + ` C ${f3(cx - rx)} ${f3(cy - ky)} ${f3(cx - kx)} ${f3(cy - ry)} ${f3(cx)} ${f3(cy - ry)}`
      + ` C ${f3(cx + kx)} ${f3(cy - ry)} ${f3(cx + rx)} ${f3(cy - ky)} ${f3(cx + rx)} ${f3(cy)} Z`;
  }
  for (let s = 0; s < SHAPE_OPTS.polarSectors; s += 1) {
    const a = -Math.PI / 2 + (s * 2 * Math.PI) / SHAPE_OPTS.polarSectors;
    d += ` M ${f3(cx)} ${f3(cy)} L ${f3(cx + RX * Math.cos(a))} ${f3(cy + RY * Math.sin(a))}`;
  }
  return d.trim();
}

ShapeFactory.arc = pathShape('arc', arcPath, { open: true });
ShapeFactory.spiral = pathShape('spiral', spiralPath, { open: true });
ShapeFactory.rectgrid = pathShape('rectgrid', rectGridPath, { open: true });
ShapeFactory.polargrid = pathShape('polargrid', polarGridPath, { open: true });

Object.assign(TOOL_LABELS, { arc: 'Arc', spiral: 'Spirale', rectgrid: 'Grille rectangulaire', polargrid: 'Grille polaire' });
Object.assign(TYPE_LABELS, { arc: 'Arc', spiral: 'Spirale', rectgrid: 'Grille', polargrid: 'Grille polaire' });

['arc', 'spiral', 'rectgrid', 'polargrid'].forEach((k) => { Tools[k] = createDragShapeTool(k); });

/** Options affichées dans le panneau pendant le tracé */
const numberOpt = (key, label, min, max, unit = '') => optionRange({
  id: `opt-${key}`, label, min, max, value: SHAPE_OPTS[key], unit, onInput: (v) => { SHAPE_OPTS[key] = v; },
});
Tools.arc.options = () => html('<p class="field-note">Glissez du début à la fin de l\'arc. Alt : courbure inversée · Maj : arc de cercle.</p>');
Tools.spiral.options = () => {
  const el = html('<div class="tool-options-body"><p class="field-note">Glissez depuis le centre. Alt : sens inverse.</p></div>');
  el.append(numberOpt('spiralSegments', 'Segments (quarts de tour)', 2, 40), numberOpt('spiralDecay', 'Décroissance', 50, 95, ' %'));
  return el;
};
Tools.rectgrid.options = () => {
  const el = html('<div class="tool-options-body"><p class="field-note">Glissez pour tracer la grille. Maj : carrée.</p></div>');
  el.append(numberOpt('gridRows', 'Rangées', 1, 30), numberOpt('gridCols', 'Colonnes', 1, 30));
  return el;
};
Tools.polargrid.options = () => {
  const el = html('<div class="tool-options-body"><p class="field-note">Glissez pour tracer la grille. Maj : circulaire.</p></div>');
  el.append(numberOpt('polarRings', 'Cercles concentriques', 1, 20), numberOpt('polarSectors', 'Secteurs', 0, 36));
  return el;
};

Hooks.on('init', () => {
  const flyout = dom.shapeFlyout;
  const items = [
    ['arc', 'Arc'], ['spiral', 'Spirale'], ['rectgrid', 'Grille rectangulaire'], ['polargrid', 'Grille polaire'],
  ];
  flyout.appendChild(html('<div class="flyout-sep"></div>'));
  items.forEach(([tool, label]) => {
    const btn = html(`<button class="flyout-item" data-tool="${tool}" type="button" role="menuitem"><svg viewBox="0 0 24 24" aria-hidden="true">${SHAPE_PLUS_ICONS[tool]}</svg><span>${label}</span></button>`);
    flyout.appendChild(btn);
    btn.addEventListener('click', () => { setTool(tool); ShapeMenu.toggle(false); });
  });
  dom.toolButtons = document.querySelectorAll('[data-tool]');
});
