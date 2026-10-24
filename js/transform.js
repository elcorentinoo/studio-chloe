/**
 * ============================================================================
 *  Chloe’s Touch — Transformations
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

/* ============================================================================
   2. OUTILS DE TRANSFORMATION : Rotation (Maj + R), Miroir (O), Échelle (S),
      Inclinaison — menu du rail
   ----------------------------------------------------------------------------
   Comme dans Illustrator :
     - le point d'origine (cible rose) est au centre de la sélection ;
       un simple clic le déplace ;
     - glisser transforme la sélection autour de ce point
       (Maj : contrainte 45° / proportions / axe ; Alt au relâchement : copie) ;
     - Entrée ou « Valeurs précises… » : saisie numérique (avec « Copier »).
   ========================================================================== */

const TRANSFORM_ICONS = {
  rotate: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  reflect: '<path d="M12 3v18" stroke-dasharray="2 2"/><path d="M9 6 3 18h6zM15 6l6 12h-6z"/>',
  scale: '<rect x="3" y="11" width="10" height="10" rx="1"/><path d="M13 3h8v8M21 3l-8 8"/>',
  shear: '<path d="M8 5h13l-5 14H3z"/>',
};
const TRANSFORM_LABELS = { rotate: 'Rotation', reflect: 'Miroir', scale: 'Mise à l\'échelle', shear: 'Inclinaison' };

const Transformer = {
  ref: null,        // point d'origine (coordonnées du document)
  drag: null,       // { start, objs, m0 }

  selectionBox() {
    const objs = canvas.getActiveObjects();
    if (!objs.length) return null;
    const active = canvas.getActiveObject();
    return active.getBoundingRect(true, true);
  },

  /** Point d'origine : celui choisi, sinon le centre de la sélection */
  origin() {
    if (this.ref) return this.ref;
    const b = this.selectionBox();
    return b ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null;
  },

  /** Matrice de la transformation autour du point o */
  about(o, a, b, c, d) {
    const T = [1, 0, 0, 1, o.x, o.y];
    const Ti = [1, 0, 0, 1, -o.x, -o.y];
    return fabric.util.multiplyTransformMatrices(fabric.util.multiplyTransformMatrices(T, [a, b, c, d, 0, 0]), Ti);
  },

  matrix(kind, { angle = 0, sx = 1, sy = 1, shx = 0, shy = 0 }, o) {
    const r = (angle * Math.PI) / 180;
    if (kind === 'rotate') return this.about(o, Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r));
    if (kind === 'scale') return this.about(o, sx, 0, 0, sy);
    if (kind === 'reflect') return this.about(o, Math.cos(2 * r), Math.sin(2 * r), Math.sin(2 * r), -Math.cos(2 * r));
    if (kind === 'shear') return this.about(o, 1, shy, shx, 1);
    return [1, 0, 0, 1, 0, 0];
  },

  /** Paramètres déduits du glisser (start → p autour de o) */
  paramsFromDrag(kind, o, start, p, shift) {
    const snap = (a) => (shift ? Math.round(a / 45) * 45 : a);
    const ang = (q) => (Math.atan2(q.y - o.y, q.x - o.x) * 180) / Math.PI;
    if (kind === 'rotate') return { angle: snap(ang(p) - ang(start)) };
    if (kind === 'reflect') return { angle: snap(ang(p)) };
    if (kind === 'scale') {
      const fx = Math.abs(start.x - o.x) < 1e-6 ? 1 : (p.x - o.x) / (start.x - o.x);
      const fy = Math.abs(start.y - o.y) < 1e-6 ? 1 : (p.y - o.y) / (start.y - o.y);
      if (shift) {
        const s = Math.hypot(p.x - o.x, p.y - o.y) / Math.max(1e-6, Math.hypot(start.x - o.x, start.y - o.y));
        return { sx: s, sy: s };
      }
      return { sx: fx, sy: fy };
    }
    // Inclinaison : déplacement horizontal → inclinaison horizontale, sinon verticale
    const dx = p.x - start.x;
    const dy = p.y - start.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      const h = start.y - o.y;
      return { shx: Math.abs(h) < 1e-6 ? 0 : dx / h };
    }
    const w = start.x - o.x;
    return { shy: Math.abs(w) < 1e-6 ? 0 : dy / w };
  },

  /** Applique M aux objets à partir de leurs matrices d'origine */
  applyTo(objs, m0, M) {
    objs.forEach((obj, i) => {
      fabric.util.applyTransformToObject(obj, fabric.util.multiplyTransformMatrices(M, m0[i]));
      obj.setCoords();
    });
  },

  /** Transformation numérique (dialogue) : copy = garder l'original */
  run(kind, params, { copy = false } = {}) {
    const o = this.origin();
    if (!o) return;
    const objs = canvas.getActiveObjects();
    canvas.discardActiveObject();
    const M = this.matrix(kind, params, o);
    const finish = (list) => {
      Arrange.reselect(list);
      canvas.requestRenderAll();
      History.queue();
      Properties.sync();
    };
    if (!copy) {
      this.applyTo(objs, objs.map((x) => x.calcTransformMatrix()), M);
      finish(objs);
      return;
    }
    let pending = objs.length;
    const clones = [];
    objs.forEach((obj, i) => obj.clone((cl) => {
      fabric.util.applyTransformToObject(cl, fabric.util.multiplyTransformMatrices(M, obj.calcTransformMatrix()));
      clones[i] = cl;
      pending -= 1;
      if (!pending) {
        clones.forEach((c) => canvas.add(c));
        finish(clones);
      }
    }, SERIAL_PROPS));
  },

  // ---------- dessin du point d'origine
  drawOrigin({ ctx }) {
    if (!TRANSFORM_LABELS[state.tool] || state.exporting) return;
    const o = this.origin();
    if (!o) return;
    const v = canvas.viewportTransform;
    const x = o.x * v[0] + v[4];
    const y = o.y * v[3] + v[5];
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#c73527';
    ctx.fillStyle = '#f68a8d';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 11, y); ctx.lineTo(x + 11, y);
    ctx.moveTo(x, y - 11); ctx.lineTo(x, y + 11);
    ctx.stroke();
    ctx.restore();
  },

  // ---------- saisie numérique
  openDialog(kind) {
    if (!canvas.getActiveObjects().length) { toast('Sélectionnez d\'abord un ou plusieurs objets.'); return; }
    const fields = {
      rotate: `<label class="field-label" for="tf-angle">Angle (°)</label><input class="input" type="number" id="tf-angle" value="90" step="1">`,
      scale: `<label class="check"><input type="checkbox" id="tf-uniform" checked> Proportionnelle</label>
        <div class="input-row"><div><label class="field-label" for="tf-sx">Horizontale (%)</label><input class="input" type="number" id="tf-sx" value="100" step="1"></div>
        <div><label class="field-label" for="tf-sy">Verticale (%)</label><input class="input" type="number" id="tf-sy" value="100" step="1"></div></div>`,
      reflect: `<div class="chips" id="tf-axis"><button class="chip is-active" type="button" data-axis="90">Axe vertical</button><button class="chip" type="button" data-axis="0">Axe horizontal</button><button class="chip" type="button" data-axis="custom">Angle…</button></div>
        <label class="field-label" for="tf-angle">Angle de l'axe (°)</label><input class="input" type="number" id="tf-angle" value="90" step="1">`,
      shear: `<label class="field-label" for="tf-angle">Angle d'inclinaison (°)</label><input class="input" type="number" id="tf-angle" value="20" step="1" min="-80" max="80">
        <div class="chips" id="tf-shear-axis"><button class="chip is-active" type="button" data-axis="h">Horizontale</button><button class="chip" type="button" data-axis="v">Verticale</button></div>`,
    };
    const sheet = Sheet.create({
      title: TRANSFORM_LABELS[kind],
      body: `<div class="field">${fields[kind]}</div><p class="field-note">Autour du point d'origine (cible rose). « Copier » garde l'original.</p>`,
      foot: '<button class="btn" type="button" data-tf="copy">Copier</button><button class="btn btn-primary" type="button" data-tf="ok">OK</button>',
    });
    const $s = sheet.$;
    let shearAxis = 'h';
    sheet.$$('#tf-axis [data-axis]').forEach((b) => b.addEventListener('click', () => {
      sheet.$$('#tf-axis [data-axis]').forEach((x) => x.classList.toggle('is-active', x === b));
      if (b.dataset.axis !== 'custom') $s('#tf-angle').value = b.dataset.axis;
      else $s('#tf-angle').focus();
    }));
    sheet.$$('#tf-shear-axis [data-axis]').forEach((b) => b.addEventListener('click', () => {
      sheet.$$('#tf-shear-axis [data-axis]').forEach((x) => x.classList.toggle('is-active', x === b));
      shearAxis = b.dataset.axis;
    }));
    if (kind === 'scale') {
      const sync = (from, to) => { if ($s('#tf-uniform').checked) $s(to).value = $s(from).value; };
      $s('#tf-sx').addEventListener('input', () => sync('#tf-sx', '#tf-sy'));
      $s('#tf-sy').addEventListener('input', () => sync('#tf-sy', '#tf-sx'));
    }
    const params = () => {
      const num = (id, def) => (Number.isFinite(Number($s(id)?.value)) ? Number($s(id).value) : def);
      if (kind === 'scale') return { sx: num('#tf-sx', 100) / 100, sy: num('#tf-sy', 100) / 100 };
      if (kind === 'shear') {
        const t = Math.tan((clamp(num('#tf-angle', 0), -80, 80) * Math.PI) / 180);
        return shearAxis === 'h' ? { shx: t } : { shy: t };
      }
      // Rotation : sens horaire positif à l'écran, comme Fabric
      return { angle: num('#tf-angle', 0) };
    };
    const go = (copy) => { this.run(kind, params(), { copy }); sheet.close(); };
    $s('[data-tf="ok"]').addEventListener('click', () => go(false));
    $s('[data-tf="copy"]').addEventListener('click', () => go(true));
    sheet.el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(false); } });
    sheet.el.addEventListener('close', () => sheet.el.remove());
    sheet.open();
    $s('input')?.select?.();
  },
};

function makeTransformTool(kind) {
  return {
    cursor: 'crosshair',
    activate() {
      setInteractionMode('draw');
      Transformer.ref = null;
      if (!canvas.getActiveObjects().length) toast('Sélectionnez d\'abord les objets à transformer (flèche noire), puis revenez à l\'outil.');
      canvas.requestRenderAll();
    },
    deactivate() { Transformer.drag = null; Transformer.ref = null; canvas.requestRenderAll(); },
    onMouseDown(p) {
      const objs = selectionBeforeClickFor(kind).length ? selectionBeforeClickFor(kind) : canvas.getActiveObjects();
      if (!objs.length) return;
      canvas.discardActiveObject(); // coordonnées absolues pendant la transformation
      Arrange.reselect(objs);
      const o = Transformer.origin();
      canvas.discardActiveObject();
      Transformer.drag = { start: p, objs, m0: objs.map((x) => x.calcTransformMatrix()), o, moved: false };
    },
    onMouseMove(p, e) {
      const d = Transformer.drag;
      if (!d) return;
      if (!d.moved && Math.hypot(p.x - d.start.x, p.y - d.start.y) * canvas.getZoom() < 4) return;
      d.moved = true;
      const M = Transformer.matrix(kind, Transformer.paramsFromDrag(kind, d.o, d.start, p, e.shiftKey), d.o);
      Transformer.applyTo(d.objs, d.m0, M);
      Transformer.ref = d.o;
      canvas.requestRenderAll();
    },
    onMouseUp(p, e) {
      const d = Transformer.drag;
      Transformer.drag = null;
      if (!d) return;
      if (!d.moved) {
        // Simple clic : nouveau point d'origine (Alt + clic : saisie numérique)
        Arrange.reselect(d.objs);
        Transformer.ref = { x: p.x, y: p.y };
        canvas.requestRenderAll();
        if (e.altKey) Transformer.openDialog(kind);
        return;
      }
      if (e.altKey) {
        // Alt : on garde l'original, la copie reçoit la transformation
        const finals = d.objs.map((x) => x.calcTransformMatrix());
        d.objs.forEach((obj, i) => { fabric.util.applyTransformToObject(obj, d.m0[i]); obj.setCoords(); });
        let pending = d.objs.length;
        const clones = [];
        d.objs.forEach((obj, i) => obj.clone((cl) => {
          fabric.util.applyTransformToObject(cl, finals[i]);
          clones[i] = cl;
          pending -= 1;
          if (!pending) {
            clones.forEach((c) => canvas.add(c));
            Arrange.reselect(clones);
            canvas.requestRenderAll();
            History.queue();
          }
        }, SERIAL_PROPS));
        return;
      }
      Arrange.reselect(d.objs);
      canvas.requestRenderAll();
      History.queue();
      Properties.sync();
    },
    options() {
      const tips = {
        rotate: 'Glissez autour du point d\'origine pour faire pivoter. Maj : par pas de 45°.',
        reflect: 'Glissez pour orienter l\'axe de symétrie (passant par le point d\'origine). Maj : par pas de 45°.',
        scale: 'Glissez pour agrandir ou réduire depuis le point d\'origine. Maj : proportionnel.',
        shear: 'Glissez horizontalement ou verticalement pour incliner depuis le point d\'origine.',
      };
      const el = html(`<div class="tool-options-body">
        <p class="field-note">${tips[kind]} Un clic déplace le point d'origine · Alt au relâchement : copie.</p>
        <div class="btn-row"><button class="btn btn-sm" type="button" data-tf-open>Valeurs…</button><button class="btn btn-sm" type="button" data-tf-center title="Remettre le point d'origine au centre de la sélection">Recentrer</button></div>
      </div>`);
      el.querySelector('[data-tf-open]').addEventListener('click', () => Transformer.openDialog(kind));
      el.querySelector('[data-tf-center]').addEventListener('click', () => { Transformer.ref = null; canvas.requestRenderAll(); });
      return el;
    },
  };
}

['rotate', 'reflect', 'scale', 'shear'].forEach((k) => {
  Tools[k] = makeTransformTool(k);
  TOOL_LABELS[k] = TRANSFORM_LABELS[k];
});
SHORTCUTS.o = 'reflect';
SHORTCUTS.s = 'scale';

Hooks.on('init', () => {
  RailGroups.create('transform', {
    title: 'Transformation',
    after: $('.rail [data-tool="text"]'),
    items: [
      { tool: 'rotate', label: 'Rotation', icon: TRANSFORM_ICONS.rotate, kbd: 'Maj R' },
      { tool: 'reflect', label: 'Miroir', icon: TRANSFORM_ICONS.reflect, kbd: 'O' },
      { tool: 'scale', label: 'Mise à l\'échelle', icon: TRANSFORM_ICONS.scale, kbd: 'S' },
      { tool: 'shear', label: 'Inclinaison', icon: TRANSFORM_ICONS.shear },
    ],
  });
  canvas.on('after:render', (e) => Transformer.drawOrigin(e));
  canvas.on('selection:created', () => { if (TRANSFORM_LABELS[state.tool]) canvas.requestRenderAll(); });
  Keys.add((e, { mod, key }) => {
    if (!mod && !e.altKey && e.shiftKey && key === 'r') { e.preventDefault(); setTool('rotate'); return true; }
    if (TRANSFORM_LABELS[state.tool] && e.key === 'Enter' && !mod) { e.preventDefault(); Transformer.openDialog(state.tool); return true; }
    return false;
  });
});
