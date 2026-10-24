/**
 * ============================================================================
 *  Chloe’s Touch — Collaboration en temps réel (pair à pair, sans serveur payant)
 *
 *  Yjs + y-webrtc (MIT), chargés à la demande depuis jsDelivr.
 *    - « Collaborer » (barre du haut) → « Créer un salon » : un lien secret
 *      est copié ; l'ouvrir ailleurs rejoint le salon.
 *    - Le contenu circule directement entre navigateurs (WebRTC), chiffré
 *      avec la clé contenue dans le lien. Le serveur de mise en relation
 *      public de y-webrtc ne voit que le nom (aléatoire) du salon.
 *    - Seul le projet partagé est concerné : en rejoignant un salon, un
 *      NOUVEAU projet « Projet partagé » est créé ; les autres projets et le
 *      coffre chiffré restent locaux (avertissement affiché).
 *    - Curseurs des participants (nom + couleur), nombre de connectés.
 *  Synchronisation : un objet = une entrée Yjs (identifiant cid) ; l'ordre
 *  des calques et les données du document (page, plans, symboles…) suivent.
 * ============================================================================
 */
'use strict';

const YWEBRTC_URL = 'https://cdn.jsdelivr.net/npm/y-webrtc@10.3.0/+esm';
const YJS_FALLBACK_URL = 'https://cdn.jsdelivr.net/npm/yjs@13.6.18/+esm';
const COLLAB_NAME_KEY = 'studio-chloe-collab-name';
const COLLAB_COLORS = ['#e0457b', '#3d7be0', '#f2a33a', '#9b6bd6', '#2bb3a3', '#d9474f'];
const PEOPLE_ICON = '<circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.3 3-5 6-5s5.4 1.7 6 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2c2.6-.2 4.6 1.3 5.3 4.3"/>';

const Collab = {
  Y: null,
  doc: null,
  provider: null,
  room: null,
  applying: false,
  cursors: new Map(),

  /** Charge Yjs et y-webrtc en s'assurant qu'ils partagent la MÊME copie de Yjs */
  async libs() {
    if (this.Y) return;
    let yUrl = YJS_FALLBACK_URL;
    try {
      const src = await (await fetch(YWEBRTC_URL)).text();
      const m = src.match(/["'](\/npm\/yjs@[^"']+\/\+esm)["']/);
      if (m) yUrl = `https://cdn.jsdelivr.net${m[1]}`;
    } catch { /* on garde la version par défaut */ }
    this.Y = await import(yUrl);
    this.Webrtc = (await import(YWEBRTC_URL)).WebrtcProvider;
  },

  me() {
    let name = '';
    try { name = localStorage.getItem(COLLAB_NAME_KEY) || ''; } catch { /* ignoré */ }
    return { name: name || 'Invité·e', color: COLLAB_COLORS[Math.floor(Math.random() * COLLAB_COLORS.length)] };
  },

  link() {
    return `${location.origin}${location.pathname}#collab=${this.room.id}.${this.room.key}`;
  },

  parseHash() {
    const m = location.hash.match(/collab=([a-z0-9]+)\.([a-z0-9]+)/i);
    return m ? { id: m[1], key: m[2] } : null;
  },

  randomId(n = 16) {
    const bytes = crypto.getRandomValues(new Uint8Array(n));
    return [...bytes].map((b) => (b % 36).toString(36)).join('');
  },

  // ---------- identifiants d'objets
  ensureIds() {
    canvas.getObjects().forEach((o) => { if (!o.cid) o.cid = this.randomId(10); });
  },

  // ---------- local → salon
  push() {
    if (!this.doc || this.applying) return;
    this.ensureIds();
    const yObjs = this.doc.getMap('objects');
    const yOrder = this.doc.getArray('order');
    const yMeta = this.doc.getMap('meta');
    const objs = canvas.getObjects().filter((o) => !o.excludeFromExport);
    const ids = objs.map((o) => o.cid);
    const full = JSON.parse(Doc.serialize());
    this.doc.transact(() => {
      objs.forEach((o) => {
        const json = JSON.stringify(o.toObject(SERIAL_PROPS));
        if (yObjs.get(o.cid) !== json) yObjs.set(o.cid, json);
      });
      [...yObjs.keys()].forEach((id) => { if (!ids.includes(id)) yObjs.delete(id); });
      if (JSON.stringify(yOrder.toArray()) !== JSON.stringify(ids)) {
        yOrder.delete(0, yOrder.length);
        yOrder.insert(0, ids);
      }
      const meta = { ...full };
      delete meta.objects;
      delete meta.version;
      const metaJson = JSON.stringify(meta);
      if (yMeta.get('doc') !== metaJson) yMeta.set('doc', metaJson);
    }, 'local');
  },

  // ---------- salon → local
  pull() {
    if (!this.doc) return;
    const yObjs = this.doc.getMap('objects');
    const order = this.doc.getArray('order').toArray().filter((id) => yObjs.has(id));
    const meta = JSON.parse(this.doc.getMap('meta').get('doc') || '{}');
    const json = { version: fabric.version, ...meta, objects: order.map((id) => JSON.parse(yObjs.get(id))) };
    const selected = canvas.getActiveObjects().map((o) => o.cid).filter(Boolean);
    const vpt = canvas.viewportTransform.slice();
    this.applying = true;
    History.restoring = true;
    canvas.discardActiveObject();
    Doc.load(json, () => {
      canvas.setViewportTransform(vpt);
      History.restoring = false;
      History.commit();         // une étape d'historique pour les modifications reçues
      const again = canvas.getObjects().filter((o) => selected.includes(o.cid));
      if (again.length) Arrange.reselect(again);
      canvas.requestRenderAll();
      Properties.sync();
      this.applying = false;
    });
  },

  // ---------- session
  async start(room, { fresh }) {
    await this.libs();
    this.room = room;
    this.doc = new this.Y.Doc();
    this.provider = new this.Webrtc(`studio-chloe-${room.id}`, this.doc, { password: room.key });
    const me = this.me();
    this.provider.awareness.setLocalStateField('user', me);
    let timer = null;
    this.doc.on('update', (update, origin) => {
      if (origin === 'local') return;
      clearTimeout(timer);
      timer = setTimeout(() => this.pull(), 30);
    });
    this.provider.awareness.on('change', () => { this.renderStatus(); canvas.requestRenderAll(); });
    if (fresh) this.push();
    else {
      // On attend un instant le contenu des autres ; salon vide → on partage le nôtre
      setTimeout(() => { if (!this.doc.getArray('order').length && canvas.getObjects().length) this.push(); }, 1500);
    }
    this.renderStatus();
    history.replaceState(null, '', `#collab=${room.id}.${room.key}`);
  },

  stop() {
    this.provider?.destroy();
    this.doc?.destroy();
    this.provider = null;
    this.doc = null;
    this.room = null;
    this.cursors.clear();
    history.replaceState(null, '', location.pathname + location.search);
    this.renderStatus();
    canvas.requestRenderAll();
    toast('Collaboration terminée : le projet reste dans votre galerie.');
  },

  async create() {
    const room = { id: this.randomId(14), key: this.randomId(20) };
    await this.start(room, { fresh: true });
    try { await navigator.clipboard.writeText(this.link()); toast('Lien du salon copié : envoyez-le à vos invités.', 'success', 5000); } catch { /* affiché dans la fenêtre */ }
    this.open();
  },

  async join(room) {
    if (window.Projects?.create) await Projects.create({ name: 'Projet partagé' });
    await this.start(room, { fresh: false });
    toast('Vous avez rejoint le salon partagé.', 'success');
  },

  // ---------- curseurs
  onMove(e) {
    if (!this.provider) return;
    const now = performance.now();
    if (now - (this.lastCursor || 0) < 50) return;
    this.lastCursor = now;
    const p = canvas.getPointer(e);
    this.provider.awareness.setLocalStateField('cursor', { x: Math.round(p.x), y: Math.round(p.y) });
  },

  drawCursors({ ctx }) {
    if (!this.provider || state.exporting) return;
    const v = canvas.viewportTransform;
    const mine = this.provider.awareness.clientID;
    ctx.save();
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    this.provider.awareness.getStates().forEach((st, id) => {
      if (id === mine || !st.cursor || !st.user) return;
      const x = st.cursor.x * v[0] + v[4];
      const y = st.cursor.y * v[3] + v[5];
      ctx.fillStyle = st.user.color;
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + 3, y + 15); ctx.lineTo(x + 7, y + 10); ctx.lineTo(x + 14, y + 9);
      ctx.closePath();
      ctx.fill();
      const label = st.user.name;
      const w = ctx.measureText(label).width + 12;
      ctx.fillRect(x + 10, y + 14, w, 18);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x + 16, y + 27);
    });
    ctx.restore();
  },

  // ---------- interface
  renderStatus() {
    const btn = $('#btn-collab');
    if (!btn) return;
    const n = this.provider ? this.provider.awareness.getStates().size : 0;
    btn.classList.toggle('is-live', Boolean(this.provider));
    btn.querySelector('span').textContent = this.provider ? `En direct · ${n}` : 'Collaborer';
  },

  open() {
    const live = Boolean(this.provider);
    const sheet = Sheet.create({
      title: 'Collaboration en direct',
      body: live ? `
        <p>Partagez ce lien : chaque personne qui l'ouvre rejoint ce projet en temps réel.</p>
        <div class="collab-link"><input class="input" type="text" readonly id="collab-link"><button class="btn btn-sm" type="button" id="collab-copy">Copier</button></div>
        <label class="field-label" for="collab-name">Votre nom (affiché à côté de votre curseur)</label>
        <input class="input" type="text" id="collab-name" maxlength="24">
        <p class="field-note">${this.provider.awareness.getStates().size} participant·e(s) connecté·e(s).</p>`
        : `
        <div class="collab-warning">
          <strong>Avant de partager</strong>
          <p>Le contenu de <em>ce projet</em> sera envoyé, en direct et chiffré, aux personnes qui ont le lien (connexion pair à pair, sans serveur Chloe’s Touch). Vos autres projets et votre coffre verrouillé ne sont jamais partagés.</p>
        </div>
        <label class="field-label" for="collab-name">Votre nom (affiché à côté de votre curseur)</label>
        <input class="input" type="text" id="collab-name" maxlength="24" placeholder="Ex. : Corentin">`,
      foot: live
        ? '<button class="btn btn-danger" type="button" id="collab-stop">Quitter le salon</button><button class="btn btn-primary" type="button" data-close>Fermer</button>'
        : '<button class="btn btn-primary" type="button" id="collab-create">Créer un salon et copier le lien</button>',
    });
    const $s = sheet.$;
    try { $s('#collab-name').value = localStorage.getItem(COLLAB_NAME_KEY) || ''; } catch { /* ignoré */ }
    $s('#collab-name').addEventListener('keydown', (e) => e.stopPropagation());
    $s('#collab-name').addEventListener('change', (e) => {
      try { localStorage.setItem(COLLAB_NAME_KEY, e.target.value.trim()); } catch { /* ignoré */ }
      if (this.provider) this.provider.awareness.setLocalStateField('user', { ...this.provider.awareness.getLocalState().user, name: e.target.value.trim() || 'Invité·e' });
    });
    if (live) {
      $s('#collab-link').value = this.link();
      $s('#collab-copy').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(this.link()); toast('Lien copié', 'success'); } catch { $s('#collab-link').select(); }
      });
      $s('#collab-stop').addEventListener('click', () => { sheet.close(); this.stop(); });
    } else {
      $s('#collab-create').addEventListener('click', () => {
        try { localStorage.setItem(COLLAB_NAME_KEY, $s('#collab-name').value.trim()); } catch { /* ignoré */ }
        sheet.close();
        this.create().catch((err) => { console.error(err); toast('Collaboration indisponible (connexion ?).', 'error'); });
      });
    }
    sheet.el.addEventListener('close', () => sheet.el.remove());
    sheet.open();
  },

  /** Lien #collab=… ouvert : on propose de rejoindre */
  offerJoin(room) {
    const sheet = Sheet.create({
      title: 'Rejoindre un projet partagé',
      body: `<div class="collab-warning"><p>On vous invite à modifier un projet en direct. Un <strong>nouveau projet</strong> « Projet partagé » sera créé dans votre galerie ; vos autres projets restent privés.</p></div>
        <label class="field-label" for="collab-join-name">Votre nom</label><input class="input" type="text" id="collab-join-name" maxlength="24">`,
      foot: '<button class="btn" type="button" data-close>Plus tard</button><button class="btn btn-primary" type="button" id="collab-join">Rejoindre</button>',
    });
    try { sheet.$('#collab-join-name').value = localStorage.getItem(COLLAB_NAME_KEY) || ''; } catch { /* ignoré */ }
    sheet.$('#collab-join-name').addEventListener('keydown', (e) => e.stopPropagation());
    sheet.$('#collab-join').addEventListener('click', () => {
      try { localStorage.setItem(COLLAB_NAME_KEY, sheet.$('#collab-join-name').value.trim()); } catch { /* ignoré */ }
      sheet.close();
      this.join(room).catch((err) => { console.error(err); toast('Impossible de rejoindre le salon (connexion ?).', 'error'); });
    });
    sheet.el.addEventListener('close', () => sheet.el.remove());
    sheet.open();
  },
};

SERIAL_PROPS.push('cid');

Hooks.on('init', () => {
  const btn = html(`<button class="pill pill-btn collab-btn" id="btn-collab" type="button" title="Collaborer en temps réel (lien partagé)">
    <svg viewBox="0 0 24 24" aria-hidden="true">${PEOPLE_ICON}</svg><span>Collaborer</span></button>`);
  $('.topbar-actions').prepend(btn);
  btn.addEventListener('click', () => Collab.open());
  Hooks.on('change', () => Collab.push());
  canvas.on('mouse:move', (opt) => Collab.onMove(opt.e));
  canvas.on('after:render', (e) => Collab.drawCursors(e));
  canvas.on('object:added', ({ target }) => { if (Collab.doc && !target.cid && !target.excludeFromExport) target.cid = Collab.randomId(10); });
  window.addEventListener('pagehide', () => Collab.provider?.destroy());
  // Ouverture d'un lien d'invitation (après le chargement du projet et un éventuel déverrouillage)
  const room = Collab.parseHash();
  if (room) {
    const wait = () => {
      if (window.Projects && !Projects.suspended) Collab.offerJoin(room);
      else setTimeout(wait, 300);
    };
    setTimeout(wait, 400);
  }
});
