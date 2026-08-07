/* ============================================================
   Evolution Arena — Auswertung & Reflexion

   Hauptziel des Spiels: „Warum X → Y?“ rekonstruierbar machen.
   Alle Aussagen hier werden aus den aufgezeichneten Rundendaten
   abgeleitet – nichts ist vorformuliert geraten.
   ============================================================ */
(function (global) {
  'use strict';
  const EA = global.EA;
  const T = EA.traits;

  const pctS = v => Math.round(v * 100) + ' %';

  /** Deutsche Aufzählung: „A, B und C“. */
  function listDe(items) {
    if (items.length <= 1) return items[0] || '';
    return items.slice(0, -1).join(', ') + ' und ' + items[items.length - 1];
  }

  /** Endstand: Population entscheidet, danach Stabilität, danach Merkmalsvielfalt. */
  function ranking(game) {
    return game.teams.slice().sort((a, b) => {
      const pa = a.individuals.length, pb = b.individuals.length;
      if (pb !== pa) return pb - pa;
      if (a.extinctions !== b.extinctions) return a.extinctions - b.extinctions;
      const ta = avgTraits(a), tb = avgTraits(b);
      return tb - ta;
    });
  }

  const avgTraits = team => team.individuals.length
    ? team.individuals.reduce((s, i) => s + i.traits.length, 0) / team.individuals.length
    : 0;

  const lastHistory = team => team.history[team.history.length - 1];

  /** Durchschnittlicher Fütterungsvorsprung eines Merkmals über die Partie. */
  function traitEdgeSeries(game, traitId, minCarriers) {
    const out = [];
    for (const rd of game.roundData) {
      const m = rd.traitAdvantage && rd.traitAdvantage[traitId];
      const min = minCarriers || 3;
      // Beide Gruppen brauchen eine Mindestgröße, sonst ist der Vergleich Rauschen.
      if (!m || m.edge === null || m.carriers < min || m.others < min) continue;
      out.push({ round: rd.round, edge: m.edge, temp: rd.temp, foodMod: rd.foodMod, event: rd.event, carriers: m.carriers });
    }
    return out;
  }

  /* ============================================================
     Einzelne Einsichten
     ============================================================ */

  /** „Warum stieg <Merkmal> von A % auf B %?“ */
  function insightRise(game) {
    const candidates = [];
    for (const team of game.teams) {
      if (!team.individuals.length || team.extinctions > 0) continue;
      const h = team.history;
      if (h.length < 3) continue;
      const start = h[0].traits, end = h[h.length - 1].traits;
      for (const t of T.TRAITS) {
        const a = start[t.id] || 0, b = end[t.id] || 0;
        const gain = b - a;
        if (b < 0.45 || gain < 0.3) continue;
        const series = traitEdgeSeries(game, t.id);
        const meanEdge = series.length ? series.reduce((s, x) => s + x.edge, 0) / series.length : 0;
        candidates.push({ team, trait: t, from: a, to: b, gain, series, meanEdge });
      }
    }
    if (!candidates.length) return null;

    // Bevorzugt wird ein Merkmal, dessen Anstieg sich tatsächlich mit Selektion
    // erklären lässt. Gibt es keines, wird der Anstieg ehrlich als Drift erklärt.
    const selected = candidates.filter(c => c.meanEdge > 0.02 && c.series.length >= 2);
    const best = (selected.length ? selected : candidates)
      .sort((a, b) => (b.gain * (1 + b.meanEdge * 2)) - (a.gain * (1 + a.meanEdge * 2)))[0];

    const draft = best.team.draftHistory.filter(d => d.traitId === best.trait.id && d.mode === 'mutation')[0];
    const origin = draft
      ? ' Der Ausgangspunkt war eine einzelne Mutation in Runde <b>' + draft.round + '</b> bei genau <b>einem</b> Individuum.'
      : ' Das Merkmal war von Anfang an ungleich verteilt – genau diese Variabilität ist der Rohstoff der Evolution.';

    let a;
    if (best.meanEdge > 0.02 && best.series.length >= 2) {
      const positive = best.series.filter(s => s.edge > 0.02);
      a = 'Der Anstieg ist <b>kein Aufbau, sondern ein Rest</b>: In <b>' + positive.length + ' von ' + best.series.length +
        '</b> auswertbaren Runden wurden Träger von ' + best.trait.icon + ' ' + best.trait.name +
        ' häufiger satt als Nicht-Träger (Ø <b>+' + Math.round(best.meanEdge * 100) +
        ' %-Punkte</b> Fütterungsvorsprung). Wer satt wird, pflanzt sich fort – und vererbt das Merkmal weiter. ' +
        'Selektion siebt, Vererbung verteilt: So verschiebt sich der Genpool von ' + pctS(best.from) + ' auf ' + pctS(best.to) + '.' + origin;
    } else {
      const mutCount = best.team.draftHistory.filter(d => d.traitId === best.trait.id && d.mode === 'mutation').length;
      a = 'Bemerkenswert: ' + best.trait.icon + ' ' + best.trait.name + ' brachte über die Partie <b>keinen messbaren ' +
        'Fütterungsvorteil</b> (Ø ' + Math.round(best.meanEdge * 100) + ' %-Punkte) und stieg trotzdem von ' +
        pctS(best.from) + ' auf ' + pctS(best.to) + '. Nicht jede Verschiebung im Genpool ist Selektion: ' +
        'In kleinen Populationen setzen sich Merkmale auch durch <b>Zufall</b> durch (Gendrift), ' +
        'zusätzlich verstärkt durch ' + mutCount + ' gedraftete Mutation' + (mutCount === 1 ? '' : 'en') +
        ' und die Vererbung an die Überlebenden.' + origin;
    }

    return {
      kind: best.meanEdge > 0.02 ? 'sel' : 'drift',
      tag: best.meanEdge > 0.02 ? 'Selektion + Vererbung' : 'Gendrift im Genpool',
      q: 'Warum stieg ' + best.trait.icon + ' ' + best.trait.name + ' bei ' + best.team.name +
         ' von ' + pctS(best.from) + ' auf ' + pctS(best.to) + '?',
      a
    };
  }

  /** „Warum trug ein Tier plötzlich zwei Merkmale?“ */
  function insightRecombination(game) {
    const evt = game.comboEvents[0];
    if (evt) {
      const combo = T.COMBOS.filter(c => c.id === evt.comboId)[0];
      if (combo) {
        const parts = combo.need.map(id => T.BY_ID[id].icon + ' ' + T.BY_ID[id].name).join(' und ');
        return {
          kind: 'rec',
          tag: 'Rekombination',
          q: 'Warum trug ein Tier bei ' + evt.teamName + ' plötzlich ' + parts + ' gleichzeitig?',
          a: 'Weil bei der Fortpflanzung in Runde <b>' + evt.round + '</b> die Merkmale zweier Eltern neu gemischt wurden. ' +
             'Niemand hat diese Kombination gedraftet – sie ist <b>durch Rekombination entstanden</b> und ergab den Kombi-Effekt ' +
             '<b>' + combo.name + '</b>: ' + combo.desc + ' Kombi-Effekte sind der Grund, warum Vererbung mehr ist als Kopieren.'
        };
      }
    }
    // Fallback: das merkmalsreichste lebende Individuum
    let rich = null, richTeam = null;
    for (const team of game.teams) {
      for (const ind of team.individuals) {
        if (!rich || ind.traits.length > rich.traits.length) { rich = ind; richTeam = team; }
      }
    }
    if (!rich || rich.traits.length < 2) return null;
    return {
      kind: 'rec',
      tag: 'Rekombination',
      q: 'Warum trägt ein Individuum von ' + richTeam.name + ' am Ende ' + rich.traits.length + ' Merkmale?',
      a: 'Weil jede Mutation nur <b>ein</b> Individuum trifft – mehrere Merkmale in einem Tier können ausschließlich ' +
         'durch <b>Rekombination bei der Fortpflanzung</b> zusammenkommen: ' +
         rich.traits.map(id => T.BY_ID[id].icon + ' ' + T.BY_ID[id].name).join(', ') + '.'
    };
  }

  /** „Warum half dasselbe Merkmal einmal und schadete später?“ */
  function insightRelative(game) {
    let best = null;
    for (const t of T.TRAITS) {
      const series = traitEdgeSeries(game, t.id, 3);
      if (series.length < 3) continue;
      let hi = null, lo = null;
      for (const s of series) {
        if (!hi || s.edge > hi.edge) hi = s;
        if (!lo || s.edge < lo.edge) lo = s;
      }
      if (!hi || !lo) continue;
      const swing = hi.edge - lo.edge;
      if (hi.edge < 0.1 || lo.edge > -0.08 || swing < 0.25) continue;
      if (!best || swing > best.swing) best = { trait: t, hi, lo, swing };
    }
    if (!best) return null;

    const env = s => 'Runde <b>' + s.round + '</b> (' + Math.round(s.temp) + ' °C, Nahrung ' +
      Math.round(s.foodMod * 100) + ' %' + (s.event ? ', ' + s.event.icon + ' ' + s.event.name : '') + ')';

    // Chronologisch erzählen: erst was zuerst passierte.
    const first = best.hi.round <= best.lo.round ? best.hi : best.lo;
    const second = first === best.hi ? best.lo : best.hi;
    const verb = s => s === best.hi ? 'half' : 'schadete';
    const phrase = s => s === best.hi
      ? 'lagen die Träger beim Sattwerden <b>+' + Math.round(s.edge * 100) + ' %-Punkte</b> vorn'
      : 'lagen die Träger <b>' + Math.round(Math.abs(s.edge) * 100) + ' %-Punkte</b> zurück';

    return {
      kind: 'rel',
      tag: 'Angepasstheit ist relativ',
      q: 'Warum ' + verb(first) + ' ' + best.trait.icon + ' ' + best.trait.name + ' in Runde ' + first.round +
         ' und ' + verb(second) + ' in Runde ' + second.round + '?',
      a: 'In ' + env(first) + ' ' + phrase(first) + '. In ' + env(second) + ' kehrte sich das um: dort ' +
         phrase(second) + '. Das Merkmal hat sich dazwischen nicht verändert – <b>die Umwelt hat sich verändert</b>. ' +
         'Angepasstheit ist keine Eigenschaft eines Tieres, sondern immer eine Beziehung zwischen Merkmal und Umwelt.'
    };
  }

  /** „Warum brach ausgerechnet dieses Team bei der Katastrophe ein?“ */
  function insightDrift(game) {
    const cat = game.roundData.filter(r => r.event && r.event.kind === 'random' && r.event.victims > 0);
    if (!cat.length) return null;
    const worst = cat.slice().sort((a, b) => b.event.victims - a.event.victims)[0];

    // Wachstumsorientierte vs. mutationsorientierte Teams vergleichen
    const growth = game.teams.slice().sort((a, b) => (b.totals.foodCards - b.totals.mutations) - (a.totals.foodCards - a.totals.mutations))[0];
    const adapt = game.teams.slice().sort((a, b) => b.totals.mutations - a.totals.mutations)[0];

    let a = 'Gar nicht wegen seiner Merkmale: ' + worst.event.icon + ' <b>' + worst.event.name + '</b> in Runde <b>' +
      worst.round + '</b> tötete jedes Individuum mit derselben Wahrscheinlichkeit von <b>' +
      Math.round(worst.event.killFrac * 100) + ' %</b> – unabhängig von Fell, Panzer oder Tempo. ' +
      'Das ist <b>Gendrift</b>, nicht Selektion: Der Genpool ändert sich durch reinen Zufall.';

    if (growth && adapt && growth !== adapt) {
      a += ' Wer wie <b>' + growth.name + '</b> vor allem auf Nahrungskarten setzte (' + growth.totals.foodCards +
        ' Nahrung vs. ' + growth.totals.mutations + ' Mutationen), wuchs schnell – hatte aber wenig Variation, ' +
        'auf die die Selektion nach dem Einbruch zugreifen konnte. <b>' + adapt.name + '</b> draftete ' +
        adapt.totals.mutations + ' Mutationen und stand mit Ø ' + Math.round(avgTraits(adapt) * 10) / 10 +
        ' Merkmalen je Individuum breiter auf.';
    }

    return {
      kind: 'drift',
      tag: 'Gendrift ≠ Selektion',
      q: 'Warum brach die Population bei ' + worst.event.icon + ' ' + worst.event.name + ' ein – trotz guter Anpassung?',
      a
    };
  }

  /** Konvergenz – nur wenn tatsächlich aufgetreten. */
  function insightConvergence(game) {
    const keys = Object.keys(game.convergenceSeen).filter(k => k.indexOf('conv-') === 0);
    if (!keys.length) return null;
    const traitId = keys[0].split('-')[1];
    const t = T.BY_ID[traitId];
    if (!t) return null;
    const teams = game.teams.filter(team => {
      const h = lastHistory(team);
      return h && (h.traits[traitId] || 0) >= 0.5;
    });
    if (teams.length < 2) return null;
    return {
      kind: 'sel',
      tag: 'Konvergenz',
      q: 'Warum entwickelten ' + listDe(teams.map(t2 => t2.name)) + ' unabhängig ' + t.icon + ' ' + t.name + '?',
      a: 'Weil alle demselben Selektionsdruck ausgesetzt waren. Die Genpools sind getrennt – es gab keinen Austausch. ' +
         'Gleiche Umwelt + gleiche verfügbare Variation ⇒ <b>gleiche Antwort</b>. Das ist konvergente Entwicklung: ' +
         'Ähnlichkeit ohne gemeinsame Abstammung des Merkmals.'
    };
  }

  /** Aussterben: der Genpool ist nicht wiederherstellbar. */
  function insightExtinction(game) {
    const dead = game.teams.filter(t => t.extinctions > 0);
    if (!dead.length) return null;
    const t = dead[0];
    return {
      kind: 'drift',
      tag: 'Aussterben',
      q: 'Warum konnte ' + t.name + ' nach dem Aussterben nicht einfach weitermachen?',
      a: 'Weil mit der letzten Sterbenden auch der gesamte <b>Genpool</b> verschwand: alle über Runden hinweg angereicherten ' +
         'Merkmale auf einen Schlag weg. Die Nische wurde von einer <b>neuen Art</b> besiedelt, die wieder bei nahezu ' +
         'null Variation anfängt. Evolution kennt kein Zurückspulen – nur Weitergabe oder Ende.' +
         (dead.length > 1 ? ' Insgesamt starben ' + dead.length + ' Arten aus.' : '')
    };
  }

  /** Abschluss: Anti-Lamarck – die Population war nie baubar. */
  function insightAntiLamarck(game) {
    const rank = ranking(game);
    const win = rank[0];
    const mut = win.draftHistory.filter(d => d.mode === 'mutation');
    let established = 0;
    for (const d of mut) {
      const before = win.history.filter(h => h.round === d.round - 1)[0];
      const after = lastHistory(win);
      const a = (before && before.traits[d.traitId]) || 0;
      const b = (after && after.traits[d.traitId]) || 0;
      if (b > a + 0.1) established++;
    }
    const share = mut.length ? Math.round(established / mut.length * 100) : 0;

    return {
      kind: 'sel',
      tag: 'Anti-Lamarck',
      q: 'Die größte Population gewinnt – konntet ihr sie bauen?',
      a: 'Nein. <b>' + win.name + '</b> draftete ' + mut.length + ' Mutation' + (mut.length === 1 ? '' : 'en') +
         '; davon ' + (established === 1 ? 'setzte sich <b>1</b>' : 'setzten sich <b>' + established + '</b>') +
         ' (' + share + ' %) im Genpool durch. Jede traf ein <b>zufälliges</b> Individuum, keine wurde nach Bedarf ' +
         'entworfen. Ob sie blieb, entschied allein, ob ihre Träger satt wurden und Nachkommen hatten. ' +
         'Die Endpopulation von <b>' + win.individuals.length + '</b> Individuen ist damit kein Bauwerk, sondern ein ' +
         '<b>emergentes Ergebnis</b> aus Variation, Selektion und differentiellem Fortpflanzungserfolg – also Fitness.'
    };
  }

  /** Bilanz der Überproduktion. */
  function insightOverproduction(game) {
    let born = 0, starved = 0, predated = 0, drift = 0;
    for (const t of game.teams) {
      born += t.totals.born; starved += t.totals.starved;
      predated += t.totals.predated; drift += t.totals.drift;
    }
    const died = starved + predated + drift;
    if (!born) return null;
    return {
      kind: 'sel',
      tag: 'Überproduktion',
      q: 'Warum sind über die Partie so viele Tiere gestorben?',
      a: 'Es wurden <b>' + born + '</b> Nachkommen geboren, aber nur <b>' + EA.state.totalPop(game) + '</b> leben am Ende. ' +
         '<b>' + starved + '</b> verhungerten am zu kleinen Wasserloch, <b>' + predated + '</b> wurden erlegt, <b>' + drift +
         '</b> starben durch Katastrophen. Genau das ist <b>Überproduktion</b>: Es kommen mehr zur Welt, als die Umwelt ' +
         'tragen kann – und erst dieser Überschuss macht Selektion überhaupt möglich.'
    };
  }

  /** Alle verfügbaren Einsichten in didaktisch sinnvoller Reihenfolge. */
  function reflections(game) {
    const list = [
      insightRise(game),
      insightRecombination(game),
      insightRelative(game),
      insightDrift(game),
      insightConvergence(game),
      insightExtinction(game),
      insightOverproduction(game),
      insightAntiLamarck(game)
    ];
    return list.filter(Boolean);
  }

  /** Kurzprofil eines Teams für Podium und Diagramm-Legende. */
  function teamSummary(team) {
    const h = team.history[team.history.length - 1];
    const top = Object.keys(h ? h.traits : {})
      .map(id => ({ id, pct: h.traits[id] }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 4);
    return {
      pop: team.individuals.length,
      peak: team.history.reduce((m, x) => Math.max(m, x.pop), 0),
      top,
      avgTraits: avgTraits(team),
      totals: team.totals,
      extinctions: team.extinctions
    };
  }

  EA.analysis = { ranking, reflections, teamSummary, avgTraits, traitEdgeSeries };
})(window);
