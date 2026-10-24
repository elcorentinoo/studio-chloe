/**
 * ============================================================================
 *  Chloe’s Touch — Outils de Fluidité (menu « Largeur & déformation »)
 *    Déformer — pousse la matière dans le sens du geste
 *    Tordre   — tourbillon autour du pinceau (maintenir pour accentuer, Alt : sens inverse)
 *    Gonfler  — repousse depuis le centre du pinceau (Alt : contracter)
 *  Agit sur la sélection, ou sinon sur les formes sous le pinceau. Les formes
 *  sont converties en tracés et subdivisées pour se déformer en douceur.
 *  Rayon et intensité dans le panneau ; [ et ] changent le rayon.
 * ============================================================================
 */
'use strict';

const LIQUIFY_ICONS = {
  warp: '<path d="M4 12c3-5 5 5 8 0s5 5 8 0"/><path d="M14 5l3 3-3 3"/><circle cx="7" cy="17" r="2.5" stroke-dasharray="2 2"/>',
  twirl: '<path d="M12 12a2 2 0 1 1 2-2c0 3-3 5-6 4.5S3.5 11 5 7.5 11 2.5 15 4s6 6.5 4.5 10.5S13 21 9 20"/>',
  bloat: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
};

const LiquifyOpts = { radius: 50, strength: 50 };

const Liquify = {
  session: null, // { kind, targets: [{ obj, cmds }], last, timer, alt }

  /** Commandes absolues → uniquement M / C / Z (les lignes deviennent des courbes) */
  toCubic(cmds) {
    const out = [];
    let pos = null;
    let start = null;
    cmds.forEach((c) => {
      const k = c[0];
      if (k === 'M') { pos = [c[1], c[2]]; start = pos; out.push(['M', ...pos]); }
      else if (k === 'L') {
        const [x, y] = [c[1], c[2]];
        out.push(['C', pos[0] + (x - pos[0]) / 3, pos[1] + (y - pos[1]) / 3, pos[0] + ((x - pos[0]) * 2) / 3, pos[1] + ((y - pos[1]) * 2) / 3, x, y]);
        pos = [x, y];
      } else if (k === 'Q') {
        const [qx, qy, x, y] = c.slice(1);
        out.push(['C', pos[0] + ((qx - pos[0]) * 2) / 3, pos[1] + ((qy - pos[1]) * 2) / 3, x + ((qx - x) * 2) / 3, y + ((qy - y) * 2) / 3, x, y]);
        pos = [x, y];
      } else if (k === 'C') { out.push([...c]); pos = [c[5], c[6]]; }
      else if (k === 'Z') {
        if (start && (pos[0] !== start[0] || pos[1] !== start[1])) {
          out.push(['C', pos[0] + (start[0] - pos[0]) / 3, pos[1] + (start[1] - pos[1]) / 3, pos[0] + ((start[0] - pos[0]) * 2) / 3, pos[1] + ((start[1] - pos[1]) * 2) / 3, start[0], start[1]]);
        }
        out.push(['Z']);
        pos = start;
      }
    });
    return out;
  },

  /** Découpe chaque courbe en morceaux d'au plus maxLen (de Casteljau) */
  densify(cmds, maxLen) {
    const out = [];
    let pos = null;
    cmds.forEach((c) => {
      if (c[0] !== 'C') { out.push(c); if (c[0] === 'M') pos = [c[1], c[2]]; return; }
      const p = [pos, [c[1], c[2]], [c[3], c[4]], [c[5], c[6]]];
      const len = Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]) + Math.hypot(p[2][0] - p[1][0], p[2][1] - p[1][1]) + Math.hypot(p[3][0] - p[2][0], p[3][1] - p[2][1]);
      const n = clamp(Math.ceil(len / maxLen), 1, 48);
      let rest = p;
      for (let i = n; i >= 2; i -= 1) {
        const t = 1 / i;
        const lerp = (a, b) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        const ab = lerp(rest[0], rest[1]);
        const bc = lerp(rest[1], rest[2]);
        const cd = lerp(rest[2], rest[3]);
        const abc = lerp(ab, bc);
        const bcd = lerp(bc, cd);
        const m = lerp(abc, bcd);
        out.push(['C', ...ab, ...abc, ...m]);
        rest = [m, bcd, cd, rest[3]];
      }
      out.push(['C', ...rest[1], ...rest[2], ...rest[3]]);
      pos = [c[5], c[6]];
    });
    return out;
  },

  start(kind, p, e) {
    const R = LiquifyOpts.radius / canvas.getZoom();
    const sel = selectionBeforeClickFor(kind).filter((o) => Geo.canConvert(o) && !o.locked);
    const pool = sel.length ? sel : canvas.getObjects().filter((o) => o.visible && !o.locked && Geo.canConvert(o) && (() => {
      const b = o.getBoundingRect(true, true);
      return p.x > b.left - R && p.x < b.left + b.width + R && p.y > b.top - R && p.y < b.top + b.height + R;
    })());
    if (!pool.length) { toast('Rien à déformer ici : sélectionnez une forme ou passez le pinceau dessus.'); return; }
    canvas.discardActiveObject();
    const targets = pool.map((o) => {
      const obj = asPlainPath(o);
      const cmds = this.densify(this.toCubic(Geo.commands(obj)), R / 4);
      return { obj, cmds };
    });
    this.session = { kind, targets, last: p, alt: e.altKey, cursor: p };
    if (kind !== 'warp') this.session.timer = setInterval(() => this.step(this.session.cursor), 30);
    this.step(p);
  },

  /** Une étape de déformation autour du point c */
  step(c, prev) {
    const s = this.session;
    if (!s) return;
    const R = LiquifyOpts.radius / canvas.getZoom();
    const k = LiquifyOpts.strength / 100;
    const dx = prev ? c.x - prev.x : 0;
    const dy = prev ? c.y - prev.y : 0;
    const move = (x, y) => {
      const ox = x - c.x;
      const oy = y - c.y;
      const d = Math.hypot(ox, oy);
      if (d >= R) return [x, y];
      const f = (1 - (d / R) ** 2) ** 2;
      if (s.kind === 'warp') return [x + dx * f * k * 1.4, y + dy * f * k * 1.4];
      if (s.kind === 'twirl') {
        const a = (s.alt ? -1 : 1) * 0.06 * k * f;
        return [c.x + ox * Math.cos(a) - oy * Math.sin(a), c.y + ox * Math.sin(a) + oy * Math.cos(a)];
      }
      // Gonfler (Alt : contracter)
      if (d < 1e-6) return [x, y];
      const push = (s.alt ? -1 : 1) * R * 0.025 * k * f;
      return [x + (ox / d) * push, y + (oy / d) * push];
    };
    s.targets.forEach((t) => {
      t.cmds.forEach((cmd) => {
        for (let i = 1; i < cmd.length; i += 2) [cmd[i], cmd[i + 1]] = move(cmd[i], cmd[i + 1]);
      });
      t.obj._setPath(t.cmds.map((cmd) => [...cmd]), {});
      t.obj.setCoords();
      t.obj.dirty = true;
    });
    canvas.requestRenderAll();
  },

  end() {
    const s = this.session;
    if (!s) return;
    clearInterval(s.timer);
    this.session = null;
    Arrange.reselect(s.targets.map((t) => t.obj));
    canvas.requestRenderAll();
    History.queue();
  },

  ring(p) {
    const ctx = canvas.contextTop;
    if (!ctx) return; // rendu d’export en cours (toCanvasElement) : pas de calque d’interface
    canvas.clearContext(ctx);
    const v = canvas.viewportTransform;
    ctx.save();
    ctx.strokeStyle = PEN_COLOR;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x * v[0] + v[4], p.y * v[3] + v[5], LiquifyOpts.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.arc(p.x * v[0] + v[4], p.y * v[3] + v[5], LiquifyOpts.radius * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  },
};

function makeLiquifyTool(kind) {
  const tips = {
    warp: 'Glissez sur une forme pour pousser sa matière.',
    twirl: 'Maintenez ou glissez sur une forme pour la tordre. Alt : sens inverse.',
    bloat: 'Maintenez ou glissez sur une forme pour la gonfler. Alt : contracter.',
  };
  return {
    cursor: 'crosshair',
    activate() { setInteractionMode('draw'); },
    deactivate() { Liquify.end(); canvas.clearContext(canvas.contextTop); },
    onMouseDown(p, e) { Liquify.start(kind, p, e); },
    onMouseMove(p, e) {
      const s = Liquify.session;
      if (s) {
        s.alt = e.altKey;
        if (kind === 'warp') Liquify.step(p, s.last);
        s.last = p;
        s.cursor = p;
      }
      Liquify.ring(p);
    },
    onMouseUp() { Liquify.end(); },
    options() {
      const el = html(`<div class="tool-options-body"><p class="field-note">${tips[kind]} Avec une sélection, seule la sélection est déformée. [ et ] : rayon.</p></div>`);
      el.append(
        optionRange({ id: `liq-radius-${kind}`, label: 'Rayon', min: 10, max: 200, value: LiquifyOpts.radius, unit: ' px', onInput: (v) => { LiquifyOpts.radius = v; } }),
        optionRange({ id: `liq-strength-${kind}`, label: 'Intensité', min: 5, max: 100, value: LiquifyOpts.strength, unit: ' %', onInput: (v) => { LiquifyOpts.strength = v; } }),
      );
      return el;
    },
    syncOptions() {
      this._optionsEl?.querySelectorAll('.field').forEach((f, i) => f.set?.(i ? LiquifyOpts.strength : LiquifyOpts.radius));
    },
  };
}

Object.assign(TOOL_LABELS, { warp: 'Déformer', twirl: 'Tordre', bloat: 'Gonfler' });
['warp', 'twirl', 'bloat'].forEach((k) => { Tools[k] = makeLiquifyTool(k); });

Hooks.on('init', () => {
  RailGroups.add('deform', { tool: 'warp', label: 'Déformer', icon: LIQUIFY_ICONS.warp });
  RailGroups.add('deform', { tool: 'twirl', label: 'Tordre', icon: LIQUIFY_ICONS.twirl });
  RailGroups.add('deform', { tool: 'bloat', label: 'Gonfler / contracter', icon: LIQUIFY_ICONS.bloat });
  Keys.add((e, { mod }) => {
    if (!mod && (e.key === '[' || e.key === ']') && ['warp', 'twirl', 'bloat'].includes(state.tool)) {
      e.preventDefault();
      LiquifyOpts.radius = clamp(LiquifyOpts.radius + (e.key === ']' ? 10 : -10), 10, 200);
      Tools[state.tool].syncOptions();
      return true;
    }
    return false;
  });
});
