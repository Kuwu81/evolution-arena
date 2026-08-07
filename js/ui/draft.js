/* ============================================================
   Evolution Arena — Draft-Oberfläche
   Eine Karte, zwei Verwendungen: Mutation (Resilienz später)
   oder Nahrung (Wachstum jetzt).
   ============================================================ */
(function (global) {
  'use strict';
  const EA = global.EA;
  const U = EA.util;
  const { el } = U;
  const T = EA.traits;
  const S = EA.state;

  function envChips(game) {
    return el('div', { class: 'draft__banner-env' }, [
      el('span', { class: 'tagpill' }, '🌡️ ' + game.env.temp + ' °C'),
      el('span', { class: 'tagpill' }, '🍃 ' + Math.round(game.env.foodMod * 100) + ' %'),
      game.predationPressure ? el('span', { class: 'tagpill' }, '☠️ ' + game.predationPressure) : null
    ]);
  }

  function banner(game, team) {
    return el('div', { class: 'draft__banner', style: { '--team': team.color } }, [
      el('div', { class: 'draft__banner-dot' }, team.letter),
      el('div', {}, [
        el('div', { class: 'draft__banner-name' }, team.name),
        el('div', { class: 'draft__banner-meta' },
          'Population ' + team.individuals.length + ' · Ø ' +
          (Math.round(EA.analysis.avgTraits(team) * 10) / 10) + ' Merkmale je Individuum')
      ]),
      envChips(game)
    ]);
  }

  function cardNode(game, team, trait, index, onPick) {
    const rar = T.RARITY[trait.rarity];
    const carriers = S.traitCount(team, trait.id);
    const pop = Math.max(1, team.individuals.length);

    return el('button', {
      class: 'card',
      style: { '--rar': rar.color, '--rar-glow': U.rgba(rar.color, .22) },
      onclick: () => onPick(index),
      onmouseenter: () => EA.audio.play('hover')
    }, [
      el('div', { class: 'card__top' }, [
        el('span', { class: 'card__icon' }, trait.icon),
        el('div', {}, [
          el('div', { class: 'card__name' }, trait.name),
          el('div', { class: 'card__rarity' }, rar.icon + ' ' + rar.label)
        ]),
        el('span', { class: 'card__key' }, String(index + 1))
      ]),
      el('p', { class: 'card__desc' }, trait.desc),
      el('div', { class: 'card__stats' }, trait.pills.map(p =>
        el('span', { class: 'stat-pill' + (p[1] === '+' ? ' stat-pill--plus' : (p[1] === '−' ? ' stat-pill--minus' : '')) }, p[0])
      )),
      el('div', { class: 'card__have' },
        carriers > 0
          ? 'Bereits im Genpool: ' + carriers + '/' + pop + ' (' + Math.round(carriers / pop * 100) + ' %)'
          : 'Neu für diese Art')
    ]);
  }

  /** Übergabebildschirm bei mehreren menschlichen Teams. */
  function handoff(team) {
    return new Promise(resolve => {
      const m = EA.modal.open({
        title: 'Gerät weitergeben',
        closable: false,
        className: 'modal--slim',
        body: el('div', { class: 'handoff', style: { '--team': team.color } }, [
          el('div', { class: 'handoff__dot' }, team.letter),
          el('div', { class: 'handoff__t' }, team.name + ' ist am Zug'),
          el('div', { class: 'handoff__s' }, 'Reicht das Gerät weiter. Der Draft ist verdeckt – die anderen Teams sollen die Auswahl nicht sehen.')
        ]),
        foot: [el('button', { class: 'btn btn--primary btn--xl', onclick: () => { m.close(); resolve(); } }, 'Bereit ▸')],
        onKey: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); m.close(); resolve(); } }
      });
    });
  }

  /** Kartenwahl + Verwendung. Löst mit { trait, mode } auf. */
  function chooseCard(game, team, offer) {
    return new Promise(resolve => {
      let selected = -1;

      const cardsWrap = el('div', { class: 'cards' });
      const cards = offer.map((t, i) => cardNode(game, team, t, i, pick));
      cards.forEach(c => cardsWrap.appendChild(c));

      const hint = el('p', { class: 'draft__lead' },
        'Wähle eine der drei Zufallskarten. Erst danach entscheidest du, wie du sie einsetzt.');

      const btnMut = el('button', { class: 'use-btn use-btn--mut', disabled: true, onclick: () => confirm('mutation') }, [
        el('span', { class: 'use-btn__t' }, [el('span', {}, '🧬'), 'Als Mutation']),
        el('span', { class: 'use-btn__d' }, 'Trifft ein zufälliges Individuum – du kannst nicht bestimmen, welches. Startet bei 1 von ' + team.individuals.length + ' und muss sich erst durchsetzen. Resilienz für später.'),
        el('span', { class: 'use-btn__k' }, 'Taste M')
      ]);

      const btnFood = el('button', { class: 'use-btn use-btn--food', disabled: true, onclick: () => confirm('food') }, [
        el('span', { class: 'use-btn__t' }, [el('span', {}, '🍖'), 'Als Nahrung']),
        el('span', { class: 'use-btn__d' }, 'Füttert bis zu ' + EA.phases.BAL.foodCardFeeds + ' Träger dieses Merkmals durch: Sie werden diese Runde garantiert satt. Wachstum jetzt.'),
        el('span', { class: 'use-btn__k' }, 'Taste N')
      ]);

      const useWrap = el('div', { class: 'use-choice' }, [btnMut, btnFood]);

      const modal = EA.modal.open({
        title: 'Draft — Runde ' + game.round,
        sub: 'Mutation ist ungerichtet: Du wählst die Karte, nicht ihre Wirkung.',
        closable: false,
        className: 'modal--wide',
        body: [banner(game, team), hint, cardsWrap, useWrap],
        onKey: e => {
          const k = e.key.toLowerCase();
          if (k >= '1' && k <= '3') { e.preventDefault(); pick(parseInt(k, 10) - 1); }
          else if (k === 'm' && selected >= 0) { e.preventDefault(); confirm('mutation'); }
          else if (k === 'n' && selected >= 0) { e.preventDefault(); confirm('food'); }
        }
      });

      function pick(i) {
        if (i < 0 || i >= offer.length) return;
        selected = i;
        cards.forEach((c, j) => {
          c.classList.toggle('is-selected', j === i);
          c.classList.toggle('is-dim', j !== i);
        });
        btnMut.disabled = false;
        btnFood.disabled = false;
        const carriers = S.traitCount(team, offer[i].id);
        btnFood.querySelector('.use-btn__d').textContent = carriers > 0
          ? 'Füttert bis zu ' + Math.min(EA.phases.BAL.foodCardFeeds, carriers) + ' Träger von ' + offer[i].name + ' durch – sie werden diese Runde garantiert satt. Wachstum jetzt.'
          : 'Kein Individuum trägt ' + offer[i].name + '. Die Karte füttert stattdessen ' + EA.phases.BAL.foodCardFallback + ' zufällige Tiere durch.';
        hint.textContent = offer[i].icon + ' ' + offer[i].name + ' gewählt. Wie setzt du die Karte ein?';
        EA.audio.play('cardPick');
        // Auf schmalen Displays liegt die Verwendungswahl unterhalb der Karten.
        useWrap.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }

      function confirm(mode) {
        if (selected < 0) return;
        EA.audio.play(mode === 'mutation' ? 'mutation' : 'food');
        modal.close();
        resolve({ trait: offer[selected], mode });
      }
    });
  }

  /** Zeigt, was die Entscheidung bewirkt hat. */
  function reveal(game, team, result) {
    return new Promise(resolve => {
      const trait = result.trait;
      let body;

      if (result.mode === 'mutation' && result.target) {
        const pop = team.individuals.length;
        body = el('div', { class: 'mut-reveal' }, [
          el('div', { class: 'mut-reveal__icon' }, trait.icon),
          el('div', { class: 'mut-reveal__t' }, trait.name + ' trifft ' + result.target.label),
          el('div', { class: 'mut-reveal__s' },
            'Die Mutation wurde einem zufällig bestimmten Individuum zugewiesen – nicht dem, das sie am dringendsten bräuchte. ' +
            'Sie liegt jetzt bei ' + Math.round(100 / pop) + ' % des Genpools. Ob sie bleibt, entscheidet allein, ' +
            'ob ihre Träger satt werden und Nachkommen haben.'),
          el('span', { class: 'mut-reveal__tag' }, 'Mutation ist ungerichtet')
        ]);
      } else {
        body = el('div', { class: 'mut-reveal' }, [
          el('div', { class: 'mut-reveal__icon' }, '🍖'),
          el('div', { class: 'mut-reveal__t' }, result.fedList.length + ' Individuen werden durchgefüttert'),
          el('div', { class: 'mut-reveal__s' },
            (result.converted
              ? trait.name + ' ist bereits in der gesamten Population fixiert – als Mutation hätte die Karte nichts bewirkt und wurde zu Nahrung. '
              : '') +
            'Diese Tiere überstehen die Selektion dieser Runde garantiert und können sich fortpflanzen. ' +
            'Wachstum jetzt – dafür fehlt die Mutation, die später Resilienz gebracht hätte.'),
          el('span', { class: 'mut-reveal__tag', style: { background: 'rgba(247,184,75,.16)', color: 'var(--warn)' } }, 'Wachstum statt Resilienz')
        ]);
      }

      const m = EA.modal.open({
        title: team.name,
        sub: 'Ergebnis des Drafts',
        className: 'modal--slim',
        closable: false,
        body,
        foot: [el('button', { class: 'btn btn--primary', onclick: () => { m.close(); resolve(); } }, 'Weiter ▸')],
        onKey: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); m.close(); resolve(); } }
      });
    });
  }

  /**
   * Wartefenster, während die anderen Teams online noch wählen.
   * Der Gastgeber kann für getrennte Mitspielende übernehmen – sonst
   * würde eine geschlossene Registerkarte die ganze Runde blockieren.
   */
  function waitForOthers(room, game, pendingTeams, offers) {
    const list = el('div', { class: 'wait-list' });
    const note = el('p', { class: 'field__hint' });
    let takeoverBtn = null;

    const render = missingIds => {
      list.innerHTML = '';
      for (const team of pendingTeams) {
        const done = missingIds.indexOf(team.id) === -1;
        list.appendChild(el('div', { class: 'wait-list__row' + (done ? ' is-done' : '') }, [
          el('span', { class: 'swatch', style: { background: team.color } }, team.letter),
          el('span', { class: 'wait-list__name' }, team.name),
          done
            ? el('span', { class: 'tagpill tagpill--good' }, '✓ gewählt')
            : el('span', { class: 'wait-list__pending' }, [el('span', { class: 'spinner' }), 'wählt …'])
        ]));
      }
      note.textContent = missingIds.length === 1
        ? 'Noch ein Team entscheidet.'
        : 'Noch ' + missingIds.length + ' Teams entscheiden.';
      if (takeoverBtn) {
        const offline = missingIds.filter(id => isOffline(room, game, id));
        takeoverBtn.disabled = missingIds.length === 0;
        takeoverBtn.hidden = !missingIds.length;
        takeoverBtn.querySelector('.wait-take__d').textContent = offline.length
          ? offline.length + ' der wartenden Teams sind getrennt.'
          : 'Alle sind verbunden – noch kurz Geduld.';
      }
    };

    const foot = [];
    if (room.isHost) {
      takeoverBtn = el('button', { class: 'btn btn--sm', onclick: () => forceAll() }, [
        el('span', {}, '⏭ Wartende überspringen'),
        el('span', { class: 'wait-take__d' }, '')
      ]);
      takeoverBtn.classList.add('wait-take');
      foot.push(takeoverBtn);
    }

    /** Ersatzentscheidung ohne Zufall – jedes Gerät käme auf dasselbe Ergebnis. */
    function forceAll() {
      for (const team of pendingTeams) {
        if (room.hasDraft(game.round, team.id)) continue;
        const offer = offers.get(team);
        room.publishDraft(game.round, team.id, offer[0].id, 'mutation', true);
      }
    }

    // Getrennte Mitspielende nach einer Schonfrist automatisch übernehmen.
    let autoTimer = 0;
    if (room.isHost) {
      autoTimer = setInterval(() => {
        // Ist der Raum zu, gibt es nichts mehr zu übernehmen.
        if (room.status !== 'open') { clearInterval(autoTimer); return; }
        for (const team of pendingTeams) {
          if (room.hasDraft(game.round, team.id)) continue;
          if (!isOffline(room, game, team.id)) continue;
          const offer = offers.get(team);
          room.publishDraft(game.round, team.id, offer[0].id, 'mutation', true);
        }
      }, 4000);
    }

    const m = EA.modal.open({
      title: 'Gleichzeitiger Draft',
      sub: 'Alle Arten wählen zur selben Zeit – niemand sieht die Karten der anderen.',
      closable: false,
      className: 'modal--slim',
      body: [list, note],
      foot
    });

    const ids = pendingTeams.map(t => t.id);
    return room.awaitDrafts(game.round, ids, render).then(() => {
      clearInterval(autoTimer);
      m.close();
    });
  }

  function isOffline(room, game, teamId) {
    const team = game.teams.find(t => t.id === teamId);
    if (!team || !team.playerId) return false;
    const p = room.players.find(x => x.id === team.playerId);
    return !p || !p.online;
  }

  /**
   * Führt den Draft eines Teams durch und liefert das Ergebnis.
   *
   * Das Angebot wird übergeben, nicht hier gezogen: Im Onlinemodus müssen
   * alle Angebote einer Runde vorab und in Teamreihenfolge aus game.rng
   * kommen, sonst laufen die Geräte auseinander.
   *
   * opts.choice  vorentschieden ({ trait, mode }) – aus dem Netz oder Verlauf
   * opts.handoff Übergabebildschirm (Hotseat mit mehreren Menschen)
   * opts.reveal  Auflösung zeigen, obwohl die Wahl schon feststeht (eigenes
   *              Team online: der Dialog erklärt „Mutation ist ungerichtet“)
   * opts.clock   für Pausen, die Pause und Geschwindigkeit respektieren
   */
  async function run(game, team, offer, opts) {
    const o = opts || {};
    let choice = o.choice || null;
    // Fremde Züge nur kurz einblenden – die eigene Wahl wird aufgelöst.
    let narrate = !!choice && !o.reveal;

    if (!choice && team.controller === 'ai') {
      const decision = EA.ai.decide(game, team, offer);
      choice = { trait: decision.trait, mode: decision.mode };
      narrate = true;
    }

    if (!choice) {
      if (o.handoff) await handoff(team);
      choice = await chooseCard(game, team, offer);
      narrate = false;
    }

    const result = EA.phases.applyDraft(game, team, choice.trait, choice.mode);
    if (result.target) EA.arena.fxMutation(result.target);

    if (narrate) {
      EA.audio.play(result.mode === 'mutation' ? 'mutation' : 'food');
      EA.hud.toast(
        '<b style="color:' + team.color + '">' + team.name + '</b> draftet ' + choice.trait.icon + ' ' +
        choice.trait.name + ' als ' + (result.mode === 'mutation' ? 'Mutation' : 'Nahrung') +
        (choice.auto ? ' <i>(automatisch)</i>' : ''),
        result.mode === 'mutation' ? 'info' : 'good', 2000);
      if (o.clock) await o.clock.wait(o.brisk ? 480 : 760);
      return result;
    }

    await reveal(game, team, result);
    return result;
  }

  EA.draft = { run, chooseCard, reveal, handoff, waitForOthers };
})(window);
