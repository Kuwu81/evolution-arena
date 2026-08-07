/* ============================================================
   Evolution Arena — Anwendungssteuerung
   Bildschirme, Setup, Rundenablauf, Eingaben, Render-Schleife.
   ============================================================ */
(function (global) {
  'use strict';
  const EA = global.EA;
  const U = EA.util;
  const { $, $$, el, clamp } = U;

  EA.bus = U.Emitter();

  const App = {
    clock: U.Clock(),
    game: null,
    screen: 'menu',
    auto: false,
    runToken: 0,
    advanceResolve: null,
    setup: {
      teamCount: 3,
      rounds: 10,
      pack: 'basis',
      startPop: 6,
      seed: '',
      teams: []
    },

    /* ============================================================
       Start
       ============================================================ */
    boot() {
      EA.hud.mount();
      EA.endscreen.mount();
      EA.arena.init($('#arena'), $('#arena-overlay'), $('#arena-wrap'));

      this.buildSetupTeams();
      this.bindGlobal();
      this.bindMenu();
      this.bindSetup();
      this.bindGameControls();

      EA.bus.on('log', e => { if (this.screen === 'game') EA.hud.appendLog(e); });

      const soundOn = EA.audio.enabled;
      $('#btn-sound').textContent = soundOn ? '🔊' : '🔇';
      $('#btn-sound').classList.toggle('is-on', soundOn);

      this.clock.start();
      this.loop(performance.now());
    },

    /* ---------- Render-Schleife (nur Darstellung, keine Spiellogik) ---------- */
    loop(now) {
      const dt = Math.min(50, now - (this._last || now));
      this._last = now;
      if (this.screen === 'game') {
        EA.arena.update(dt);
        EA.arena.draw();
      }
      requestAnimationFrame(t => this.loop(t));
    },

    /* ============================================================
       Bildschirme
       ============================================================ */
    show(name) {
      this.screen = name;
      $$('.screen').forEach(s => {
        const active = s.dataset.screen === name;
        s.classList.toggle('is-active', active);
        if (active) {
          s.classList.remove('is-entering');
          void s.offsetWidth;
          s.classList.add('is-entering');
        }
      });
      // Direkt messen: der ResizeObserver feuert erst zum nächsten Frame,
      // bis dahin hätte das Layout keine gültige Canvasgröße.
      if (name === 'game') EA.arena.resize();
    },

    /* ============================================================
       Globale Eingaben
       ============================================================ */
    bindGlobal() {
      // Audio darf erst nach einer Nutzergeste starten.
      const unlock = () => { EA.audio.unlock(); document.removeEventListener('pointerdown', unlock); };
      document.addEventListener('pointerdown', unlock);

      document.addEventListener('click', e => {
        const btn = e.target.closest && e.target.closest('.btn, .seg__btn, .stepper__btn, .panel-tabs__btn');
        if (btn && !btn.disabled) EA.audio.play('click');
      }, true);

      document.addEventListener('keydown', e => {
        if (EA.modal.stackSize > 0) return;                     // Modals behandeln ihre Tasten selbst
        const tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

        if (e.key === 'Escape' && this.screen === 'game') { e.preventDefault(); this.pause(); return; }
        if (this.screen !== 'game') return;

        const k = e.key.toLowerCase();
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.tryAdvance(); }
        else if (k === 'a') { e.preventDefault(); this.toggleAuto(); }
        else if (k === 's') { e.preventDefault(); this.toggleSound(); }
      });
    },

    /* ============================================================
       Menü
       ============================================================ */
    bindMenu() {
      $$('[data-action="goto-setup"]').forEach(b => b.addEventListener('click', () => this.show('setup')));
      $$('[data-action="back-to-menu"]').forEach(b => b.addEventListener('click', () => {
        this.abortGame();
        this.show('menu');
      }));
      $$('[data-action="open-rules"]').forEach(b => b.addEventListener('click', () => EA.modal.rules()));
      $$('[data-action="open-glossary"]').forEach(b => b.addEventListener('click', () => EA.modal.glossary(this.setup.pack)));
    },

    /* ============================================================
       Setup
       ============================================================ */
    buildSetupTeams() {
      const colors = EA.names.TEAM_COLORS;
      const rng = U.Rng(Date.now() & 0xffff);
      const names = EA.names.speciesNames(rng, 6);
      this.setup.teams = colors.map((c, i) => ({
        name: names[i],
        color: c.hex,
        controller: i === 0 ? 'human' : 'ai'
      }));
      this.renderTeamRows();
    },

    renderTeamRows() {
      const host = $('#team-rows');
      host.innerHTML = '';
      for (let i = 0; i < this.setup.teamCount; i++) {
        const t = this.setup.teams[i];
        const input = el('input', {
          class: 'input', type: 'text', value: t.name, maxlength: '22',
          'aria-label': 'Artname Team ' + (i + 1),
          oninput: e => { t.name = e.target.value; }
        });
        const mkBtn = (mode, label) => el('button', {
          class: t.controller === mode ? 'is-active' : '',
          onclick: e => {
            t.controller = mode;
            e.target.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('is-active', b === e.target));
          }
        }, label);

        host.appendChild(el('div', { class: 'team-row', style: { animationDelay: (i * 0.04) + 's' } }, [
          el('span', { class: 'swatch', style: { background: t.color } }, String.fromCharCode(65 + i)),
          input,
          el('div', { class: 'ctrl-toggle' }, [mkBtn('human', 'Mensch'), mkBtn('ai', 'KI')])
        ]));
      }
      $('#out-teamcount').textContent = String(this.setup.teamCount);
      $('[data-action="teams-dec"]').disabled = this.setup.teamCount <= 2;
      $('[data-action="teams-inc"]').disabled = this.setup.teamCount >= 6;
    },

    bindSetup() {
      $('[data-action="teams-dec"]').addEventListener('click', () => {
        this.setup.teamCount = clamp(this.setup.teamCount - 1, 2, 6);
        this.renderTeamRows();
      });
      $('[data-action="teams-inc"]').addEventListener('click', () => {
        this.setup.teamCount = clamp(this.setup.teamCount + 1, 2, 6);
        this.renderTeamRows();
      });
      $('[data-action="reroll-names"]').addEventListener('click', () => {
        const rng = U.Rng(Date.now() & 0xffffff);
        const names = EA.names.speciesNames(rng, 6);
        this.setup.teams.forEach((t, i) => { t.name = names[i]; });
        this.renderTeamRows();
      });

      const seg = (id, key, cast) => {
        $$('#' + id + ' .seg__btn').forEach(btn => btn.addEventListener('click', () => {
          $$('#' + id + ' .seg__btn').forEach(b => b.classList.toggle('is-active', b === btn));
          this.setup[key] = cast ? cast(btn.dataset.value) : btn.dataset.value;
        }));
      };
      seg('seg-rounds', 'rounds', Number);
      seg('seg-pack', 'pack');
      seg('seg-startpop', 'startPop', Number);

      $('#inp-seed').addEventListener('input', e => { this.setup.seed = e.target.value.trim(); });
      $('[data-action="start-game"]').addEventListener('click', () => this.startGame());
    },

    /* ============================================================
       Spielsteuerung
       ============================================================ */
    bindGameControls() {
      $('#btn-advance').addEventListener('click', () => this.tryAdvance());
      $('[data-action="pause"]').addEventListener('click', () => this.pause());
      $('#btn-auto').addEventListener('click', () => this.toggleAuto());
      $('#btn-sound').addEventListener('click', () => this.toggleSound());

      $$('#seg-speed .seg__btn').forEach(btn => btn.addEventListener('click', () => {
        $$('#seg-speed .seg__btn').forEach(b => b.classList.toggle('is-active', b === btn));
        this.clock.speed = Number(btn.dataset.value);
      }));

      $$('#panel-tabs .panel-tabs__btn').forEach(btn => btn.addEventListener('click', () => {
        $$('#panel-tabs .panel-tabs__btn').forEach(b => b.classList.toggle('is-active', b === btn));
        $('.game-grid').dataset.view = btn.dataset.target;
        if (btn.dataset.target === 'arena') EA.arena.resize();
      }));

      $('[data-action="clear-filter"]').addEventListener('click', () => {
        EA.hud.elLog.scrollTop = EA.hud.elLog.scrollHeight;
      });

      $('[data-action="export-log"]').addEventListener('click', () => EA.endscreen.exportLog());
      $('[data-action="rematch"]').addEventListener('click', () => this.startGame());
    },

    toggleAuto() {
      this.auto = !this.auto;
      const btn = $('#btn-auto');
      btn.classList.toggle('is-on', this.auto);
      btn.textContent = this.auto ? '⏸ Auto' : '▶ Auto';
      if (this.auto) this.tryAdvance();
    },

    toggleSound() {
      const on = !EA.audio.enabled;
      EA.audio.setEnabled(on);
      $('#btn-sound').textContent = on ? '🔊' : '🔇';
      $('#btn-sound').classList.toggle('is-on', on);
      if (on) { EA.audio.unlock(); EA.audio.startMusic(); }
    },

    pause() {
      if (EA.modal.stackSize > 0) return;
      this.clock.paused = true;
      const m = EA.modal.open({
        title: 'Pause',
        sub: 'Runde ' + this.game.round + ' von ' + this.game.rounds + ' · Seed ' + this.game.seed,
        closable: false,
        className: 'modal--slim',
        body: el('div', { class: 'pause-actions' }, [
          el('button', { class: 'btn btn--primary btn--xl', onclick: () => close() }, U.iconLabel('▶', 'Weiterspielen')),
          el('button', { class: 'btn', onclick: () => EA.modal.rules() }, U.iconLabel('📖', 'Regeln & Biologie')),
          el('button', { class: 'btn', onclick: () => EA.modal.glossary(this.game.pack) }, U.iconLabel('🧬', 'Merkmals-Lexikon')),
          el('button', {
            class: 'btn', onclick: () => {
              EA.audio.setMusic(!EA.audio.musicEnabled);
              EA.hud.toast('Musik ' + (EA.audio.musicEnabled ? 'an' : 'aus'), 'info', 1400);
            }
          }, U.iconLabel('🎵', 'Musik an/aus')),
          el('button', {
            class: 'btn btn--danger', onclick: () => {
              close();
              this.abortGame();
              this.show('menu');
            }
          }, U.iconLabel('✕', 'Partie beenden'))
        ])
      });
      const close = () => { m.close(); this.clock.paused = false; };
    },

    /* ============================================================
       Partie
       ============================================================ */
    startGame() {
      this.abortGame();
      const seedNum = parseInt(this.setup.seed, 10);
      const game = EA.state.createGame({
        seed: isNaN(seedNum) ? null : seedNum,
        pack: this.setup.pack,
        rounds: this.setup.rounds,
        startPop: this.setup.startPop,
        teams: this.setup.teams.slice(0, this.setup.teamCount).map(t => ({
          name: t.name, color: t.color, controller: t.controller
        }))
      });
      this.game = game;
      EA.state.refreshStats(game);

      this.show('game');
      EA.hud.setGame(game);
      EA.arena.setGame(game);
      EA.audio.unlock();
      EA.audio.startMusic();

      this.auto = false;
      $('#btn-auto').classList.remove('is-on');
      $('#btn-auto').textContent = '▶ Auto';

      const token = ++this.runToken;
      this.runGame(token);
    },

    abortGame() {
      this.runToken++;
      this.clock.paused = false;
      this.clock.flush();
      if (this.advanceResolve) { const r = this.advanceResolve; this.advanceResolve = null; r(); }
      EA.modal.closeAll();
      EA.audio.stopMusic();
    },

    alive(token) { return token === this.runToken; },

    /** Wartet auf „Weiter“ – oder läuft im Auto-Modus selbstständig durch. */
    gate(label, token) {
      if (!this.alive(token)) return Promise.resolve();
      if (this.auto) {
        EA.hud.setAdvance(label, false);
        return this.clock.wait(520);
      }
      EA.hud.setAdvance(label, true);
      return new Promise(resolve => { this.advanceResolve = resolve; });
    },

    tryAdvance() {
      if (this.advanceResolve) {
        const r = this.advanceResolve;
        this.advanceResolve = null;
        EA.hud.setAdvance('…', false);
        EA.audio.play('phase');
        r();
      }
    },

    async runGame(token) {
      const game = this.game;
      for (let r = 1; r <= game.rounds; r++) {
        if (!this.alive(token)) return;
        game.round = r;
        await this.runRound(token);
      }
      if (!this.alive(token)) return;
      this.finish();
    },

    async runRound(token) {
      const game = this.game;
      const C = this.clock;
      const hud = EA.hud;
      const arena = EA.arena;

      hud.markPopulations();
      hud.renderRound();

      /* ---------- Phase 0: Ereigniskarte ---------- */
      game.phase = 0;
      hud.setPhase(0);
      hud.clearBanner();
      await this.gate('Ereigniskarte aufdecken ▸', token);
      if (!this.alive(token)) return;

      const ev = EA.phases.phaseEvent(game);
      EA.audio.play(ev.card.kind === 'random' ? 'catastrophe' : 'cardDeal');
      hud.renderEvent(ev);
      hud.renderEnv();
      hud.banner(ev.card.icon + ' ' + ev.card.name, ev.card.kind === 'random' ? 'ungerichtet · Gendrift' : 'gerichtet · Selektion');
      arena.flash(U.rgba(ev.card.color, .5), 800);

      if (ev.killFrac > 0) {
        arena.shake(20);
        for (const v of ev.victims) arena.fxDeath(v.ind, v.team, 'drift');
        hud.toast('<b>' + ev.victims.length + '</b> Individuen sterben zufällig – kein Merkmal schützt', 'bad', 2600);
      }
      arena.layout();
      hud.renderTeams();
      hud.renderGenepool();
      hud.renderCombos();
      await C.wait(1100);
      hud.clearBanner();

      /* ---------- Phase 1: Draft ---------- */
      game.phase = 1;
      hud.setPhase(1);
      await this.gate('Draft starten ▸', token);
      if (!this.alive(token)) return;

      const humanTeams = game.teams.filter(t => t.controller === 'human' && t.individuals.length > 0);
      for (const team of game.teams) {
        if (!this.alive(token)) return;
        if (!team.individuals.length) continue;
        await EA.draft.run(game, team, { handoff: humanTeams.length > 1, clock: C });
        if (!this.alive(token)) return;
        EA.state.refreshStats(game);
        hud.renderTeams();
        hud.renderGenepool();
        hud.renderCombos();
      }

      /* ---------- Phase 2: Wasserloch ---------- */
      game.phase = 2;
      hud.setPhase(2);
      await this.gate('Ans Wasserloch ▸', token);
      if (!this.alive(token)) return;

      const feeding = EA.phases.phaseFeeding(game);
      hud.renderEnv();
      await this.animateFeeding(feeding, token);
      if (!this.alive(token)) return;

      /* ---------- Phase 3: Selektion ---------- */
      game.phase = 3;
      hud.setPhase(3);
      await this.gate('Selektion auflösen ▸', token);
      if (!this.alive(token)) return;

      const selection = EA.phases.phaseSelection(game);
      arena.setMode('idle');
      for (const d of selection.deaths) arena.fxDeath(d.ind, d.team, d.cause);
      if (selection.deaths.length) {
        EA.audio.play('death');
        arena.shake(Math.min(14, selection.deaths.length));
      }
      if (selection.extinctions.length) {
        EA.audio.play('extinct');
        for (const t of selection.extinctions) {
          hud.toast('<b style="color:' + t.color + '">Aussterben</b> – der Genpool ist verloren', 'bad', 3200);
        }
      }
      arena.layout();
      hud.renderTeams();
      hud.renderGenepool();
      hud.renderCombos();
      await C.wait(950);

      /* ---------- Phase 4: Vermehrung ---------- */
      game.phase = 4;
      hud.setPhase(4);
      await this.gate('Vermehrung ▸', token);
      if (!this.alive(token)) return;

      const repro = EA.phases.phaseReproduction(game);
      arena.layout();
      const step = repro.births.length ? Math.min(70, 1300 / repro.births.length) : 0;
      for (const b of repro.births) {
        if (!this.alive(token)) return;
        arena.fxBirth(b.ind, b.team);
        EA.audio.play('birth', { rate: 0.9 + Math.random() * 0.4, minGap: 0.04 });
        await C.wait(step);
      }
      if (repro.newCombos.length) {
        for (const c of repro.newCombos) {
          hud.toast('✨ <b style="color:' + c.team.color + '">' + c.team.name + '</b>: Kombi „' + c.combo.name + '“ durch Rekombination', 'good', 3200);
        }
      }

      EA.phases.endRound(game);
      EA.phases.recordRound(game, feeding, selection, repro);
      EA.state.refreshStats(game);
      arena.layout();
      hud.renderAll();
      await C.wait(600);
    },

    async animateFeeding(feeding, token) {
      const C = this.clock;
      const arena = EA.arena;
      const game = this.game;

      for (const team of game.teams) for (const ind of team.individuals) ind.fedRevealed = false;
      arena.setMode('feeding');
      await C.wait(700);
      if (!this.alive(token)) return;

      // Jagd zuerst – Koevolution wird sichtbar, bevor gefressen wird.
      const hunts = feeding.hunts.filter(h => h.prey);
      if (hunts.length) {
        const stepH = Math.min(190, 1500 / hunts.length);
        for (const h of hunts) {
          if (!this.alive(token)) return;
          arena.fxHunt(h.hunter.ind, h.prey.ind, h.success);
          EA.audio.play('hunt', { minGap: 0.05 });
          if (h.success) arena.floatText(h.prey.ind.x, h.prey.ind.y - 12, '−1', '#ff6a5a');
          await C.wait(stepH);
        }
      }

      // Fressen in der Reihenfolge, die die Merkmale bestimmt haben.
      const drinkers = feeding.order.filter(o => o.got > 0.01);
      const stepD = drinkers.length ? Math.min(65, 1600 / drinkers.length) : 0;
      for (const d of drinkers) {
        if (!this.alive(token)) return;
        arena.fxDrink(d.ind);
        d.ind.fedRevealed = true;
        EA.audio.play('drink', { rate: 0.8 + Math.random() * 0.6, minGap: 0.045 });
        await C.wait(stepD);
      }
      for (const team of game.teams) for (const ind of team.individuals) ind.fedRevealed = true;

      const hungry = feeding.totalCount - feeding.fedCount;
      EA.hud.toast(
        '💧 <b>' + feeding.fedCount + '</b> satt · <b>' + hungry + '</b> gehen leer aus',
        hungry > feeding.fedCount ? 'bad' : 'info', 2600);
      await C.wait(550);
    },

    finish() {
      const game = this.game;
      game.finished = true;
      EA.hud.setPhase(-1);
      EA.audio.play('victory');
      EA.audio.stopMusic();
      EA.endscreen.show(game);
      this.show('end');
      EA.endscreen.drawCharts();
    }
  };

  EA.app = App;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.boot());
  } else {
    App.boot();
  }
})(window);
