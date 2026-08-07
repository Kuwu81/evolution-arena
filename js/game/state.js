/* ============================================================
   Evolution Arena — Spielzustand
   Einzige Quelle der Wahrheit; alle Phasen mutieren ausschließlich
   dieses Objekt und schreiben ihre Begründung in den Log.
   ============================================================ */
(function (global) {
  'use strict';
  const EA = global.EA;
  const { Rng } = EA.util;
  const G = EA.genetics;

  const MAX_POP_PER_TEAM = 60;   // reines Sicherheitsventil – begrenzend ist das Wasserloch

  let indSeq = 0;

  function createIndividual(team, traits, round, lineage) {
    return {
      id: ++indSeq,
      label: '#' + indSeq,
      teamId: team.id,
      traits: traits.slice(),
      lineage: lineage || 'A',
      bornRound: round,
      age: 0,
      fed: false,
      guaranteed: false,
      stats: null,
      // Darstellung
      seed: Math.random() * 1000,
      x: 0, y: 0, tx: 0, ty: 0,
      vis: { scale: 0, alpha: 1, state: 'idle', t: 0 }
    };
  }

  function createTeam(index, config, rng, pack) {
    const team = {
      id: 'T' + (index + 1),
      index,
      name: config.name,
      color: config.color,
      controller: config.controller,
      // Online: wem gehört dieses Team? null = KI oder lokale Partie.
      playerId: config.playerId || null,
      letter: String.fromCharCode(65 + index),
      individuals: [],
      lineages: { A: { id: 'A', name: config.name } },
      extinctions: 0,
      speciated: false,
      history: [],
      draftHistory: [],
      totals: { born: 0, starved: 0, predated: 0, drift: 0, hunted: 0, mutations: 0, foodCards: 0 }
    };

    // Startpopulation: ungleich verteilte Merkmale = sichtbare Variabilität.
    const starters = EA.traits.starterPool(pack);
    for (let i = 0; i < config.startPop; i++) {
      const traits = [];
      // Etwa die Hälfte der Individuen startet mit einem Merkmal, wenige mit zwei.
      if (rng.chance(0.55)) traits.push(rng.pick(starters).id);
      if (rng.chance(0.14)) {
        const second = rng.pick(starters).id;
        if (traits.indexOf(second) === -1) traits.push(second);
      }
      team.individuals.push(createIndividual(team, traits, 0));
    }
    return team;
  }

  function createGame(setup) {
    indSeq = 0;

    const seed = setup.seed || (Math.floor(Math.random() * 1e9) + 1);
    const rng = Rng(seed);
    const names = EA.names.speciesNames(rng, setup.teams.length);

    const game = {
      seed,
      rng,
      pack: setup.pack,
      rounds: setup.rounds,
      round: 0,
      phase: -1,
      env: { temp: 20, foodMod: 1.0 },
      predationPressure: 0,
      carrion: 0,
      teams: [],
      log: [],
      roundData: [],
      currentEvent: null,
      comboEvents: [],
      convergenceSeen: Object.create(null),
      finished: false
    };

    game.deck = EA.events.EventDeck(rng, setup.pack);

    setup.teams.forEach((cfg, i) => {
      game.teams.push(createTeam(i, {
        name: cfg.name && cfg.name.trim() ? cfg.name.trim() : names[i],
        color: cfg.color,
        controller: cfg.controller,
        playerId: cfg.playerId || null,
        startPop: setup.startPop
      }, rng, setup.pack));
    });

    // Runde 0 als Ausgangspunkt festhalten, damit Diagramme bei „Start“ beginnen.
    snapshot(game);
    return game;
  }

  /* ---------- Abfragen ---------- */
  const aliveTeams = game => game.teams.filter(t => t.individuals.length > 0);
  const totalPop = game => game.teams.reduce((a, t) => a + t.individuals.length, 0);

  function traitCount(team, id) {
    let n = 0;
    for (const ind of team.individuals) if (ind.traits.indexOf(id) !== -1) n++;
    return n;
  }

  function teamCtx(game, team) {
    return {
      temp: game.env.temp,
      teamPop: team.individuals.length,
      otherTeamsAlive: game.teams.filter(t => t !== team && t.individuals.length > 0).length
    };
  }

  /** Werte aller Individuen für die aktuelle Umwelt neu berechnen. */
  function refreshStats(game) {
    for (const team of game.teams) {
      const ctx = teamCtx(game, team);
      for (const ind of team.individuals) ind.stats = G.derive(ind, ctx);
    }
  }

  /* ---------- Log ---------- */
  function log(game, entry) {
    const e = {
      round: game.round,
      phase: game.phase,
      icon: entry.icon || '•',
      text: entry.text,
      kind: entry.kind || null,      // good | bad | key
      teamId: entry.teamId || null,
      color: entry.color || null
    };
    game.log.push(e);
    if (EA.bus) EA.bus.emit('log', e);
    return e;
  }

  /* ---------- Rundenschnappschuss (Basis aller Auswertungen) ---------- */
  function snapshot(game) {
    for (const team of game.teams) {
      const pool = G.genePool(team.individuals);
      const traits = Object.create(null);
      for (const p of pool) traits[p.id] = p.pct;
      team.history.push({
        round: game.round,
        pop: team.individuals.length,
        traits,
        traitCounts: pool.reduce((m, p) => (m[p.id] = p.count, m), Object.create(null)),
        avgTraits: team.individuals.length
          ? team.individuals.reduce((a, i) => a + i.traits.length, 0) / team.individuals.length
          : 0,
        extinctions: team.extinctions
      });
    }
  }

  EA.state = {
    MAX_POP_PER_TEAM,
    createGame, createIndividual, createTeam,
    aliveTeams, totalPop, traitCount, teamCtx, refreshStats,
    log, snapshot
  };
})(window);
