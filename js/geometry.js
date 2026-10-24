/**
 * ============================================================================
 *  Chloe’s Touch — Géométrie partagée (utilisée par la sélection directe,
 *  le Pathfinder, le décalage de tracé, les outils de déformation…)
 *
 *    Geo.commands(obj)   → commandes absolues [['M',x,y],['L',x,y],['C',…],['Q',…],['Z']]
 *                          en coordonnées du DOCUMENT (transformation appliquée)
 *    Geo.toPathData(obj) → chaîne SVG « M … Z » (idem)
 *    Geo.toPath(obj)     → nouveau fabric.Path équivalent (même style, sans transformation)
 *    Geo.replace(old, neu) → remplace un objet dans la pile (même plan) et le sélectionne
 *    Geo.canConvert(obj) → vrai pour rectangles, ellipses, cercles, polygones, lignes, tracés
 * ============================================================================
 */
'use strict';

const KAPPA = 0.5522847498; // cercle ≈ 4 courbes de Bézier

/** Propriétés de style recopiées lors d'une conversion en tracé */
const STYLE_PROPS = ['fill', 'stroke', 'strokeWidth', 'strokeDashArray', 'strokeLineCap', 'strokeLineJoin',
  'strokeMiterLimit', 'strokeUniform', 'opacity', 'shadow', 'globalCompositeOperation', 'name', 'visible', 'paintFirst'];

const Geo = {
  canConvert(obj) {
    return ['rect', 'ellipse', 'circle', 'polygon', 'polyline', 'path', 'line', 'triangle'].includes(obj?.type);
  },

  /** Commandes en coordonnées LOCALES de l'objet (centrées sur son centre) */
  localCommands(obj) {
    const t = obj.type;
    if (t === 'rect') {
      const w = obj.width / 2;
      const h = obj.height / 2;
      const rx = Math.min(obj.rx || 0, w);
      const ry = Math.min(obj.ry || 0, h);
      if (!rx || !ry) return [['M', -w, -h], ['L', w, -h], ['L', w, h], ['L', -w, h], ['Z']];
      const kx = rx * KAPPA;
      const ky = ry * KAPPA;
      return [
        ['M', -w + rx, -h], ['L', w - rx, -h], ['C', w - rx + kx, -h, w, -h + ry - ky, w, -h + ry],
        ['L', w, h - ry], ['C', w, h - ry + ky, w - rx + kx, h, w - rx, h],
        ['L', -w + rx, h], ['C', -w + rx - kx, h, -w, h - ry + ky, -w, h - ry],
        ['L', -w, -h + ry], ['C', -w, -h + ry - ky, -w + rx - kx, -h, -w + rx, -h], ['Z'],
      ];
    }
    if (t === 'ellipse' || t === 'circle') {
      const rx = t === 'circle' ? obj.radius : obj.rx;
      const ry = t === 'circle' ? obj.radius : obj.ry;
      const kx = rx * KAPPA;
      const ky = ry * KAPPA;
      return [['M', rx, 0], ['C', rx, ky, kx, ry, 0, ry], ['C', -kx, ry, -rx, ky, -rx, 0],
        ['C', -rx, -ky, -kx, -ry, 0, -ry], ['C', kx, -ry, rx, -ky, rx, 0], ['Z']];
    }
    if (t === 'triangle') {
      const w = obj.width / 2;
      const h = obj.height / 2;
      return [['M', 0, -h], ['L', w, h], ['L', -w, h], ['Z']];
    }
    if (t === 'line') {
      const p = obj.calcLinePoints();
      return [['M', p.x1, p.y1], ['L', p.x2, p.y2]];
    }
    if (t === 'polygon' || t === 'polyline') {
      const o = obj.pathOffset;
      const cmds = obj.points.map((p, i) => [i ? 'L' : 'M', p.x - o.x, p.y - o.y]);
      if (t === 'polygon') cmds.push(['Z']);
      return cmds;
    }
    if (t === 'path') {
      const o = obj.pathOffset;
      return obj.path.map((cmd) => {
        const c = cmd[0].toUpperCase();
        if (c === 'Z') return ['Z'];
        const out = [c];
        for (let k = 1; k < cmd.length; k += 2) out.push(cmd[k] - o.x, cmd[k + 1] - o.y);
        return out;
      });
    }
    return [];
  },

  /** Applique une matrice aux coordonnées d'une liste de commandes */
  transform(cmds, m) {
    return cmds.map((cmd) => {
      if (cmd[0] === 'Z') return ['Z'];
      const out = [cmd[0]];
      for (let k = 1; k < cmd.length; k += 2) {
        const p = fabric.util.transformPoint({ x: cmd[k], y: cmd[k + 1] }, m);
        out.push(p.x, p.y);
      }
      return out;
    });
  },

  /** Commandes en coordonnées du document (le groupe parent éventuel est pris en compte) */
  commands(obj) {
    return this.transform(this.localCommands(obj), obj.calcTransformMatrix());
  },

  toPathData(cmds) {
    const list = Array.isArray(cmds) ? cmds : this.commands(cmds);
    const f = (n) => Math.round(n * 1000) / 1000;
    return list.map((c) => (c[0] === 'Z' ? 'Z' : `${c[0]} ${c.slice(1).map(f).join(' ')}`)).join(' ');
  },

  /** Style recopié d'un objet (le contour suit l'échelle si strokeUniform est faux) */
  styleOf(obj) {
    const style = {};
    STYLE_PROPS.forEach((k) => { if (obj[k] !== undefined) style[k] = obj[k]; });
    if (obj.fill && typeof obj.fill === 'object' && obj.fill.toObject) style.fill = obj.fill; // dégradé, motif
    if (!obj.strokeUniform) {
      const m = obj.calcTransformMatrix();
      style.strokeWidth = (obj.strokeWidth || 0) * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
    }
    return style;
  },

  /** Nouveau fabric.Path équivalent à obj (coordonnées absolues, sans rotation) */
  toPath(obj, extra = {}) {
    const d = this.toPathData(this.commands(obj));
    const path = new fabric.Path(d, { ...this.styleOf(obj), ...extra });
    if (obj.type === 'polyline' || obj.type === 'line') path.set({ fill: null });
    if (obj.shapeKind) path.shapeKind = obj.shapeKind === 'pen' ? 'pen' : undefined;
    return path;
  },

  /** Remplace old par neu au même plan, puis sélectionne neu */
  replace(old, neu, { select = true } = {}) {
    const index = canvas.getObjects().indexOf(old);
    const wasActive = canvas.getActiveObjects().includes(old);
    if (wasActive) canvas.discardActiveObject();
    canvas.remove(old);
    canvas.insertAt(neu, Math.max(0, index));
    neu.setCoords();
    if (select) canvas.setActiveObject(neu);
    canvas.requestRenderAll();
    return neu;
  },

  /** Boîte englobante simple d'une liste de commandes */
  bounds(cmds) {
    const xs = [];
    const ys = [];
    cmds.forEach((c) => { for (let k = 1; k < c.length; k += 2) { xs.push(c[k]); ys.push(c[k + 1]); } });
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
  },
};
