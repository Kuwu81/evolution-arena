/* ============================================================
   Evolution Arena — Ereigniskarten

   Jede Karte verändert genau EINEN Umweltparameter für alle Teams.
   Didaktisch zentral ist die Trennung:
     kind: 'directed' → Merkmale entscheiden (Selektion)
     kind: 'random'   → reiner Zufall (Gendrift)
   ============================================================ */
(function (global) {
  'use strict';
  const EA = global.EA;
  const { clamp } = EA.util;

  const TEMP_NEUTRAL = 20;
  const TEMP_MIN = -4;
  const TEMP_MAX = 38;

  const CARDS = [
    /* ─────────── Temperatur (gerichtet) ─────────── */
    {
      id: 'coldsnap', name: 'Kälteeinbruch', icon: '❄️', kind: 'directed', param: 'temp',
      color: '#7cc8ff', weight: 12,
      text: 'Ein Polarwind fegt über die Ebene. Das Wohlfühlfenster verschiebt sich nach unten – Fell und Körpergröße zahlen sich aus.',
      roll: rng => ({ temp: rng.int(3, 9) })
    },
    {
      id: 'deepfrost', name: 'Strenger Frost', icon: '🧊', kind: 'directed', param: 'temp',
      color: '#a8dcff', weight: 6, minRound: 3,
      text: 'Nächtelanger Frost. Wer keine Isolation trägt, verliert massiv Fressleistung.',
      roll: rng => ({ temp: rng.int(-4, 2) })
    },
    {
      id: 'heatwave', name: 'Hitzewelle', icon: '🔥', kind: 'directed', param: 'temp',
      color: '#ff9a4d', weight: 12,
      text: 'Die Luft flimmert. Jetzt zählen Wärmeableitung und Nachtaktivität – dichtes Fell wird zur Bürde.',
      roll: rng => ({ temp: rng.int(29, 34) })
    },
    {
      id: 'scorcher', name: 'Sengende Glut', icon: '☀️', kind: 'directed', param: 'temp',
      color: '#ffb066', weight: 6, minRound: 3,
      text: 'Der Boden bricht auf. Nur konsequente Hitzeanpassung hält das Fressen aufrecht.',
      roll: rng => ({ temp: rng.int(34, 38) })
    },
    {
      id: 'mild', name: 'Milde Jahreszeit', icon: '🌤️', kind: 'directed', param: 'temp',
      color: '#9be7c4', weight: 9,
      text: 'Ausgeglichenes Klima. Der Temperaturdruck lässt nach – wer spezialisiert ist, verliert seinen Sondervorteil.',
      roll: rng => ({ temp: rng.int(17, 23) })
    },
    {
      id: 'coolnights', name: 'Kühle Nächte', icon: '🌫️', kind: 'directed', param: 'temp',
      color: '#8fd8f5', weight: 8,
      text: 'Milde Tage, kalte Nächte. Ein sanfter Zug in Richtung Kälteanpassung.',
      roll: rng => ({ temp: rng.int(11, 16) })
    },
    {
      id: 'warmspell', name: 'Warmer Zug', icon: '🌞', kind: 'directed', param: 'temp',
      color: '#ffd08a', weight: 8,
      text: 'Trockene Wärme zieht auf. Noch erträglich – aber Fellträger schwitzen bereits.',
      roll: rng => ({ temp: rng.int(24, 28) })
    },

    /* ─────────── Nahrungsangebot (gerichtet) ─────────── */
    {
      id: 'drought', name: 'Dürre', icon: '🍂', kind: 'directed', param: 'food',
      color: '#d9a05b', weight: 12,
      text: 'Das Wasserloch schrumpft. Effizienz schlägt Wachstum – wer viel frisst, verhungert zuerst.',
      roll: () => ({ food: 0.62 })
    },
    {
      id: 'harddrought', name: 'Schwere Dürre', icon: '🏜️', kind: 'directed', param: 'food',
      color: '#c98a44', weight: 6, minRound: 3,
      text: 'Nur noch eine Pfütze. Große Körper und Gigantismus werden zur tödlichen Hypothek.',
      roll: () => ({ food: 0.44 })
    },
    {
      id: 'abundance', name: 'Überfluss', icon: '🌱', kind: 'directed', param: 'food',
      color: '#4fe0a6', weight: 11,
      text: 'Regen und frisches Grün. Jetzt zahlt sich Wachstum aus – Nachwuchs kommt durch.',
      roll: () => ({ food: 1.48 })
    },
    {
      id: 'rains', name: 'Regenzeit', icon: '🌧️', kind: 'directed', param: 'food',
      color: '#6ec9ff', weight: 10,
      text: 'Das Wasserloch füllt sich spürbar auf. Der Konkurrenzdruck sinkt für eine Runde.',
      roll: () => ({ food: 1.26 })
    },
    {
      id: 'normalyear', name: 'Ausgeglichenes Jahr', icon: '⚖️', kind: 'directed', param: 'food',
      color: '#b6c8d4', weight: 8,
      text: 'Das Wasserloch pendelt sich ein. Reguläre Knappheit – die Auslese läuft weiter.',
      roll: () => ({ food: 1.0 })
    },

    /* ─────────── Gendrift (ungerichtet) ─────────── */
    {
      id: 'volcano', name: 'Vulkanausbruch', icon: '🌋', kind: 'random', param: 'drift',
      color: '#ff6a5a', weight: 5, minRound: 3,
      text: 'Asche und Lava treffen die Ebene. Es stirbt, wer zufällig im Weg steht – kein Merkmal schützt.',
      roll: rng => ({ kill: rng.range(0.16, 0.26) })
    },
    {
      id: 'plague', name: 'Seuche', icon: '🦠', kind: 'random', param: 'drift',
      color: '#ff8a6a', weight: 5, minRound: 3,
      text: 'Ein neuer Erreger zieht durch alle Arten. Der Tod trifft die Population blind.',
      roll: rng => ({ kill: rng.range(0.14, 0.24) })
    },
    {
      id: 'impact', name: 'Einschlag', icon: '☄️', kind: 'random', param: 'drift',
      color: '#ffa07a', weight: 3, minRound: 5,
      text: 'Ein Meteorit schlägt ein. Wer überlebt, hat schlicht Glück gehabt – das ist Gendrift.',
      roll: rng => ({ kill: rng.range(0.22, 0.34) })
    },
    {
      id: 'bottleneck', name: 'Flaschenhals', icon: '⌛', kind: 'random', param: 'drift',
      color: '#ff9ecb', weight: 4, minRound: 4, pack: 'advanced',
      text: 'Ein Engpass reduziert jede Population drastisch. Der Genpool der Überlebenden ist reiner Zufall.',
      roll: rng => ({ kill: rng.range(0.3, 0.42) })
    }
  ];

  const BY_ID = Object.create(null);
  for (const c of CARDS) BY_ID[c.id] = c;

  /**
   * Ziehstapel: zieht ohne Zurücklegen, mischt bei Erschöpfung neu.
   * Runde 1 ist garantiert gerichtet und mild – das Spiel soll mit
   * Selektion beginnen, nicht mit Zufall.
   */
  function EventDeck(rng, pack) {
    const pool = CARDS.filter(c => !c.pack || c.pack === pack);
    let pile = [];

    function refill() {
      pile = [];
      for (const c of pool) {
        const n = Math.max(1, Math.round(c.weight / 3));
        for (let i = 0; i < n; i++) pile.push(c);
      }
      rng.shuffle(pile);
    }
    refill();

    return {
      draw(round) {
        if (round === 1) {
          const openers = pool.filter(c => c.id === 'mild' || c.id === 'normalyear' || c.id === 'coolnights' || c.id === 'warmspell');
          return rng.pick(openers);
        }
        for (let attempt = 0; attempt < 60; attempt++) {
          if (!pile.length) refill();
          const card = pile.pop();
          if (card.minRound && round < card.minRound) continue;
          return card;
        }
        return BY_ID.normalyear;
      }
    };
  }

  /**
   * Wendet eine Karte auf die Umwelt an und liefert eine Beschreibung
   * der Veränderung für UI und Log.
   */
  function applyCard(card, env, rng) {
    const before = { temp: env.temp, food: env.foodMod };
    const r = card.roll(rng);
    const result = { card, killFrac: 0, deltas: [], before };

    if (r.temp !== undefined) {
      env.temp = clamp(r.temp, TEMP_MIN, TEMP_MAX);
      // Der nicht adressierte Parameter kehrt langsam zur Mitte zurück.
      env.foodMod = env.foodMod + (1 - env.foodMod) * 0.35;
    }
    if (r.food !== undefined) {
      env.foodMod = r.food;
      env.temp = env.temp + (TEMP_NEUTRAL - env.temp) * 0.35;
    }
    if (r.kill !== undefined) {
      result.killFrac = r.kill;
      env.temp = env.temp + (TEMP_NEUTRAL - env.temp) * 0.25;
      env.foodMod = env.foodMod + (1 - env.foodMod) * 0.25;
    }

    env.temp = Math.round(clamp(env.temp, TEMP_MIN, TEMP_MAX));
    env.foodMod = Math.round(clamp(env.foodMod, 0.35, 1.6) * 100) / 100;

    const dT = env.temp - Math.round(before.temp);
    const dF = Math.round((env.foodMod - before.food) * 100);
    if (dT !== 0) result.deltas.push({ icon: '🌡️', text: (dT > 0 ? '+' : '') + dT + ' °C → ' + env.temp + ' °C' });
    if (dF !== 0) result.deltas.push({ icon: '🍃', text: (dF > 0 ? '+' : '') + dF + ' % → ' + Math.round(env.foodMod * 100) + ' %' });
    if (result.killFrac > 0) result.deltas.push({ icon: '☠️', text: Math.round(result.killFrac * 100) + ' % Verluste – zufällig' });

    return result;
  }

  EA.events = { CARDS, BY_ID, EventDeck, applyCard, TEMP_NEUTRAL, TEMP_MIN, TEMP_MAX };
})(window);
