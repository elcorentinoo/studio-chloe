/**
 * ============================================================================
 *  Studio Chloé — Édition avancée des points (menu de la Plume)
 *
 *    Ajouter un point (+)      — clic sur un segment
 *    Supprimer un point (−)    — clic sur un point d'ancrage
 *    Convertir le point        — clic : angle ↔ lisse ; glisser depuis un
 *                                point : tire des poignées symétriques
 *    Ciseaux (C)               — clic sur un tracé : le coupe en deux
 *                                (un tracé fermé devient ouvert)
 *  Fonctionne sur les tracés et sur toutes les formes (converties en tracé
 *  au premier clic, comme avec la flèche blanche).
 *
 *  Modèle interne : un sous-tracé = liste de points d'ancrage
 *    { p: {x,y}, hin: {x,y}, hout: {x,y} } + closed
 *  (coordonnées propres du tracé Fabric ; PathEditor.refit recale la boîte).
 * ============================================================================
 */
'use strict';

const ANCHOR_ICONS = {
  add: '<path d="M12 19l7-7 3 3-7 7z"/><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18z"/><path d="M19 2v6M16 5h6"/>',
  remove: '<path d="M12 19l7-7 3 3-7 7z"/><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18z"/><path d="M16 5h6"/>',
  convert: '<path d="M4 20 12 4l8 16"/><path d="M6 9h12" stroke-dasharray="2 2"/><circle cx="12" cy="4" r="1.6"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
};

const Anchors = {
  // ---------- conversion commandes ↔ points d'ancrage
  parse(path) {
    const subs = [];
    let cur = null;
    let pos = null;
    const P = (x, y) => ({ x, y });
    path.forEach((c) => {
      const k = c[0].toUpperCase();
      if (k === 'M') {
        pos = P(c[1], c[2]);
        cur = { closed: false, anchors: [{ p: pos, hin: { ...pos }, hout: { ...pos } }] };
        subs.push(cur);
      } else if (k === 'L' || k === 'C' || k === 'Q') {
        const end = P(c[c.length - 2], c[c.length - 1]);
        const last = cur.anchors[cur.anchors.length - 1];
        if (k === 'C') { last.hout = P(c[1], c[2]); cur.anchors.push({ p: end, hin: P(c[3], c[4]), hout: { ...end } }); }
        else if (k === 'Q') {
          last.hout = P(pos.x + ((c[1] - pos.x) * 2) / 3, pos.y + ((c[2] - pos.y) * 2) / 3);
          cur.anchors.push({ p: end, hin: P(end.x + ((c[1] - end.x) * 2) / 3, end.y + ((c[2] - end.y) * 2) / 3), hout: { ...end } });
        } else cur.anchors.push({ p: end, hin: { ...end }, hout: { ...end } });
        pos = end;
      } else if (k === 'Z' && cur) {
        cur.closed = true;
        const a = cur.anchors;
        const first = a[0];
        const last = a[a.length - 1];
        // Le dernier point confondu avec le premier : on les fusionne
        if (a.length > 1 && Math.abs(last.p.x - first.p.x) < 1e-6 && Math.abs(last.p.y - first.p.y) < 1e-6) {
          first.hin = last.hin;
          a.pop();
        }
        pos = first.p;
      }
    });
    return subs.filter((s) => s.anchors.length);
  },

  build(subs) {
    const out = [];
    const same = (a, b) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
    const seg = (a, b) => (same(a.hout, a.p) && same(b.hin, b.p)
      ? ['L', b.p.x, b.p.y]
      : ['C', a.hout.x, a.hout.y, b.hin.x, b.hin.y, b.p.x, b.p.y]);
    subs.forEach((s) => {
      const A = s.anchors;
      if (!A.length) return;
      out.push(['M', A[0].p.x, A[0].p.y]);
      for (let i = 1; i < A.length; i += 1) out.push(seg(A[i - 1], A[i]));
      if (s.closed) {
        if (A.length > 1) out.push(seg(A[A.length - 1], A[0]));
        out.push(['Z']);
      }
    });
    return out;
  },

  segmentCount(s) { return s.closed ? s.anchors.length : s.anchors.length - 1; },
  segmentEnds(s, i) { return [s.anchors[i], s.anchors[(i + 1) % s.anchors.length]]; },

  bez(a, b, t) {
    const mt = 1 - t;
    const P = [a.p, a.hout, b.hin, b.p];
    return {
      x: mt ** 3 * P[0].x + 3 * mt * mt * t * P[1].x + 3 * mt * t * t * P[2].x + t ** 3 * P[3].x,
      y: mt ** 3 * P[0].y + 3 * mt * mt * t * P[1].y + 3 * mt * t * t * P[2].y + t ** 3 * P[3].y,
    };
  },

  /** Point du tracé le plus proche de q (coordonnées du tracé) */
  nearestOnPath(subs, q) {
    let best = null;
    subs.forEach((s, si) => {
      for (let i = 0; i < this.segmentCount(s); i += 1) {
        const [a, b] = this.segmentEnds(s, i);
        let bt = 0;
        let bd = Infinity;
        for (let k = 0; k <= 40; k += 1) {
          const t = k / 40;
          const p = this.bez(a, b, t);
          const d = Math.hypot(p.x - q.x, p.y - q.y);
          if (d < bd) { bd = d; bt = t; }
        }
        // Affinage local
        let step = 1 / 80;
        for (let r = 0; r < 12; r += 1) {
          [bt - step, bt + step].forEach((t) => {
            if (t < 0 || t > 1) return;
            const p = this.bez(a, b, t);
            const d = Math.hypot(p.x - q.x, p.y - q.y);
            if (d < bd) { bd = d; bt = t; }
          });
          step /= 2;
        }
        if (!best || bd < best.d) best = { si, i, t: bt, d: bd, point: this.bez(a, b, bt) };
      }
    });
    return best;
  },

  nearestAnchor(subs, q) {
    let best = null;
    subs.forEach((s, si) => s.anchors.forEach((a, k) => {
      const d = Math.hypot(a.p.x - q.x, a.p.y - q.y);
      if (!best || d < best.d) best = { si, k, d };
    }));
    return best;
  },

  /** Insère un point au paramètre t du segment i (de Casteljau) ; renvoie son index */
  split(s, i, t) {
    const [a, b] = this.segmentEnds(s, i);
    const L = (u, v) => ({ x: u.x + (v.x - u.x) * t, y: u.y + (v.y - u.y) * t });
    const ab = L(a.p, a.hout);
    const bc = L(a.hout, b.hin);
    const cd = L(b.hin, b.p);
    const abc = L(ab, bc);
    const bcd = L(bc, cd);
    const m = L(abc, bcd);
    a.hout = ab;
    b.hin = cd;
    s.anchors.splice(i + 1, 0, { p: m, hin: abc, hout: bcd });
    return i + 1;
  },

  // ---------- application sur un objet Fabric
  /** Pixels écran → unités du tracé (pour les tolérances) */
  unit(obj) {
    const m = obj.calcTransformMatrix();
    return 1 / (canvas.getZoom() * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1);
  },

  write(obj, subs) {
    obj.path = this.build(subs);
    PathEditor.refit(obj);
    obj.dirty = true;
  },

  /** Tracé visé : le plus proche du pointeur (8 px écran), converti si besoin */
  pick(p, { anchorsOnly = false } = {}) {
    const zoom = canvas.getZoom();
    const cands = canvas.getObjects().filter((o) => o.visible && !o.locked && Geo.canConvert(o)).reverse();
    for (const o of cands) {
      const b = o.getBoundingRect(true, true);
      const pad = 12 / zoom;
      if (p.x < b.left - pad || p.x > b.left + b.width + pad || p.y < b.top - pad || p.y > b.top + b.height + pad) continue;
      const subs = o.type === 'path' ? this.parse(o.path) : null;
      const q = o.type === 'path' ? PathEditor.toPath(o, p) : null;
      // Formes non converties : test sur leur géométrie (coordonnées du document)
      const geomSubs = subs || this.parse(Geo.commands(o).map((c) => [...c]));
      const gq = q || p;
      const unit = o.type === 'path' ? this.unit(o) : 1 / zoom;
      const hitA = this.nearestAnchor(geomSubs, gq);
      const hitS = anchorsOnly ? null : this.nearestOnPath(geomSubs, gq);
      if ((hitA && hitA.d <= 8 * unit) || (hitS && hitS.d <= 8 * unit)) return { obj: o, anchor: hitA && hitA.d <= 8 * unit ? hitA : null, seg: hitS && hitS.d <= 8 * unit ? hitS : null };
    }
    return null;
  },

  /** Convertit au besoin en tracé (même géométrie à l'écran) et renvoie ses sous-tracés */
  prepare(obj) {
    const path = DirectSelect.editable(obj);
    if (!path) return null;
    return { obj: path, subs: this.parse(path.path) };
  },

  // ---------- aperçu
  render(p) {
    const ctx = canvas.contextTop;
    if (!ctx) return; // rendu d’export en cours (toCanvasElement) : pas de calque d’interface
    canvas.clearContext(ctx);
    if (!ANCHOR_TOOLS.includes(state.tool)) return;
    const hit = p ? this.pick(p, { anchorsOnly: state.tool === 'deleteAnchor' || state.tool === 'convertAnchor' }) : null;
    const obj = hit?.obj || (canvas.getActiveObject()?.type === 'path' ? canvas.getActiveObject() : null);
    if (!obj) return;
    const toS = (pt) => (obj.type === 'path' ? PathEditor.toScreen(obj, pt.x, pt.y) : fabric.util.transformPoint(pt, canvas.viewportTransform));
    const subs = obj.type === 'path' ? this.parse(obj.path) : this.parse(Geo.commands(obj).map((c) => [...c]));
    ctx.save();
    ctx.strokeStyle = PEN_COLOR;
    ctx.lineWidth = 1.5;
    subs.forEach((s, si) => s.anchors.forEach((a, k) => {
      const c = toS(a.p);
      const on = hit?.anchor && hit.anchor.si === si && hit.anchor.k === k;
      const r = on ? 6 : 4;
      ctx.fillStyle = on ? (state.tool === 'deleteAnchor' ? '#e0457b' : '#d4f04c') : '#ffffff';
      ctx.fillRect(c.x - r, c.y - r, r * 2, r * 2);
      ctx.strokeRect(c.x - r, c.y - r, r * 2, r * 2);
    }));
    if (hit?.seg && (state.tool === 'addAnchor' || state.tool === 'scissors') && !hit.anchor) {
      const c = toS(hit.seg.point);
      ctx.beginPath();
      ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = state.tool === 'scissors' ? '#e0457b' : '#d4f04c';
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  },

  // ---------- opérations
  addAt(p) {
    const hit = this.pick(p);
    if (!hit?.seg) return false;
    const prep = this.prepare(hit.obj);
    if (!prep) return false;
    const q = PathEditor.toPath(prep.obj, p);
    const n = this.nearestOnPath(prep.subs, q);
    this.split(prep.subs[n.si], n.i, n.t);
    this.write(prep.obj, prep.subs);
    return prep.obj;
  },

  deleteAt(p) {
    const hit = this.pick(p, { anchorsOnly: true });
    if (!hit?.anchor) return false;
    const prep = this.prepare(hit.obj);
    if (!prep) return false;
    const q = PathEditor.toPath(prep.obj, p);
    const a = this.nearestAnchor(prep.subs, q);
    const s = prep.subs[a.si];
    s.anchors.splice(a.k, 1);
    if (s.anchors.length < 2) prep.subs.splice(a.si, 1);
    if (!prep.subs.length) { canvas.remove(prep.obj); return true; }
    this.write(prep.obj, prep.subs);
    return prep.obj;
  },

  /** Clic : angle ↔ lisse */
  convertAt(p) {
    const hit = this.pick(p, { anchorsOnly: true });
    if (!hit?.anchor) return false;
    const prep = this.prepare(hit.obj);
    if (!prep) return false;
    const q = PathEditor.toPath(prep.obj, p);
    const ai = this.nearestAnchor(prep.subs, q);
    const s = prep.subs[ai.si];
    const a = s.anchors[ai.k];
    const smooth = Math.hypot(a.hin.x - a.p.x, a.hin.y - a.p.y) > 1e-6 || Math.hypot(a.hout.x - a.p.x, a.hout.y - a.p.y) > 1e-6;
    if (smooth) {
      a.hin = { ...a.p };
      a.hout = { ...a.p };
    } else {
      const n = s.anchors.length;
      const prev = s.anchors[s.closed ? (ai.k - 1 + n) % n : Math.max(0, ai.k - 1)].p;
      const next = s.anchors[s.closed ? (ai.k + 1) % n : Math.min(n - 1, ai.k + 1)].p;
      const d = { x: (next.x - prev.x) / 6, y: (next.y - prev.y) / 6 };
      a.hout = { x: a.p.x + d.x, y: a.p.y + d.y };
      a.hin = { x: a.p.x - d.x, y: a.p.y - d.y };
    }
    this.write(prep.obj, prep.subs);
    return prep.obj;
  },

  /** Glisser depuis un point : poignées symétriques vers la souris */
  pullHandles(obj, si, k, p) {
    const subs = this.parse(obj.path);
    const a = subs[si]?.anchors[k];
    if (!a) return;
    const q = PathEditor.toPath(obj, p);
    a.hout = { x: q.x, y: q.y };
    a.hin = { x: 2 * a.p.x - q.x, y: 2 * a.p.y - q.y };
    obj.path = this.build(subs);
    obj.dirty = true;
    canvas.requestRenderAll();
  },

  cutAt(p) {
    const hit = this.pick(p);
    if (!hit?.seg && !hit?.anchor) return false;
    const prep = this.prepare(hit.obj);
    if (!prep) return false;
    const { obj, subs } = prep;
    const q = PathEditor.toPath(obj, p);
    const unit = this.unit(obj);
    const na = this.nearestAnchor(subs, q);
    let si;
    let k;
    if (na && na.d <= 8 * unit) { si = na.si; k = na.k; } else {
      const n = this.nearestOnPath(subs, q);
      si = n.si;
      k = this.split(subs[si], n.i, n.t);
    }
    const s = subs[si];
    const A = s.anchors;
    const pieces = [];
    const clone = (a) => ({ p: { ...a.p }, hin: { ...a.hin }, hout: { ...a.hout } });
    if (s.closed) {
      // Fermé → ouvert, qui commence et finit au point de coupe
      const rot = [...A.slice(k), ...A.slice(0, k), A[k]].map(clone);
      rot[0].hin = { ...rot[0].p };
      rot[rot.length - 1].hout = { ...rot[rot.length - 1].p };
      pieces.push({ closed: false, anchors: rot });
    } else {
      if (k === 0 || k === A.length - 1) return false; // couper à une extrémité ne change rien
      const left = A.slice(0, k + 1).map(clone);
      const right = A.slice(k).map(clone);
      left[left.length - 1].hout = { ...left[left.length - 1].p };
      right[0].hin = { ...right[0].p };
      pieces.push({ closed: false, anchors: left }, { closed: false, anchors: right });
    }
    const others = subs.filter((_, i) => i !== si);
    // Chaque morceau devient un tracé à part, exprimé en coordonnées du document
    const m = obj.calcTransformMatrix();
    const o = obj.pathOffset;
    const toDoc = (cmds) => Geo.transform(cmds.map((c) => (c[0] === 'Z' ? ['Z'] : [c[0], ...c.slice(1).map((v, i) => v - (i % 2 ? o.y : o.x))])), m);
    const index = canvas.getObjects().indexOf(obj);
    const results = pieces.map((piece) => new fabric.Path(Geo.toPathData(toDoc(this.build([piece]))), { ...Geo.styleOf(obj), shapeKind: obj.shapeKind }));
    if (others.length) this.write(obj, others); else canvas.remove(obj);
    results.forEach((r, i) => canvas.insertAt(r, index + 1 + i));
    return results;
  },
};

const ANCHOR_TOOLS = ['addAnchor', 'deleteAnchor', 'convertAnchor', 'scissors'];

function makeAnchorTool(kind) {
  const tips = {
    addAnchor: 'Cliquez sur un segment pour y ajouter un point.',
    deleteAnchor: 'Cliquez sur un point d\'ancrage pour le supprimer (la courbe se referme sur ses voisins).',
    convertAnchor: 'Cliquez sur un point : angle ↔ lisse. Glissez depuis un point pour tirer ses poignées.',
    scissors: 'Cliquez sur un tracé pour le couper : un tracé fermé s\'ouvre, un tracé ouvert se sépare en deux.',
  };
  return {
    cursor: 'crosshair',
    drag: null,
    activate() { setInteractionMode('draw'); },
    deactivate() { this.drag = null; canvas.clearContext(canvas.contextTop); },
    onMouseDown(p) {
      if (kind === 'convertAnchor') {
        const hit = Anchors.pick(p, { anchorsOnly: true });
        if (!hit?.anchor) return;
        const prep = Anchors.prepare(hit.obj);
        if (!prep) return;
        const na = Anchors.nearestAnchor(prep.subs, PathEditor.toPath(prep.obj, p));
        this.drag = { obj: prep.obj, si: na.si, k: na.k, start: p, moved: false };
      }
    },
    onMouseMove(p) {
      const d = this.drag;
      if (d) {
        if (!d.moved && Math.hypot(p.x - d.start.x, p.y - d.start.y) * canvas.getZoom() < 3) return;
        d.moved = true;
        Anchors.pullHandles(d.obj, d.si, d.k, p);
      }
      Anchors.render(p);
    },
    onMouseUp(p) {
      let done = null;
      if (kind === 'convertAnchor') {
        const d = this.drag;
        this.drag = null;
        if (d?.moved) { PathEditor.refit(d.obj); done = d.obj; } else if (d) done = Anchors.convertAt(p);
      } else if (kind === 'addAnchor') done = Anchors.addAt(p);
      else if (kind === 'deleteAnchor') done = Anchors.deleteAt(p);
      else if (kind === 'scissors') done = Anchors.cutAt(p);
      if (!done) return;
      if (Array.isArray(done)) Arrange.reselect(done);
      else if (done !== true) canvas.setActiveObject(done);
      canvas.requestRenderAll();
      History.queue();
      Anchors.render(p);
    },
    options() { return html(`<p class="field-note">${tips[kind]}</p>`); },
  };
}

Object.assign(TOOL_LABELS, { addAnchor: 'Ajout de point', deleteAnchor: 'Suppression de point', convertAnchor: 'Conversion de point', scissors: 'Ciseaux' });
ANCHOR_TOOLS.forEach((k) => { Tools[k] = makeAnchorTool(k); });

Hooks.on('init', () => {
  RailGroups.add('pen', { tool: 'addAnchor', label: 'Ajouter un point', icon: ANCHOR_ICONS.add, kbd: '+' });
  RailGroups.add('pen', { tool: 'deleteAnchor', label: 'Supprimer un point', icon: ANCHOR_ICONS.remove, kbd: '−' });
  RailGroups.add('pen', { tool: 'convertAnchor', label: 'Convertir le point', icon: ANCHOR_ICONS.convert });
  RailGroups.add('pen', { tool: 'scissors', label: 'Ciseaux', icon: ANCHOR_ICONS.scissors, kbd: 'C' });
  Keys.add((e, { mod, key }) => {
    if (mod || e.altKey) return false;
    if (key === '+' || key === '=') { e.preventDefault(); setTool('addAnchor'); return true; }
    if (key === '-' || key === '_') { e.preventDefault(); setTool('deleteAnchor'); return true; }
    // C : rogner si une image est sélectionnée, sinon les ciseaux
    if (key === 'c' && !e.shiftKey && !isImage(canvas.getActiveObject())) { e.preventDefault(); setTool('scissors'); return true; }
    return false;
  });
});
