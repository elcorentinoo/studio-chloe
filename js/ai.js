/**
 * ============================================================================
 *  Studio Chloé — IA gratuite (bouton « IA » du rail)
 *
 *  1. Détourage GRATUIT dans le navigateur : @imgly/background-removal
 *     (modèle ONNX exécuté sur l'ordinateur, aucune image envoyée, chargé à
 *     la demande ; licence AGPL-3.0). C'est désormais le détourage par
 *     défaut du bouton « Détourer l'image » ; Remove.bg reste disponible.
 *  2. Génération d'image : Pollinations (image.pollinations.ai, gratuit,
 *     sans clé) — description, style, format.
 *  3. Texte → vecteur : génération d'une illustration à plat puis
 *     vectorisation automatique (Vectoriser de js/library.js).
 * ============================================================================
 */
'use strict';

const IMGLY_URL = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.4.5/+esm';
const POLLINATIONS_URL = 'https://image.pollinations.ai/prompt/';
const AI_ICON = '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/><path d="M5 17l.5 1.2 1.2.5-1.2.5L5 20.4l-.5-1.2-1.2-.5 1.2-.5z"/>';

const AI_STYLES = {
  none: { label: 'Libre', suffix: '' },
  photo: { label: 'Photo', suffix: ', photorealistic, natural light, high detail' },
  illustration: { label: 'Illustration', suffix: ', flat illustration, soft colors, clean shapes' },
  '3d': { label: '3D', suffix: ', 3d render, soft clay style, studio lighting' },
  watercolor: { label: 'Aquarelle', suffix: ', watercolor painting, paper texture' },
  logo: { label: 'Logo plat', suffix: ', minimal flat logo, vector style, solid colors, white background' },
};
const AI_FORMATS = { square: ['Carré', 1024, 1024], portrait: ['Portrait', 832, 1216], landscape: ['Paysage', 1216, 832] };
const VECTOR_SUFFIX = ', flat vector illustration, simple bold shapes, few solid colors, clean edges, plain white background, no text, no gradient';

/* ---------- 1. Détourage dans le navigateur ---------- */
const FreeBgRemoval = {
  module: null,

  async lib() {
    this.module ||= import(/* chargement à la demande */ IMGLY_URL).catch((err) => { this.module = null; throw err; });
    return this.module;
  },

  async run() {
    const target = canvas.getActiveObject();
    if (!isImage(target) || state.isRemovingBg) return;
    BackgroundRemover.setLoading(true);
    dom.btnRemoveBgLabel.textContent = 'Détourage IA en cours…';
    dom.imageNote.textContent = 'Préparation du modèle (le premier détourage télécharge ~40 Mo, ensuite c\'est instantané)…';
    try {
      const { removeBackground } = await this.lib();
      const source = await imageObjectToBlob(target);
      const blob = await removeBackground(source, {
        output: { format: 'image/png' },
        progress: (key, current, total) => {
          if (!total) return;
          const pct = Math.round((current / total) * 100);
          dom.imageNote.textContent = /fetch|download/i.test(key) ? `Téléchargement du modèle… ${pct} %` : `Analyse de l'image… ${pct} %`;
        },
      });
      const cutout = await loadFabricImage(await readFileAsDataURL(blob));
      if (!canvas.getObjects().includes(target)) { toast('L\'image a été supprimée pendant le détourage.'); return; }
      replaceImagePreservingTransform(target, cutout);
      toast('Arrière-plan supprimé (IA gratuite, dans votre navigateur)', 'success');
    } catch (err) {
      console.error('[Détourage IA]', err);
      toast('Le détourage gratuit n\'a pas pu démarrer (connexion ?). Essayez « via Remove.bg ».', 'error', 7000);
    } finally {
      BackgroundRemover.setLoading(false);
    }
  },

  mountUI() {
    // Le bouton principal passe au détourage gratuit ; Remove.bg devient l'option
    const fresh = dom.btnRemoveBg.cloneNode(true);
    dom.btnRemoveBg.replaceWith(fresh);
    dom.btnRemoveBg = fresh;
    dom.btnRemoveBgLabel = fresh.querySelector('#btn-remove-bg-label');
    fresh.addEventListener('click', () => this.run());
    fresh.title = 'Détourage IA gratuit, calculé dans votre navigateur';
    const alt = html('<button class="btn btn-sm btn-block btn-ghost" type="button" id="btn-remove-bg-api" disabled>Détourer via Remove.bg (crédits)</button>');
    fresh.after(alt);
    alt.addEventListener('click', () => BackgroundRemover.removeFromSelection());
    Hooks.on('sync', ({ ref, single }) => {
      alt.disabled = !(single && isImage(ref)) || state.isRemovingBg;
      alt.hidden = Boolean(state.cropping);
      if (single && isImage(ref) && !state.isRemovingBg) dom.imageNote.textContent = 'Rognez-la, vectorisez-la ou détourez-la (IA gratuite).';
    });
  },
};

/* ---------- 2–3. Génération (Pollinations) ---------- */
const AIStudio = {
  opts: { style: 'illustration', format: 'square' },

  url(prompt, { width, height, seed }) {
    return `${POLLINATIONS_URL}${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true&model=flux`;
  },

  /** Télécharge l'image générée (CORS) et la renvoie en Data URL */
  fetchImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const timer = setTimeout(() => reject(new Error('Le service d\'images IA met trop de temps à répondre.')), 90000);
      img.onload = () => {
        clearTimeout(timer);
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        try { resolve(c.toDataURL('image/png')); } catch { reject(new Error('Image IA non exploitable (CORS).')); }
      };
      img.onerror = () => { clearTimeout(timer); reject(new Error('Génération impossible : service indisponible ou connexion coupée.')); };
      img.src = url;
    });
  },

  async insert(dataUrl, name) {
    const img = await loadFabricImage(dataUrl);
    ImageImporter.placeImage(img, Viewport.center());
    img.set({ name });
    setTool('select');
    canvas.setActiveObject(img);
    canvas.requestRenderAll();
    return img;
  },

  open(tab = 'image') {
    const sheet = Sheet.create({
      title: 'IA — création gratuite',
      wide: true,
      body: `
        <div class="tabs" role="tablist">
          <button class="tab" type="button" data-ai-tab="image">Générer une image</button>
          <button class="tab" type="button" data-ai-tab="vector">Texte → vecteur</button>
          <button class="tab" type="button" data-ai-tab="cutout">Détourage</button>
        </div>
        <div data-ai-pane="image" data-ai-pane-vector="1">
          <label class="field-label" for="ai-prompt">Décrivez l'image</label>
          <textarea class="input" id="ai-prompt" rows="3" placeholder="Ex. : un citron vert stylisé sur fond crème, ambiance été"></textarea>
          <div class="ai-row" data-only="image"><span class="swatch-caption">Style</span><div class="chips" id="ai-styles">${Object.entries(AI_STYLES).map(([k, s]) => `<button class="chip" type="button" data-style="${k}">${s.label}</button>`).join('')}</div></div>
          <div class="ai-row"><span class="swatch-caption">Format</span><div class="chips" id="ai-formats">${Object.entries(AI_FORMATS).map(([k, f]) => `<button class="chip" type="button" data-format="${k}">${f[0]}</button>`).join('')}</div></div>
          <div class="ai-preview" id="ai-preview" hidden><img alt="Aperçu de l'image générée" id="ai-img"></div>
          <p class="field-note" id="ai-note">Service gratuit Pollinations (sans compte). La description est envoyée à leur serveur.</p>
        </div>
        <div data-ai-pane="cutout" hidden>
          <p>Le détourage gratuit fonctionne <strong>dans votre navigateur</strong> : sélectionnez une image puis « Détourer l'image » dans la tuile Image. Aucune photo n'est envoyée en ligne.</p>
          <p class="field-note">Le premier détourage télécharge le modèle d'IA (~40 Mo, mis en cache ensuite). Remove.bg reste disponible en option.</p>
        </div>`,
      foot: '<button class="btn" type="button" id="ai-again" hidden>Autre version</button><button class="btn btn-primary" type="button" id="ai-go">Générer</button>',
    });
    const $s = sheet.$;
    let current = tab;
    let lastUrl = null;
    let lastData = null;
    const refresh = () => {
      sheet.$$('[data-ai-tab]').forEach((b) => b.classList.toggle('is-active', b.dataset.aiTab === current));
      $s('[data-ai-pane="image"]').hidden = current === 'cutout';
      $s('[data-ai-pane="cutout"]').hidden = current !== 'cutout';
      $s('[data-only="image"]').hidden = current !== 'image';
      sheet.$$('[data-style]').forEach((b) => b.classList.toggle('is-active', b.dataset.style === this.opts.style));
      sheet.$$('[data-format]').forEach((b) => b.classList.toggle('is-active', b.dataset.format === this.opts.format));
      $s('#ai-go').hidden = current === 'cutout';
      $s('#ai-go').textContent = lastData ? (current === 'vector' ? 'Insérer et vectoriser' : 'Insérer dans la page') : (current === 'vector' ? 'Générer le vecteur' : 'Générer');
      $s('#ai-again').hidden = !lastData;
    };
    sheet.$$('[data-ai-tab]').forEach((b) => b.addEventListener('click', () => { current = b.dataset.aiTab; lastData = null; $s('#ai-preview').hidden = true; refresh(); }));
    sheet.$$('[data-style]').forEach((b) => b.addEventListener('click', () => { this.opts.style = b.dataset.style; refresh(); }));
    sheet.$$('[data-format]').forEach((b) => b.addEventListener('click', () => { this.opts.format = b.dataset.format; refresh(); }));
    $s('#ai-prompt').addEventListener('keydown', (e) => e.stopPropagation());

    const generate = async () => {
      const prompt = $s('#ai-prompt').value.trim();
      if (!prompt) { $s('#ai-prompt').focus(); toast('Décrivez d\'abord ce que vous voulez.'); return; }
      const [, width, height] = AI_FORMATS[this.opts.format];
      const full = prompt + (current === 'vector' ? VECTOR_SUFFIX : AI_STYLES[this.opts.style].suffix);
      lastUrl = this.url(full, { width, height, seed: Math.floor(Math.random() * 1e9) });
      const btn = $s('#ai-go');
      btn.disabled = true;
      $s('#ai-again').disabled = true;
      btn.innerHTML = '<span class="spinner-inline"></span> Création…';
      $s('#ai-note').textContent = 'Génération en cours (10 à 30 secondes)…';
      try {
        lastData = await this.fetchImage(lastUrl);
        $s('#ai-img').src = lastData;
        $s('#ai-preview').hidden = false;
        $s('#ai-note').textContent = 'Aperçu prêt. « Autre version » relance avec une autre graine.';
      } catch (err) {
        lastData = null;
        $s('#ai-note').textContent = err.message;
        toast(err.message, 'error', 6000);
      } finally {
        btn.disabled = false;
        $s('#ai-again').disabled = false;
        refresh();
      }
    };
    $s('#ai-again').addEventListener('click', generate);
    $s('#ai-go').addEventListener('click', async () => {
      if (!lastData) { generate(); return; }
      const prompt = $s('#ai-prompt').value.trim();
      const data = lastData;
      sheet.close();
      const img = await this.insert(data, prompt.slice(0, 40) || 'Image IA');
      if (current === 'vector') {
        if (!Vectorizer.sheet) Vectorizer.build();
        Vectorizer.opts = { colors: 8, detail: 'normal', removeBg: true };
        canvas.setActiveObject(img);
        await Vectorizer.run();
      }
      History.queue();
    });
    sheet.el.addEventListener('close', () => sheet.el.remove());
    refresh();
    sheet.open();
    $s('#ai-prompt').focus();
  },
};

Hooks.on('init', () => {
  FreeBgRemoval.mountUI();
  const btn = html(`<button class="rail-btn rail-btn-ai" id="btn-ai" type="button" title="IA gratuite : générer une image, texte → vecteur, détourage" aria-label="IA"><svg viewBox="0 0 24 24" aria-hidden="true">${AI_ICON}</svg></button>`);
  $('#btn-library').after(btn);
  btn.addEventListener('click', () => AIStudio.open());
});
