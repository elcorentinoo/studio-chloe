/**
 * ============================================================================
 *  Studio Chloé — Recolorer la composition
 *
 *  Comme « Recolorer la composition » d'Illustrator : toutes les couleurs de
 *  la sélection (remplissages, contours, arrêts de dégradé, lettres colorées,
 *  fonds / contours du panneau Aspect, y compris dans les groupes) sont listées
 *  de la plus utilisée à la moins utilisée. Chaque couleur peut être remplacée ;
 *  teinte, saturation et luminosité se règlent pour l'ensemble ; raccourcis :
 *  harmonies (analogues, complémentaires, triade) à partir d'une couleur de
 *  base, mélanger, niveaux de gris, réinitialiser. Aperçu en direct, une seule
 *  étape d'annulation. Les images et les motifs ne sont pas modifiés.
 *  Accès : tuile Apparence › « Recolorer la composition… ».
 * ============================================================================
 */
'use strict';

const Recolor = {
  /** Emplacements de couleur : { get, set, orig } — set reçoit la nouvelle couleur */
  collect(objs) {
    const slots = [];
    const add = (holder, key, after) => {
      const v = holder[key];
      if (typeof v !== 'string' || !toHex(v)) return;
      slots.push({ orig: v, set: (c) => { holder[key] = c; after?.(); } });
    };
    const walk = (o) => {
      if (!o || isImage(o)) return;
      if (o.type === 'group') { o.getObjects().forEach(walk); o.dirty = true; return; }
      const dirty = () => { o.dirty = true; };
      ['fill', 'stroke'].forEach((k) => {
        const v = o[k];
        if (v instanceof fabric.Gradient) v.colorStops.forEach((s) => add(s, 'color', dirty));
        else add(o, k, dirty);
      });
      Object.values(o.styles || {}).forEach((line) => Object.values(line).forEach((st) => { add(st, 'fill', dirty); add(st, 'stroke', dirty); }));
      (o.appearance || []).forEach((layer) => add(layer, 'color', dirty));
    };
    objs.forEach(walk);
    return slots;
  },

  /** Couleurs distinctes (#rrggbb), de la plus fréquente à la moins fréquente */
  palette(slots) {
    const count = new Map();
    slots.forEach((s) => { const h = toHex(s.orig); count.set(h, (count.get(h) || 0) + 1); });
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([hex, n]) => ({ hex, n }));
  },

  /* ---------- Couleurs (TSL) ---------- */
  toHsl(hex) {
    const [r, g, b] = new fabric.Color(hex).getSource().map((v) => v / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  },

  fromHsl(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.min(1, Math.max(0, s));
    l = Math.min(1, Math.max(0, l));
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
    return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  },

  /** Couleur finale d'un emplacement : correspondance puis réglages globaux, alpha conservé */
  transform(orig, map, adj) {
    const src = new fabric.Color(orig);
    let hex = map.get(toHex(orig)) || toHex(orig);
    if (adj.h || adj.s || adj.l) {
      const [h, s, l] = this.toHsl(hex);
      hex = this.fromHsl(h + adj.h, s * (1 + adj.s / 100), l + (adj.l / 100) * (adj.l > 0 ? 1 - l : l));
    }
    const alpha = src.getAlpha();
    if (alpha >= 1) return hex;
    const [r, g, b] = new fabric.Color(hex).getSource();
    return `rgba(${r},${g},${b},${alpha})`;
  },

  /** Harmonies à partir d'une couleur de base (n couleurs) */
  harmony(kind, base, n) {
    const [h, s, l] = this.toHsl(base);
    const steps = { analog: [0, 30, -30, 60, -60], complement: [0, 180], triad: [0, 120, 240] }[kind];
    return Array.from({ length: n }, (_, i) => {
      const turn = Math.floor(i / steps.length);
      const light = Math.min(0.92, Math.max(0.12, l + (turn % 2 ? -1 : 1) * 0.14 * Math.ceil(turn / 2)));
      return this.fromHsl(h + steps[i % steps.length], s, turn ? light : l);
    });
  },

  open() {
    const objs = canvas.getActiveObjects();
    const slots = this.collect(objs);
    if (!slots.length) { toast('Sélectionnez des formes ou des textes colorés à recolorer.'); return; }
    const colors = this.palette(slots);
    const map = new Map(); // ancienne couleur → nouvelle
    const adj = { h: 0, s: 0, l: 0 };
    History.flush();           // état actuel enregistré…
    History.restoring = true; // …l'aperçu ne crée pas d'étapes

    const preview = () => {
      slots.forEach((s) => s.set(this.transform(s.orig, map, adj)));
      objs.forEach((o) => { o.dirty = true; });
      canvas.requestRenderAll();
    };
    const range = (id, label, min, max) => `<div class="field"><label class="field-label" for="${id}">${label} <output id="out-${id}">0</output></label><input type="range" id="${id}" min="${min}" max="${max}" step="1" value="0"></div>`;
    const sheet = Sheet.create({
      title: 'Recolorer la composition',
      body: `
        <p class="field-note">${colors.length} couleur${colors.length > 1 ? 's' : ''} dans la sélection. Cliquez sur une nouvelle couleur pour la changer.</p>
        <div class="rc-list" id="rc-list">${colors.map((c, i) => `
          <div class="rc-row" data-rc="${i}">
            <span class="rc-swatch" style="background:${c.hex}" title="${c.hex} · ${c.n} usage${c.n > 1 ? 's' : ''}"></span>
            <svg class="rc-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M14 7l5 5-5 5"/></svg>
            <input class="rc-new" type="color" value="${c.hex}" aria-label="Nouvelle couleur pour ${c.hex}">
            <code class="rc-hex">${c.hex}</code>
          </div>`).join('')}</div>
        <div class="chips rc-actions">
          <button class="chip" type="button" data-rc-harmony="analog" title="À partir de la première nouvelle couleur">Analogues</button>
          <button class="chip" type="button" data-rc-harmony="complement">Complémentaires</button>
          <button class="chip" type="button" data-rc-harmony="triad">Triade</button>
          <button class="chip" type="button" data-rc-shuffle>Mélanger</button>
          <button class="chip" type="button" data-rc-gray>Niveaux de gris</button>
          <button class="chip" type="button" data-rc-reset>Réinitialiser</button>
        </div>
        ${range('rc-h', 'Teinte', -180, 180)}
        ${range('rc-s', 'Saturation', -100, 100)}
        ${range('rc-l', 'Luminosité', -100, 100)}`,
      foot: '<button class="btn" type="button" data-close>Annuler</button><button class="btn btn-primary" type="button" id="rc-ok">Appliquer</button>',
    });
    sheet.el.classList.add('sheet-side', 'sheet-recolor');
    const inputs = sheet.$$('.rc-new');
    const setRow = (i, hex) => {
      inputs[i].value = hex;
      sheet.$$('.rc-hex')[i].textContent = hex;
      if (hex === colors[i].hex) map.delete(colors[i].hex); else map.set(colors[i].hex, hex);
    };
    inputs.forEach((input, i) => input.addEventListener('input', () => { setRow(i, input.value); preview(); }));
    sheet.$$('[data-rc-harmony]').forEach((b) => b.addEventListener('click', () => {
      const list = this.harmony(b.dataset.rcHarmony, inputs[0].value, colors.length);
      list.forEach((hex, i) => setRow(i, hex));
      preview();
    }));
    sheet.$('[data-rc-shuffle]').addEventListener('click', () => {
      const current = inputs.map((x) => x.value);
      for (let i = current.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [current[i], current[j]] = [current[j], current[i]]; }
      if (current.length > 1 && current.every((c, i) => c === inputs[i].value)) current.push(current.shift()); // toujours un changement
      current.forEach((hex, i) => setRow(i, hex));
      preview();
    });
    sheet.$('[data-rc-gray]').addEventListener('click', () => {
      inputs.forEach((x, i) => { const [r, g, b] = new fabric.Color(x.value).getSource(); const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b).toString(16).padStart(2, '0'); setRow(i, `#${y}${y}${y}`); });
      preview();
    });
    sheet.$('[data-rc-reset]').addEventListener('click', () => {
      colors.forEach((c, i) => setRow(i, c.hex));
      ['h', 's', 'l'].forEach((k) => { adj[k] = 0; const r = sheet.$(`#rc-${k}`); r.value = 0; sheet.$(`#out-rc-${k}`).textContent = '0'; paintRange(r); });
      preview();
    });
    ['h', 's', 'l'].forEach((k) => {
      const r = sheet.$(`#rc-${k}`);
      paintRange(r);
      r.addEventListener('input', () => {
        adj[k] = Number(r.value);
        sheet.$(`#out-rc-${k}`).textContent = k === 'h' ? `${r.value}°` : `${r.value} %`;
        paintRange(r);
        preview();
      });
    });
    let applied = false;
    sheet.$('#rc-ok').addEventListener('click', () => { applied = true; sheet.close(); });
    sheet.el.addEventListener('close', () => {
      if (!applied) slots.forEach((s) => s.set(s.orig));
      objs.forEach((o) => { o.dirty = true; });
      History.restoring = false;
      canvas.requestRenderAll();
      if (applied) { History.queue(); History.flush(); toast('Composition recolorée', 'success'); }
      Properties.sync();
      sheet.el.remove();
    });
    sheet.open();
    this.sheet = sheet; // pour les tests
  },

  mountUI() {
    const btn = html(`<button class="btn btn-sm btn-block" type="button" id="btn-recolor" title="Remplacer toutes les couleurs de la sélection">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="9" r="4.5"/><circle cx="16" cy="9" r="4.5"/><circle cx="12" cy="15.5" r="4.5"/></svg>
      Recolorer la composition…</button>`);
    $('#section-appearance').appendChild(btn);
    btn.addEventListener('click', () => this.open());
    Hooks.on('sync', ({ hasSelection }) => { btn.hidden = !hasSelection; });
  },
};

Hooks.on('init', () => Recolor.mountUI());
