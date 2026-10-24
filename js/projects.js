/**
 * ============================================================================
 *  Chloe’s Touch — Projets, tableaux & verrouillage par empreinte
 *
 *  1. Store   — IndexedDB : projets (métadonnées + miniature), documents,
 *               tableaux, réglages. Migration de l'ancien document unique.
 *  2. Vault   — chiffrement AES-GCM de tout le contenu. La clé est protégée
 *               par une passkey (Touch ID / Face ID / Windows Hello, extension
 *               WebAuthn « PRF ») et par un code de secours.
 *  3. Projects — projet courant, sauvegarde automatique, création, ouverture.
 *  4. Gallery — galerie façon Pinterest : mosaïque, tableaux, « Enregistrer ».
 *  5. LockScreen & réglages du verrouillage, verrouillage automatique.
 *
 *  Tout reste dans le navigateur de l'appareil : rien n'est envoyé à un serveur.
 * ============================================================================
 */
'use strict';

const DB_NAME = 'studio-chloe';
const DB_VERSION = 2;
const THUMB_SIZE = 420;           // px — grand côté des miniatures
const SAVE_DELAY_MS = 500;
const THUMB_EVERY_MS = 2500;
const AUTOLOCK_KEY = 'studio-chloe-autolock';
const AUTOLOCK_CHOICES = [1, 5, 15, 60, 0]; // minutes (0 = jamais)

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const textEnc = new TextEncoder();
const textDec = new TextDecoder();
const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));

/* ============================================================================
   1. STORE (IndexedDB)
   ========================================================================== */

const Store = {
  db: null,

  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = req.result;
        const tx = req.transaction;
        ['projects', 'boards'].forEach((name) => {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
        });
        if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs');
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        // Version 1 : un seul document (« courant ») → premier projet
        if (e.oldVersion === 1 && db.objectStoreNames.contains('documents')) {
          const get = tx.objectStore('documents').get('courant');
          get.onsuccess = () => {
            if (!get.result) return;
            const id = uid();
            const now = Date.now();
            tx.objectStore('projects').put({ id, name: 'Mon premier projet', boardIds: [], createdAt: now, updatedAt: now, thumb: null });
            tx.objectStore('docs').put(get.result, id);
            tx.objectStore('meta').put(id, 'current');
          };
        }
      };
      req.onsuccess = () => { this.db = req.result; resolve(); };
      req.onerror = () => reject(req.error);
    });
  },

  run(storeName, mode, action) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, mode);
      const req = action(tx.objectStore(storeName));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Stockage indisponible (espace plein ?)'));
    });
  },

  get: (store, key) => Store.run(store, 'readonly', (s) => s.get(key)),
  all: (store) => Store.run(store, 'readonly', (s) => s.getAll()),
  put: (store, value, key) => Store.run(store, 'readwrite', (s) => (key === undefined ? s.put(value) : s.put(value, key))),
  del: (store, key) => Store.run(store, 'readwrite', (s) => s.delete(key)),
};

/* ============================================================================
   2. VAULT — chiffrement & passkey
   ----------------------------------------------------------------------------
   - Une clé « maîtresse » AES-256 chiffre projets, documents et tableaux.
   - Elle est enveloppée (wrapKey) par une clé dérivée de la passkey grâce à
     l'extension PRF : seule l'empreinte de la propriétaire permet de la
     retrouver. Une 2e enveloppe utilise le code de secours (PBKDF2).
   - En mémoire uniquement tant que c'est déverrouillé ; jamais écrite en clair.
   ========================================================================== */

const Vault = {
  config: null, // meta 'vault' : { credId, salt, wrap: {iv, data}, recovery: {salt, iv, data}, since }
  key: null,    // clé maîtresse (CryptoKey) quand c'est déverrouillé

  get enabled() { return Boolean(this.config); },
  get unlocked() { return !this.enabled || Boolean(this.key); },

  async load() { this.config = (await Store.get('meta', 'vault')) || null; },

  async supported() {
    if (!window.PublicKeyCredential || !window.isSecureContext) return { ok: false, why: 'Ce navigateur ne gère pas les passkeys (ou la page n\'est pas en HTTPS).' };
    const platform = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.().catch(() => false);
    if (!platform) return { ok: false, why: 'Aucun capteur d\'empreinte / Face ID / Windows Hello n\'est disponible sur cet appareil.' };
    const caps = await PublicKeyCredential.getClientCapabilities?.().catch(() => null);
    if (caps && caps['extension:prf'] === false) return { ok: false, why: 'Ce navigateur ne permet pas encore le chiffrement par empreinte. Utilisez Safari (iPhone / Mac à jour) ou Chrome récent.' };
    return { ok: true };
  },

  async seal(obj) {
    const iv = randomBytes(12);
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.key, textEnc.encode(JSON.stringify(obj)));
    return { iv, data };
  },
  async unseal({ iv, data }) {
    return JSON.parse(textDec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, this.key, data)));
  },

  /** Clé d'enveloppe dérivée de la sortie PRF de la passkey */
  async kekFromPrf(prfOutput) {
    const base = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: textEnc.encode('studio-chloe'), info: textEnc.encode('vault-kek') },
      base, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']);
  },

  /** Clé d'enveloppe dérivée du code de secours */
  async kekFromCode(code, salt) {
    const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const base = await crypto.subtle.importKey('raw', textEnc.encode(clean), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 310000 },
      base, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']);
  },

  async wrap(kek) {
    const iv = randomBytes(12);
    return { iv, data: await crypto.subtle.wrapKey('raw', this.key, kek, { name: 'AES-GCM', iv }) };
  },
  async unwrap(kek, { iv, data }) {
    return crypto.subtle.unwrapKey('raw', data, kek, { name: 'AES-GCM', iv },
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  },

  newRecoveryCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O ni 1/I
    const bytes = randomBytes(20);
    const chars = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
    return chars.match(/.{4}/g).join('-');
  },

  /** Crée une passkey sur cet appareil et renvoie { credId, prf } */
  async registerPasskey(salt) {
    const cred = await navigator.credentials.create({
      publicKey: {
        rp: { name: 'Chloe’s Touch' },
        user: { id: randomBytes(16), name: 'Chloe’s Touch', displayName: 'Chloe’s Touch' },
        challenge: randomBytes(32),
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
        extensions: { prf: { eval: { first: salt } } },
        timeout: 120000,
      },
    });
    const ext = cred.getClientExtensionResults();
    if (!ext.prf?.enabled) {
      throw new Error('Ce navigateur ne permet pas le chiffrement par empreinte. Utilisez Safari (iPhone / Mac à jour) ou Chrome récent.');
    }
    // Certains navigateurs donnent déjà le secret à la création, sinon on le demande
    const prf = ext.prf.results?.first || await this.assertPasskey(cred.rawId, salt);
    return { credId: new Uint8Array(cred.rawId), prf };
  },

  /** Demande l'empreinte et renvoie le secret PRF */
  async assertPasskey(credId, salt) {
    const res = await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: [{ type: 'public-key', id: credId }],
        userVerification: 'required',
        extensions: { prf: { eval: { first: salt } } },
        timeout: 120000,
      },
    });
    const out = res.getClientExtensionResults().prf?.results?.first;
    if (!out) throw new Error('L\'empreinte a été reconnue, mais ce navigateur ne fournit pas la clé de chiffrement.');
    return out;
  },

  /** Active le verrouillage : passkey + code de secours, puis chiffre tout */
  async enable() {
    const salt = randomBytes(32);
    const { credId, prf } = await this.registerPasskey(salt);
    this.key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const code = this.newRecoveryCode();
    const rSalt = randomBytes(16);
    const config = {
      credId, salt, since: Date.now(),
      wrap: await this.wrap(await this.kekFromPrf(prf)),
      recovery: { salt: rSalt, ...(await this.wrap(await this.kekFromCode(code, rSalt))) },
    };
    await Projects.reencryptAll(true); // chiffre les données existantes avec la nouvelle clé
    this.config = config;
    await Store.put('meta', config, 'vault');
    return code;
  },

  /** Nouvelle passkey (nouvel appareil, empreinte changée) — garde la même clé */
  async replacePasskey() {
    const salt = randomBytes(32);
    const { credId, prf } = await this.registerPasskey(salt);
    this.config = { ...this.config, credId, salt, wrap: await this.wrap(await this.kekFromPrf(prf)) };
    await Store.put('meta', this.config, 'vault');
  },

  async newRecovery() {
    const code = this.newRecoveryCode();
    const rSalt = randomBytes(16);
    this.config = { ...this.config, recovery: { salt: rSalt, ...(await this.wrap(await this.kekFromCode(code, rSalt))) } };
    await Store.put('meta', this.config, 'vault');
    return code;
  },

  async unlockWithPasskey() {
    const prf = await this.assertPasskey(this.config.credId, this.config.salt);
    this.key = await this.unwrap(await this.kekFromPrf(prf), this.config.wrap);
  },

  async unlockWithCode(code) {
    try {
      this.key = await this.unwrap(await this.kekFromCode(code, this.config.recovery.salt), this.config.recovery);
    } catch {
      throw new Error('Code de secours incorrect.');
    }
  },

  async disable() {
    await Projects.reencryptAll(false);
    this.config = null;
    this.key = null;
    await Store.del('meta', 'vault');
  },

  lock() { this.key = null; },
};

/* ============================================================================
   3. PROJETS
   ----------------------------------------------------------------------------
   Enregistrement « projects » : { id, createdAt, updatedAt, name, boardIds,
   thumb, w, h } — ou { id, createdAt, updatedAt, sealed } quand c'est chiffré.
   Le document (JSON Fabric) est stocké à part dans « docs » (même principe).
   ========================================================================== */

const Projects = {
  current: null,     // métadonnées du projet ouvert (déchiffrées)
  suspended: true,   // pas de sauvegarde (démarrage, verrouillé)
  timer: null,
  pendingJSON: null,
  lastThumb: 0,

  // ---------- lecture / écriture (chiffrées si le coffre est actif)
  async readMeta(rec) {
    if (!rec?.sealed) return rec;
    return { id: rec.id, createdAt: rec.createdAt, updatedAt: rec.updatedAt, ...(await Vault.unseal(rec.sealed)) };
  },
  async writeMeta(meta) {
    const { id, createdAt, updatedAt, ...rest } = meta;
    const rec = Vault.enabled ? { id, createdAt, updatedAt, sealed: await Vault.seal(rest) } : meta;
    await Store.put('projects', rec);
  },
  async readDoc(id) {
    const raw = await Store.get('docs', id);
    if (!raw) return null;
    return raw.data && raw.iv ? (await Vault.unseal(raw)).doc : raw;
  },
  async writeDoc(id, json) {
    await Store.put('docs', Vault.enabled ? await Vault.seal({ doc: json }) : json, id);
  },
  async listAll() {
    const recs = await Store.all('projects');
    const metas = await Promise.all(recs.map((r) => this.readMeta(r).catch(() => null)));
    return metas.filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt);
  },

  /** (Dé)chiffre toutes les données — à l'activation / désactivation du verrou */
  async reencryptAll(encrypt) {
    const projects = await this.listAll();
    const docs = await Promise.all(projects.map((p) => this.readDoc(p.id)));
    const boards = await Boards.list();
    const savedConfig = Vault.config;
    Vault.config = encrypt ? (savedConfig || {}) : null; // writeMeta / writeDoc s'appuient sur Vault.enabled
    for (let i = 0; i < projects.length; i += 1) {
      await this.writeMeta(projects[i]);
      if (docs[i]) await this.writeDoc(projects[i].id, docs[i]);
    }
    for (const b of boards) await Boards.write(b);
    Vault.config = encrypt ? savedConfig : null;
  },

  // ---------- sauvegarde automatique
  queueSave(json) {
    if (this.suspended || !this.current || !Vault.unlocked) return;
    this.pendingJSON = json;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), SAVE_DELAY_MS);
  },

  async flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.pendingJSON || !this.current) return;
    // l'historique référence les images (ImagePool) : on enregistre un document complet
    const json = ImagePool.expand(this.pendingJSON);
    this.pendingJSON = null;
    await this.persist(json);
  },

  async persist(json, { thumb = Date.now() - this.lastThumb > THUMB_EVERY_MS } = {}) {
    const meta = this.current;
    meta.updatedAt = Date.now();
    meta.w = state.page.width;
    meta.h = state.page.height;
    if (thumb) { meta.thumb = this.thumbnail(); this.lastThumb = Date.now(); }
    try {
      await this.writeDoc(meta.id, json);
      await this.writeMeta(meta);
    } catch (err) {
      console.error('[Projets]', err);
      toast('Sauvegarde impossible : espace de stockage du navigateur plein ?', 'error', 6000);
    }
  },

  /** Écrit tout de suite un document dans le projet courant (annule l'attente) */
  async saveNow(json = Doc.serialize()) {
    clearTimeout(this.timer);
    this.pendingJSON = null;
    if (this.current) await this.persist(json, { thumb: true });
  },

  thumbnail() {
    if (!canvas.getObjects().length) return null;
    const m = THUMB_SIZE / Math.max(state.page.width, state.page.height);
    return Exporter.toDataURL({ format: 'jpeg', multiplier: m, transparent: false, quality: 0.8 });
  },

  currentName() { return this.current?.name || 'Sans titre'; },

  // ---------- ouverture / création
  async open(id) {
    await this.flush();
    const rec = await Store.get('projects', id);
    if (!rec) return false;
    const meta = await this.readMeta(rec);
    const json = await this.readDoc(id);
    this.suspended = true;
    await new Promise((resolve) => Doc.open(json, resolve));
    this.current = meta;
    this.suspended = false;
    await Store.put('meta', id, 'current');
    this.updateLabel();
    return true;
  },

  async create({ json = null, name = 'Sans titre', boardIds = [] } = {}) {
    await this.flush();
    const now = Date.now();
    const meta = { id: uid(), name, boardIds, createdAt: now, updatedAt: now, thumb: null, w: DEFAULT_PAGE.width, h: DEFAULT_PAGE.height };
    this.suspended = true;
    await new Promise((resolve) => Doc.open(json, resolve));
    this.current = meta;
    this.suspended = false;
    await this.saveNow();
    await Store.put('meta', meta.id, 'current');
    this.updateLabel();
    return meta;
  },

  async createFromDoc(json, name) {
    const meta = await this.create({ json, name, boardIds: Gallery.board ? [Gallery.board] : [] });
    Gallery.close();
    return meta;
  },

  async rename(id, name) {
    const meta = id === this.current?.id ? this.current : await this.readMeta(await Store.get('projects', id));
    meta.name = name.trim() || 'Sans titre';
    meta.updatedAt = Date.now();
    await this.writeMeta(meta);
    if (meta === this.current) this.updateLabel();
  },

  async duplicate(id) {
    if (id === this.current?.id) await this.saveNow();
    const meta = await this.readMeta(await Store.get('projects', id));
    const json = await this.readDoc(id);
    const now = Date.now();
    const copy = { ...meta, id: uid(), name: `${meta.name} (copie)`, createdAt: now, updatedAt: now };
    await this.writeDoc(copy.id, json);
    await this.writeMeta(copy);
    return copy;
  },

  async remove(id) {
    await Store.del('projects', id);
    await Store.del('docs', id);
    if (id === this.current?.id) {
      this.current = null;
      const rest = await this.listAll();
      if (rest.length) await this.open(rest[0].id);
      else await this.create({ name: 'Sans titre' });
    }
  },

  async setBoards(id, boardIds) {
    const meta = id === this.current?.id ? this.current : await this.readMeta(await Store.get('projects', id));
    meta.boardIds = boardIds;
    await this.writeMeta(meta);
  },

  /** Ouvre le dernier projet (ou en crée un) */
  async boot() {
    const currentId = await Store.get('meta', 'current');
    if (currentId && await this.open(currentId)) return;
    const all = await this.listAll();
    if (all.length) await this.open(all[0].id);
    else await this.create({ name: 'Mon premier projet' });
  },

  updateLabel() {
    const btn = $('#btn-project');
    if (btn) btn.querySelector('span').textContent = this.currentName();
    document.title = `${this.currentName()} — Chloe’s Touch`;
  },
};
window.Projects = Projects; // utilisé par formats.js et library.js

/* ============================================================================
   TABLEAUX
   ========================================================================== */

const Boards = {
  async list() {
    const recs = await Store.all('boards');
    const out = await Promise.all(recs.map(async (r) => (r.sealed
      ? { id: r.id, createdAt: r.createdAt, ...(await Vault.unseal(r.sealed).catch(() => ({ name: '?' }))) }
      : r)));
    return out.sort((a, b) => a.createdAt - b.createdAt);
  },
  async write(board) {
    const { id, createdAt, ...rest } = board;
    await Store.put('boards', Vault.enabled ? { id, createdAt, sealed: await Vault.seal(rest) } : board);
  },
  async create(name) {
    const board = { id: uid(), name: name.trim() || 'Nouveau tableau', createdAt: Date.now() };
    await this.write(board);
    return board;
  },
  async remove(id, projects) {
    await Store.del('boards', id);
    for (const p of projects.filter((x) => x.boardIds?.includes(id))) {
      await Projects.setBoards(p.id, p.boardIds.filter((b) => b !== id));
    }
  },
};

/* ============================================================================
   4. GALERIE (façon Pinterest)
   ========================================================================== */

const LOCK_ICON = '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>';
const FINGERPRINT_ICON = '<path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"/>';

function relativeDate(ts) {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return 'à l\'instant';
  if (d < 3600) return `il y a ${Math.round(d / 60)} min`;
  if (d < 86400) return `il y a ${Math.round(d / 3600)} h`;
  if (d < 86400 * 7) return `il y a ${Math.round(d / 86400)} j`;
  return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

const Gallery = {
  board: null,   // tableau affiché (null = tous)
  query: '',
  projects: [],
  boards: [],

  mount() {
    this.el = html(`
      <section class="gallery" id="gallery" hidden aria-label="Mes projets">
        <header class="gallery-head">
          <div class="gallery-title">
            <img src="logo.svg" alt="" width="40" height="40">
            <div><h1>Mes projets</h1><p id="gallery-count"></p></div>
          </div>
          <input class="input gallery-search" type="search" id="gallery-search" placeholder="Rechercher un projet…" aria-label="Rechercher un projet">
          <div class="gallery-actions">
            <button class="pill pill-btn" type="button" id="gallery-templates">Partir d'un modèle</button>
            <button class="pill pill-btn pill-primary" type="button" id="gallery-new">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg> Nouveau projet
            </button>
            <button class="pill pill-btn pill-icon" type="button" id="gallery-security" title="Verrouillage par empreinte" aria-label="Verrouillage par empreinte">
              <svg viewBox="0 0 24 24" aria-hidden="true">${FINGERPRINT_ICON}</svg>
            </button>
            <button class="pill pill-btn pill-icon" type="button" id="gallery-close" title="Retour à l'éditeur (Échap)" aria-label="Fermer">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
            </button>
          </div>
        </header>
        <nav class="board-bar" id="board-bar" aria-label="Tableaux"></nav>
        <div class="board-head" id="board-head" hidden></div>
        <div class="masonry" id="masonry"></div>
      </section>`);
    $('.app').appendChild(this.el);

    const $g = (s) => this.el.querySelector(s);
    $g('#gallery-close').addEventListener('click', () => this.close());
    $g('#gallery-new').addEventListener('click', async () => {
      await Projects.create({ name: 'Sans titre', boardIds: this.board ? [this.board] : [] });
      this.close();
    });
    $g('#gallery-templates').addEventListener('click', () => Library.open('templates'));
    $g('#gallery-security').addEventListener('click', () => Security.open());
    $g('#gallery-search').addEventListener('input', (e) => { this.query = e.target.value; this.renderGrid(); });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !e.target.closest('input') && !document.querySelector('dialog[open]')) this.close();
    });
    this.bindGrid();
  },

  async open() {
    if (!Vault.unlocked) return;
    if (Projects.current) await Projects.saveNow();
    this.el.hidden = false;
    document.body.classList.add('is-overlay');
    await this.refresh();
    this.el.querySelector('#gallery-search').focus({ preventScroll: true });
  },

  close() {
    if (!Projects.current) return;
    this.el.hidden = true;
    document.body.classList.remove('is-overlay');
    closePopover();
  },

  async refresh() {
    [this.projects, this.boards] = await Promise.all([Projects.listAll(), Boards.list()]);
    if (this.board && !this.boards.some((b) => b.id === this.board)) this.board = null;
    this.renderBoards();
    this.renderGrid();
  },

  renderBoards() {
    const count = (id) => this.projects.filter((p) => p.boardIds?.includes(id)).length;
    const bar = this.el.querySelector('#board-bar');
    bar.innerHTML = `
      <button class="board-chip${this.board ? '' : ' is-active'}" type="button" data-board="">Tous les projets <span>${this.projects.length}</span></button>
      ${this.boards.map((b) => `<button class="board-chip${this.board === b.id ? ' is-active' : ''}" type="button" data-board="${b.id}"></button>`).join('')}
      <button class="board-chip board-new" type="button" id="board-new">+ Nouveau tableau</button>`;
    this.boards.forEach((b) => {
      const chip = bar.querySelector(`[data-board="${b.id}"]`);
      chip.textContent = b.name;
      chip.insertAdjacentHTML('beforeend', ` <span>${count(b.id)}</span>`);
    });
    bar.querySelectorAll('[data-board]').forEach((c) => c.addEventListener('click', () => {
      this.board = c.dataset.board || null;
      this.renderBoards();
      this.renderGrid();
    }));
    bar.querySelector('#board-new').addEventListener('click', (e) => this.promptBoard(e.currentTarget));

    const head = this.el.querySelector('#board-head');
    const board = this.boards.find((b) => b.id === this.board);
    head.hidden = !board;
    if (board) {
      head.innerHTML = `<h2></h2>
        <button class="chip" type="button" id="board-rename">Renommer</button>
        <button class="chip chip-danger" type="button" id="board-delete">Supprimer le tableau</button>`;
      head.querySelector('h2').textContent = board.name;
      head.querySelector('#board-rename').addEventListener('click', async () => {
        const name = prompt('Nom du tableau', board.name);
        if (name === null) return;
        board.name = name.trim() || board.name;
        await Boards.write(board);
        await this.refresh();
      });
      head.querySelector('#board-delete').addEventListener('click', async () => {
        if (!confirm(`Supprimer le tableau « ${board.name} » ? Les projets ne sont pas supprimés.`)) return;
        await Boards.remove(board.id, this.projects);
        this.board = null;
        await this.refresh();
      });
    }
    this.el.querySelector('#gallery-count').textContent = `${this.projects.length} projet${this.projects.length > 1 ? 's' : ''} · ${this.boards.length} tableau${this.boards.length > 1 ? 'x' : ''}`;
  },

  visible() {
    const q = this.query.trim().toLowerCase();
    return this.projects.filter((p) => (!this.board || p.boardIds?.includes(this.board))
      && (!q || p.name.toLowerCase().includes(q)));
  },

  renderGrid() {
    const grid = this.el.querySelector('#masonry');
    const list = this.visible();
    if (!list.length) {
      grid.innerHTML = `<div class="gallery-empty">${this.board ? 'Ce tableau est vide : utilisez « Enregistrer » sur un projet pour l\'y ajouter.' : 'Aucun projet ne correspond.'}</div>`;
      return;
    }
    grid.innerHTML = list.map((p) => {
      const ratio = `${p.w || 1}/${p.h || 1}`;
      return `
      <article class="pin${p.id === Projects.current?.id ? ' is-current' : ''}" data-id="${p.id}">
        <button class="pin-thumb" type="button" data-act="open" style="aspect-ratio:${ratio}" aria-label="Ouvrir">
          ${p.thumb ? `<img src="${p.thumb}" alt="" loading="lazy">` : '<span class="pin-blank">Page vide</span>'}
        </button>
        <button class="pin-save" type="button" data-act="save">Enregistrer</button>
        <div class="pin-foot">
          <div class="pin-info"><strong class="pin-name"></strong><small>${relativeDate(p.updatedAt)}${p.boardIds?.length ? ` · ${p.boardIds.length} tableau${p.boardIds.length > 1 ? 'x' : ''}` : ''}</small></div>
          <button class="pin-more" type="button" data-act="menu" aria-label="Plus d'actions">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>
          </button>
        </div>
      </article>`;
    }).join('');
    list.forEach((p) => { grid.querySelector(`[data-id="${p.id}"] .pin-name`).textContent = p.name; });
  },

  bindGrid() {
    this.el.querySelector('#masonry').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      const pin = e.target.closest('.pin');
      if (!btn || !pin) return;
      const p = this.projects.find((x) => x.id === pin.dataset.id);
      if (btn.dataset.act === 'open') {
        if (p.id !== Projects.current?.id) await Projects.open(p.id);
        this.close();
      } else if (btn.dataset.act === 'save') {
        this.saveMenu(btn, p);
      } else if (btn.dataset.act === 'menu') {
        this.projectMenu(btn, p);
      }
    });
  },

  /** « Enregistrer » à la Pinterest : choisir les tableaux du projet */
  saveMenu(anchor, p) {
    const pop = openPopover(anchor, `
      <div class="flyout-title">Enregistrer dans…</div>
      ${this.boards.map((b) => `<label class="flyout-item flyout-check"><input type="checkbox" value="${b.id}" ${p.boardIds?.includes(b.id) ? 'checked' : ''}><span></span></label>`).join('')}
      ${this.boards.length ? '<div class="flyout-sep"></div>' : ''}
      <form class="flyout-form"><input class="input" type="text" placeholder="Nouveau tableau…" maxlength="40" aria-label="Nom du nouveau tableau"><button class="chip chip-primary" type="submit">Créer</button></form>`);
    this.boards.forEach((b) => { pop.querySelector(`input[value="${b.id}"] + span`).textContent = b.name; });
    pop.querySelectorAll('input[type="checkbox"]').forEach((cb) => cb.addEventListener('change', async () => {
      const ids = [...pop.querySelectorAll('input[type="checkbox"]:checked')].map((x) => x.value);
      await Projects.setBoards(p.id, ids);
      p.boardIds = ids;
      this.renderBoards();
      this.renderGrid();
    }));
    pop.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = e.target.querySelector('input').value.trim();
      if (!name) return;
      const b = await Boards.create(name);
      await Projects.setBoards(p.id, [...(p.boardIds || []), b.id]);
      closePopover();
      await this.refresh();
      toast(`Enregistré dans « ${name} »`, 'success');
    });
  },

  projectMenu(anchor, p) {
    const pop = openPopover(anchor, `
      <button class="flyout-item" type="button" data-m="open">Ouvrir</button>
      <button class="flyout-item" type="button" data-m="rename">Renommer</button>
      <button class="flyout-item" type="button" data-m="dup">Dupliquer</button>
      <div class="flyout-sep"></div>
      <button class="flyout-item is-danger" type="button" data-m="del">Supprimer</button>`);
    pop.addEventListener('click', async (e) => {
      const m = e.target.closest('[data-m]')?.dataset.m;
      if (!m) return;
      closePopover();
      if (m === 'open') { await Projects.open(p.id); this.close(); }
      if (m === 'rename') {
        const name = prompt('Nom du projet', p.name);
        if (name !== null) { await Projects.rename(p.id, name); await this.refresh(); }
      }
      if (m === 'dup') { await Projects.duplicate(p.id); await this.refresh(); toast('Projet dupliqué', 'success'); }
      if (m === 'del') {
        if (!confirm(`Supprimer définitivement « ${p.name} » ?`)) return;
        await Projects.remove(p.id);
        await this.refresh();
        toast('Projet supprimé');
      }
    });
  },

  promptBoard(anchor) {
    const pop = openPopover(anchor, '<form class="flyout-form"><input class="input" type="text" placeholder="Nom du tableau" maxlength="40" aria-label="Nom du tableau"><button class="chip chip-primary" type="submit">Créer</button></form>');
    const input = pop.querySelector('input');
    input.focus();
    pop.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!input.value.trim()) return;
      const b = await Boards.create(input.value);
      closePopover();
      this.board = b.id;
      await this.refresh();
    });
  },
};

/** Petit menu flottant ancré à un bouton (un seul à la fois) */
let popoverEl = null;
function openPopover(anchor, markup) {
  closePopover();
  popoverEl = html(`<div class="flyout popover">${markup}</div>`);
  document.body.appendChild(popoverEl);
  const r = anchor.getBoundingClientRect();
  const w = popoverEl.offsetWidth;
  popoverEl.style.left = `${clamp(r.right - w, 8, window.innerWidth - w - 8)}px`;
  const below = r.bottom + 6;
  popoverEl.style.top = `${below + popoverEl.offsetHeight > window.innerHeight - 8 ? Math.max(8, r.top - popoverEl.offsetHeight - 6) : below}px`;
  setTimeout(() => document.addEventListener('pointerdown', outsidePopover), 0);
  return popoverEl;
}
function outsidePopover(e) { if (popoverEl && !popoverEl.contains(e.target)) closePopover(); }
function closePopover() {
  popoverEl?.remove();
  popoverEl = null;
  document.removeEventListener('pointerdown', outsidePopover);
}

/* ============================================================================
   5. ÉCRAN DE VERROUILLAGE, RÉGLAGES, VERROUILLAGE AUTOMATIQUE
   ========================================================================== */

const LockScreen = {
  mount() {
    this.el = html(`
      <section class="lock-screen" id="lock-screen" hidden aria-label="Chloe’s Touch est verrouillé">
        <div class="lock-card">
          <img src="logo.svg" alt="" width="72" height="72">
          <h1>Chloe’s Touch est verrouillé</h1>
          <p>Vos projets sont chiffrés sur cet appareil. Seule votre empreinte peut les ouvrir.</p>
          <button class="btn btn-primary btn-block lock-btn" type="button" id="lock-unlock">
            <svg viewBox="0 0 24 24" aria-hidden="true">${FINGERPRINT_ICON}</svg>
            Déverrouiller
          </button>
          <button class="lock-link" type="button" id="lock-show-code">J'ai perdu l'accès à mon empreinte</button>
          <form class="lock-code" id="lock-code" hidden>
            <input class="input" type="text" placeholder="Code de secours (XXXX-XXXX-…)" autocomplete="off" spellcheck="false" aria-label="Code de secours">
            <button class="btn" type="submit">Déverrouiller avec le code</button>
          </form>
          <p class="lock-error" id="lock-error" role="alert"></p>
        </div>
      </section>`);
    document.body.appendChild(this.el);
    const $l = (s) => this.el.querySelector(s);
    $l('#lock-unlock').addEventListener('click', () => this.tryUnlock(() => Vault.unlockWithPasskey()));
    $l('#lock-show-code').addEventListener('click', () => { $l('#lock-code').hidden = false; $l('#lock-code input').focus(); });
    $l('#lock-code').addEventListener('submit', (e) => {
      e.preventDefault();
      const code = e.target.querySelector('input').value;
      this.tryUnlock(() => Vault.unlockWithCode(code), true);
    });
  },

  show() {
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    closePopover();
    this.el.hidden = false;
    document.body.classList.add('is-locked', 'is-overlay');
    this.el.querySelector('#lock-error').textContent = '';
    this.el.querySelector('#lock-code').hidden = true;
    this.el.querySelector('#lock-code input').value = '';
  },

  hide() {
    this.el.hidden = true;
    document.body.classList.remove('is-locked');
    if ($('#gallery').hidden) document.body.classList.remove('is-overlay');
  },

  async tryUnlock(fn, viaCode = false) {
    const btn = this.el.querySelector('#lock-unlock');
    btn.disabled = true;
    this.el.querySelector('#lock-error').textContent = '';
    try {
      await fn();
      this.hide();
      await Projects.boot();
      AutoLock.touch();
      if (viaCode) toast('Déverrouillé avec le code. Pensez à réenregistrer votre empreinte (Mes projets → empreinte).', 'info', 7000);
    } catch (err) {
      console.warn('[Verrouillage]', err);
      const msg = err?.name === 'NotAllowedError' ? 'Empreinte annulée ou non reconnue. Réessayez.' : (err.message || 'Déverrouillage impossible.');
      this.el.querySelector('#lock-error').textContent = msg;
    } finally {
      btn.disabled = false;
    }
  },
};

/** Verrouille tout de suite : sauvegarde, puis efface tout de l'écran et de la mémoire */
async function lockNow() {
  if (!Vault.enabled || !Vault.key) return;
  await Projects.flush();
  Projects.suspended = true;
  Projects.current = null;
  Clipboard.data = null;
  Doc.open(null);
  $('#gallery').hidden = true;
  Vault.lock();
  LockScreen.show();
  Projects.updateLabel();
  document.title = 'Chloe’s Touch';
}

const AutoLock = {
  last: Date.now(),
  hiddenAt: null,
  minutes() {
    try { const v = Number(localStorage.getItem(AUTOLOCK_KEY)); return AUTOLOCK_CHOICES.includes(v) ? v : 5; } catch { return 5; }
  },
  touch() { this.last = Date.now(); },
  check() {
    const m = this.minutes();
    if (m && Vault.enabled && Vault.key && Date.now() - this.last > m * 60000) lockNow();
  },
  bind() {
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((evt) => document.addEventListener(evt, () => this.touch(), { passive: true, capture: true }));
    setInterval(() => this.check(), 15000);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.hiddenAt = Date.now(); Projects.flush(); return; }
      if (this.hiddenAt) { this.last = Math.min(this.last, this.hiddenAt); this.check(); }
    });
  },
};

/** Fenêtre des réglages du verrouillage */
const Security = {
  async open() {
    this.sheet?.el.remove();
    const support = await Vault.supported();
    const m = AutoLock.minutes();
    const body = Vault.enabled
      ? `<div class="security-status is-on"><svg viewBox="0 0 24 24" aria-hidden="true">${LOCK_ICON}</svg>
           <div><strong>Verrouillage activé</strong><p>Depuis le ${new Date(Vault.config.since).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}. Projets, tableaux et miniatures sont chiffrés sur cet appareil.</p></div></div>
         <div><h3 class="sheet-section">Verrouillage automatique après</h3><div class="chips">
           ${AUTOLOCK_CHOICES.map((v) => `<button class="chip${v === m ? ' is-active' : ''}" type="button" data-autolock="${v}">${v ? (v === 60 ? '1 h' : `${v} min`) : 'Jamais'}</button>`).join('')}
         </div><p class="field-note">D'inactivité, ou d'absence de l'onglet. Au rechargement de la page, c'est toujours verrouillé.</p></div>
         <div class="security-actions">
           <button class="btn" type="button" id="sec-lock"><svg viewBox="0 0 24 24" aria-hidden="true">${LOCK_ICON}</svg>Verrouiller maintenant</button>
           <button class="btn" type="button" id="sec-repasskey">Réenregistrer mon empreinte</button>
           <button class="btn" type="button" id="sec-recovery">Nouveau code de secours</button>
           <button class="btn btn-danger" type="button" id="sec-disable">Désactiver le verrouillage</button>
         </div>`
      : `<div class="security-status"><svg viewBox="0 0 24 24" aria-hidden="true">${FINGERPRINT_ICON}</svg>
           <div><strong>Protégez vos projets avec votre empreinte</strong>
           <p>Touch ID, Face ID ou Windows Hello. Vos projets sont chiffrés : sans votre empreinte (ou votre code de secours), personne ne peut les ouvrir, même avec cet ordinateur entre les mains.</p></div></div>
         <ul class="security-list">
           <li>Un <strong>code de secours</strong> vous sera donné : notez-le, il permet de rentrer si l'empreinte ne marche plus.</li>
           <li>Le verrouillage concerne <strong>ce navigateur, sur cet appareil</strong>.</li>
         </ul>
         ${support.ok ? '' : `<p class="lock-error">${escapeHTML(support.why)}</p>`}
         <button class="btn btn-primary" type="button" id="sec-enable" ${support.ok ? '' : 'disabled'}>
           <svg viewBox="0 0 24 24" aria-hidden="true">${FINGERPRINT_ICON}</svg> Activer avec mon empreinte
         </button>`;
    this.sheet = Sheet.create({ title: 'Verrouillage par empreinte', body });
    const { $ } = this.sheet;
    this.sheet.$$('[data-autolock]').forEach((b) => b.addEventListener('click', () => {
      try { localStorage.setItem(AUTOLOCK_KEY, b.dataset.autolock); } catch { /* ignoré */ }
      this.sheet.$$('[data-autolock]').forEach((x) => x.classList.toggle('is-active', x === b));
    }));
    $('#sec-enable')?.addEventListener('click', () => this.run(async () => {
      await Projects.saveNow();
      const code = await Vault.enable();
      this.showCode(code, true);
    }));
    $('#sec-lock')?.addEventListener('click', () => { this.sheet.close(); lockNow(); });
    $('#sec-repasskey')?.addEventListener('click', () => this.run(async () => {
      await Vault.replacePasskey();
      toast('Nouvelle empreinte enregistrée', 'success');
      this.sheet.close();
    }));
    $('#sec-recovery')?.addEventListener('click', () => this.run(async () => this.showCode(await Vault.newRecovery(), false)));
    $('#sec-disable')?.addEventListener('click', () => {
      if (!confirm('Désactiver le verrouillage ? Vos projets seront déchiffrés et accessibles sans empreinte sur ce navigateur.')) return;
      this.run(async () => {
        await Vault.disable();
        toast('Verrouillage désactivé');
        this.sheet.close();
      });
    });
    this.sheet.open();
  },

  async run(fn) {
    this.sheet.$$('button').forEach((b) => { b.disabled = true; });
    try {
      await fn();
    } catch (err) {
      console.warn('[Verrouillage]', err);
      toast(err?.name === 'NotAllowedError' ? 'Opération annulée.' : (err.message || 'Une erreur est survenue.'), 'error', 6000);
    } finally {
      this.sheet?.$$('button').forEach((b) => { b.disabled = false; });
    }
  },

  /** Affiche le code de secours (une seule fois) */
  showCode(code, first) {
    this.sheet.body.innerHTML = `
      <div class="security-status is-on"><svg viewBox="0 0 24 24" aria-hidden="true">${LOCK_ICON}</svg>
        <div><strong>${first ? 'C\'est activé !' : 'Nouveau code de secours'}</strong>
        <p>Notez ce code et gardez-le en lieu sûr (gestionnaire de mots de passe, papier). Il ne sera plus jamais affiché.${first ? '' : ' L\'ancien code ne fonctionne plus.'}</p></div></div>
      <div class="recovery-code" id="recovery-code"></div>
      <div class="security-actions">
        <button class="btn" type="button" id="code-copy">Copier</button>
        <button class="btn" type="button" id="code-download">Télécharger (.txt)</button>
      </div>
      <label class="check check-strong"><input type="checkbox" id="code-ok"> J'ai noté mon code de secours</label>
      <button class="btn btn-primary" type="button" id="code-done" disabled>Terminer</button>`;
    const { $ } = this.sheet;
    $('#recovery-code').textContent = code;
    $('#code-copy').addEventListener('click', () => navigator.clipboard?.writeText(code).then(() => toast('Code copié', 'success')));
    $('#code-download').addEventListener('click', () => {
      const url = URL.createObjectURL(new Blob([`Chloe’s Touch — code de secours\n\n${code}\n\nÀ utiliser si l'empreinte ne fonctionne plus (écran de verrouillage → « J'ai perdu l'accès à mon empreinte »).\n`], { type: 'text/plain' }));
      downloadURL(url, 'chloes-touch-code-de-secours.txt');
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    $('#code-ok').addEventListener('change', (e) => { $('#code-done').disabled = !e.target.checked; });
    $('#code-done').addEventListener('click', () => this.sheet.close());
    // On ne ferme pas par erreur avant d'avoir noté le code
    this.sheet.el.addEventListener('cancel', (e) => { if (!$('#code-ok')?.checked) e.preventDefault(); });
  },
};

/* ============================================================================
   BRANCHEMENT
   ========================================================================== */

function mountProjectUI() {
  // Nom du projet dans la marque (ouvre la galerie)
  const brand = $('.brand-pill');
  brand.appendChild(html(`
    <button class="project-chip" id="btn-project" type="button" title="Mes projets (⌘/Ctrl + O)">
      <span>…</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
    </button>`));
  $('#btn-project').addEventListener('click', () => Gallery.open());

  // Bouton « Projets » en tête du rail (accessible aussi sur mobile)
  const firstGroup = $('.rail .rail-group');
  const btn = html(`
    <button class="rail-btn" id="btn-gallery" type="button" title="Mes projets (⌘/Ctrl + O)" aria-label="Mes projets">
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="8" height="10" rx="2"/><rect x="13" y="3" width="8" height="6" rx="2"/><rect x="3" y="15" width="8" height="6" rx="2"/><rect x="13" y="11" width="8" height="10" rx="2"/></svg>
    </button>`);
  firstGroup.prepend(btn);
  btn.addEventListener('click', () => Gallery.open());

  Keys.add((e, { mod, key }) => {
    if (mod && key === 'o') { e.preventDefault(); Gallery.open(); return true; }
    if (mod && e.shiftKey && key === 'l' && Vault.enabled) { e.preventDefault(); lockNow(); return true; }
    return false;
  });
}

Hooks.on('init', () => {
  mountProjectUI();
  Gallery.mount();
  LockScreen.mount();
  AutoLock.bind();
  Hooks.on('change', (json) => Projects.queueSave(json));
  window.addEventListener('pagehide', () => Projects.flush());
});

// Chargement : coffre verrouillé → écran de verrouillage, sinon dernier projet
Hooks.on('boot', async () => {
  try {
    await Store.open();
    await Vault.load();
    if (Vault.enabled) {
      Doc.open(null);
      LockScreen.show();
      return;
    }
    await Projects.boot();
  } catch (err) {
    console.error('[Projets]', err);
    toast('Stockage du navigateur indisponible : vos créations ne seront pas sauvegardées (navigation privée ?).', 'error', 8000);
    Doc.open(null);
  }
});
