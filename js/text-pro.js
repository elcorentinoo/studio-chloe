/**
 * ============================================================================
 *  Chloe’s Touch — Texte avancé
 *    1. Zone de texte : avec l'outil Texte (T), GLISSER trace un cadre où le
 *       texte revient à la ligne (fabric.Textbox) ; un simple clic crée un
 *       texte libre comme avant.
 *    2. Texte sur tracé : sélectionnez un texte + un tracé (ou une forme) →
 *       « Placer sur le tracé ». Réglages : décalage, côté, alignement.
 *    3. Texte dans une forme : texte + forme fermée → le texte s'écoule dans
 *       la forme (cadre de texte inscrit, la forme reste en fond).
 *    4. Vectoriser le texte (⌘/Ctrl + Maj + O) : les lettres deviennent des
 *       tracés (opentype.js + fichiers de police Fontsource / Google Fonts,
 *       chargés à la demande).
 * ============================================================================
 */
'use strict';

const OPENTYPE_URL = 'https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.min.js';
/** Polices système → équivalentes libres (mêmes proportions) pour la vectorisation */
const FONT_SUBSTITUTES = { arial: 'arimo', helvetica: 'arimo', georgia: 'gelasio', 'courier new': 'cousine', impact: 'anton', 'times new roman': 'tinos' };

/* ---------- Fabric 5 : IText / Textbox oublient de recréer leur tracé au chargement ---------- */
['IText', 'Textbox'].forEach((klass) => {
  const base = fabric[klass].fromObject;
  fabric[klass].fromObject = function fromObject(object, callback) {
    if (!object.path) return base.call(this, object, callback);
    const copy = { ...object };
    const path = copy.path;
    delete copy.path;
    return base.call(this, copy, (instance) => {
      fabric.Path.fromObject(path, (p) => {
        instance.set('path', p);
        instance.initDimensions();
        instance.setCoords();
        callback(instance);
      });
    });
  };
});

/* ============================================================================
   1. ZONE DE TEXTE (glisser avec l'outil Texte)
   ========================================================================== */
{
  const textTool = Tools.text;
  const createIText = textTool.onMouseUp;
  Object.assign(textTool, {
    onMouseDown(p) {
      const rect = new fabric.Rect({
        left: p.x, top: p.y, width: 0, height: 0, fill: 'rgba(246, 138, 141, 0.10)', stroke: '#d9474f',
        strokeWidth: 1, strokeDashArray: [4, 4], strokeUniform: true, selectable: false, evented: false, excludeFromExport: true,
      });
      state.drawing = { obj: rect, origin: p };
      canvas.add(rect);
    },
    onMouseMove(p) {
      if (!state.drawing) return;
      state.drawing.obj.set(getDragBox(state.drawing.origin, p, false));
      canvas.requestRenderAll();
    },
    onMouseUp(p, e) {
      const origin = state.drawing?.origin || p;
      const box = getDragBox(origin, p, false);
      cancelDrawing();
      if (box.width < 12) { createIText.call(this, origin, e); return; }
      const tb = new fabric.Textbox(TEXT_DEFAULTS.text, {
        left: box.left, top: box.top, width: box.width,
        fontFamily: TEXT_DEFAULTS.fontFamily, fontSize: TEXT_DEFAULTS.fontSize, fill: TEXT_DEFAULTS.fill,
        opacity: state.style.opacity, splitByGrapheme: false,
      });
      canvas.add(tb);
      setTool('select');
      canvas.setActiveObject(tb);
      tb.enterEditing();
      tb.selectAll();
      canvas.requestRenderAll();
    },
  });
}

/* ============================================================================
   2–3. TEXTE SUR TRACÉ / DANS UNE FORME
   ========================================================================== */

const TextPro = {
  /** Propriétés d'un texte réutilisables pour en créer un autre (styles par lettre compris) */
  textProps(text) {
    const props = text.toObject(SERIAL_PROPS);
    delete props.type;
    delete props.path;
    delete props.version;
    props.styles = fabric.util.stylesFromArray(props.styles, text.text);
    return props;
  },

  pair() {
    const objs = canvas.getActiveObjects();
    if (objs.length !== 2) return null;
    const text = objs.find(isText);
    const shape = objs.find((o) => o !== text && Geo.canConvert(o));
    return text && shape ? { text, shape } : null;
  },

  onPath() {
    const pair = this.pair();
    if (!pair) { toast('Sélectionnez un texte et un tracé (ou une forme).'); return; }
    const { text, shape } = pair;
    canvas.discardActiveObject();
    const guide = Geo.toPath(shape); // coordonnées du document, sans rotation
    guide.set({ fill: null, stroke: null, strokeWidth: 0 });
    const props = this.textProps(text);
    const klass = text.type === 'text' ? fabric.Text : fabric.IText;
    const neu = new klass(text.text, { ...props, path: guide, angle: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, flipX: false, flipY: false, pathAlign: 'baseline', textAlign: 'left' });
    neu.set({ left: guide.left, top: guide.top });
    const index = canvas.getObjects().indexOf(text);
    canvas.remove(text, shape);
    canvas.insertAt(neu, Math.min(index, canvas.getObjects().length));
    neu.setCoords();
    canvas.setActiveObject(neu);
    canvas.requestRenderAll();
    History.queue();
    Properties.sync();
    refreshFonts();
    toast('Texte placé sur le tracé : réglez le décalage dans le panneau.', 'success');
  },

  detach() {
    const t = canvas.getActiveObject();
    if (!isText(t) || !t.path) return;
    const b = t.getBoundingRect(true, true);
    t.set({ path: null });
    t.initDimensions();
    t.set({ left: b.left, top: b.top });
    t.setCoords();
    canvas.requestRenderAll();
    History.queue();
    Properties.sync();
  },

  inShape() {
    const pair = this.pair();
    if (!pair) { toast('Sélectionnez un texte et une forme fermée.'); return; }
    const { text, shape } = pair;
    canvas.discardActiveObject();
    const b = shape.getBoundingRect(true, true);
    const round = ['ellipse', 'circle'].includes(shape.type) || (shape.type === 'polygon' && shape.points.length > 4);
    const k = round ? 0.7 : 0.88;
    const w = b.width * k;
    const props = this.textProps(text);
    const tb = new fabric.Textbox(text.text, {
      ...props, width: w, angle: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, flipX: false, flipY: false, textAlign: 'center', originX: 'center', originY: 'center',
    });
    // Taille de police réduite tant que le texte dépasse de la forme
    tb.set({ fontSize: tb.fontSize * Math.abs(text.scaleY || 1) });
    for (let i = 0; i < 40 && tb.height > b.height * k; i += 1) { tb.set({ fontSize: tb.fontSize * 0.92 }); tb.initDimensions(); }
    const c = shape.getCenterPoint();
    tb.set({ left: c.x, top: c.y, name: 'Texte dans la forme' });
    const index = canvas.getObjects().indexOf(shape);
    canvas.remove(text);
    canvas.insertAt(tb, Math.min(index + 1, canvas.getObjects().length));
    tb.setCoords();
    canvas.setActiveObject(tb);
    canvas.requestRenderAll();
    History.queue();
    Properties.sync();
    refreshFonts();
  },

  /* ---------- 4. vectorisation ---------- */
  fontCache: {},

  fontURL(family, weight, style) {
    const raw = String(family || 'Inter').split(',')[0].replace(/["']/g, '').trim().toLowerCase();
    const id = FONT_SUBSTITUTES[raw] || raw.replace(/\s+/g, '-');
    return `https://cdn.jsdelivr.net/npm/@fontsource/${id}@5/files/${id}-latin-${weight}-${style}.woff`;
  },

  async font(family, weightRaw, styleRaw) {
    const weight = weightRaw === 'bold' ? 700 : weightRaw === 'normal' || !weightRaw ? 400 : Number(weightRaw) || 400;
    const style = styleRaw === 'italic' ? 'italic' : 'normal';
    const tries = [[weight, style], [weight, 'normal'], [400, style], [400, 'normal']];
    for (const [w, s] of tries) {
      const url = this.fontURL(family, w, s);
      if (!(url in this.fontCache)) {
        this.fontCache[url] = fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).then((buf) => (buf ? window.opentype.parse(buf) : null)).catch(() => null);
      }
      const f = await this.fontCache[url];
      if (f) return f;
    }
    return null;
  },

  /** Commandes (repère local du texte) des lettres d'un objet texte, regroupées par couleur */
  async glyphCommands(t) {
    const byFill = new Map();
    const add = (fill, cmds) => { if (!byFill.has(fill)) byFill.set(fill, []); byFill.get(fill).push(...cmds); };
    let top = -t.height / 2;
    for (let i = 0; i < t._textLines.length; i += 1) {
      const H = t.getHeightOfLine(i);
      const baseline = top + H / t.lineHeight - (H * t._fontSizeFraction) / t.lineHeight;
      const lineLeft = -t.width / 2 + t._getLineLeftOffset(i);
      const bounds = t.__charBounds[i] || [];
      for (let j = 0; j < t._textLines[i].length; j += 1) {
        const ch = t._textLines[i][j];
        const st = t.getCompleteStyleDeclaration(i, j);
        const box = bounds[j];
        if (!box) continue;
        const fill = typeof st.fill === 'string' ? st.fill : (t.fill || '#000');
        if (/\S/.test(ch)) {
          const font = await this.font(st.fontFamily, st.fontWeight, st.fontStyle);
          if (!font) throw new Error(`Police « ${st.fontFamily} » introuvable pour la vectorisation.`);
          const gp = font.getPath(ch, lineLeft + box.left, baseline + (st.deltaY || 0), st.fontSize);
          add(fill, this.opentypeToCmds(gp));
        }
        // Soulignés / barrés
        const thick = st.fontSize / 15;
        const deco = (dy) => {
          const x0 = lineLeft + box.left;
          const x1 = x0 + box.kernedWidth;
          const y = baseline + dy;
          add(fill, [['M', x0, y], ['L', x1, y], ['L', x1, y + thick], ['L', x0, y + thick], ['Z']]);
        };
        if (st.underline) deco(st.fontSize * 0.1);
        if (st.linethrough) deco(-st.fontSize * 0.3);
      }
      top += H;
    }
    return byFill;
  },

  opentypeToCmds(p) {
    return p.commands.map((c) => {
      if (c.type === 'M') return ['M', c.x, c.y];
      if (c.type === 'L') return ['L', c.x, c.y];
      if (c.type === 'C') return ['C', c.x1, c.y1, c.x2, c.y2, c.x, c.y];
      if (c.type === 'Q') return ['Q', c.x1, c.y1, c.x, c.y];
      return ['Z'];
    });
  },

  async outline(objs = canvas.getActiveObjects()) {
    const texts = objs.filter(isText);
    if (!texts.length) { toast('Sélectionnez un ou plusieurs textes.'); return; }
    if (texts.some((t) => t.path)) { toast('Détachez d\'abord le texte de son tracé pour le vectoriser.'); return; }
    toast('Vectorisation du texte…');
    try {
      await loadScript(OPENTYPE_URL);
      canvas.discardActiveObject();
      const made = [];
      for (const t of texts) {
        if (t.isEditing) t.exitEditing();
        const groups = await this.glyphCommands(t);
        const m = t.calcTransformMatrix();
        const style = {
          stroke: t.stroke, strokeWidth: t.strokeWidth, opacity: t.opacity, shadow: t.shadow,
          strokeUniform: true, strokeLineJoin: 'round', fillRule: 'nonzero',
        };
        const paths = [...groups.entries()].filter(([, cmds]) => cmds.length).map(([fill, cmds]) => new fabric.Path(Geo.toPathData(Geo.transform(cmds, m)), { ...style, fill }));
        if (!paths.length) continue;
        const result = paths.length === 1 ? paths[0] : new fabric.Group(paths);
        result.set({ name: `${t.text.slice(0, 24)} (vectorisé)` });
        Geo.replace(t, result, { select: false });
        made.push(result);
      }
      Arrange.reselect(made);
      canvas.requestRenderAll();
      History.queue();
      Properties.sync();
      toast(`Texte vectorisé (${made.length})`, 'success');
    } catch (err) {
      console.error(err);
      toast(err.message || 'La vectorisation du texte a échoué (connexion ?).', 'error', 6000);
    }
  },

  /* ---------- panneau ---------- */
  mountUI() {
    this.el = html(`
      <div class="text-pro">
        <div class="btn-row" id="tp-pair" hidden>
          <button class="btn btn-sm" type="button" id="tp-onpath">Sur le tracé</button>
          <button class="btn btn-sm" type="button" id="tp-inshape">Dans la forme</button>
        </div>
        <div id="tp-path" hidden>
          <label class="field-label" for="tp-offset">Décalage sur le tracé <output id="out-tp-offset">0</output></label>
          <input type="range" id="tp-offset" min="0" max="1000" step="1" value="0">
          <div class="chips">
            <button class="chip" type="button" data-side="left">Dessus</button>
            <button class="chip" type="button" data-side="right">Dessous</button>
            <button class="chip" type="button" data-palign="baseline">Ligne de base</button>
            <button class="chip" type="button" data-palign="center">Centré</button>
          </div>
          <button class="btn btn-sm btn-block" type="button" id="tp-detach">Détacher du tracé</button>
        </div>
        <button class="btn btn-sm btn-block" type="button" id="tp-outline" title="⌘/Ctrl + Maj + O">Vectoriser le texte</button>
      </div>`);
    dom.sectionText.appendChild(this.el);
    // La paire texte + forme n'affiche pas la tuile Texte : on place aussi les boutons dans Disposition
    this.pairRow = html(`<div class="btn-row" id="tp-pair-arrange" hidden>
      <button class="btn btn-sm" type="button" data-tp="onpath">Texte sur le tracé</button>
      <button class="btn btn-sm" type="button" data-tp="inshape">Texte dans la forme</button></div>`);
    $('#btn-flip-h').closest('.btn-row').after(this.pairRow);
    this.pairRow.querySelector('[data-tp="onpath"]').addEventListener('click', () => this.onPath());
    this.pairRow.querySelector('[data-tp="inshape"]').addEventListener('click', () => this.inShape());
    this.el.querySelector('#tp-onpath').addEventListener('click', () => this.onPath());
    this.el.querySelector('#tp-inshape').addEventListener('click', () => this.inShape());
    this.el.querySelector('#tp-detach').addEventListener('click', () => this.detach());
    this.el.querySelector('#tp-outline').addEventListener('click', () => this.outline());
    const offset = this.el.querySelector('#tp-offset');
    offset.addEventListener('input', () => {
      const t = canvas.getActiveObject();
      if (!isText(t) || !t.path) return;
      t.set({ pathStartOffset: Number(offset.value) });
      this.el.querySelector('#out-tp-offset').textContent = `${offset.value} px`;
      paintRange(offset);
      canvas.requestRenderAll();
      History.queue();
    });
    this.el.querySelectorAll('[data-side], [data-palign]').forEach((b) => b.addEventListener('click', () => {
      const t = canvas.getActiveObject();
      if (!isText(t) || !t.path) return;
      if (b.dataset.side) t.set({ pathSide: b.dataset.side });
      if (b.dataset.palign) t.set({ pathAlign: b.dataset.palign });
      canvas.requestRenderAll();
      History.queue();
      this.sync({ objects: [t], ref: t, single: true });
    }));
    Hooks.on('sync', (info) => this.sync(info));
    Keys.add((e, { mod, key }) => {
      if (mod && e.shiftKey && key === 'o') { e.preventDefault(); this.outline(); return true; }
      return false;
    });
  },

  sync({ ref, single }) {
    const pair = this.pair();
    this.pairRow.hidden = !pair;
    this.el.querySelector('#tp-pair').hidden = true;
    const onPath = single && isText(ref) && ref.path;
    this.el.querySelector('#tp-path').hidden = !onPath;
    if (onPath) {
      const len = ref.path.segmentsInfo?.[ref.path.segmentsInfo.length - 1]?.length || 1000;
      const offset = this.el.querySelector('#tp-offset');
      offset.max = Math.round(len);
      offset.value = Math.round(ref.pathStartOffset || 0);
      this.el.querySelector('#out-tp-offset').textContent = `${offset.value} px`;
      paintRange(offset);
      this.el.querySelectorAll('[data-side]').forEach((b) => b.classList.toggle('is-active', b.dataset.side === (ref.pathSide || 'left')));
      this.el.querySelectorAll('[data-palign]').forEach((b) => b.classList.toggle('is-active', b.dataset.palign === (ref.pathAlign || 'baseline')));
    }
  },
};

Hooks.on('init', () => TextPro.mountUI());
