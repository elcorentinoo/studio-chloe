/**
 * ============================================================================
 *  Studio Chloé — Outil Largeur (Maj + W) : contour d'épaisseur variable
 *
 *  Glissez depuis un point du contour d'un tracé (ou d'une forme) pour
 *  l'élargir ou l'affiner à cet endroit, comme dans Illustrator.
 *    - les points de largeur sont des losanges sur le tracé ; glissez-en un
 *      pour le modifier, Alt + clic pour le supprimer ;
 *    - profils prêts à l'emploi dans le panneau (fuseau, pointe, goutte…).
 *  Le tracé reste un vrai tracé (sa ligne centrale reste éditable à la
 *  flèche blanche) : seul son rendu dessine un contour variable.
 *  Modèle : obj.widthProfile = [{ t: 0…1 (position sur la longueur), r: 0…1 }]
 *  où r × strokeWidth = largeur locale (strokeWidth = largeur maximale).
 *  Exporté en SVG comme une forme pleine (le contour vectorisé).
 * ============================================================================
 */
'use strict';

const WIDTH_ICON = '<path d="M3 17c4 0 5-10 9-10s5 10 9 10"/><path d="M12 4v6M12 14v6" stroke-dasharray="2 2"/><path d="m10 5 2-2 2 2M10 19l2 2 2-2"/>';

const WIDTH_PRESETS = {
  uniform: { label: 'Uniforme', pts: [[0, 1], [1, 1]] },
  spindle: { label: 'Fuseau', pts: [[0, 0.05], [0.5, 1], [1, 0.05]] },
  taper: { label: 'Pointe', pts: [[0, 1], [1, 0.02]] },
  drop: { label: 'Goutte', pts: [[0, 0.02], [0.75, 1], [1, 0.4]] },
  wave: { label: 'Vague', pts: [[0, 0.3], [0.25, 1], [0.5, 0.3], [0.75, 1], [1, 0.3]] },
};

const WidthProfile = {
  /** Largeur relative (0…1) à la position t, interpolation douce entre les points */
  at(profile, t) {
    const pts = profile;
    if (t <= pts[0].t) return pts[0].r;
    for (let i = 1; i < pts.length; i += 1) {
      if (t <= pts[i].t) {
        const a = pts[i - 1];
        const b = pts[i];
        const u = (t - a.t) / Math.max(1e-9, b.t - a.t);
        const s = (1 - Math.cos(Math.PI * u)) / 2;
        return a.r + (b.r - a.r) * s;
      }
    }
    return pts[pts.length - 1].r;
  },

  /** Échantillonne les commandes (absolues) en sous-tracés de points [{x,y}] */
  sample(cmds) {
    const subs = [];
    let cur = null;
    let pos = null;
    let start = null;
    const push = (p) => cur.pts.push(p);
    cmds.forEach((c) => {
      const k = c[0].toUpperCase();
      if (k === 'M') {
        cur = { pts: [], closed: false };
        subs.push(cur);
        pos = { x: c[1], y: c[2] };
        start = pos;
        push(pos);
      } else if (k === 'L') {
        pos = { x: c[1], y: c[2] };
        push(pos);
      } else if (k === 'C' || k === 'Q') {
        const p0 = pos;
        const ctrl = k === 'C' ? [{ x: c[1], y: c[2] }, { x: c[3], y: c[4] }] : [{ x: c[1], y: c[2] }];
        const p3 = { x: c[c.length - 2], y: c[c.length - 1] };
        const len = Math.hypot(p3.x - p0.x, p3.y - p0.y) + ctrl.reduce((s, q) => s + Math.hypot(q.x - p0.x, q.y - p0.y), 0);
        const n = clamp(Math.ceil(len / 6), 6, 64);
        for (let i = 1; i <= n; i += 1) {
          const t = i / n;
          const mt = 1 - t;
          if (k === 'C') {
            push({
              x: mt ** 3 * p0.x + 3 * mt * mt * t * ctrl[0].x + 3 * mt * t * t * ctrl[1].x + t ** 3 * p3.x,
              y: mt ** 3 * p0.y + 3 * mt * mt * t * ctrl[0].y + 3 * mt * t * t * ctrl[1].y + t ** 3 * p3.y,
            });
          } else {
            push({ x: mt * mt * p0.x + 2 * mt * t * ctrl[0].x + t * t * p3.x, y: mt * mt * p0.y + 2 * mt * t * ctrl[0].y + t * t * p3.y });
          }
        }
        pos = p3;
      } else if (k === 'Z' && cur) {
        cur.closed = true;
        if (start && (pos.x !== start.x || pos.y !== start.y)) push(start);
        pos = start;
      }
    });
    return subs.filter((s) => s.pts.length >= 2);
  },

  /** Longueurs cumulées de tous les sous-tracés (pour le paramètre t global) */
  measure(subs) {
    let total = 0;
    subs.forEach((s) => {
      s.len = [0];
      for (let i = 1; i < s.pts.length; i += 1) {
        total += Math.hypot(s.pts[i].x - s.pts[i - 1].x, s.pts[i].y - s.pts[i - 1].y);
        s.len.push(total);
      }
    });
    return Math.max(total, 1e-9);
  },

  /** Contour (anneaux de points) d'un tracé de largeur variable */
  outline(cmds, profile, maxWidth) {
    const subs = this.sample(cmds);
    const total = this.measure(subs);
    const rings = [];
    subs.forEach((s) => {
      const n = s.pts.length;
      const left = [];
      const right = [];
      for (let i = 0; i < n; i += 1) {
        const prev = s.pts[Math.max(0, i - 1)];
        const next = s.pts[Math.min(n - 1, i + 1)];
        let dx = next.x - prev.x;
        let dy = next.y - prev.y;
        const L = Math.hypot(dx, dy) || 1;
        dx /= L; dy /= L;
        const half = (this.at(profile, s.len[i] / total) * maxWidth) / 2;
        left.push({ x: s.pts[i].x - dy * half, y: s.pts[i].y + dx * half });
        right.push({ x: s.pts[i].x + dy * half, y: s.pts[i].y - dx * half });
      }
      if (s.closed) { rings.push(left, right.reverse()); } else rings.push([...left, ...right.reverse()]);
    });
    return rings;
  },

  /** Contour en coordonnées LOCALES de l'objet (mis en cache) */
  localOutline(obj) {
    const key = JSON.stringify([obj.path, obj.widthProfile, obj.strokeWidth]);
    if (obj._wpCache?.key === key) return obj._wpCache.rings;
    const o = obj.pathOffset;
    const cmds = obj.path.map((c) => {
      if (c[0].toUpperCase() === 'Z') return ['Z'];
      const out = [c[0].toUpperCase()];
      for (let k = 1; k < c.length; k += 2) out.push(c[k] - o.x, c[k + 1] - o.y);
      return out;
    });
    const rings = this.outline(cmds, obj.widthProfile, obj.strokeWidth);
    obj._wpCache = { key, rings };
    return rings;
  },

  ringsToD(rings) {
    const f = (n) => Math.round(n * 100) / 100;
    return rings.map((r) => `M ${r.map((p) => `${f(p.x)} ${f(p.y)}`).join(' L ')} Z`).join(' ');
  },
};

const hasWidthProfile = (o) => o?.type === 'path' && Array.isArray(o.widthProfile) && o.widthProfile.length >= 2 && toHex(o.stroke) && o.strokeWidth > 0;

/* ---------- rendu & export SVG des tracés à largeur variable ---------- */
{
  const baseRender = fabric.Path.prototype._render;
  fabric.Path.prototype._render = function render(ctx) {
    if (!hasWidthProfile(this)) { baseRender.call(this, ctx); return; }
    if (this.fill && (typeof this.fill === 'object' || toHex(this.fill))) {
      this._renderPathCommands(ctx);
      this._renderFill(ctx);
    }
    const rings = WidthProfile.localOutline(this);
    ctx.beginPath();
    rings.forEach((r) => { r.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); });
    ctx.save();
    ctx.fillStyle = this.stroke;
    ctx.fill('evenodd');
    ctx.restore();
  };

  const baseToSVG = fabric.Path.prototype.toSVG;
  fabric.Path.prototype.toSVG = function toSVG(reviver) {
    if (!hasWidthProfile(this)) return baseToSVG.call(this, reviver);
    const op = this.opacity ?? 1;
    const fillHex = this.fill && typeof this.fill === 'string' ? toHex(this.fill) : null;
    const o = this.pathOffset;
    const fillPath = fillHex
      ? `<path d="${fabric.util.joinPath(this.path)}" transform="translate(${-o.x} ${-o.y})" style="fill:${fillHex};stroke:none;" />`
      : '';
    const outline = `<path d="${WidthProfile.ringsToD(WidthProfile.localOutline(this))}" style="fill:${toHex(this.stroke)};fill-rule:evenodd;stroke:none;" />`;
    return this._createBaseSVGMarkup(['<g ', 'COMMON_PARTS', ` opacity="${op}">`, fillPath, outline, '</g>\n'], { reviver, noStyle: true });
  };
}

/* ---------- outil ---------- */

const WidthTool = {
  target: null,   // tracé survolé / modifié
  hover: null,    // { t, point, normal, width }
  drag: null,     // { obj, index }

  /** Point le plus proche sur la ligne centrale (coordonnées du document) */
  nearest(obj, p) {
    const subs = WidthProfile.sample(Geo.commands(obj));
    const total = WidthProfile.measure(subs);
    let best = null;
    subs.forEach((s) => {
      for (let i = 1; i < s.pts.length; i += 1) {
        const a = s.pts[i - 1];
        const b = s.pts[i];
        const vx = b.x - a.x;
        const vy = b.y - a.y;
        const L2 = vx * vx + vy * vy || 1e-9;
        const u = clamp(((p.x - a.x) * vx + (p.y - a.y) * vy) / L2, 0, 1);
        const q = { x: a.x + vx * u, y: a.y + vy * u };
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (!best || d < best.d) {
          const L = Math.sqrt(L2);
          best = { d, point: q, t: (s.len[i - 1] + (s.len[i] - s.len[i - 1]) * u) / total, normal: { x: -vy / L, y: vx / L } };
        }
      }
    });
    return best;
  },

  profileOf(obj) { return obj.widthProfile ? obj.widthProfile.map((x) => ({ ...x })) : [{ t: 0, r: 1 }, { t: 1, r: 1 }]; },

  /** Prépare l'objet : tracé sans transformation, contour existant */
  prepare(obj) {
    if (!obj || obj.locked || !Geo.canConvert(obj)) return null;
    if (!toHex(obj.stroke)) { toast('L\'outil Largeur agit sur le contour : donnez d\'abord un contour à cet objet.'); return null; }
    const path = asPlainPath(obj);
    if (!path.strokeWidth) path.set({ strokeWidth: 4 });
    path.strokeUniform = true;
    return path;
  },

  /** Écrit une largeur absolue w au paramètre t (crée ou modifie un point) */
  setWidthAt(obj, t, w, index = -1) {
    const prof = this.profileOf(obj);
    const max0 = obj.strokeWidth;
    const abs = prof.map((x) => ({ t: x.t, w: x.r * max0 }));
    let i = index;
    if (i < 0) {
      i = abs.findIndex((x) => Math.abs(x.t - t) < 0.02);
      if (i < 0) { abs.push({ t, w }); abs.sort((a, b) => a.t - b.t); i = abs.findIndex((x) => x.t === t); }
    }
    abs[i].w = Math.max(0.2, w);
    const max = Math.max(...abs.map((x) => x.w));
    obj.set({ strokeWidth: max, widthProfile: abs.map((x) => ({ t: Math.round(x.t * 10000) / 10000, r: x.w / max })) });
    obj.setCoords();
    obj.dirty = true;
    return i;
  },

  applyPreset(key) {
    const objs = canvas.getActiveObjects().map((o) => this.prepare(o)).filter(Boolean);
    if (!objs.length) { toast('Sélectionnez un tracé avec un contour.'); return; }
    objs.forEach((o) => {
      if (key === 'none') o.set({ widthProfile: undefined });
      else o.set({ widthProfile: WIDTH_PRESETS[key].pts.map(([t, r]) => ({ t, r })) });
      o.dirty = true;
    });
    Arrange.reselect(objs);
    canvas.requestRenderAll();
    History.queue();
  },

  candidates() {
    return canvas.getObjects().filter((o) => o.visible && !o.locked && Geo.canConvert(o) && toHex(o.stroke)).reverse();
  },

  /** Tracé et point le plus proches du pointeur (à moins de 14 px écran + demi-largeur) */
  pick(p) {
    const zoom = canvas.getZoom();
    let best = null;
    this.candidates().forEach((o) => {
      const b = o.getBoundingRect(true, true);
      const pad = 40 / zoom;
      if (p.x < b.left - pad || p.x > b.left + b.width + pad || p.y < b.top - pad || p.y > b.top + b.height + pad) return;
      const n = this.nearest(o, p);
      if (!n) return;
      const w = (hasWidthProfile(o) ? WidthProfile.at(o.widthProfile, n.t) : 1) * (o.strokeWidth || 1);
      if (n.d <= w / 2 + 14 / zoom && (!best || n.d < best.n.d)) best = { obj: o, n, w };
    });
    return best;
  },

  render() {
    const ctx = canvas.contextTop;
    if (!ctx) return; // rendu d’export en cours (toCanvasElement) : pas de calque d’interface
    canvas.clearContext(ctx);
    if (state.tool !== 'width') return;
    const v = canvas.viewportTransform;
    const S = (q) => ({ x: q.x * v[0] + v[4], y: q.y * v[3] + v[5] });
    ctx.save();
    ctx.strokeStyle = PEN_COLOR;
    ctx.lineWidth = 1.5;
    const diamond = (q, r, fill) => {
      ctx.beginPath();
      ctx.moveTo(q.x, q.y - r); ctx.lineTo(q.x + r, q.y); ctx.lineTo(q.x, q.y + r); ctx.lineTo(q.x - r, q.y); ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.stroke();
    };
    const obj = this.drag?.obj || this.hover?.obj;
    if (obj && hasWidthProfile(obj)) {
      const subs = WidthProfile.sample(Geo.commands(obj));
      const total = WidthProfile.measure(subs);
      obj.widthProfile.forEach((x) => {
        // position du point de largeur sur la ligne centrale
        let q = null;
        subs.forEach((s) => { for (let i = 1; i < s.pts.length && !q; i += 1) if (s.len[i] / total >= x.t) q = s.pts[i]; });
        if (q) diamond(S(q), 5, '#ffffff');
      });
    }
    const h = this.hover;
    if (h && !this.drag) {
      const c = S(h.n.point);
      const half = (h.w / 2) * v[0];
      ctx.beginPath();
      ctx.moveTo(c.x - h.n.normal.x * half, c.y - h.n.normal.y * half);
      ctx.lineTo(c.x + h.n.normal.x * half, c.y + h.n.normal.y * half);
      ctx.stroke();
      diamond(c, 4, '#d4f04c');
    }
    if (this.drag?.label) {
      const c = S(this.drag.label.at);
      ctx.font = '600 11px Inter, system-ui, sans-serif';
      const txt = `${this.drag.label.w.toFixed(1)} px`;
      const tw = ctx.measureText(txt).width + 12;
      ctx.fillStyle = '#25300b';
      ctx.fillRect(c.x + 10, c.y - 24, tw, 20);
      ctx.fillStyle = '#d4f04c';
      ctx.fillText(txt, c.x + 16, c.y - 10);
    }
    ctx.restore();
  },
};

Tools.width = {
  cursor: 'crosshair',
  activate() { setInteractionMode('draw'); },
  deactivate() { WidthTool.hover = null; WidthTool.drag = null; canvas.clearContext(canvas.contextTop); },
  onMouseDown(p, e) {
    const hit = WidthTool.pick(p);
    if (!hit) return;
    let obj = hit.obj;
    if (!hasWidthProfile(obj) || obj.type !== 'path') obj = WidthTool.prepare(obj);
    if (!obj) return;
    const n = WidthTool.nearest(obj, p);
    // Point de largeur existant tout près ?
    const prof = WidthTool.profileOf(obj);
    const idx = prof.findIndex((x) => Math.abs(x.t - n.t) < 0.025);
    if (e.altKey && idx >= 0 && prof.length > 2) {
      prof.splice(idx, 1);
      obj.set({ widthProfile: prof });
      obj.dirty = true;
      canvas.requestRenderAll();
      History.queue();
      return;
    }
    if (!obj.widthProfile) obj.set({ widthProfile: prof });
    WidthTool.drag = { obj, t: idx >= 0 ? prof[idx].t : n.t, index: idx, center: n.point, normal: n.normal };
  },
  onMouseMove(p) {
    const d = WidthTool.drag;
    if (d) {
      const w = 2 * Math.abs((p.x - d.center.x) * d.normal.x + (p.y - d.center.y) * d.normal.y);
      d.index = WidthTool.setWidthAt(d.obj, d.t, w, d.index);
      d.label = { at: d.center, w };
      canvas.requestRenderAll();
    } else {
      WidthTool.hover = WidthTool.pick(p);
    }
    WidthTool.render();
  },
  onMouseUp() {
    const d = WidthTool.drag;
    WidthTool.drag = null;
    if (!d) return;
    canvas.setActiveObject(d.obj);
    canvas.requestRenderAll();
    History.queue();
    WidthTool.render();
  },
  options() {
    const el = html(`<div class="tool-options-body">
      <p class="field-note">Glissez depuis le contour d'un tracé pour l'élargir ou l'affiner à cet endroit. Alt + clic sur un losange : supprimer le point.</p>
      <span class="field-label">Profils (sur la sélection)</span>
      <div class="chips">${Object.entries(WIDTH_PRESETS).map(([k, x]) => `<button class="chip" type="button" data-wp="${k}">${x.label}</button>`).join('')}
      <button class="chip" type="button" data-wp="none">Retirer</button></div>
    </div>`);
    el.querySelectorAll('[data-wp]').forEach((b) => b.addEventListener('click', () => WidthTool.applyPreset(b.dataset.wp)));
    return el;
  },
};

TOOL_LABELS.width = 'Largeur';
SERIAL_PROPS.push('widthProfile');

Hooks.on('init', () => {
  // Menu « Déformation » du rail (complété par js/liquify.js)
  RailGroups.create('deform', {
    title: 'Largeur & déformation',
    after: $('.rail [data-group="transform"]'),
    items: [{ tool: 'width', label: 'Largeur', icon: WIDTH_ICON, kbd: 'Maj W' }],
  });
  canvas.on('after:render', () => { if (state.tool === 'width' && (WidthTool.hover || WidthTool.drag)) WidthTool.render(); });
  Keys.add((e, { mod, key }) => {
    if (!mod && !e.altKey && e.shiftKey && key === 'w') { e.preventDefault(); setTool('width'); return true; }
    return false;
  });
});
