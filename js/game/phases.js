/* ============================================================
   Evolution Arena — Rundenphasen

   0 Ereigniskarte  → Umweltparameter ändern (bzw. Gendrift)
   1 Draft          → Mutation ODER Nahrung
   2 Wasserloch     → gleichzeitiges Fressen, Prädation, Aas
   3 Selektion      → Satte überleben, Hungrige sterben
   4 Vermehrung     → Rekombination, Überproduktion

   Die Funktionen mutieren den Spielzustand und liefern ein
   Ergebnisobjekt zurück, das die Präsentationsschicht animiert.
   ============================================================ */
(function (global) {
  'use strict';
  const EA = global.EA;
  const { clamp } = EA.util;
  const S = EA.state;
  const G = EA.genetics;
  const T = EA.traits;

  /* ---------- Balancing-Konstanten ---------- */
  const BAL = {
    capacityPerTeam: 4.2,       // Grundvorrat des Wasserlochs je Team
    capacityGrowth: 0.15,       // langsames Wachstum über die Runden
    nightShare: 0.38,           // Anteil des Nachtvorrats
    nichePerHead: 1.0,          // garantierte Nischennahrung je Isolations-Träger
    carrionPerDeath: 0.38,
    carrionMaxMeal: 0.7,
    huntYield: 1.6,
    huntFailYield: 0.15,
    huntBase: 0.44,
    huntSpread: 0.18,
    huntPreyPerHunter: 3,       // Beutetiere je Jäger für vollen Jagderfolg
    warnCallPenalty: 0.15,
    warnCallTargetWeight: 0.6,
    injuryChance: 0.22,
    priorityJitter: 1.2,        // Zufall in der Fresswarteschlange = Drift am Wasserloch
    pairOffspring: 1.6,
    soloOffspring: 0.7,
    rearingBase: 0.85,
    respawnPop: 3,
    foodCardFeeds: 5,
    foodCardFallback: 2,
    speciationCarriers: 3,
    speciationPop: 9,
    convergenceThreshold: 0.55
  };

  /* ============================================================
     Phase 0 — Ereigniskarte
     ============================================================ */
  function phaseEvent(game) {
    const card = game.deck.draw(game.round);
    const applied = EA.events.applyCard(card, game.env, game.rng);
    game.currentEvent = applied;

    S.log(game, {
      icon: card.icon,
      text: '<b>' + card.name + '</b> — ' + card.text,
      kind: 'key'
    });
    for (const d of applied.deltas) {
      S.log(game, { icon: d.icon, text: d.text });
    }

    applied.victims = [];
    if (applied.killFrac > 0) {
      applied.victims = applyDrift(game, applied.killFrac);
      S.log(game, {
        icon: '☠️',
        text: '<b>' + applied.victims.length + '</b> Individuen sterben – <b>unabhängig von jedem Merkmal</b>. Das ist Gendrift, keine Selektion.',
        kind: 'bad'
      });
    }

    S.refreshStats(game);
    return applied;
  }

  /** Katastrophe: trifft jedes Individuum mit gleicher Wahrscheinlichkeit. */
  function applyDrift(game, frac) {
    const victims = [];
    for (const team of game.teams) {
      const survivors = [];
      for (const ind of team.individuals) {
        if (game.rng.chance(frac)) {
          ind.vis.state = 'dying';
          victims.push({ ind, team, cause: 'drift' });
        } else survivors.push(ind);
      }
      const lost = team.individuals.length - survivors.length;
      team.totals.drift += lost;
      team.individuals = survivors;
      if (lost > 0) {
        S.log(game, {
          icon: '💀', teamId: team.id, color: team.color, kind: 'team',
          text: '<b>' + team.name + '</b> verliert <span class="num">' + lost + '</span> Individuen durch Zufall.'
        });
      }
    }
    game.carrion += victims.length * BAL.carrionPerDeath;
    return victims;
  }

  /* ============================================================
     Phase 1 — Draft
     ============================================================ */

  /** Drei Zufallskarten – gewichtet nach Seltenheit, ohne Dubletten. */
  function makeOffer(game, team) {
    const deck = T.deckFor(game.pack);
    const offer = [];
    const taken = Object.create(null);
    let guard = 0;
    while (offer.length < 3 && guard++ < 200) {
      const t = game.rng.weighted(deck, x => T.RARITY[x.rarity].weight);
      if (taken[t.id]) continue;
      taken[t.id] = true;
      offer.push(t);
    }
    return offer;
  }

  /**
   * Wendet die Draft-Entscheidung an.
   * mode 'mutation': trifft EIN zufälliges Individuum (Anti-Lamarck).
   * mode 'food':     füttert Träger des Merkmals durch (Wachstum jetzt).
   */
  function applyDraft(game, team, trait, mode) {
    const res = { team, trait, mode, target: null, fedList: [], converted: false };

    if (mode === 'mutation') {
      const candidates = team.individuals.filter(i => i.traits.indexOf(trait.id) === -1);
      if (candidates.length === 0) {
        // Merkmal bereits fixiert – die Karte wird notgedrungen zu Nahrung.
        res.converted = true;
        res.mode = 'food';
        S.log(game, {
          icon: '↩️', teamId: team.id, color: team.color, kind: 'team',
          text: '<b>' + team.name + '</b>: ' + trait.icon + ' ' + trait.name + ' ist bereits in der ganzen Population fixiert – die Karte wird als Nahrung verwertet.'
        });
        return applyFood(game, team, trait, res);
      }
      const target = game.rng.pick(candidates);
      target.traits.push(trait.id);
      target.vis.state = 'mutating';
      target.vis.t = 0;
      res.target = target;
      team.totals.mutations++;
      team.draftHistory.push({ round: game.round, traitId: trait.id, mode: 'mutation' });

      S.log(game, {
        icon: trait.icon, teamId: team.id, color: team.color, kind: 'key',
        text: '<b>' + team.name + '</b>: Mutation ' + trait.icon + ' <b>' + trait.name +
              '</b> trifft zufällig Individuum <span class="num">' + target.label + '</span> — ' +
              '<span class="num">1/' + team.individuals.length + '</span> der Population. Ob sie sich durchsetzt, entscheidet die Selektion.'
      });
      return res;
    }

    return applyFood(game, team, trait, res);
  }

  function applyFood(game, team, trait, res) {
    const carriers = team.individuals.filter(i => i.traits.indexOf(trait.id) !== -1);
    let fedList;
    if (carriers.length > 0) {
      fedList = game.rng.shuffle(carriers.slice()).slice(0, BAL.foodCardFeeds);
    } else {
      fedList = game.rng.shuffle(team.individuals.slice()).slice(0, BAL.foodCardFallback);
    }
    for (const ind of fedList) { ind.guaranteed = true; ind.vis.state = 'boosted'; ind.vis.t = 0; }
    res.mode = 'food';
    res.fedList = fedList;
    team.totals.foodCards++;
    team.draftHistory.push({ round: game.round, traitId: trait.id, mode: 'food' });

    S.log(game, {
      icon: '🍖', teamId: team.id, color: team.color, kind: 'team',
      text: '<b>' + team.name + '</b> verwertet ' + trait.icon + ' ' + trait.name + ' als Nahrung: <span class="num">' +
            fedList.length + '</span> ' + (carriers.length ? 'Träger werden' : 'Individuen werden') +
            ' diese Runde satt – Wachstum jetzt statt Resilienz später.'
    });
    return res;
  }

  /* ============================================================
     Phase 2 — Wasserloch-Feeding
     ============================================================ */
  function phaseFeeding(game) {
    S.refreshStats(game);
    const rng = game.rng;
    const teams = S.aliveTeams(game);
    const teamCount = Math.max(1, teams.length);

    const capacity = (teamCount * (BAL.capacityPerTeam + game.round * BAL.capacityGrowth)) * game.env.foodMod;
    const result = {
      capacity,
      dayPool: capacity,
      nightPool: capacity * BAL.nightShare,
      hunts: [],
      order: [],
      carrionStart: game.carrion,
      fedCount: 0,
      totalCount: 0
    };

    const all = [];
    for (const team of teams) {
      for (const ind of team.individuals) {
        ind.intake = ind.stats.bonusFood;
        ind.fed = false;
        ind.dead = null;
        all.push({ ind, team });
      }
    }
    result.totalCount = all.length;

    /* --- 2a Prädation: Fleischfresser jagen andere Arten --- */
    const hunters = all.filter(e => e.ind.stats.lane === 'meat' && !e.ind.guaranteed);
    rng.shuffle(hunters);
    hunters.sort((a, b) => b.ind.stats.attack - a.ind.stats.attack);
    game.predationPressure = all.filter(e => e.ind.stats.lane === 'meat').length;

    // Räuber-Beute-Rückkopplung: Je mehr Jäger auf je weniger Beute kommen,
    // desto wachsamer ist die Beute und desto seltener gelingt die Jagd.
    const preyCount = all.filter(e => e.ind.stats.lane !== 'meat').length;
    const crowding = hunters.length
      ? clamp(preyCount / (hunters.length * BAL.huntPreyPerHunter), 0.3, 1)
      : 1;
    result.crowding = crowding;

    for (const hunter of hunters) {
      if (hunter.ind.dead) continue;
      const prey = pickPrey(game, hunter, all);
      if (!prey) {
        // Keine Beute erreichbar – der Jäger geht leer aus.
        result.hunts.push({ hunter, prey: null, success: false, reason: 'noprey' });
        continue;
      }
      const warned = teamHasWarnCall(prey.team);
      let p = BAL.huntBase + (hunter.ind.stats.attack - prey.ind.stats.defense) * BAL.huntSpread;
      if (warned) p -= BAL.warnCallPenalty;
      p = clamp(p * crowding, 0.04, 0.9);

      const success = rng.chance(p);
      const hunt = { hunter, prey, success, p, warned, injured: false };

      if (success) {
        prey.ind.dead = 'predated';
        prey.team.totals.predated++;
        hunter.team.totals.hunted++;
        hunter.ind.intake += BAL.huntYield;
        game.carrion += BAL.carrionPerDeath;
      } else {
        hunter.ind.intake += BAL.huntFailYield;
        if (prey.ind.stats.defense > 1.2 && rng.chance(BAL.injuryChance)) {
          hunter.ind.dead = 'injured';
          hunter.ind.intake = 0;
          hunt.injured = true;
          game.carrion += BAL.carrionPerDeath;
        }
      }
      result.hunts.push(hunt);
    }

    const killedByHunt = result.hunts.filter(h => h.success).length;
    const injured = result.hunts.filter(h => h.injured).length;
    if (result.hunts.length) {
      S.log(game, {
        icon: '🥩',
        text: 'Räuberdruck: <span class="num">' + result.hunts.length + '</span> Jagdversuche, <b>' +
              killedByHunt + '</b> erfolgreich' + (injured ? ', <span class="num">' + injured + '</span> Jäger tödlich verletzt' : '') + '.' +
              (crowding < 0.7 ? ' Die Beute wird knapp – die Jagd gelingt seltener.' : ''),
        kind: killedByHunt ? 'bad' : null
      });
    }

    // Erlegte Tiere fressen nicht mehr mit.
    const living = all.filter(e => !e.ind.dead);

    /* --- 2b Aasfresser: Kadaver der Vorrunde + frische Risse --- */
    let carrionPool = game.carrion;
    const scavengers = rng.shuffle(living.filter(e => e.ind.stats.scavenge));
    for (const e of scavengers) {
      if (carrionPool <= 0.01) break;
      const want = Math.min(BAL.carrionMaxMeal, e.ind.stats.need - e.ind.intake);
      if (want <= 0) continue;
      const take = Math.min(want, carrionPool);
      carrionPool -= take;
      e.ind.intake += take;
    }
    result.carrionUsed = game.carrion - carrionPool;
    game.carrion = 0; // Kadaver verwesen bis zur nächsten Runde neu

    /* --- 2c Nischen (Isolation): eigener, sicherer Vorrat je Team --- */
    for (const team of teams) {
      const nicheFolk = living.filter(e => e.team === team && e.ind.stats.lane === 'niche');
      if (!nicheFolk.length) continue;
      let pool = nicheFolk.length * BAL.nichePerHead;
      for (const e of sortByPriority(nicheFolk, rng)) {
        if (pool <= 0) break;
        const take = Math.min(e.ind.stats.need - e.ind.intake, pool);
        if (take <= 0) continue;
        pool -= take;
        e.ind.intake += take;
      }
    }

    /* --- 2d Wasserloch: Tag- und Nachtschicht --- */
    const lanes = [
      { key: 'day',   pool: result.dayPool,   folk: living.filter(e => e.ind.stats.lane === 'day') },
      { key: 'night', pool: result.nightPool, folk: living.filter(e => e.ind.stats.lane === 'night') }
    ];
    result.lanes = {};
    for (const lane of lanes) {
      let pool = lane.pool;
      const queue = sortByPriority(lane.folk, rng);
      for (const e of queue) {
        const missing = e.ind.stats.need - e.ind.intake;
        if (missing <= 0) continue;
        if (e.ind.guaranteed) continue;           // durchgefüttert per Nahrungskarte
        const take = Math.min(missing, Math.max(0, pool));
        pool -= take;
        e.ind.intake += take;
        result.order.push({ ind: e.ind, team: e.team, got: take, need: e.ind.stats.need });
      }
      result.lanes[lane.key] = { total: lane.pool, left: Math.max(0, pool), eaters: lane.folk.length };
    }

    /* --- 2e Bilanz --- */
    for (const e of living) {
      e.ind.fed = e.ind.guaranteed || e.ind.intake >= e.ind.stats.need - 1e-6;
      if (e.ind.fed) result.fedCount++;
    }

    result.traitAdvantage = measureTraitAdvantage(living);

    S.log(game, {
      icon: '💧',
      text: 'Wasserloch: <span class="num">' + Math.round(capacity * 10) / 10 + '</span> Einheiten für <span class="num">' +
            result.totalCount + '</span> Individuen. <b>' + result.fedCount + '</b> werden satt.',
      kind: null
    });

    return result;
  }

  function sortByPriority(entries, rng) {
    return entries
      .map(e => ({ e, k: e.ind.stats.priority + rng.range(0, BAL.priorityJitter) }))
      .sort((a, b) => b.k - a.k)
      .map(x => x.e);
  }

  function teamHasWarnCall(team) {
    for (const ind of team.individuals) if (ind.stats && ind.stats.warns) return true;
    return false;
  }

  function pickPrey(game, hunter, all) {
    const options = all.filter(e =>
      e.team !== hunter.team && !e.ind.dead && e.ind.stats.lane !== 'meat'
    );
    if (!options.length) return null;
    return game.rng.weighted(options, e => {
      let w = e.ind.stats.preyWeight;
      if (teamHasWarnCall(e.team)) w *= BAL.warnCallTargetWeight;
      return w;
    });
  }

  /**
   * Differentieller Fütterungserfolg je Merkmal – die Datengrundlage
   * für die spätere Frage „Warum stieg X von A % auf B %?“.
   */
  function measureTraitAdvantage(living) {
    const map = Object.create(null);
    for (const t of T.TRAITS) map[t.id] = { carriers: 0, carriersFed: 0, others: 0, othersFed: 0 };
    for (const e of living) {
      const fed = e.ind.fed ? 1 : 0;
      for (const t of T.TRAITS) {
        const m = map[t.id];
        if (e.ind.traits.indexOf(t.id) !== -1) { m.carriers++; m.carriersFed += fed; }
        else { m.others++; m.othersFed += fed; }
      }
    }
    for (const id in map) {
      const m = map[id];
      m.rateCarriers = m.carriers ? m.carriersFed / m.carriers : null;
      m.rateOthers = m.others ? m.othersFed / m.others : null;
      m.edge = (m.rateCarriers !== null && m.rateOthers !== null) ? m.rateCarriers - m.rateOthers : null;
    }
    return map;
  }

  /* ============================================================
     Phase 3 — Selektion
     ============================================================ */
  function phaseSelection(game) {
    const result = { deaths: [], byTeam: {}, extinctions: [] };

    for (const team of game.teams) {
      const survivors = [];
      let starved = 0, predated = 0;
      for (const ind of team.individuals) {
        if (ind.dead) {
          predated++;
          ind.vis.state = 'dying';
          result.deaths.push({ ind, team, cause: ind.dead });
        } else if (!ind.fed) {
          starved++;
          ind.vis.state = 'dying';
          result.deaths.push({ ind, team, cause: 'starved' });
        } else {
          ind.guaranteed = false;
          ind.age++;
          survivors.push(ind);
        }
      }
      team.totals.starved += starved;
      team.individuals = survivors;
      result.byTeam[team.id] = { starved, predated, survived: survivors.length };

      if (starved || predated) {
        S.log(game, {
          icon: '☠️', teamId: team.id, color: team.color, kind: 'team',
          text: '<b>' + team.name + '</b>: <span class="num">' + starved + '</span> verhungert' +
                (predated ? ', <span class="num">' + predated + '</span> erlegt' : '') +
                ' — <span class="num">' + survivors.length + '</span> satte Überlebende.'
        });
      }
    }

    // Aussterben und Wiedergründung
    for (const team of game.teams) {
      if (team.individuals.length === 0 && team.extinctions >= 0) {
        result.extinctions.push(team);
        respawn(game, team);
      }
    }

    game.carrion += result.deaths.length * BAL.carrionPerDeath;
    return result;
  }

  function respawn(game, team) {
    team.extinctions++;
    const previous = team.name;
    if (game.round >= game.rounds) {
      S.log(game, {
        icon: '⚰️', teamId: team.id, color: team.color, kind: 'bad',
        text: '<b>' + previous + '</b> stirbt in der Schlussrunde aus. Population 0.'
      });
      return;
    }
    team.name = EA.names.successorName(game.rng, previous);
    team.lineages = { A: { id: 'A', name: team.name } };
    team.speciated = false;

    const starters = T.starterPool(game.pack);
    for (let i = 0; i < BAL.respawnPop; i++) {
      const traits = game.rng.chance(0.6) ? [game.rng.pick(starters).id] : [];
      team.individuals.push(S.createIndividual(team, traits, game.round));
    }

    S.log(game, {
      icon: '⚰️', teamId: team.id, color: team.color, kind: 'key',
      text: '<b>' + previous + '</b> ist ausgestorben. Der Genpool ist unwiederbringlich verloren – ' +
            'eine neue Art <b>' + team.name + '</b> besiedelt die Nische mit <span class="num">' + BAL.respawnPop + '</span> Individuen.'
    });
  }

  /* ============================================================
     Phase 4 — Vermehrung & Vererbung
     ============================================================ */
  function phaseReproduction(game) {
    const rng = game.rng;
    const result = { births: [], byTeam: {}, spontaneous: [], newCombos: [] };

    for (const team of game.teams) {
      if (!team.individuals.length) { result.byTeam[team.id] = { born: 0, lost: 0 }; continue; }

      const combosBefore = new Set(G.activeCombos(team.individuals).map(c => c.combo.id));
      const ctx = S.teamCtx(game, team);
      for (const ind of team.individuals) ind.stats = G.derive(ind, ctx);

      const offspring = [];
      let lost = 0;

      // Isolation unterbindet den Genfluss: Linien pflanzen sich getrennt fort.
      const byLineage = Object.create(null);
      for (const ind of team.individuals) {
        (byLineage[ind.lineage] = byLineage[ind.lineage] || []).push(ind);
      }

      for (const lin in byLineage) {
        const parents = rng.shuffle(byLineage[lin].slice());
        for (let i = 0; i < parents.length; i += 2) {
          const a = parents[i], b = parents[i + 1] || null;
          const fert = b
            ? BAL.pairOffspring + (a.stats.fertility + b.stats.fertility) / 2
            : BAL.soloOffspring + a.stats.fertility / 2;
          const n = rng.stochasticRound(Math.max(0, fert));
          const rearing = clamp(BAL.rearingBase + (b ? (a.stats.rearing + b.stats.rearing) / 2 : a.stats.rearing), 0.1, 1);

          for (let k = 0; k < n; k++) {
            if (team.individuals.length + offspring.length >= S.MAX_POP_PER_TEAM) break;
            if (!rng.chance(rearing)) { lost++; continue; }
            const traits = G.recombine(a, b, rng);
            const spont = G.maybeSpontaneous(traits, rng, game.pack);
            const child = S.createIndividual(team, traits, game.round, lin);
            child.vis.state = 'born';
            child.vis.scale = 0;
            child.parents = b ? [a.label, b.label] : [a.label];
            offspring.push(child);
            result.births.push({ ind: child, team });
            if (spont) result.spontaneous.push({ team, ind: child, trait: spont });
          }
        }
      }

      team.individuals = team.individuals.concat(offspring);
      team.totals.born += offspring.length;
      result.byTeam[team.id] = { born: offspring.length, lost };

      if (offspring.length || lost) {
        S.log(game, {
          icon: '🥚', teamId: team.id, color: team.color, kind: 'team',
          text: '<b>' + team.name + '</b>: <span class="num">' + offspring.length + '</span> Nachkommen' +
                (lost ? ', <span class="num">' + lost + '</span> nicht durchgekommen' : '') +
                ' — Population <span class="num">' + team.individuals.length + '</span>.'
        });
      }

      for (const s of result.spontaneous) {
        if (s.team !== team) continue;
        S.log(game, {
          icon: '🧬', teamId: team.id, color: team.color, kind: 'key',
          text: '<b>' + team.name + '</b>: Spontanmutation ' + s.trait.icon + ' <b>' + s.trait.name +
                '</b> bei einem Neugeborenen — ohne Draft, rein zufällig.'
        });
      }

      // Neue Kombis entstehen ausschließlich durch Rekombination.
      const combosAfter = G.activeCombos(team.individuals);
      for (const c of combosAfter) {
        if (combosBefore.has(c.combo.id)) continue;
        result.newCombos.push({ team, combo: c.combo, count: c.count });
        game.comboEvents.push({ round: game.round, teamId: team.id, teamName: team.name, comboId: c.combo.id });
        S.log(game, {
          icon: '✨', teamId: team.id, color: team.color, kind: 'key',
          text: '<b>' + team.name + '</b>: Kombi-Effekt <b>' + c.combo.name + '</b> (' +
                c.combo.need.map(id => T.BY_ID[id].icon).join('+') + ') entsteht durch Rekombination bei der Fortpflanzung. ' +
                c.combo.desc
        });
      }
    }

    return result;
  }

  /* ============================================================
     Rundenabschluss — Artbildung, Konvergenz, Schnappschuss
     ============================================================ */
  function endRound(game) {
    const notes = [];

    if (game.pack === 'advanced') {
      for (const team of game.teams) {
        if (team.speciated || team.individuals.length < BAL.speciationPop) continue;
        const isolated = team.individuals.filter(i => i.traits.indexOf('isolation') !== -1);
        if (isolated.length < BAL.speciationCarriers) continue;

        const daughterName = EA.names.successorName(game.rng, team.name);
        team.speciated = true;
        team.lineages.B = { id: 'B', name: daughterName };
        for (const ind of isolated) ind.lineage = 'B';

        notes.push({ type: 'speciation', team });
        S.log(game, {
          icon: '🏝️', teamId: team.id, color: team.color, kind: 'key',
          text: '<b>Artbildung:</b> <span class="num">' + isolated.length + '</span> isolierte Individuen von <b>' + team.name +
                '</b> spalten sich als Tochterlinie <b>' + daughterName + '</b> ab. ' +
                'Ab jetzt kein Genfluss mehr zwischen den Linien — die Genpools driften auseinander.'
        });
      }

      // Divergenz zwischen den Linien messbar machen
      for (const team of game.teams) {
        if (!team.speciated) continue;
        const A = team.individuals.filter(i => i.lineage === 'A');
        const B = team.individuals.filter(i => i.lineage === 'B');
        if (A.length < 2 || B.length < 2) continue;
        const div = G.divergence(A, B);
        if (div.maxDiff >= 0.45 && div.maxId) {
          const tr = T.BY_ID[div.maxId];
          const key = 'div-' + team.id + '-' + div.maxId;
          if (!game.convergenceSeen[key]) {
            game.convergenceSeen[key] = true;
            S.log(game, {
              icon: '↔️', teamId: team.id, color: team.color, kind: 'key',
              text: '<b>Divergenz:</b> Die Linien von <b>' + team.name + '</b> unterscheiden sich bei ' +
                    tr.icon + ' ' + tr.name + ' um <span class="num">' + Math.round(div.maxDiff * 100) + ' %-Punkte</span>.'
            });
          }
        }
      }
    }

    S.snapshot(game);
    detectConvergence(game);
    return notes;
  }

  /** Unabhängige Gleichentwicklung: gleiche Antwort, getrennte Genpools. */
  function detectConvergence(game) {
    const teams = S.aliveTeams(game);
    if (teams.length < 2) return;
    for (const t of T.TRAITS) {
      const risers = teams.filter(team => {
        const h = team.history;
        const now = h[h.length - 1].traits[t.id] || 0;
        const start = (h[0] && h[0].traits[t.id]) || 0;
        return now >= BAL.convergenceThreshold && now - start >= 0.35;
      });
      if (risers.length < 2) continue;
      const key = 'conv-' + t.id + '-' + risers.map(r => r.id).sort().join('');
      if (game.convergenceSeen[key]) continue;
      game.convergenceSeen[key] = true;
      S.log(game, {
        icon: '🔁', kind: 'key',
        text: '<b>Konvergenz:</b> ' + risers.map(r => r.name).join(' und ') + ' haben <b>unabhängig voneinander</b> ' +
              t.icon + ' ' + t.name + ' angereichert. Gleicher Selektionsdruck, gleiche Antwort — ohne gemeinsamen Genfluss.'
      });
    }
  }

  /** Runden-Kennzahlen für Diagramme und Reflexion sichern. */
  function recordRound(game, feeding, selection, reproduction) {
    const byTeam = {};
    for (const team of game.teams) {
      const sel = selection.byTeam[team.id] || { starved: 0, predated: 0, survived: 0 };
      const rep = reproduction.byTeam[team.id] || { born: 0, lost: 0 };
      byTeam[team.id] = {
        pop: team.individuals.length,
        starved: sel.starved, predated: sel.predated,
        born: rep.born, lostOffspring: rep.lost,
        extinctions: team.extinctions
      };
    }
    game.roundData.push({
      round: game.round,
      event: game.currentEvent ? {
        id: game.currentEvent.card.id,
        name: game.currentEvent.card.name,
        icon: game.currentEvent.card.icon,
        kind: game.currentEvent.card.kind,
        killFrac: game.currentEvent.killFrac,
        victims: game.currentEvent.victims ? game.currentEvent.victims.length : 0
      } : null,
      temp: game.env.temp,
      foodMod: game.env.foodMod,
      capacity: feeding.capacity,
      fed: feeding.fedCount,
      present: feeding.totalCount,
      hunts: feeding.hunts.length,
      kills: feeding.hunts.filter(h => h.success).length,
      predationPressure: game.predationPressure,
      traitAdvantage: feeding.traitAdvantage,
      byTeam
    });
  }

  EA.phases = {
    BAL,
    phaseEvent, applyDrift,
    makeOffer, applyDraft,
    phaseFeeding,
    phaseSelection,
    phaseReproduction,
    endRound, recordRound
  };
})(window);
