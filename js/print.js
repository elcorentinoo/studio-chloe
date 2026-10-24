/**
 * ============================================================================
 *  Chloe’s Touch — Couleurs d'impression
 *    - Sélecteur CMJN sous le remplissage et le contour (bouton « CMJN ») :
 *      4 curseurs C, M, J, N en %. Conversion approximative vers le RVB de
 *      l'écran (sans profil ICC) — suffisant pour viser une teinte.
 *    - Export PDF : fonds perdus (3 mm) et traits de coupe, cases de la
 *      fenêtre d'export.
 * ============================================================================
 */
'use strict';

const Cmyk = {
  fromHex(hex) {
    const c = new fabric.Color(hex).getSource();
    const r = c[0] / 255;
    const g = c[1] / 255;
    const b = c[2] / 255;
    const k = 1 - Math.max(r, g, b);
    if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
    return {
      c: Math.round(((1 - r - k) / (1 - k)) * 100),
      m: Math.round(((1 - g - k) / (1 - k)) * 100),
      y: Math.round(((1 - b - k) / (1 - k)) * 100),
      k: Math.round(k * 100),
    };
  },
  toHex({ c, m, y, k }) {
    const ch = (v) => Math.round(255 * (1 - v / 100) * (1 - k / 100)).toString(16).padStart(2, '0');
    return `#${ch(c)}${ch(m)}${ch(y)}`;
  },
};

const CmykPicker = {
  mount(row, prop) {
    const btn = html(`<button class="chip chip-cmyk" type="button" title="Saisir la couleur en CMJN (impression)">CMJN</button>`);
    row.querySelector('.field-label').appendChild(btn); // à droite du libellé « Remplissage » / « Contour »
    const box = html(`<div class="cmyk-box" hidden>
      ${['c', 'm', 'y', 'k'].map((k) => `<label class="cmyk-field"><span>${{ c: 'C', m: 'M', y: 'J', k: 'N' }[k]}</span><input type="range" min="0" max="100" step="1" data-cmyk="${k}"><output></output></label>`).join('')}
    </div>`);
    row.appendChild(box);
    const input = prop === 'fill' ? dom.propFill : dom.propStroke;
    const read = () => {
      const v = Cmyk.fromHex(input.value);
      box.querySelectorAll('[data-cmyk]').forEach((r) => {
        r.value = v[r.dataset.cmyk];
        r.nextElementSibling.textContent = `${r.value} %`;
        paintRange(r);
      });
    };
    btn.addEventListener('click', () => {
      box.hidden = !box.hidden;
      btn.classList.toggle('is-active', !box.hidden);
      if (!box.hidden) read();
    });
    box.querySelectorAll('[data-cmyk]').forEach((r) => r.addEventListener('input', () => {
      const v = {};
      box.querySelectorAll('[data-cmyk]').forEach((x) => { v[x.dataset.cmyk] = Number(x.value); x.nextElementSibling.textContent = `${x.value} %`; paintRange(x); });
      const hex = Cmyk.toHex(v);
      input.value = hex;
      input.dispatchEvent(new Event('input', { bubbles: true })); // même chemin que le sélecteur de couleur
    }));
    Hooks.on('sync', () => { if (!box.hidden) read(); });
  },
};

/** Fonds perdus et traits de coupe dans l'export PDF */
const PrintMarks = {
  opts: { bleed: false, marks: false },
  BLEED_MM: 3,
  MARK_MM: 10, // marge réservée aux traits de coupe

  extendExport() {
    const ED = ExportDialog;
    const baseBuild = ED.build.bind(ED);
    const baseRefresh = ED.refresh.bind(ED);
    ED.build = () => {
      baseBuild();
      const row = html(`<div id="export-print-row" class="print-row">
        <label class="check check-strong"><input type="checkbox" id="export-bleed"> Fonds perdus (3 mm)</label>
        <label class="check check-strong"><input type="checkbox" id="export-marks"> Traits de coupe</label>
      </div>`);
      ED.sheet.$('#export-transp-row').after(row);
      row.querySelector('#export-bleed').addEventListener('change', (e) => { this.opts.bleed = e.target.checked; });
      row.querySelector('#export-marks').addEventListener('change', (e) => { this.opts.marks = e.target.checked; });
    };
    ED.refresh = () => {
      baseRefresh();
      ED.sheet.$('#export-print-row').hidden = ED.opts.format !== 'pdf';
    };
    const basePdf = ED.pdf.bind(ED);
    ED.pdf = async (area, scale, transparent) => {
      if (!this.opts.bleed && !this.opts.marks) return basePdf(area, scale, transparent);
      toast('Préparation du PDF d\'impression…');
      await loadScript(JSPDF_URL);
      const { jsPDF } = window.jspdf;
      const dpi = state.page.dpi || 96;
      const mm = (n) => (n * dpi) / 25.4;          // mm → px du document
      const pt = (px) => (px * 72) / dpi;          // px → points PDF
      const bleed = this.opts.bleed ? mm(this.BLEED_MM) : 0;
      const margin = this.opts.marks ? mm(this.MARK_MM) : 0;
      const outer = { w: area.width + 2 * (bleed + margin), h: area.height + 2 * (bleed + margin) };
      const doc = new jsPDF({ orientation: outer.w >= outer.h ? 'landscape' : 'portrait', unit: 'pt', format: [pt(outer.w), pt(outer.h)], compress: true });
      // Image de la page + débord (les objets qui dépassent de la page remplissent le fond perdu)
      const zone = { left: area.left - bleed, top: area.top - bleed, width: area.width + 2 * bleed, height: area.height + 2 * bleed };
      const fmt = transparent ? 'png' : 'jpeg';
      const url = Exporter.toDataURL({ format: fmt, multiplier: scale, transparent, area: zone, quality: 0.95 });
      doc.addImage(url, fmt === 'png' ? 'PNG' : 'JPEG', pt(margin), pt(margin), pt(zone.width), pt(zone.height), undefined, 'FAST');
      if (this.opts.marks) {
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.3);
        const x0 = margin + bleed;
        const y0 = margin + bleed;
        const x1 = x0 + area.width;
        const y1 = y0 + area.height;
        const gap = mm(1);
        const len = mm(5);
        const cut = [[x0, y0, -1, -1], [x1, y0, 1, -1], [x0, y1, -1, 1], [x1, y1, 1, 1]];
        cut.forEach(([x, y, sx, sy]) => {
          // trait horizontal et vertical, hors du fond perdu
          doc.line(pt(x + sx * (bleed + gap)), pt(y), pt(x + sx * (bleed + gap + len)), pt(y));
          doc.line(pt(x), pt(y + sy * (bleed + gap)), pt(x), pt(y + sy * (bleed + gap + len)));
        });
        doc.setFontSize(6);
        doc.setTextColor(80);
        doc.text(`Chloe’s Touch · ${Math.round((area.width / dpi) * 25.4)} × ${Math.round((area.height / dpi) * 25.4)} mm${bleed ? ' · fonds perdus 3 mm' : ''}`, pt(x0), pt(margin / 2));
      }
      doc.save(exportFileName('pdf'));
    };
  },
};

Hooks.on('init', () => {
  CmykPicker.mount(dom.rowFill, 'fill');
  CmykPicker.mount($('#row-stroke'), 'stroke');
  PrintMarks.extendExport();
});
