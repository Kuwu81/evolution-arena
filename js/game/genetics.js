/* ============================================================
   Evolution Arena — Genetik
   Ableitung der Individuenwerte, Kombi-Effekte, Rekombination.
   ============================================================ */
(function (global) {
  'use strict';
  const EA = global.EA;
  const { clamp } = EA.util;
  const T = EA.traits;

  /** Basiswerte einer merkmalslosen Art. */
  function baseStats() {
    return {
      need: 1.0,
      priority: 1.0,
      attack: 0,
      defense: 0,
      tempOpt: 20,
      tempTol: 5,
      fertility: 0,
      rearing: 0,
      preyWeight: 1,
      lane: 'day',
      heatFactor: 1,
      bonusFood: 0,
      bodyScale: 1,
      scavenge: false,
      warns: false,
      combos: []
    };
  }

  /**
   * Rechnet aus Merkmalen + Umwelt die spielrelevanten Werte aus.
   * ctx: { temp, teamPop, otherTeamsAlive }
   */
  function derive(individual, ctx) {
    const s = baseStats();
    const ids = individual.traits;

    for (let i = 0; i < ids.length; i++) {
      const t = T.BY_ID[ids[i]];
      if (t) t.apply(s, ctx);
    }

    // Kombi-Effekte greifen erst, wenn die Vererbung Merkmale zusammengeführt hat.
    for (const combo of T.COMBOS) {
      if (combo.need.every(id => ids.indexOf(id) !== -1)) {
        combo.apply(s, ctx);
        s.combos.push(combo.id);
      }
    }

    // Temperatur: Abstand zum Wohlfühlfenster senkt die Fressleistung.
    const dev = Math.abs(ctx.temp - s.tempOpt);
    let pen = clamp((dev - s.tempTol) * 0.045, 0, 0.65);
    if (ctx.temp > s.tempOpt) pen *= s.heatFactor;
    s.tempPenalty = pen;
    s.need *= 1 + pen * 0.85;
    s.priority -= pen * 2.2;

    s.need = Math.max(0.25, s.need);
    s.defense = Math.max(0, s.defense);
    s.preyWeight = Math.max(0.05, s.preyWeight);
    return s;
  }

  /**
   * Rekombination: Jedes Merkmal des Elternpaars wird einzeln vererbt.
   * Tragen beide Eltern das Merkmal, ist es fast sicher; trägt es nur
   * ein Elternteil, entscheidet der Zufall (≈ Mendel'sche Aufspaltung).
   */
  function recombine(parentA, parentB, rng) {
    const traits = [];
    const seen = Object.create(null);
    const all = parentB ? parentA.traits.concat(parentB.traits) : parentA.traits.slice();

    for (const id of all) {
      if (seen[id]) continue;
      seen[id] = true;
      const inA = parentA.traits.indexOf(id) !== -1;
      const inB = parentB ? parentB.traits.indexOf(id) !== -1 : false;
      let p;
      if (parentB) p = (inA && inB) ? 0.94 : 0.5;
      else p = 0.86; // Ein Elternteil allein: Merkmale bleiben meist erhalten.
      if (rng.chance(p)) traits.push(id);
    }
    return traits;
  }

  /** Seltene Spontanmutation – hält den Genpool auch ohne Draft in Bewegung. */
  const SPONTANEOUS_RATE = 0.014;
  function maybeSpontaneous(traits, rng, pack) {
    if (!rng.chance(SPONTANEOUS_RATE)) return null;
    const pool = T.deckFor(pack).filter(t => t.rarity === 'common' && traits.indexOf(t.id) === -1);
    if (!pool.length) return null;
    const pick = rng.pick(pool);
    traits.push(pick.id);
    return pick;
  }

  /** Prozentuale Merkmalsverteilung einer Individuenliste (der sichtbare Genpool). */
  function genePool(individuals) {
    const counts = Object.create(null);
    for (const ind of individuals) {
      for (const id of ind.traits) counts[id] = (counts[id] || 0) + 1;
    }
    const n = individuals.length || 1;
    const out = [];
    for (const id in counts) {
      out.push({ id, count: counts[id], pct: counts[id] / n });
    }
    out.sort((a, b) => b.pct - a.pct || a.id.localeCompare(b.id));
    return out;
  }

  /** Welche Kombis sind in der Population tatsächlich realisiert? */
  function activeCombos(individuals) {
    const found = [];
    for (const combo of T.COMBOS) {
      let n = 0;
      for (const ind of individuals) {
        if (combo.need.every(id => ind.traits.indexOf(id) !== -1)) n++;
      }
      if (n > 0) found.push({ combo, count: n });
    }
    return found.sort((a, b) => b.count - a.count);
  }

  /** Genetische Distanz zweier Linien – Grundlage der Divergenz-Meldung. */
  function divergence(groupA, groupB) {
    const a = genePool(groupA), b = genePool(groupB);
    const map = id => { const m = Object.create(null); for (const e of (id === 'a' ? a : b)) m[e.id] = e.pct; return m; };
    const ma = map('a'), mb = map('b');
    const ids = new Set(Object.keys(ma).concat(Object.keys(mb)));
    let maxDiff = 0, maxId = null, total = 0;
    for (const id of ids) {
      const d = Math.abs((ma[id] || 0) - (mb[id] || 0));
      total += d;
      if (d > maxDiff) { maxDiff = d; maxId = id; }
    }
    return { maxDiff, maxId, mean: ids.size ? total / ids.size : 0 };
  }

  EA.genetics = { baseStats, derive, recombine, maybeSpontaneous, genePool, activeCombos, divergence };
})(window);
