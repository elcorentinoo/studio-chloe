/**
 * ============================================================================
 *  Studio Chloé — Plume (Bézier) & édition des points
 *
 *  Plume (P) — comme dans Illustrator :
 *    clic          → point d'angle
 *    cliquer-glisser → point lisse (les deux poignées sont symétriques)
 *    clic sur le 1er point → ferme la forme
 *    Entrée, Échap ou double-clic → termine un tracé ouvert
 *    Retour arrière → retire le dernier point
 *
 *  Édition des points : double-clic sur un tracé (plume ou pinceau).
 *    Carrés = points d'ancrage (déplacent aussi leurs poignées), ronds = poignées.
 *    Échap, Entrée ou clic ailleurs pour terminer.
 * ============================================================================
 */
'use strict';

const PEN_COLOR = '#7c9425';
const PEN_CLOSE_PX = 9; // rayon (écran) pour fermer sur le premier point

/* ============================================================================
   1. OUTIL PLUME
   ========================================================================== */

Tools.pen = {
  cursor: 'crosshair',
  points: [],        // { x, y, hin: {x,y}, hout: {x,y} }
  dragging: false,
  mouse: null,

  activate() {
    setInteractionMode('draw');
    this.points = [];
    this.render();
  },

  deactivate() { this.finish(false); },

  onMouseDown(p) {
    const zoom = canvas.getZoom();
    const first = this.points[0];
    const last = this.points[this.points.length - 1];
    // Clic sur le premier point : on ferme la forme
    if (this.points.length >= 2 && Math.hypot(p.x - first.x, p.y - first.y) < PEN_CLOSE_PX / zoom) {
      this.finish(true);
      return;
    }
    // Deuxième clic au même endroit (double-clic) : on termine
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 2 / zoom) {
      this.finish(false);
      return;
    }
    this.points.push({ x: p.x, y: p.y, hin: { ...p }, hout: { ...p } });
    this.dragging = true;
    this.render();
  },

  onMouseMove(p) {
    this.mouse = p;
    const last = this.points[this.points.length - 1];
    if (this.dragging && last) {
      last.hout = { x: p.x, y: p.y };
      last.hin = { x: 2 * last.x - p.x, y: 2 * last.y - p.y };
    }
    this.render();
  },

  onMouseUp() { this.dragging = false; },

  removeLast() {
    this.points.pop();
    this.render();
  },

  pathData(close) {
    const P = this.points;
    const f = (n) => Math.round(n * 100) / 100;
    let d = `M ${f(P[0].x)} ${f(P[0].y)}`;
    for (let i = 1; i < P.length; i += 1) {
      d += ` C ${f(P[i - 1].hout.x)} ${f(P[i - 1].hout.y)} ${f(P[i].hin.x)} ${f(P[i].hin.y)} ${f(P[i].x)} ${f(P[i].y)}`;
    }
    if (close) {
      const L = P[P.length - 1];
      d += ` C ${f(L.hout.x)} ${f(L.hout.y)} ${f(P[0].hin.x)} ${f(P[0].hin.y)} ${f(P[0].x)} ${f(P[0].y)} Z`;
    }
    return d;
  },

  /** Crée le tracé (2 points minimum) et repart pour un nouveau */
  finish(close) {
    const pts = this.points;
    this.points = [];
    this.dragging = false;
    this.clearPreview();
    if (pts.length < 2) return;
    this.points = pts;
    const d = this.pathData(close);
    this.points = [];
    const s = shapeStyle();
    const path = new fabric.Path(d, {
      ...s,
      fill: close ? s.fill : null,
      stroke: s.stroke || (close ? null : s.fill) || '#25300b',
      strokeWidth: close ? s.strokeWidth : Math.max(1, s.strokeWidth),
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      shapeKind: 'pen',
    });
    canvas.add(path);
    canvas.setActiveObject(path);
    canvas.requestRenderAll();
    History.queue();
  },

  clearPreview() {
    if (canvas.contextTop) canvas.clearContext(canvas.contextTop);
  },

  /** Aperçu du tracé en cours, dessiné sur le calque supérieur de Fabric */
  render() {
    this.clearPreview();
    const P = this.points;
    if (!P.length || state.tool !== 'pen') return;
    const ctx = canvas.contextTop;
    if (!ctx) return; // rendu d’export en cours (toCanvasElement) : pas de calque d’interface
    const v = canvas.viewportTransform;
    const zoom = v[0];
    ctx.save();
    ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]);
    ctx.lineWidth = 1.5 / zoom;
    ctx.strokeStyle = PEN_COLOR;

    // Courbe
    ctx.beginPath();
    ctx.moveTo(P[0].x, P[0].y);
    for (let i = 1; i < P.length; i += 1) {
      ctx.bezierCurveTo(P[i - 1].hout.x, P[i - 1].hout.y, P[i].hin.x, P[i].hin.y, P[i].x, P[i].y);
    }
    ctx.stroke();

    // Segment « élastique » jusqu'à la souris
    const last = P[P.length - 1];
    if (this.mouse && !this.dragging) {
      ctx.setLineDash([4 / zoom, 4 / zoom]);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.bezierCurveTo(last.hout.x, last.hout.y, this.mouse.x, this.mouse.y, this.mouse.x, this.mouse.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Poignées du dernier point
    if (last.hout.x !== last.x || last.hout.y !== last.y) {
      ctx.beginPath();
      ctx.moveTo(last.hin.x, last.hin.y);
      ctx.lineTo(last.hout.x, last.hout.y);
      ctx.stroke();
      [last.hin, last.hout].forEach((h) => {
        ctx.beginPath();
        ctx.arc(h.x, h.y, 3.5 / zoom, 0, Math.PI * 2);
        ctx.fillStyle = '#d4f04c';
        ctx.fill();
        ctx.stroke();
      });
    }

    // Points d'ancrage (le premier est plus grand : on peut y fermer la forme)
    P.forEach((pt, i) => {
      const r = (i === 0 && P.length >= 2 ? 5 : 3.5) / zoom;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(pt.x - r, pt.y - r, r * 2, r * 2);
      ctx.strokeRect(pt.x - r, pt.y - r, r * 2, r * 2);
    });
    ctx.restore();
  },
};

/* ============================================================================
   2. ÉDITION DES POINTS D'UN TRACÉ
   ----------------------------------------------------------------------------
   Chaque coordonnée des commandes du tracé (M, L, C, Q) reçoit un « control »
   Fabric. Pendant l'édition, la boîte de l'objet n'est pas recalculée (cache
   désactivé) ; à la fin d'un déplacement, on recalcule ses dimensions en
   gardant tous les points exactement à leur place à l'écran.
   ========================================================================== */

const PathEditor = {
  obj: null,

  /** Point du tracé (coordonnées internes) → point écran */
  toScreen(obj, x, y) {
    const m = fabric.util.multiplyTransformMatrices(canvas.viewportTransform, obj.calcTransformMatrix());
    return fabric.util.transformPoint({ x: x - obj.pathOffset.x, y: y - obj.pathOffset.y }, m);
  },

  /** Point du document → coordonnées internes du tracé */
  toPath(obj, p) {
    const local = fabric.util.transformPoint(p, fabric.util.invertTransform(obj.calcTransformMatrix()));
    return { x: local.x + obj.pathOffset.x, y: local.y + obj.pathOffset.y };
  },

  /** Recalcule la boîte du tracé sans déplacer ses points */
  refit(obj) {
    const before = { ...obj.pathOffset };
    const center = obj.getCenterPoint();
    const m = obj.calcTransformMatrix();
    // Fabric 5 : les tracés réutilisent le calcul de boîte des polylignes
    fabric.Polyline.prototype._setPositionDimensions.call(obj, {});
    const delta = { x: obj.pathOffset.x - before.x, y: obj.pathOffset.y - before.y };
    const shift = fabric.util.transformPoint(delta, [m[0], m[1], m[2], m[3], 0, 0]);
    obj.setPositionByOrigin(new fabric.Point(center.x + shift.x, center.y + shift.y), 'center', 'center');
    obj.setCoords();
    obj.dirty = true;
  },

  /** Liste des coordonnées éditables : { ci, k, kind: 'anchor' | 'handle', anchorOf } */
  describe(obj) {
    const out = [];
    let prevAnchor = null;
    obj.path.forEach((cmd, ci) => {
      const c = cmd[0].toUpperCase();
      if (c === 'M' || c === 'L') {
        out.push({ ci, k: 1, kind: 'anchor' });
      } else if (c === 'C') {
        out.push({ ci, k: 1, kind: 'handle', anchor: prevAnchor });
        out.push({ ci, k: 3, kind: 'handle', anchor: { ci, k: 5 } });
        out.push({ ci, k: 5, kind: 'anchor' });
      } else if (c === 'Q') {
        out.push({ ci, k: 1, kind: 'handle', anchor: prevAnchor, anchor2: { ci, k: 3 } });
        out.push({ ci, k: 3, kind: 'anchor' });
      }
      if (c !== 'Z') prevAnchor = { ci, k: cmd.length - 2 };
    });
    return out;
  },

  /**
   * Coordonnées entraînées par un point d'ancrage : ses poignées (entrante et
   * sortante) et, pour une forme fermée, le point final confondu avec le départ.
   */
  linked(obj, ci) {
    const path = obj.path;
    const list = [];
    const cmd = path[ci];
    const c = cmd[0].toUpperCase();
    if (c === 'C') list.push([ci, 3]);
    const next = path[ci + 1];
    if (next && next[0].toUpperCase() === 'C') list.push([ci + 1, 1]);
    // Forme fermée : le dernier point d'ancrage = le point de départ
    if (ci === 0) {
      const closed = path[path.length - 1][0].toUpperCase() === 'Z';
      const lastCmd = closed ? path[path.length - 2] : null;
      if (lastCmd && lastCmd !== cmd) {
        const n = lastCmd.length;
        if (Math.abs(lastCmd[n - 2] - cmd[1]) < 0.01 && Math.abs(lastCmd[n - 1] - cmd[2]) < 0.01) {
          list.push([path.length - 2, n - 2]);
          if (lastCmd[0].toUpperCase() === 'C') list.push([path.length - 2, 3]);
        }
      }
    }
    return list;
  },

  start(obj) {
    if (this.obj) this.stop();
    if (obj?.type !== 'path' || obj.locked) return;
    this.obj = obj;
    this.saved = { controls: obj.controls, hasBorders: obj.hasBorders, objectCaching: obj.objectCaching };
    const controls = {};
    this.describe(obj).forEach((pt) => {
      controls[`p${pt.ci}_${pt.k}`] = this.makeControl(pt);
    });
    obj.controls = controls;
    obj.hasBorders = false;
    obj.objectCaching = false;
    canvas.setActiveObject(obj);
    canvas.requestRenderAll();
    toast('Édition des points : déplacez les carrés (points) et les ronds (poignées). Échap pour terminer.');
  },

  makeControl(pt) {
    const editor = this;
    return new fabric.Control({
      actionName: 'modifyPath',
      cursorStyle: 'pointer',
      sizeX: 14,
      sizeY: 14,
      positionHandler(dim, finalMatrix, obj) {
        const cmd = obj.path[pt.ci];
        return editor.toScreen(obj, cmd[pt.k], cmd[pt.k + 1]);
      },
      actionHandler(eventData, transform, x, y) {
        const obj = transform.target;
        const p = editor.toPath(obj, { x, y });
        const cmd = obj.path[pt.ci];
        const dx = p.x - cmd[pt.k];
        const dy = p.y - cmd[pt.k + 1];
        cmd[pt.k] = p.x;
        cmd[pt.k + 1] = p.y;
        if (pt.kind === 'anchor') {
          editor.linked(obj, pt.ci).forEach(([ci, k]) => {
            obj.path[ci][k] += dx;
            obj.path[ci][k + 1] += dy;
          });
        }
        obj.dirty = true;
        return true;
      },
      render(ctx, left, top, styleOverride, obj) {
        ctx.save();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = PEN_COLOR;
        if (pt.kind === 'handle') {
          // Ligne de la poignée vers son (ses) point(s) d'ancrage
          [pt.anchor, pt.anchor2].filter(Boolean).forEach((a) => {
            const ac = obj.path[a.ci];
            const s = editor.toScreen(obj, ac[a.k], ac[a.k + 1]);
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(left, top);
            ctx.stroke();
          });
          ctx.beginPath();
          ctx.arc(left, top, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = '#d4f04c';
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(left - 5, top - 5, 10, 10);
          ctx.strokeRect(left - 5, top - 5, 10, 10);
        }
        ctx.restore();
      },
    });
  },

  stop() {
    const obj = this.obj;
    if (!obj) return;
    this.obj = null;
    obj.hasBorders = this.saved.hasBorders;
    obj.objectCaching = this.saved.objectCaching;
    delete obj.controls; // retour aux poignées de transformation standard (prototype)
    this.refit(obj);
    canvas.requestRenderAll();
    History.queue();
  },

  bind() {
    canvas.on('mouse:dblclick', ({ target }) => {
      if (state.tool !== 'select' || state.cropping) return;
      if (this.obj && target !== this.obj) { this.stop(); return; }
      if (target?.type === 'path' && !this.obj) this.start(target);
    });
    // Fin d'un déplacement de point : on recalcule la boîte du tracé
    canvas.on('object:modified', ({ target, action }) => {
      if (target === this.obj && action === 'modifyPath') {
        this.refit(target);
        canvas.requestRenderAll();
      }
    });
    canvas.on('selection:cleared', () => this.stop());
    canvas.on('selection:updated', () => { if (this.obj && canvas.getActiveObject() !== this.obj) this.stop(); });
    canvas.on('object:removed', ({ target }) => { if (target === this.obj) this.obj = null; });
    Hooks.on('docLoaded', () => { this.obj = null; });
  },
};

/* ============================================================================
   BRANCHEMENT
   ========================================================================== */

TOOL_LABELS.pen = 'Plume';
TYPE_LABELS.pen = 'Tracé';
SHORTCUTS.p = 'pen';

Hooks.on('init', () => {
  PathEditor.bind();
  Keys.add((e) => {
    // Plume : terminer / retirer le dernier point
    if (state.tool === 'pen' && Tools.pen.points.length) {
      if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); Tools.pen.finish(false); return true; }
      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); Tools.pen.removeLast(); return true; }
    }
    // Édition des points : terminer
    if (PathEditor.obj && (e.key === 'Enter' || e.key === 'Escape')) {
      e.preventDefault();
      PathEditor.stop();
      return true;
    }
    return false;
  });
  // La vue bouge (zoom, déplacement) : l'aperçu de la plume suit
  canvas.on('after:render', () => { if (state.tool === 'pen' && Tools.pen.points.length) Tools.pen.render(); });
});

/* ============================================================================
   ⌘Z PENDANT UN TRACÉ
   - Plume en cours : ⌘Z retire le dernier point posé (comme dans Illustrator)
   - Édition des points : ⌘Z annule le dernier déplacement de point
   ========================================================================== */
{
  const baseUndo = History.undo.bind(History);
  History.undo = () => {
    if (state.tool === 'pen' && Tools.pen.points.length) {
      Tools.pen.removeLast();
      return;
    }
    if (PathEditor.obj) {
      const obj = PathEditor.obj;
      PathEditor.stop();
      History.flush();
      baseUndo();
      // On reste en édition des points sur le tracé restauré
      setTimeout(() => {
        const restored = canvas.getObjects().find((o) => o.type === 'path' && o.left === obj.left && o.top === obj.top)
          || canvas.getObjects().filter((o) => o.type === 'path').pop();
        if (restored) PathEditor.start(restored);
      }, 60);
      return;
    }
    baseUndo();
  };
}
