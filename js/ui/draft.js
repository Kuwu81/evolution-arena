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
   * Führt den Draft eines Teams durch (Mensch oder KI) und liefert das Ergebnis.
   * clock wird gebraucht, damit KI-Pausen Pause und Geschwindigkeit respektieren.
   */
  async function run(game, team, opts) {
    const o = opts || {};
    const offer = EA.phases.makeOffer(game, team);

    if (team.controller === 'ai') {
      const decision = EA.ai.decide(game, team, offer);
      const result = EA.phases.applyDraft(game, team, decision.trait, decision.mode);
      EA.audio.play(result.mode === 'mutation' ? 'mutation' : 'food');
      EA.hud.toast(
        '<b style="color:' + team.color + '">' + team.name + '</b> draftet ' + decision.trait.icon + ' ' +
        decision.trait.name + ' als ' + (result.mode === 'mutation' ? 'Mutation' : 'Nahrung'),
        result.mode === 'mutation' ? 'info' : 'good', 2000);
      if (result.target) EA.arena.fxMutation(result.target);
      if (o.clock) await o.clock.wait(760);
      return result;
    }

    if (o.handoff) await handoff(team);
    const choice = await chooseCard(game, team, offer);
    const result = EA.phases.applyDraft(game, team, choice.trait, choice.mode);
    if (result.target) EA.arena.fxMutation(result.target);
    await reveal(game, team, result);
    return result;
  }

  EA.draft = { run };
})(window);
