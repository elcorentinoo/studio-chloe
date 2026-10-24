/**
 * ============================================================================
 *  Studio Chloé — Application installable (PWA) & confort tactile
 *    - Service worker (sw.js) : installation sur l'écran d'accueil, hors ligne,
 *      avis « nouvelle version » après une mise à jour.
 *    - Bouton « Installer l'app » (quand le navigateur le propose).
 *    - Deux doigts : pincer pour zoomer, glisser pour se déplacer.
 *    - Mobile : le panneau de droite devient un tiroir repliable en bas.
 *    - Partage natif (Web Share API) du fichier exporté : bouton « Partager »
 *      de la fenêtre d'export.
 * ============================================================================
 */
'use strict';

const Pwa = {
  deferredPrompt: null,

  register() {
    if (!('serviceWorker' in navigator)) return;
    const local = ['localhost', '127.0.0.1'].includes(location.hostname);
    if (location.protocol !== 'https:' && !local) return;
    const hadController = Boolean(navigator.serviceWorker.controller); // première visite : pas d'avis
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        sw?.addEventListener('statechange', () => {
          if (sw.state === 'activated' && hadController) {
            toast('Nouvelle version de Studio Chloé prête : rechargez la page pour en profiter.', 'success', 8000);
          }
        });
      });
    }).catch((err) => console.warn('[PWA]', err));
  },

  mountInstall() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      $('#btn-install').hidden = false;
    });
    const btn = html(`<button class="rail-btn" id="btn-install" type="button" title="Installer Studio Chloé comme une application" aria-label="Installer l'application" hidden>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5"/><rect x="4" y="17" width="16" height="4" rx="1.5"/></svg></button>`);
    $('#btn-help').before(btn);
    btn.addEventListener('click', async () => {
      if (!this.deferredPrompt) return;
      this.deferredPrompt.prompt();
      await this.deferredPrompt.userChoice.catch(() => null);
      this.deferredPrompt = null;
      btn.hidden = true;
    });
    window.addEventListener('appinstalled', () => { btn.hidden = true; toast('Studio Chloé est installé sur cet appareil.', 'success'); });
  },

  // ---------- deux doigts : zoom et déplacement
  bindTouch() {
    const el = dom.stage;
    let pinch = null;
    const mid = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      e.stopPropagation();
      // Le premier doigt a pu commencer un tracé : on l'annule
      cancelDrawing();
      canvas._currentTransform = null;
      if (canvas.isDrawingMode && canvas._isCurrentlyDrawing) { canvas._isCurrentlyDrawing = false; canvas.clearContext(canvas.contextTop); }
      pinch = { d: dist(e.touches), m: mid(e.touches), zoom: canvas.getZoom() };
    }, { capture: true, passive: false });
    el.addEventListener('touchmove', (e) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      e.stopPropagation();
      const m = mid(e.touches);
      const r = canvas.upperCanvasEl.getBoundingClientRect();
      Viewport.setZoom(pinch.zoom * (dist(e.touches) / pinch.d), { x: m.x - r.left, y: m.y - r.top });
      Viewport.pan(m.x - pinch.m.x, m.y - pinch.m.y);
      pinch.m = m;
    }, { capture: true, passive: false });
    const end = (e) => { if (pinch && e.touches.length < 2) pinch = null; };
    el.addEventListener('touchend', end, { capture: true });
    el.addEventListener('touchcancel', end, { capture: true });
  },

  // ---------- panneau en tiroir sur mobile
  mountDrawer() {
    const panel = $('.panel');
    const handle = html(`<button class="drawer-handle" type="button" aria-expanded="false" aria-label="Ouvrir ou fermer le panneau"><span></span></button>`);
    panel.prepend(handle);
    const mq = window.matchMedia('(max-width: 720px)');
    const set = (open) => {
      panel.classList.toggle('is-open', open);
      handle.setAttribute('aria-expanded', String(open));
    };
    handle.addEventListener('click', () => set(!panel.classList.contains('is-open')));
    // Une sélection ouvre le tiroir ; tout désélectionner le referme
    Hooks.on('sync', ({ hasSelection }) => { if (mq.matches) set(hasSelection); });
    mq.addEventListener?.('change', () => set(false));
  },

  // ---------- partage natif de l'export
  extendExport() {
    if (!navigator.share || !navigator.canShare) return;
    const ED = ExportDialog;
    const baseBuild = ED.build.bind(ED);
    ED.build = () => {
      baseBuild();
      const btn = html('<button class="btn" type="button" id="export-share">Partager…</button>');
      ED.sheet.$('#export-go').before(btn);
      btn.addEventListener('click', () => this.share());
    };
  },

  async share() {
    const ED = ExportDialog;
    const { format, scale, transparent } = ED.opts;
    try {
      let blob;
      let ext;
      if (format === 'svg') { blob = new Blob([Exporter.toSVG()], { type: 'image/svg+xml' }); ext = 'svg'; } else {
        const f = format === 'pdf' ? 'png' : format;
        const url = Exporter.toDataURL({ format: f, multiplier: scale, transparent, area: ED.area() });
        blob = await (await fetch(url)).blob();
        ext = f === 'jpeg' ? 'jpg' : f;
      }
      const file = new File([blob], exportFileName(ext), { type: blob.type });
      if (!navigator.canShare({ files: [file] })) { toast('Ce format ne peut pas être partagé depuis ce navigateur.'); return; }
      await navigator.share({ files: [file], title: Projects?.currentName?.() || 'Studio Chloé' });
      ED.sheet.close();
    } catch (err) {
      if (err?.name !== 'AbortError') toast('Partage impossible : utilisez « Télécharger ».', 'error');
    }
  },
};

Hooks.on('init', () => {
  Pwa.register();
  Pwa.mountInstall();
  Pwa.bindTouch();
  Pwa.mountDrawer();
  Pwa.extendExport();
});
