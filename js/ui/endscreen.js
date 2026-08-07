/* ============================================================
   Evolution Arena — Abschlussbildschirm
   Podium, Verlaufsdiagramme, Replay-Log und die Reflexion,
   die aus den Rundendaten „Warum X → Y?“ beantwortet.
   ============================================================ */
(function (global) {
  'use strict';
  const EA = global.EA;
  const U = EA.util;
  const { $, el } = U;
  const T = EA.traits;

  const End = {
    game: null,
    chartTeam: null,

    mount() {
      this.elPodium = $('#end-podium');
      this.elReflect = $('#reflect-list');
      this.elLogFull = $('#log-full');
      this.selChart = $('#sel-chart-team');

      U.$$('#end-tabs .seg__btn').forEach(btn => {
        btn.addEventListener('click', () => {
          U.$$('#end-tabs .seg__btn').forEach(b => b.classList.toggle('is-active', b === btn));
          U.$$('.end__pane').forEach(p => p.classList.toggle('is-active', p.dataset.pane === btn.dataset.value));
          EA.audio.play('click');
          if (btn.dataset.value === 'charts') this.drawCharts();
        });
      });

      this.selChart.addEventListener('change', () => {
        this.chartTeam = this.selChart.value;
        this.drawGeneChart();
      });

      global.addEventListener('resize', () => {
        if ($('#screen-end').classList.contains('is-active')) this.drawCharts();
      });
    },

    show(game) {
      this.game = game;
      const rank = EA.analysis.ranking(game);
      const winner = rank[0];

      $('#out-end-rounds').textContent = game.rounds;
      $('#out-winner').innerHTML = winner.individuals.length
        ? '<span style="color:' + winner.color + '">' + U.escapeHtml(winner.name) + '</span> gewinnt'
        : 'Keine Art hat überlebt';

      this.renderPodium(rank);
      this.renderReflections();
      this.renderLog();

      this.selChart.innerHTML = '';
      for (const t of game.teams) this.selChart.appendChild(el('option', { value: t.id }, t.name));
      this.chartTeam = winner.id;
      this.selChart.value = winner.id;

      // Standardmäßig auf der Reflexion starten – das ist das Hauptziel.
      U.$$('#end-tabs .seg__btn').forEach(b => b.classList.toggle('is-active', b.dataset.value === 'reflect'));
      U.$$('.end__pane').forEach(p => p.classList.toggle('is-active', p.dataset.pane === 'reflect'));
    },

    renderPodium(rank) {
      const max = Math.max(1, rank[0].individuals.length);
      this.elPodium.innerHTML = '';
      rank.forEach((team, i) => {
        const sum = EA.analysis.teamSummary(team);
        const fill = el('span', { class: 'podium-row__fill' });
        const row = el('div', {
          class: 'podium-row' + (i === 0 ? ' podium-row--1' : ''),
          style: { '--team': team.color, animationDelay: (i * 0.08) + 's' }
        }, [
          el('span', { class: 'podium-row__rank' }, String(i + 1)),
          el('span', { class: 'podium-row__dot' }, team.letter),
          el('div', { class: 'podium-row__body' }, [
            el('div', { class: 'podium-row__name' }, team.name +
              (team.controller === 'ai' ? ' · KI' : '') +
              (team.extinctions ? ' · ' + team.extinctions + '× ausgestorben' : '')),
            el('div', { class: 'podium-row__traits' },
              sum.top.length
                ? sum.top.map(t => (T.BY_ID[t.id] ? T.BY_ID[t.id].icon + ' ' + Math.round(t.pct * 100) + '%' : '')).join('  ·  ')
                : 'kein Merkmal im Genpool'),
            el('div', { class: 'podium-row__bar' }, [fill])
          ]),
          el('span', { class: 'podium-row__pop' }, String(team.individuals.length))
        ]);
        this.elPodium.appendChild(row);
        setTimeout(() => { fill.style.width = (team.individuals.length / max * 100) + '%'; }, 120 + i * 90);
      });
    },

    renderReflections() {
      const items = EA.analysis.reflections(this.game);
      this.elReflect.innerHTML = '';
      items.forEach((r, i) => {
        this.elReflect.appendChild(el('div', {
          class: 'reflect-card reflect-card--' + r.kind,
          style: { animationDelay: (i * 0.06) + 's' }
        }, [
          el('div', { class: 'reflect-card__q' }, [el('i', {}, '❓'), r.q]),
          el('p', { class: 'reflect-card__a', html: r.a }),
          el('span', { class: 'reflect-card__tag' }, r.tag)
        ]));
      });
    },

    renderLog() {
      this.elLogFull.innerHTML = '';
      let round = -1;
      for (const e of this.game.log) {
        if (e.round !== round) {
          round = e.round;
          this.elLogFull.appendChild(el('div', { class: 'log-round' }, 'Runde ' + round));
        }
        this.elLogFull.appendChild(el('div', {
          class: 'log-entry' + (e.kind ? ' log-entry--' + e.kind : '') + (e.teamId ? ' log-entry--team' : ''),
          style: e.color ? { '--team': e.color } : null
        }, [
          el('span', { class: 'log-entry__i' }, e.icon),
          el('span', { html: e.text })
        ]));
      }
    },

    drawCharts() {
      this.drawPopChart();
      this.drawGeneChart();
    },

    catastropheMarkers() {
      return this.game.roundData
        .filter(r => r.event && r.event.kind === 'random' && r.event.victims > 0)
        .map(r => ({ x: r.round, label: r.event.icon, color: '#ff6a5a' }));
    },

    drawPopChart() {
      const game = this.game;
      const rounds = game.teams[0].history.map(h => h.round);
      const series = game.teams.map(t => ({
        label: t.name,
        color: t.color,
        values: t.history.map(h => h.pop)
      }));
      EA.charts.lineChart($('#chart-pop'), series, {
        xLabels: rounds.map(r => r === 0 ? 'Start' : 'R' + r),
        markers: this.catastropheMarkers()
      });
      EA.charts.legend($('#legend-pop'), series);
    },

    drawGeneChart() {
      const team = this.game.teams.filter(t => t.id === this.chartTeam)[0] || this.game.teams[0];
      const rounds = team.history.map(h => h.round);

      // Die sechs Merkmale mit dem größten Ausschlag zeigen – sonst wird es unlesbar.
      const scores = T.TRAITS.map(t => {
        let max = 0, min = 1, seen = false;
        for (const h of team.history) {
          const v = h.traits[t.id] || 0;
          if (v > 0) seen = true;
          max = Math.max(max, v); min = Math.min(min, v);
        }
        return { trait: t, span: seen ? max : 0, max };
      }).filter(s => s.max > 0.05).sort((a, b) => b.max - a.max).slice(0, 6);

      const palette = ['#4fe0a6', '#60a5fa', '#fbbf24', '#c084fc', '#fb7185', '#22d3ee'];
      const series = scores.map((s, i) => ({
        label: s.trait.icon + ' ' + s.trait.name,
        color: palette[i % palette.length],
        values: team.history.map(h => (h.traits[s.trait.id] || 0) * 100)
      }));

      EA.charts.lineChart($('#chart-genes'), series, {
        xLabels: rounds.map(r => r === 0 ? 'Start' : 'R' + r),
        yMax: 100,
        yTicks: 4,
        yFormat: v => Math.round(v) + '%',
        markers: this.catastropheMarkers()
      });
      EA.charts.legend($('#legend-genes'), series);
    },

    /** Replay-Log als Textdatei – für die Auswertung im Unterricht. */
    exportLog() {
      const game = this.game;
      const lines = [];
      const strip = s => String(s).replace(/<[^>]*>/g, '');

      lines.push('EVOLUTION ARENA — Replay-Log');
      lines.push('Seed: ' + game.seed + ' · Pack: ' + game.pack + ' · Runden: ' + game.rounds);
      lines.push('Teams: ' + game.teams.map(t => t.name + ' (' + t.individuals.length + ')').join(', '));
      lines.push('='.repeat(64));

      let round = -1;
      for (const e of game.log) {
        if (e.round !== round) { round = e.round; lines.push('', '--- RUNDE ' + round + ' ---'); }
        lines.push('  ' + e.icon + ' ' + strip(e.text));
      }

      lines.push('', '='.repeat(64), 'ENDSTAND');
      EA.analysis.ranking(game).forEach((t, i) => {
        const s = EA.analysis.teamSummary(t);
        lines.push('  ' + (i + 1) + '. ' + t.name + ' — Population ' + t.individuals.length +
          ' (Maximum ' + s.peak + ', Ø ' + (Math.round(s.avgTraits * 10) / 10) + ' Merkmale, ' +
          s.totals.mutations + ' Mutationen, ' + s.totals.foodCards + ' Nahrungskarten)');
        lines.push('     Genpool: ' + (s.top.length
          ? s.top.map(x => (T.BY_ID[x.id] ? T.BY_ID[x.id].name : x.id) + ' ' + Math.round(x.pct * 100) + '%').join(', ')
          : '—'));
      });

      lines.push('', '='.repeat(64), 'REFLEXION — Warum X → Y?');
      for (const r of EA.analysis.reflections(game)) {
        lines.push('', '  [' + r.tag + '] ' + r.q);
        lines.push('  ' + strip(r.a));
      }

      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: 'evolution-arena-log-' + game.seed + '.txt' });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
  };

  EA.endscreen = End;
})(window);
