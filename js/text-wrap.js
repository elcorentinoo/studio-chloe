/**
 * ============================================================================
 *  Studio Chloé — Habillage du texte
 *
 *  Comme Objet › Habillage du texte d'Illustrator : un objet marqué
 *  « Habillage » (case de la tuile Disposition, avec un écart réglable)
 *  repousse le texte des zones de texte (texte tracé avec T en glissant)
 *  placées SOUS lui. Chaque ligne prend la plus large place libre à côté de
 *  l'objet ; si la ligne est entièrement barrée, le texte reprend sous l'objet.
 *  Le texte se recompose en direct quand on déplace l'objet ou le texte.
 *  Limites : zones de texte non pivotées ; habillage rectangulaire (boîte de
 *  l'objet + écart). Modèle : obj.textWrap = { offset }.
 * ============================================================================
 */
'use strict';

const TextWrap = {
  /** Zones à éviter, dans le repère du texte (origine en haut à gauche, non mis à l'échelle) */
  zonesFor(t) {
    const cv = t.canvas;
    if (!cv || t.type !== 'textbox' || t.group || Math.abs(t.angle || 0) > 0.01 || t.path) return null;
    const objs = cv.getObjects();
    const idx = objs.indexOf(t);
    if (idx < 0) return null;
    const sx = Math.abs(t.scaleX || 1);
    const sy = Math.abs(t.scaleY || 1);
    const tl = t.originX === 'left' && t.originY === 'top' ? { x: t.left, y: t.top } : t.getPointByOrigin('left', 'top');
    const zones = [];
    objs.slice(idx + 1).forEach((o) => {
      if (!o.textWrap || !o.visible || o.excludeFromExport) return;
      const off = Number(o.textWrap.offset ?? 12);
      const b = o.getBoundingRect(true, true);
      zones.push({
        x0: (b.left - off - tl.x) / sx,
        x1: (b.left + b.width + off - tl.x) / sx,
        y0: (b.top - off - tl.y) / sy,
        y1: (b.top + b.height + off - tl.y) / sy,
      });
    });
    return zones.length ? zones : null;
  },

  /** Intervalles libres de [0, W] sur la bande [y0, y1] */
  free(zones, W, y0, y1) {
    const cuts = zones.filter((z) => z.y1 > y0 && z.y0 < y1).map((z) => [Math.max(0, z.x0), Math.min(W, z.x1)]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
    const out = [];
    let x = 0;
    cuts.forEach(([a, b]) => { if (a > x) out.push({ x, w: a - x }); x = Math.max(x, b); });
    if (x < W) out.push({ x, w: W - x });
    return out;
  },

  /** Place la prochaine ligne : segment le plus large, ou plus bas si la bande est barrée */
  place(t, W) {
    const lh = t.fontSize * t.lineHeight * t._fontSizeMult;
    const minW = Math.min(W, Math.max(t.fontSize * 3, 30));
    let y = t._wrapY;
    let gap = 0;
    let best = { x: 0, w: W };
    for (let guard = 0; guard < 100; guard++) {
      const segs = this.free(t._wrapZones, W, y, y + lh);
      best = segs.reduce((a, b) => (b.w > a.w ? b : a), { x: 0, w: 0 });
      if (best.w >= minW) break;
      const below = t._wrapZones.filter((z) => z.y1 > y && z.y0 < y + lh).map((z) => z.y1);
      if (!below.length) { best = { x: 0, w: W }; break; }
      const ny = Math.min(...below);
      gap += ny - y;
      y = ny;
    }
    const k = t._wrapOut;
    t._wrapSegs[k] = best.w > 0 ? best : { x: 0, w: W };
    t._wrapGaps[k] = gap;
    t._wrapY = y + lh;
    t._wrapOut += 1;
    return t._wrapSegs[k].w;
  },

  /** Recompose les zones de texte (après un déplacement, un ajout…) */
  refresh() {
    if (this.busy) return;
    this.busy = true;
    try {
      canvas.getObjects().forEach((o) => {
        if (o.type !== 'textbox' || o.isEditing) return;
        const had = Boolean(o._wrapSegs?.length);
        const has = Boolean(this.zonesFor(o));
        if (!had && !has) return;
        o.initDimensions();
        o.setCoords();
        o.dirty = true;
      });
      canvas.requestRenderAll();
    } finally { this.busy = false; }
  },
};

{
  const proto = fabric.Textbox.prototype;

  const baseWrapText = proto._wrapText;
  proto._wrapText = function wrapText(lines, desiredWidth) {
    this._wrapZones = TextWrap.zonesFor(this);
    this._wrapSegs = [];
    this._wrapGaps = [];
    this._wrapY = 0;
    this._wrapOut = 0;
    try { return baseWrapText.call(this, lines, desiredWidth); } finally {
      if (!this._wrapZones) { this._wrapSegs = null; this._wrapGaps = null; }
      this._wrapZones = null;
    }
  };

  const baseWrapLine = proto._wrapLine;
  // Même algorithme que Fabric, mais la largeur disponible change à chaque ligne
  proto._wrapLine = function wrapLine(_line, lineIndex, desiredWidth, reservedSpace = 0) {
    if (!this._wrapZones) return baseWrapLine.call(this, _line, lineIndex, desiredWidth, reservedSpace);
    const splitByGrapheme = this.splitByGrapheme;
    const graphemeLines = [];
    let line = [];
    const words = splitByGrapheme ? fabric.util.string.graphemeSplit(_line) : _line.split(this._wordJoiners);
    const infix = splitByGrapheme ? '' : ' ';
    const additionalSpace = this._getWidthOfCharSpacing();
    let lineWidth = 0;
    let offset = 0;
    let infixWidth = 0;
    let largestWordWidth = 0;
    let lineJustStarted = true;
    if (words.length === 0) words.push([]);
    let avail = TextWrap.place(this, desiredWidth) - reservedSpace;
    let i;
    for (i = 0; i < words.length; i++) {
      const word = splitByGrapheme ? words[i] : fabric.util.string.graphemeSplit(words[i]);
      const wordWidth = this._measureWord(word, lineIndex, offset);
      offset += word.length;
      lineWidth += infixWidth + wordWidth - additionalSpace;
      if (lineWidth > avail && !lineJustStarted) {
        graphemeLines.push(line);
        line = [];
        lineWidth = wordWidth;
        lineJustStarted = true;
        avail = TextWrap.place(this, desiredWidth) - reservedSpace;
      } else {
        lineWidth += additionalSpace;
      }
      if (!lineJustStarted && !splitByGrapheme) line.push(infix);
      line = line.concat(word);
      infixWidth = splitByGrapheme ? 0 : this._measureWord([infix], lineIndex, offset);
      offset++;
      lineJustStarted = false;
      if (wordWidth > largestWordWidth) largestWordWidth = wordWidth;
    }
    if (i) graphemeLines.push(line);
    if (largestWordWidth + reservedSpace > this.dynamicMinWidth) this.dynamicMinWidth = largestWordWidth - additionalSpace + reservedSpace;
    return graphemeLines;
  };

  const wrapped = (t, i) => Boolean(t._wrapSegs && t._wrapSegs.length === t._textLines?.length && t._wrapSegs[i]);

  const baseLeft = proto._getLineLeftOffset;
  proto._getLineLeftOffset = function lineLeft(i) {
    if (!wrapped(this, i)) return baseLeft.call(this, i);
    const seg = this._wrapSegs[i];
    const diff = seg.w - this.getLineWidth(i);
    if (this.textAlign === 'center' || this.textAlign === 'justify-center') return seg.x + diff / 2;
    if (this.textAlign === 'right' || this.textAlign === 'justify-right') return seg.x + diff;
    return seg.x;
  };

  const baseHeight = proto.getHeightOfLine;
  proto.getHeightOfLine = function heightOfLine(i) {
    const h = baseHeight.call(this, i);
    return wrapped(this, i) ? h + (this._wrapGaps[i] || 0) : h;
  };

  // l'espace sauté se place AU-DESSUS de la ligne
  const baseCommon = proto._renderTextCommon;
  proto._renderTextCommon = function renderTextCommon(ctx, method) {
    if (!this._wrapSegs) { baseCommon.call(this, ctx, method); return; }
    ctx.save();
    let lineHeights = 0;
    const left = this._getLeftOffset();
    const top = this._getTopOffset();
    for (let i = 0; i < this._textLines.length; i++) {
      const gap = wrapped(this, i) ? this._wrapGaps[i] || 0 : 0;
      const heightOfLine = this.getHeightOfLine(i);
      this._renderTextLine(method, ctx, this._textLines[i], left + this._getLineLeftOffset(i), top + lineHeights + gap + (heightOfLine - gap) / this.lineHeight, i);
      lineHeights += heightOfLine;
    }
    ctx.restore();
  };

  const baseCursor = proto._getCursorBoundariesOffsets;
  proto._getCursorBoundariesOffsets = function cursorOffsets(position) {
    const cached = this.cursorOffsetCache && 'top' in this.cursorOffsetCache;
    const b = baseCursor.call(this, position);
    if (cached || !this._wrapSegs) return b;
    const { lineIndex } = this.get2DCursorLocation(position);
    const gap = wrapped(this, lineIndex) ? this._wrapGaps[lineIndex] || 0 : 0;
    if (gap) b.top += gap * (1 - (1 - this._fontSizeFraction) / this.lineHeight);
    return b;
  };

  // pas de justification forcée sur toute la largeur quand le texte habille un objet
  const baseEnlarge = proto.enlargeSpaces;
  proto.enlargeSpaces = function enlargeSpaces() {
    if (this._wrapSegs) return;
    baseEnlarge.call(this);
  };
}

const TextWrapUI = {
  mountUI() {
    this.el = html(`
      <div class="field text-wrap-field" id="text-wrap-field" hidden>
        <label class="check" title="Repousse les zones de texte placées sous cet objet"><input type="checkbox" id="text-wrap-on"> Habillage du texte</label>
        <div class="field" id="text-wrap-offset-row" hidden>
          <label class="field-label" for="text-wrap-offset">Écart <output id="out-text-wrap">12 px</output></label>
          <input type="range" id="text-wrap-offset" min="0" max="120" step="1" value="12">
        </div>
      </div>`);
    dom.sectionArrange.querySelector('.arrange-block').appendChild(this.el);
    const on = this.el.querySelector('#text-wrap-on');
    const range = this.el.querySelector('#text-wrap-offset');
    on.addEventListener('change', () => {
      canvas.getActiveObjects().filter((o) => !isText(o)).forEach((o) => {
        if (on.checked) o.textWrap = { offset: Number(range.value) };
        else delete o.textWrap;
      });
      TextWrap.refresh();
      History.queue();
      this.sync();
    });
    range.addEventListener('input', () => {
      paintRange(range);
      this.el.querySelector('#out-text-wrap').textContent = `${range.value} px`;
      canvas.getActiveObjects().forEach((o) => { if (o.textWrap) o.textWrap = { offset: Number(range.value) }; });
      TextWrap.refresh();
    });
    range.addEventListener('change', () => History.queue());
    Hooks.on('sync', () => this.sync());
    // recomposition en direct
    const relevant = (o) => o && (o.textWrap || o.type === 'textbox' || o.type === 'activeSelection');
    ['object:moving', 'object:scaling', 'object:rotating', 'object:modified'].forEach((evt) => canvas.on(evt, ({ target }) => { if (relevant(target)) TextWrap.refresh(); }));
    ['object:added', 'object:removed'].forEach((evt) => canvas.on(evt, ({ target }) => { if (target?.textWrap && !History.restoring) TextWrap.refresh(); }));
    Hooks.on('docLoaded', () => TextWrap.refresh());
  },

  sync() {
    const objs = canvas.getActiveObjects().filter((o) => !isText(o));
    this.el.hidden = !objs.length;
    if (!objs.length) return;
    const ref = objs[0];
    this.el.querySelector('#text-wrap-on').checked = Boolean(ref.textWrap);
    this.el.querySelector('#text-wrap-offset-row').hidden = !ref.textWrap;
    const range = this.el.querySelector('#text-wrap-offset');
    range.value = ref.textWrap?.offset ?? 12;
    this.el.querySelector('#out-text-wrap').textContent = `${range.value} px`;
    paintRange(range);
  },
};

SERIAL_PROPS.push('textWrap');

Hooks.on('init', () => TextWrapUI.mountUI());
