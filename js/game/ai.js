/* ============================================================
   Evolution Arena — KI-Teams
   Bewertet die drei Draft-Karten gegen die aktuelle Umwelt und
   entscheidet zwischen Resilienz (Mutation) und Wachstum (Nahrung).
   Die KI kann – wie ein Mensch – nicht bestimmen, WEN die Mutation trifft.
   ============================================================ */
(function (global) {
  'use strict';
  const EA = global.EA;
  const { clamp } = EA.util;
  const S = EA.state;

  const PROFILES = [
    { id: 'survivor',   label: 'Überlebenskünstler', boost: { efficiency: 1.4, armor: 1.35, herd: 1.3, warncall: 1.3, broodcare: 1.25 } },
    { id: 'hunter',     label: 'Jäger',              boost: { carnivore: 1.7, speed: 1.4, size: 1.3, camo: 1.25, gigantism: 1.2 } },
    { id: 'breeder',    label: 'Schnellwachser',     boost: { rstrategy: 1.7, brightcolor: 1.4, efficiency: 1.2, broodcare: 1.15 } },
    { id: 'specialist', label: 'Spezialist',         boost: { fur: 1.35, heatshed: 1.35, nocturnal: 1.35, isolation: 1.4 } },
    { id: 'generalist', label: 'Generalist',         boost: {} }
  ];

  function profileFor(game, team) {
    if (!team.aiProfile) {
      team.aiProfile = game.rng.pick(PROFILES);
    }
    return team.aiProfile;
  }

  /** Situationsabhängiger Nutzen eines Merkmals – 0 = wertlos. */
  function scoreTrait(game, team, trait) {
    const temp = game.env.temp;
    const food = game.env.foodMod;
    const cold = temp < 14, hot = temp > 26;
    const scarce = food < 0.85, rich = food > 1.15;
    const total = Math.max(1, S.totalPop(game));
    const pred = clamp(game.predationPressure / total, 0, 0.6);
    const neighbours = game.teams.filter(t => t !== team && t.individuals.length > 0).length;

    let s;
    switch (trait.id) {
      case 'speed':       s = 1.15 + (scarce ? 0.6 : 0); break;
      case 'efficiency':  s = 1.7 + (scarce ? 1.9 : 0); break;
      case 'fur':         s = cold ? 3.3 : (hot ? 0.15 : 0.9); break;
      case 'heatshed':    s = hot ? 3.3 : (cold ? 0.15 : 0.9); break;
      case 'scavenger':   s = 1.1 + pred * 3.5; break;
      case 'herd':        s = 1.0 + pred * 4.5; break;
      case 'neutral':     s = 0.25; break;
      case 'size':        s = 1.3 + (cold ? 0.6 : 0) + pred * 1.6 - (scarce ? 1.0 : 0); break;
      case 'armor':       s = 0.85 + pred * 5.5; break;
      case 'warncall':    s = 0.8 + pred * 4.8; break;
      case 'camo':        s = 0.9 + pred * 4.2; break;
      case 'carnivore':   s = 1.0 + (scarce ? 1.7 : 0) + Math.min(1.0, neighbours * 0.3) - pred * 2.0; break;
      case 'nocturnal':   s = 1.4 + (hot ? 1.9 : 0); break;
      case 'rstrategy':   s = 1.4 + (rich ? 1.3 : -0.5); break;
      case 'symbiosis':   s = 0.7 + neighbours * 0.4; break;
      case 'gigantism':   s = 0.7 + (cold ? 0.7 : 0) + pred * 1.3 - (scarce ? 1.7 : 0); break;
      case 'brightcolor': s = 1.0 + (rich ? 0.9 : 0) - pred * 2.2; break;
      case 'broodcare':   s = 1.2 + (pred > 0.1 ? 0.7 : 0) + (scarce ? 0.4 : 0); break;
      case 'isolation':   s = 0.9 + (scarce ? 1.1 : 0) + (pred > 0.15 ? 0.8 : 0); break;
      default:            s = 1.0;
    }

    const profile = profileFor(game, team);
    s *= profile.boost[trait.id] || 1;

    // Sättigung: was fast alle tragen, bringt als weitere Mutation wenig.
    const share = team.individuals.length ? S.traitCount(team, trait.id) / team.individuals.length : 0;
    s *= (1 - share * 0.75);

    return Math.max(0.05, s);
  }

  /** Wählt Karte und Verwendung. Rückgabe: { trait, mode }. */
  function decide(game, team, offer) {
    const rng = game.rng;
    const scored = offer.map(t => ({
      trait: t,
      score: scoreTrait(game, team, t) * rng.range(0.85, 1.15)  // etwas Unschärfe
    })).sort((a, b) => b.score - a.score);

    const best = scored[0];
    const pop = team.individuals.length;
    const carriers = S.traitCount(team, best.trait.id);
    const roundsLeft = game.rounds - game.round;

    // Nahrung = sofortiges Wachstum, Mutation = Resilienz für später.
    let foodValue = (carriers > 0 ? Math.min(EA.phases.BAL.foodCardFeeds, carriers) : EA.phases.BAL.foodCardFallback * 0.55) * 0.85;
    let mutValue = best.score * 1.55;

    if (pop <= 4) foodValue *= 2.0;                     // kurz vor dem Aussterben zählt jedes Tier
    if (roundsLeft <= 2) foodValue *= 1.9;              // am Ende gewinnt Population, nicht Anpassung
    if (roundsLeft <= 1) mutValue *= 0.4;
    if (carriers === pop && pop > 0) mutValue *= 0.15;  // Merkmal ist bereits fixiert
    if (game.env.foodMod < 0.75) foodValue *= 1.25;     // in der Dürre rettet Durchfüttern Leben

    const mode = (mutValue * rng.range(0.9, 1.1) >= foodValue) ? 'mutation' : 'food';
    return { trait: best.trait, mode, ranking: scored };
  }

  EA.ai = { PROFILES, decide, scoreTrait, profileFor };
})(window);
