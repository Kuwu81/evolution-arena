/* ============================================================
   Evolution Arena — HUD, Seitenpanels, Log
   ============================================================ */
(function (global) {
  'use strict';
  const EA = global.EA;
  const U = EA.util;
  const { $, el, clamp } = U;
  const T = EA.traits;
  const G = EA.genetics;

  const PHASE_INFO = [
    { name: 'Ereigniskarte', hint: 'Zu Rundenbeginn ändert sich ein Umweltparameter für alle Teams.' },
    { name: 'Draft', hint: '3 Karten, 1 Wahl: Mutation (Resilienz später) oder Nahrung (Wachstum jetzt).' },
    { name: 'Wasserloch', hint: 'Alle fressen gleichzeitig am zu kleinen Vorrat. Merkmale entscheiden.' },
    { name: 'Selektion', hint: 'Satte überleben, Hungrige sterben. Population 0 bedeutet Aussterben.' },
    { name: 'Vermehrung', hint: 'Satte Eltern erzeugen Nachkommen; Merkmale werden gemischt vererbt.' }
  ];

  const Hud = {
    game: null,
    selectedTeam: null,
    _logRound: -1,
    _lastPop: Object.create(null),

    mount() {
      this.elTeams = $('#team-list');
      this.elGene = $('#genepool');
      this.elCombos = $('#combo-list');
      this.elEvent = $('#event-slot');
      this.elLog = $('#log');
      this.elToasts = $('#toast-stack');
      this.elBanner = $('#arena-banner');
      this.selGene = $('#sel-genepool-team');

      this.selGene.addEventListener('change', () => {
        this.selectedTeam = this.selGene.value;
        this.renderGenepool();
        this.renderCombos();
      });
    },

    setGame(game) {
      this.game = game;
      this.selectedTeam = (game.teams.filter(t => t.controller === 'human')[0] || game.teams[0]).id;
      this._logRound = -1;
      this._lastPop = Object.create(null);
      this.elLog.innerHTML = '';
      this.elEvent.innerHTML = '';
      $('#out-rounds').textContent = game.rounds;
      this.fillTeamSelect();
      this.renderAll();
    },

    fillTeamSelect() {
      this.selGene.innerHTML = '';
      for (const t of this.game.teams) {
        this.selGene.appendChild(el('option', { value: t.id }, t.name));
      }
      this.selGene.value = this.selectedTeam;
    },

    /** Nach dem Aussterben bekommt ein Team einen neuen Artnamen. */
    syncTeamSelect() {
      const options = this.selGene.options;
      for (let i = 0; i < options.length && i < this.game.teams.length; i++) {
        const name = this.game.teams[i].name;
        if (options[i].textContent !== name) options[i].textContent = name;
      }
    },

    renderAll() {
      this.renderRound();
      this.renderEnv();
      this.renderTeams();
      this.renderGenepool();
      this.renderCombos();
    },

    renderRound() {
      $('#out-round').textContent = Math.max(1, this.game.round);
    },

    renderEnv() {
      const env = this.game.env;
      const tempEl = $('#chip-temp'), foodEl = $('#chip-food'), predEl = $('#chip-pred');
      const tempVal = $('#out-temp'), foodVal = $('#out-food'), predVal = $('#out-pred');

      const bump = (node, next, current) => {
        if (current !== next) {
          node.classList.remove('is-bump');
          void node.offsetWidth;
          node.classList.add('is-bump');
        }
      };

      bump(tempEl, env.temp + '°', tempVal.textContent);
      tempVal.textContent = env.temp + '°';
      tempEl.classList.toggle('is-cold', env.temp < 14);
      tempEl.classList.toggle('is-hot', env.temp > 26);

      const foodTxt = Math.round(env.foodMod * 100) + '%';
      bump(foodEl, foodTxt, foodVal.textContent);
      foodVal.textContent = foodTxt;
      foodEl.classList.toggle('is-low', env.foodMod < 0.85);
      foodEl.classList.toggle('is-high', env.foodMod > 1.15);

      predVal.textContent = String(this.game.predationPressure);
      predEl.classList.toggle('is-low', this.game.predationPressure > 0);
    },

    renderTeams() {
      const frag = document.createDocumentFragment();
      for (const team of this.game.teams) {
        const pop = team.individuals.length;
        const prev = this._lastPop[team.id];
        const delta = prev === undefined ? 0 : pop - prev;
        const deltaCls = delta > 0 ? 'delta-up' : (delta < 0 ? 'delta-down' : 'delta-flat');
        const deltaTxt = delta === 0 ? '±0' : (delta > 0 ? '+' + delta : String(delta));

        const node = el('div', {
          class: 'team-item' + (team.id === this.selectedTeam ? ' is-selected' : '') + (pop === 0 ? ' is-extinct' : ''),
          style: { '--team': team.color },
          onclick: () => {
            this.selectedTeam = team.id;
            this.selGene.value = team.id;
            this.renderTeams();
            this.renderGenepool();
            this.renderCombos();
            EA.audio.play('hover');
          }
        }, [
          el('div', { class: 'team-item__dot' }, team.letter),
          el('div', { class: 'team-item__body' }, [
            el('div', { class: 'team-item__name' }, team.name),
            el('div', { class: 'team-item__meta' }, [
              team.controller === 'ai' ? el('span', { class: 'team-item__ai' }, 'KI') : null,
              el('span', {}, 'Ø ' + (Math.round(EA.analysis.avgTraits(team) * 10) / 10) + ' Merkmale'),
              team.extinctions ? el('span', { title: 'Aussterbe-Ereignisse' }, '⚰️' + team.extinctions) : null
            ])
          ]),
          el('div', { class: 'team-item__pop' }, [
            el('b', {}, String(pop)),
            el('span', { class: 'team-item__delta ' + deltaCls }, deltaTxt)
          ])
        ]);
        frag.appendChild(node);
      }
      this.elTeams.innerHTML = '';
      this.elTeams.appendChild(frag);
      this.syncTeamSelect();
    },

    /** Populationsstände für die Delta-Anzeige einfrieren. */
    markPopulations() {
      for (const team of this.game.teams) this._lastPop[team.id] = team.individuals.length;
    },

    currentTeam() {
      return this.game.teams.filter(t => t.id === this.selectedTeam)[0] || this.game.teams[0];
    },

    renderGenepool() {
      const team = this.currentTeam();
      if (!team) return;
      const pool = G.genePool(team.individuals);
      this.elGene.innerHTML = '';

      if (!pool.length) {
        this.elGene.appendChild(el('p', { class: 'genepool__empty' },
          team.individuals.length ? 'Noch keine Merkmale im Genpool – reine Ausgangsform.' : 'Population ausgestorben.'));
        return;
      }

      const hist = team.history;
      const prev = hist.length > 1 ? hist[hist.length - 2].traits : {};

      for (const entry of pool) {
        const trait = T.BY_ID[entry.id];
        if (!trait) continue;
        const was = prev[entry.id] || 0;
        const diff = entry.pct - was;
        const diffTxt = Math.abs(diff) < 0.005 ? '' : (diff > 0 ? '▲' : '▼') + Math.round(Math.abs(diff) * 100);

        this.elGene.appendChild(el('div', {
          class: 'gene-row' + (Math.abs(diff) > 0.02 ? ' is-changed' : ''),
          style: { '--team': team.color },
          title: trait.name + ' · ' + trait.desc
        }, [
          el('span', { class: 'gene-row__i' }, trait.icon),
          el('div', { class: 'gene-row__bar' }, [
            el('div', { class: 'gene-row__fill', style: { width: (entry.pct * 100) + '%' } }),
            el('span', { class: 'gene-row__label' }, trait.name)
          ]),
          el('span', { class: 'gene-row__pct' }, [
            Math.round(entry.pct * 100) + '%',
            diffTxt ? el('i', { style: { color: diff > 0 ? 'var(--acc)' : 'var(--danger)' } }, diffTxt) : null
          ])
        ]));
      }
    },

    renderCombos() {
      const team = this.currentTeam();
      this.elCombos.innerHTML = '';
      if (!team) return;
      const combos = G.activeCombos(team.individuals);
      if (!combos.length) {
        this.elCombos.appendChild(el('p', { class: 'combo-list__empty' },
          'Noch keine Kombination. Kombi-Effekte entstehen nur, wenn die Vererbung zwei Merkmale in einem Tier zusammenführt.'));
        return;
      }
      for (const c of combos) {
        this.elCombos.appendChild(el('div', { class: 'combo-item' }, [
          el('span', { class: 'combo-item__i' }, c.combo.need.map(id => T.BY_ID[id].icon).join('')),
          el('div', {}, [
            el('div', { class: 'combo-item__t' }, c.combo.name),
            el('div', { class: 'combo-item__d' }, c.combo.desc),
            el('div', { class: 'combo-item__n' }, c.count + '× in der Population')
          ])
        ]));
      }
    },

    renderEvent(applied) {
      const card = applied.card;
      this.elEvent.innerHTML = '';
      this.elEvent.appendChild(el('div', {
        class: 'event-card',
        style: { '--evc': U.rgba(card.color, .55) }
      }, [
        el('div', { class: 'event-card__top' }, [
          el('span', { class: 'event-card__icon' }, card.icon),
          el('span', { class: 'event-card__title' }, card.name),
          el('span', { class: 'event-card__kind ' + (card.kind === 'random' ? 'kind-random' : 'kind-directed') },
            card.kind === 'random' ? 'ungerichtet' : 'gerichtet')
        ]),
        el('p', { class: 'event-card__text' }, card.text),
        applied.deltas.length ? el('div', { class: 'event-card__delta' },
          applied.deltas.map(d => el('span', { class: 'tagpill' }, d.icon + ' ' + d.text))) : null
      ]));
    },

    /* ---------- Log ---------- */
    appendLog(entry) {
      if (entry.round !== this._logRound) {
        this._logRound = entry.round;
        this.elLog.appendChild(el('div', { class: 'log-round' }, 'Runde ' + entry.round));
      }
      const cls = 'log-entry' +
        (entry.kind ? ' log-entry--' + entry.kind : '') +
        (entry.teamId ? ' log-entry--team' : '');
      const node = el('div', { class: cls, style: entry.color ? { '--team': entry.color } : null }, [
        el('span', { class: 'log-entry__i' }, entry.icon),
        el('span', { html: entry.text })
      ]);
      this.elLog.appendChild(node);
      this.elLog.scrollTop = this.elLog.scrollHeight;

      // Speicher schonen: sehr alte Einträge aus dem DOM entfernen (Log bleibt vollständig im State).
      while (this.elLog.children.length > 400) this.elLog.removeChild(this.elLog.firstChild);
    },

    /* ---------- Rückmeldungen ---------- */
    toast(text, kind, ms) {
      const node = el('div', { class: 'toast toast--' + (kind || 'info'), html: text });
      this.elToasts.appendChild(node);
      setTimeout(() => {
        node.classList.add('is-out');
        setTimeout(() => node.remove(), 320);
      }, ms || 2200);
    },

    banner(title, sub) {
      this.elBanner.innerHTML = '';
      this.elBanner.classList.remove('is-out');
      this.elBanner.appendChild(el('div', { class: 'arena-banner__t' }, title));
      if (sub) this.elBanner.appendChild(el('div', { class: 'arena-banner__s' }, sub));
    },

    clearBanner() {
      if (!this.elBanner.children.length) return;
      this.elBanner.classList.add('is-out');
      setTimeout(() => { this.elBanner.innerHTML = ''; this.elBanner.classList.remove('is-out'); }, 350);
    },

    setPhase(idx) {
      const info = PHASE_INFO[idx] || { name: '—', hint: '' };
      $('#out-phase').textContent = info.name;
      $('#out-hint').textContent = info.hint;
      U.$$('.phase-chip').forEach((chip, i) => {
        chip.classList.toggle('is-active', i === idx);
        chip.classList.toggle('is-done', i < idx);
      });
    },

    setHint(text) { $('#out-hint').textContent = text; },

    setAdvance(label, enabled) {
      const btn = $('#btn-advance');
      btn.textContent = label;
      btn.disabled = !enabled;
    }
  };

  EA.hud = Hud;
  EA.hud.PHASE_INFO = PHASE_INFO;
})(window);
