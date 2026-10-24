/**
 * ============================================================================
 *  Chloe’s Touch — Repères (lignes de guidage posées à la main)
 *
 *  Comme dans Illustrator :
 *    - glisser depuis la règle du haut  → repère horizontal
 *    - glisser depuis la règle de gauche → repère vertical
 *    - glisser un repère pour le déplacer, le ramener sur une règle pour le supprimer
 *    - les objets déplacés s'aimantent aux repères (bascule « Guides magnétiques »)
 *  Menu « Repères » dans la pilule de zoom : afficher (⌘;), verrouiller (⌘⌥;),
 *  ajouter au centre de la page, tout effacer.
 *  Les repères sont enregistrés avec le document (Doc.extras.guides) : ils
 *  suivent l'historique et les projets, mais ne sont jamais exportés.
 * ============================================================================
 */
'use strict';

const USER_GUIDE_COLOR = '#2fa7d6';      // bleu cyan, comme les repères d'Illustrator
const USER_GUIDE_HIT_PX = 5;             // distance (écran) pour attraper un repère
const GUIDE_ICON = '<path d="M3 8h18M8 3v18"/><path d="M14 14h6v6h-6z" stroke-dasharray="2 2"/>';

const UserGuides = {
  list: [],                     // { axis: 'x' | 'y', value } — x = vertical, y = horizontal
  visible: true,
  locked: false,
  drag: null,                   // { guide, fresh } pendant un glisser
  hover: null,

  // ---------- données
  save() { return this.list.length ? this.list.map((g) => ({ axis: g.axis, value: Math.round(g.value * 100) / 100 })) : undefined; },
  load(value) {
    this.list = Array.isArray(value) ? value.filter((g) => (g.axis === 'x' || g.axis === 'y') && Number.isFinite(g.value)).map((g) => ({ ...g })) : [];
    this.drag = null;
  },

  add(axis, value, { record = true } = {}) {
    const g = { axis, value };
    this.list.push(g);
    this.visible = true;
    this.refreshMenu();
    canvas.requestRenderAll();
    if (record) History.queue();
    return g;
  },

  clearAll() {
    if (!this.list.length) return;
    this.list = [];
    canvas.requestRenderAll();
    History.commit();
    toast('Repères effacés — ⌘/Ctrl + Z pour annuler');
  },

  // ---------- coordonnées
  screenOf(g) {
    const v = canvas.viewportTransform;
    return g.axis === 'x' ? g.value * v[0] + v[4] : g.value * v[3] + v[5];
  },
  /** Point écran (relatif au canvas) depuis un événement souris */
  local(e) { return Viewport.eventPoint(e); },

  hit(p) {
    if (!this.visible || this.locked) return null;
    let best = null;
    this.list.forEach((g) => {
      const d = Math.abs((g.axis === 'x' ? p.x : p.y) - this.screenOf(g));
      if (d <= USER_GUIDE_HIT_PX && (!best || d < best.d)) best = { g, d };
    });
    return best?.g || null;
  },

  inRuler(p) {
    if (!Guides.prefs.rulers) return null;
    if (p.y <= RULER_PX && p.x > RULER_PX) return 'y'; // règle du haut → repère horizontal
    if (p.x <= RULER_PX && p.y > RULER_PX) return 'x'; // règle de gauche → repère vertical
    return null;
  },

  // ---------- souris (capture : Fabric ne reçoit pas le clic)
  onDown(e) {
    if (e.button !== 0 || state.spaceDown || state.cropping || Pipette?.target) return;
    const p = this.local(e);
    const fromRuler = this.inRuler(p);
    const guide = fromRuler ? null : this.hit(p);
    if (!fromRuler && !guide) return;
    if (fromRuler && this.locked) { toast('Les repères sont verrouillés (menu Repères).'); return; }
    e.preventDefault();
    e.stopImmediatePropagation();
    const g = guide || { axis: fromRuler, value: 0 };
    if (!guide) { this.list.push(g); this.visible = true; }
    this.drag = { guide: g, fresh: !guide };
    this.move(e);
    const move = (ev) => this.move(ev);
    const up = (ev) => {
      window.removeEventListener('mousemove', move, true);
      window.removeEventListener('mouseup', up, true);
      this.drop(ev);
    };
    window.addEventListener('mousemove', move, true);
    window.addEventListener('mouseup', up, true);
  },

  move(e) {
    const { guide } = this.drag;
    const scene = Viewport.toScene(this.local(e));
    let value = guide.axis === 'x' ? scene.x : scene.y;
    if (!e.altKey) value = Math.round(value); // pixels entiers (Alt : libre)
    // Maj : accroche aux bords et au centre de la page
    if (e.shiftKey) {
      const size = guide.axis === 'x' ? state.page.width : state.page.height;
      const near = [0, size / 2, size].find((c) => Math.abs(c - value) < 12 / canvas.getZoom());
      if (near !== undefined) value = near;
    }
    guide.value = value;
    canvas.requestRenderAll();
  },

  drop(e) {
    const { guide } = this.drag;
    this.drag = null;
    const p = this.local(e);
    const outside = p.x < 0 || p.y < 0 || p.x > canvas.getWidth() || p.y > canvas.getHeight();
    const onRuler = Guides.prefs.rulers && (guide.axis === 'y' ? p.y <= RULER_PX : p.x <= RULER_PX);
    if (outside || onRuler) {
      this.list = this.list.filter((g) => g !== guide);
    }
    canvas.requestRenderAll();
    History.queue();
  },

  onHover(e) {
    if (this.drag) return;
    const p = this.local(e);
    const g = (!state.spaceDown && this.hit(p)) || null;
    const ruler = this.inRuler(p);
    if (g) canvas.upperCanvasEl.style.cursor = g.axis === 'x' ? 'col-resize' : 'row-resize';
    else if (ruler && !this.locked) canvas.upperCanvasEl.style.cursor = ruler === 'x' ? 'col-resize' : 'row-resize';
  },

  // ---------- dessin
  draw({ ctx }) {
    if (state.exporting || !this.list.length || (!this.visible && !this.drag)) return;
    const w = canvas.getWidth();
    const h = canvas.getHeight();
    ctx.save();
    ctx.lineWidth = 1;
    this.list.forEach((g) => {
      const s = Math.round(this.screenOf(g)) + 0.5;
      const active = this.drag?.guide === g;
      ctx.strokeStyle = active ? '#e0457b' : USER_GUIDE_COLOR;
      ctx.globalAlpha = this.locked ? 0.55 : 0.9;
      ctx.beginPath();
      if (g.axis === 'x') { ctx.moveTo(s, 0); ctx.lineTo(s, h); } else { ctx.moveTo(0, s); ctx.lineTo(w, s); }
      ctx.stroke();
      if (active) {
        // Position affichée pendant le glisser
        const label = `${g.axis === 'x' ? 'x' : 'y'} : ${Math.round(g.value)} px`;
        ctx.globalAlpha = 1;
        ctx.font = '600 11px Inter, system-ui, sans-serif';
        const tw = ctx.measureText(label).width + 12;
        const bx = g.axis === 'x' ? s + 8 : 28;
        const by = g.axis === 'x' ? 28 : s + 8;
        ctx.fillStyle = '#c73527';
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(bx, by, tw, 20, 10) : ctx.rect(bx, by, tw, 20);
        ctx.fill();
        ctx.fillStyle = '#f68a8d';
        ctx.fillText(label, bx + 6, by + 14);
      }
    });
    ctx.restore();
  },

  // ---------- menu
  mountUI() {
    const toggles = $('.view-toggles');
    this.btn = html(`
      <button class="chip chip-icon" type="button" id="btn-guides-menu" title="Repères : glissez depuis les règles (menu)" aria-label="Repères" aria-haspopup="menu" aria-expanded="false">
        <svg viewBox="0 0 24 24" aria-hidden="true">${GUIDE_ICON}</svg>
      </button>`);
    toggles.querySelector('[data-guide="rulers"]').after(this.btn);
    this.menu = html(`
      <div class="flyout" id="guides-flyout" role="menu" aria-label="Repères" hidden>
        <div class="flyout-title">Repères</div>
        <button class="flyout-item" type="button" data-gact="show" role="menuitemcheckbox"><span>Afficher les repères</span><kbd>⌘;</kbd></button>
        <button class="flyout-item" type="button" data-gact="lock" role="menuitemcheckbox"><span>Verrouiller les repères</span><kbd>⌘⌥;</kbd></button>
        <div class="flyout-sep"></div>
        <button class="flyout-item" type="button" data-gact="h" role="menuitem"><span>Repère horizontal au centre</span></button>
        <button class="flyout-item" type="button" data-gact="v" role="menuitem"><span>Repère vertical au centre</span></button>
        <button class="flyout-item" type="button" data-gact="rulers" role="menuitem"><span>Afficher les règles pour en tracer</span></button>
        <div class="flyout-sep"></div>
        <button class="flyout-item is-danger" type="button" data-gact="clear" role="menuitem"><span>Effacer tous les repères</span></button>
        <p class="flyout-note">Glissez depuis une règle pour créer un repère, ramenez-le sur la règle pour le supprimer. Maj : accroche au centre / aux bords.</p>
      </div>`);
    document.body.appendChild(this.menu);
    this.btn.addEventListener('click', () => this.toggleMenu());
    document.addEventListener('pointerdown', (e) => {
      if (!this.menu.hidden && !e.target.closest('#guides-flyout, #btn-guides-menu')) this.toggleMenu(false);
    });
    this.menu.addEventListener('click', (e) => {
      const act = e.target.closest('[data-gact]')?.dataset.gact;
      if (!act) return;
      if (act === 'show') this.setVisible(!this.visible);
      if (act === 'lock') this.setLocked(!this.locked);
      if (act === 'h') this.add('y', state.page.height / 2);
      if (act === 'v') this.add('x', state.page.width / 2);
      if (act === 'rulers') { Guides.prefs.rulers = true; Guides.savePrefs(); $$('[data-guide="rulers"]').forEach((b) => { b.classList.add('is-active'); b.setAttribute('aria-pressed', 'true'); }); canvas.requestRenderAll(); }
      if (act === 'clear') this.clearAll();
      if (act !== 'show' && act !== 'lock') this.toggleMenu(false);
      this.refreshMenu();
    });
    this.refreshMenu();
  },

  toggleMenu(open = this.menu.hidden) {
    if (open) {
      const r = this.btn.getBoundingClientRect();
      this.menu.hidden = false;
      this.menu.style.left = `${clamp(r.right - this.menu.offsetWidth, 8, window.innerWidth - this.menu.offsetWidth - 8)}px`;
      this.menu.style.top = `${Math.max(8, r.top - this.menu.offsetHeight - 10)}px`;
      this.refreshMenu();
    } else {
      this.menu.hidden = true;
    }
    this.btn.setAttribute('aria-expanded', String(open));
  },

  refreshMenu() {
    if (!this.menu) return;
    const set = (act, on) => {
      const b = this.menu.querySelector(`[data-gact="${act}"]`);
      b.classList.toggle('is-checked', on);
      b.setAttribute('aria-checked', String(on));
    };
    set('show', this.visible);
    set('lock', this.locked);
    this.menu.querySelector('[data-gact="rulers"]').hidden = Guides.prefs.rulers;
    this.menu.querySelector('[data-gact="clear"]').disabled = !this.list.length;
    this.btn.classList.toggle('is-active', this.visible && this.list.length > 0);
  },

  setVisible(on) {
    this.visible = on;
    canvas.requestRenderAll();
    this.refreshMenu();
    toast(on ? 'Repères affichés' : 'Repères masqués');
  },
  setLocked(on) {
    this.locked = on;
    canvas.requestRenderAll();
    this.refreshMenu();
    toast(on ? 'Repères verrouillés' : 'Repères déverrouillés');
  },

  bind() {
    Doc.extras.guides = { save: () => this.save(), load: (v) => this.load(v) };
    canvas.wrapperEl.addEventListener('mousedown', (e) => this.onDown(e), true);
    canvas.on('mouse:move', (opt) => this.onHover(opt.e));
    canvas.on('after:render', (e) => this.draw(e));
    // Aimantation : les repères visibles s'ajoutent aux cibles des guides magnétiques
    Hooks.on('snapTargets', ({ xs, ys }) => {
      if (!this.visible) return;
      this.list.forEach((g) => (g.axis === 'x' ? xs : ys).push(g.value));
    });
    Hooks.on('docLoaded', () => this.refreshMenu());
    Hooks.on('change', () => this.refreshMenu());
    Keys.add((e, { mod }) => {
      if (mod && (e.key === ';' || e.code === 'Semicolon')) {
        e.preventDefault();
        if (e.altKey) this.setLocked(!this.locked);
        else this.setVisible(!this.visible);
        return true;
      }
      return false;
    });
  },
};

Hooks.on('init', () => {
  UserGuides.bind();
  UserGuides.mountUI();
});
