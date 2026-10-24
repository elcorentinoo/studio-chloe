/**
 * ============================================================================
 *  Chloe’s Touch — Graphiques vectoriels (J), menu « Données & export »
 *
 *  Tracez un cadre : une fenêtre s'ouvre pour saisir les données (une ligne
 *  par catégorie, colonnes séparées par ; , ou tabulation — un copier-coller
 *  depuis un tableur fonctionne) et choisir le type :
 *    barres, barres horizontales, barres empilées, lignes, aires,
 *    secteurs, anneau.
 *  Le graphique est un groupe vectoriel (formes + textes) aux couleurs de la
 *  marque. Double-clic (flèche noire) : modifier les données ou le type.
 *  Les données restent dans le document (obj.chart).
 * ============================================================================
 */
'use strict';

const GRAPH_ICONS = {
  graph: '<path d="M3 3v18h18"/><path d="M7 16v-5M11 16V7M15 16v-3M19 16V9"/>',
};
const CHART_COLORS = ['#d9474f', '#f68a8d', '#c73527', '#e0457b', '#3d7be0', '#f2a33a', '#9b6bd6', '#2bb3a3'];
const CHART_TYPES = {
  bar: 'Barres', hbar: 'Barres horizontales', stack: 'Barres empilées', line: 'Lignes', area: 'Aires', pie: 'Secteurs', donut: 'Anneau',
};
const CHART_SAMPLE = 'Mois;Ventes;Objectif\nJanv.;12;10\nFévr.;18;14\nMars;15;16\nAvr.;24;18\nMai;21;20';

const Charts = {
  /** Texte → { series: [noms], rows: [{ label, values: [] }] } */
  parse(text) {
    const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    // Tabulation ou « ; » (la virgule décimale reste possible), sinon virgule
    const split = (l) => (/[\t;]/.test(l) ? l.split(/[\t;]/) : l.split(',')).map((x) => x.trim());
    const rows = lines.map(split);
    const isNum = (x) => x !== '' && !Number.isNaN(Number(String(x).replace(/\s/g, '').replace(',', '.')));
    const num = (x) => Number(String(x).replace(/\s/g, '').replace(',', '.')) || 0;
    let header = null;
    if (rows.length && rows[0].slice(1).some((x) => !isNum(x))) header = rows.shift();
    const width = Math.max(2, ...rows.map((r) => r.length));
    const series = Array.from({ length: width - 1 }, (_, i) => header?.[i + 1] || `Série ${i + 1}`);
    return {
      series,
      rows: rows.map((r) => ({ label: r[0] || '', values: series.map((_, i) => num(r[i + 1])) })),
    };
  },

  text(str, left, top, opts = {}) {
    return new fabric.Text(String(str), {
      left, top, fontFamily: 'Inter', fontSize: opts.size || 14, fill: opts.fill || '#c73527',
      originX: opts.originX || 'left', originY: opts.originY || 'top', fontWeight: opts.weight || 'normal',
    });
  },

  niceMax(v) {
    if (v <= 0) return 1;
    const p = 10 ** Math.floor(Math.log10(v));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  },

  /** Construit les objets du graphique dans la boîte (0,0,w,h) */
  build(spec) {
    const { type, w, h } = spec;
    const data = this.parse(spec.data);
    const objs = [];
    const S = Math.max(11, Math.min(w, h) / 18); // taille de texte proportionnelle
    const col = (i) => CHART_COLORS[i % CHART_COLORS.length];
    const showLegend = data.series.length > 1 || type === 'pie' || type === 'donut';
    const legendH = showLegend ? S * 2.2 : 0;

    if (type === 'pie' || type === 'donut') {
      const vals = data.rows.map((r) => Math.max(0, r.values[0]));
      const total = vals.reduce((a, b) => a + b, 0) || 1;
      const R = Math.min(w, h - legendH) / 2 - S;
      const cx = w / 2;
      const cy = (h - legendH) / 2;
      const r0 = type === 'donut' ? R * 0.55 : 0;
      let a = -Math.PI / 2;
      vals.forEach((v, i) => {
        const da = (v / total) * Math.PI * 2;
        if (da <= 0) return;
        const a1 = a + Math.min(da, Math.PI * 2 - 1e-4);
        const large = da > Math.PI ? 1 : 0;
        const P = (r, t) => `${cx + r * Math.cos(t)} ${cy + r * Math.sin(t)}`;
        const d = r0
          ? `M ${P(R, a)} A ${R} ${R} 0 ${large} 1 ${P(R, a1)} L ${P(r0, a1)} A ${r0} ${r0} 0 ${large} 0 ${P(r0, a)} Z`
          : `M ${cx} ${cy} L ${P(R, a)} A ${R} ${R} 0 ${large} 1 ${P(R, a1)} Z`;
        objs.push(new fabric.Path(d, { fill: col(i), stroke: '#ffffff', strokeWidth: Math.max(1, S / 6), strokeLineJoin: 'round' }));
        if (spec.values !== false && v / total > 0.04) {
          const mid = a + da / 2;
          const lr = r0 ? (R + r0) / 2 : R * 0.65;
          objs.push(this.text(`${Math.round((v / total) * 100)} %`, cx + lr * Math.cos(mid), cy + lr * Math.sin(mid), { size: S, fill: i % CHART_COLORS.length === 2 ? '#ffffff' : '#c73527', originX: 'center', originY: 'center', weight: 'bold' }));
        }
        a += da;
      });
      if (showLegend) this.legend(objs, data.rows.map((r) => r.label), col, w, h - legendH * 0.75, S);
      return objs;
    }

    const padL = S * 3.2;
    const padB = S * 2.2;
    const padT = S;
    const plotW = w - padL - S;
    const plotH = h - padB - padT - legendH;
    const horizontal = type === 'hbar';
    const stacked = type === 'stack';
    const maxV = this.niceMax(Math.max(1e-9, ...data.rows.map((r) => (stacked ? r.values.reduce((a, b) => a + Math.max(0, b), 0) : Math.max(...r.values)))));
    const ticks = 5;

    // Grille + graduations
    for (let i = 0; i <= ticks; i += 1) {
      const v = (maxV * i) / ticks;
      const label = Number.isInteger(v) ? String(v) : v.toFixed(1);
      if (horizontal) {
        const x = padL + (plotW * i) / ticks;
        objs.push(new fabric.Line([x, padT, x, padT + plotH], { stroke: i ? 'rgba(74,22,24,0.12)' : '#c73527', strokeWidth: i ? 1 : 1.5 }));
        objs.push(this.text(label, x, padT + plotH + S * 0.4, { size: S * 0.8, originX: 'center', fill: '#7a5f60' }));
      } else {
        const y = padT + plotH - (plotH * i) / ticks;
        objs.push(new fabric.Line([padL, y, padL + plotW, y], { stroke: i ? 'rgba(74,22,24,0.12)' : '#c73527', strokeWidth: i ? 1 : 1.5 }));
        objs.push(this.text(label, padL - S * 0.4, y, { size: S * 0.8, originX: 'right', originY: 'center', fill: '#7a5f60' }));
      }
    }

    const n = data.rows.length || 1;
    const band = (horizontal ? plotH : plotW) / n;
    const nS = data.series.length;
    data.rows.forEach((row, ri) => {
      const b0 = (horizontal ? padT : padL) + band * ri;
      const lbl = horizontal
        ? this.text(row.label, padL - S * 0.4, b0 + band / 2, { size: S * 0.85, originX: 'right', originY: 'center' })
        : this.text(row.label, b0 + band / 2, padT + plotH + S * 0.4, { size: S * 0.85, originX: 'center' });
      if (type === 'bar' || type === 'hbar' || type === 'stack') objs.push(lbl);
      if (type === 'bar' || type === 'hbar') {
        const inner = band * 0.72;
        const bw = inner / nS;
        row.values.forEach((v, si) => {
          const len = (Math.max(0, v) / maxV) * (horizontal ? plotW : plotH);
          const off = b0 + (band - inner) / 2 + bw * si;
          const rect = horizontal
            ? new fabric.Rect({ left: padL, top: off, width: len, height: bw * 0.9, fill: col(si), rx: Math.min(4, bw / 4), ry: Math.min(4, bw / 4), strokeWidth: 0 })
            : new fabric.Rect({ left: off, top: padT + plotH - len, width: bw * 0.9, height: len, fill: col(si), rx: Math.min(4, bw / 4), ry: Math.min(4, bw / 4), strokeWidth: 0 });
          objs.push(rect);
          if (spec.values !== false) {
            objs.push(horizontal
              ? this.text(v, padL + len + S * 0.3, off + (bw * 0.9) / 2, { size: S * 0.75, originY: 'center' })
              : this.text(v, off + (bw * 0.9) / 2, padT + plotH - len - S * 0.25, { size: S * 0.75, originX: 'center', originY: 'bottom' }));
          }
        });
      } else if (stacked) {
        const bw = band * 0.6;
        let acc = 0;
        row.values.forEach((v, si) => {
          const len = (Math.max(0, v) / maxV) * plotH;
          objs.push(new fabric.Rect({ left: b0 + (band - bw) / 2, top: padT + plotH - acc - len, width: bw, height: len, fill: col(si), strokeWidth: 0 }));
          acc += len;
        });
      }
    });

    if (type === 'line' || type === 'area') {
      data.rows.forEach((row, ri) => objs.push(this.text(row.label, padL + band * ri + band / 2, padT + plotH + S * 0.4, { size: S * 0.85, originX: 'center' })));
      data.series.forEach((_, si) => {
        const pts = data.rows.map((row, ri) => ({ x: padL + band * ri + band / 2, y: padT + plotH - (Math.max(0, row.values[si]) / maxV) * plotH }));
        if (type === 'area') {
          objs.push(new fabric.Polygon([{ x: pts[0].x, y: padT + plotH }, ...pts, { x: pts[pts.length - 1].x, y: padT + plotH }], { fill: col(si), opacity: 0.35, strokeWidth: 0 }));
        }
        objs.push(new fabric.Polyline(pts, { fill: null, stroke: col(si), strokeWidth: Math.max(2, S / 5), strokeLineJoin: 'round', strokeLineCap: 'round' }));
        pts.forEach((p) => objs.push(new fabric.Circle({ left: p.x, top: p.y, radius: Math.max(3, S / 3.5), originX: 'center', originY: 'center', fill: '#ffffff', stroke: col(si), strokeWidth: Math.max(2, S / 6) })));
      });
    }
    if (showLegend) this.legend(objs, data.series, col, w, h - legendH * 0.75, S);
    return objs;
  },

  legend(objs, names, col, w, y, S) {
    const items = names.map((name, i) => {
      const t = this.text(name, 0, y, { size: S * 0.85, originY: 'center' });
      return { t, i, width: S * 1.2 + t.width + S };
    });
    const total = items.reduce((s, it) => s + it.width, 0);
    let x = Math.max(0, (w - total) / 2);
    items.forEach(({ t, i, width }) => {
      objs.push(new fabric.Rect({ left: x, top: y - S * 0.4, width: S * 0.8, height: S * 0.8, rx: S * 0.2, ry: S * 0.2, fill: col(i), strokeWidth: 0 }));
      t.set({ left: x + S * 1.2 });
      objs.push(t);
      x += width;
    });
  },

  /** Crée (ou remplace) un groupe-graphique dans la boîte du document */
  place(spec, box, replace = null) {
    const objs = this.build({ ...spec, w: box.width, h: box.height });
    const group = new fabric.Group(objs, { name: `Graphique — ${CHART_TYPES[spec.type]}` });
    group.chart = { type: spec.type, data: spec.data, values: spec.values !== false, w: box.width, h: box.height };
    // Le cadre intérieur commence en (0,0) : on aligne le groupe sur la boîte voulue
    const b = group.getBoundingRect(true, true);
    group.set({ left: group.left + (box.left - b.left), top: group.top + (box.top - b.top) });
    if (replace) {
      group.set({ angle: replace.angle, scaleX: replace.scaleX, scaleY: replace.scaleY });
      group.setPositionByOrigin(replace.getCenterPoint(), 'center', 'center');
      Geo.replace(replace, group);
    } else {
      canvas.add(group);
      canvas.setActiveObject(group);
    }
    group.setCoords();
    canvas.requestRenderAll();
    History.queue();
    refreshFonts();
    return group;
  },

  /** Fenêtre de saisie (création ou modification) */
  edit({ box = null, target = null } = {}) {
    const spec = target?.chart || { type: 'bar', data: CHART_SAMPLE, values: true };
    const sheet = Sheet.create({
      title: target ? 'Modifier le graphique' : 'Nouveau graphique',
      body: `
        <div><h3 class="sheet-section">Type</h3><div class="chips" id="chart-types">
          ${Object.entries(CHART_TYPES).map(([k, l]) => `<button class="chip${k === spec.type ? ' is-active' : ''}" type="button" data-chart="${k}">${l}</button>`).join('')}
        </div></div>
        <div class="field">
          <h3 class="sheet-section">Données</h3>
          <textarea class="input chart-data" id="chart-data" rows="8" spellcheck="false"></textarea>
          <p class="field-note">Une ligne par catégorie ; colonnes séparées par « ; », « , » ou une tabulation (copier-coller depuis un tableur). 1re ligne = noms des séries (facultatif). Secteurs et anneau utilisent la 1re série.</p>
        </div>
        <label class="check check-strong"><input type="checkbox" id="chart-values" ${spec.values !== false ? 'checked' : ''}> Afficher les valeurs</label>`,
      foot: `<button class="btn btn-primary" type="button" id="chart-ok">${target ? 'Mettre à jour' : 'Créer le graphique'}</button>`,
    });
    sheet.$('#chart-data').value = spec.data;
    let type = spec.type;
    sheet.$$('[data-chart]').forEach((b) => b.addEventListener('click', () => {
      type = b.dataset.chart;
      sheet.$$('[data-chart]').forEach((x) => x.classList.toggle('is-active', x === b));
    }));
    sheet.$('#chart-ok').addEventListener('click', () => {
      const next = { type, data: sheet.$('#chart-data').value, values: sheet.$('#chart-values').checked };
      if (!this.parse(next.data).rows.length) { toast('Ajoutez au moins une ligne de données.', 'error'); return; }
      if (target) this.place(next, { left: 0, top: 0, width: target.chart.w, height: target.chart.h }, target);
      else this.place(next, box);
      sheet.close();
      setTool('select');
    });
    sheet.el.addEventListener('close', () => sheet.el.remove());
    sheet.open();
  },
};

Tools.graph = {
  cursor: 'crosshair',
  activate() { setInteractionMode('draw'); },
  deactivate() { cancelDrawing(); },
  onMouseDown(p) { Tools.quickcrop.onMouseDown.call(this, p); },
  onMouseMove(p, e) { Tools.quickcrop.onMouseMove.call(this, p, e); },
  onMouseUp(p, e) {
    if (!state.drawing) return;
    const { origin } = state.drawing;
    let box = getDragBox(origin, p, e.shiftKey);
    cancelDrawing();
    if (box.width < 40 || box.height < 40) box = { left: origin.x, top: origin.y, width: 480, height: 320 };
    Charts.edit({ box });
  },
  options() { return html('<p class="field-note">Tracez le cadre du graphique : la fenêtre de saisie des données s\'ouvre ensuite. Double-clic sur un graphique pour le modifier.</p>'); },
};

TOOL_LABELS.graph = 'Graphique';
SERIAL_PROPS.push('chart');
SHORTCUTS.j = 'graph';

Hooks.on('init', () => {
  RailGroups.create('data', {
    title: 'Graphiques & tranches',
    after: $('.rail [data-group="paint"]'),
    items: [{ tool: 'graph', label: 'Graphique', icon: GRAPH_ICONS.graph, kbd: 'J' }],
  });
  canvas.on('mouse:dblclick', ({ target }) => {
    if (state.tool === 'select' && target?.chart) Charts.edit({ target });
  });
});
