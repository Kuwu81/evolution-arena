/* ============================================================
   Evolution Arena — Merkmale (Traits) & Kombi-Effekte

   Jedes Merkmal verändert über apply() die abgeleiteten Werte eines
   Individuums. Nichts davon ist "gut" oder "schlecht" an sich – erst
   die Umwelt der Runde entscheidet (Angepasstheit ist relativ).

   Werte-Modell eines Individuums:
     need      Nahrungsbedarf (Basis 1.0)
     priority  Rang in der Fresswarteschlange (höher = früher)
     attack    Jagderfolg als Fleischfresser
     defense   Widerstand gegen Prädation
     tempOpt   Mitte des Wohlfühlfensters (°C)
     tempTol   Halbe Breite des Wohlfühlfensters (°C)
     fertility Zusatz-Nachkommen pro Elternteil
     rearing   Überlebenschance der Nachkommen (Aufzucht)
     preyWeight Wie auffällig das Tier für Jäger ist
     lane      Nahrungsquelle: day | night | niche | meat
     heatFactor Faktor auf die Hitze-Seite der Temperaturstrafe
     bonusFood Zusatznahrung außerhalb des Wasserlochs
     bodyScale Darstellungsgröße
   ============================================================ */
(function (global) {
  'use strict';
  const EA = global.EA;

  const RARITY = {
    common:   { id: 'common',   label: 'Common',   icon: '⚪', color: '#9fb4c4', weight: 62 },
    uncommon: { id: 'uncommon', label: 'Uncommon', icon: '🔵', color: '#4ea8ff', weight: 28 },
    rare:     { id: 'rare',     label: 'Rare',     icon: '🟣', color: '#c084fc', weight: 10 }
  };

  /** Rangfolge der Nahrungsquellen – die spezialisiertere gewinnt. */
  const LANE_RANK = { day: 0, night: 1, niche: 2, meat: 3 };

  function setLane(s, lane) {
    if (LANE_RANK[lane] > LANE_RANK[s.lane]) s.lane = lane;
  }

  const TRAITS = [
    /* ─────────────── COMMON ─────────────── */
    {
      id: 'speed', name: 'Schnelligkeit', icon: '🏃', rarity: 'common', pack: 'basis',
      desc: 'Erreicht das Wasserloch vor den anderen und macht als Jäger mehr Beute – der schlanke Bau kostet aber Energie.',
      pills: [['Fressreihenfolge ++', '+'], ['Jagd +', '+'], ['Bedarf +12 %', '−']],
      apply: s => { s.priority += 0.65; s.attack += 0.5; s.need *= 1.12; }
    },
    {
      id: 'efficiency', name: 'Effizienz', icon: '🍽️', rarity: 'common', pack: 'basis',
      desc: 'Kommt mit deutlich weniger Nahrung aus – der Vorteil schlägt bei Dürre voll durch.',
      pills: [['Bedarf −32 %', '+']],
      apply: s => { s.need *= 0.68; }
    },
    {
      id: 'fur', name: 'Fell', icon: '🧥', rarity: 'common', pack: 'basis',
      desc: 'Verschiebt das Wohlfühlfenster in die Kälte. In der Hitze wird daraus eine Last.',
      pills: [['Kälte ++', '+'], ['Hitze −−', '−']],
      apply: s => { s.tempOpt -= 9; s.tempTol += 1; s.need *= 1.05; }
    },
    {
      id: 'heatshed', name: 'Wärmeableitung', icon: '💨', rarity: 'common', pack: 'basis',
      desc: 'Große Oberfläche, dünne Haut: verschiebt das Wohlfühlfenster in die Wärme.',
      pills: [['Hitze ++', '+'], ['Kälte −−', '−']],
      apply: s => { s.tempOpt += 9; s.tempTol += 1; }
    },
    {
      id: 'scavenger', name: 'Aasfresser', icon: '🦴', rarity: 'common', pack: 'basis',
      desc: 'Nutzt Kadaver der Vorrunde und frische Risse – Nahrung, um die niemand konkurriert.',
      pills: [['Aas-Zugang', '+'], ['Bedarf −5 %', '+']],
      apply: s => { s.scavenge = true; s.need *= 0.95; }
    },
    {
      id: 'herd', name: 'Herde', icon: '🐾', rarity: 'common', pack: 'basis',
      desc: 'Schutz durch Masse: Die Verteidigung wächst mit der eigenen Populationsgröße.',
      pills: [['Verteidigung + je Individuum', '+'], ['Fressreihenfolge −', '−']],
      apply: (s, ctx) => { s.defense += 0.3 + Math.min(1.4, ctx.teamPop * 0.045); s.priority -= 0.25; }
    },
    {
      id: 'neutral', name: 'Neutrale Mutation', icon: '🎲', rarity: 'common', pack: 'basis',
      desc: 'Verändert nichts an der Fitness. Ihre Häufigkeit schwankt allein durch Zufall – Gendrift zum Anfassen.',
      pills: [['ohne Wirkung', '']],
      apply: () => {}
    },

    /* ─────────────── UNCOMMON ─────────────── */
    {
      id: 'size', name: 'Körpergröße', icon: '🐘', rarity: 'uncommon', pack: 'basis',
      desc: 'Setzt sich am Wasserloch durch und ist schwer zu erlegen – frisst dafür deutlich mehr.',
      pills: [['Bedarf +45 %', '−'], ['Verteidigung +', '+'], ['Kälte +', '+']],
      apply: s => { s.need *= 1.45; s.tempOpt -= 3; s.tempTol += 0.5; s.attack += 0.9; s.defense += 0.7; s.priority += 0.45; s.bodyScale += 0.4; }
    },
    {
      id: 'armor', name: 'Panzer', icon: '🛡️', rarity: 'uncommon', pack: 'basis',
      desc: 'Nahezu unangreifbar für Jäger, aber langsam am Wasserloch.',
      pills: [['Verteidigung ++', '+'], ['Fressreihenfolge −−', '−']],
      apply: s => { s.defense += 1.5; s.priority -= 0.65; s.need *= 1.1; s.bodyScale += 0.1; }
    },
    {
      id: 'warncall', name: 'Warnruf', icon: '📢', rarity: 'uncommon', pack: 'basis',
      desc: 'Warnt die ganze Art: Jagdversuche auf dieses Team werden seltener und scheitern öfter.',
      pills: [['Teamweiter Schutz', '+'], ['Bedarf +5 %', '−']],
      apply: s => { s.need *= 1.05; s.warns = true; }
    },
    {
      id: 'camo', name: 'Tarnung', icon: '🎨', rarity: 'uncommon', pack: 'basis',
      desc: 'Wird von Jägern kaum entdeckt. Zusammen mit Schnelligkeit entsteht ein Lauerjäger.',
      pills: [['Beutewahl −65 %', '+']],
      apply: s => { s.preyWeight *= 0.35; }
    },
    {
      id: 'carnivore', name: 'Fleischfresser', icon: '🥩', rarity: 'uncommon', pack: 'basis',
      desc: 'Frisst nicht am Wasserloch, sondern jagt andere Arten. Misslingt die Jagd, gibt es nichts.',
      pills: [['Jagd statt Wasserloch', ''], ['Angriff +', '+'], ['Alles-oder-nichts', '−']],
      apply: s => { setLane(s, 'meat'); s.attack += 1.0; s.need *= 1.3; }
    },
    {
      id: 'nocturnal', name: 'Nachtaktiv', icon: '🌙', rarity: 'uncommon', pack: 'basis',
      desc: 'Frisst nachts an einem kleineren, aber viel weniger umkämpften Vorrat. Hitze macht wenig aus.',
      pills: [['Eigene Nachtschicht', '+'], ['Hitzeschutz +', '+'], ['Kleinerer Vorrat', '−']],
      apply: s => { setLane(s, 'night'); s.heatFactor *= 0.2; s.tempTol += 1.5; }
    },
    {
      id: 'rstrategy', name: 'r-Strategie', icon: '🐣', rarity: 'uncommon', pack: 'basis',
      desc: 'Viele, kleine, schlecht geschützte Nachkommen. Wächst rasant und bricht rasant ein.',
      pills: [['Nachwuchs ++', '+'], ['Aufzucht −', '−'], ['Verteidigung −', '−']],
      apply: s => { s.fertility += 0.85; s.rearing -= 0.22; s.need *= 0.85; s.defense -= 0.3; s.bodyScale -= 0.15; }
    },
    {
      id: 'symbiosis', name: 'Symbiose', icon: '🤝', rarity: 'uncommon', pack: 'basis',
      desc: 'Profitiert von der Anwesenheit anderer Arten – je mehr Nachbarn überleben, desto besser.',
      pills: [['Zusatznahrung je Nachbarart', '+']],
      apply: (s, ctx) => { s.bonusFood += Math.min(0.55, ctx.otherTeamsAlive * 0.22); }
    },

    /* ─────────────── RARE (doppelschneidig) ─────────────── */
    {
      id: 'gigantism', name: 'Gigantismus', icon: '🦣', rarity: 'rare', pack: 'basis',
      desc: 'Überwältigend stark und kältefest – aber der Nahrungsbedarf ist kaum zu decken.',
      pills: [['Bedarf +120 %', '−'], ['Angriff ++', '+'], ['Verteidigung ++', '+'], ['Nachwuchs −', '−']],
      apply: s => { s.need *= 2.2; s.attack += 2.0; s.defense += 1.7; s.tempOpt -= 6; s.tempTol += 0.5; s.priority += 0.7; s.fertility -= 0.25; s.bodyScale += 0.85; }
    },
    {
      id: 'brightcolor', name: 'Grelle Färbung', icon: '✨', rarity: 'rare', pack: 'basis',
      desc: 'Sexuelle Selektion: enorm attraktiv für Partner – und weithin sichtbar für jeden Jäger.',
      pills: [['Nachwuchs ++', '+'], ['Beutewahl +140 %', '−'], ['Verteidigung −', '−']],
      apply: s => { s.fertility += 1.1; s.preyWeight *= 2.4; s.defense -= 0.4; }
    },
    {
      id: 'broodcare', name: 'Brutpflege', icon: '🛡️🐣', rarity: 'rare', pack: 'basis',
      desc: 'K-Strategie: wenige Nachkommen, die aber fast alle durchkommen.',
      pills: [['Aufzucht ++', '+'], ['Nachwuchs −', '−'], ['Bedarf +12 %', '−']],
      apply: s => { s.rearing += 0.55; s.fertility -= 0.35; s.need *= 1.12; }
    },
    {
      id: 'isolation', name: 'Isolation', icon: '🏝️', rarity: 'rare', pack: 'advanced',
      desc: 'Zieht sich in eine eigene Nische zurück: sichere Nahrung, aber kein Genfluss mehr. Ab drei Trägern spaltet sich eine Tochterlinie ab.',
      pills: [['Eigene Nahrungsnische', '+'], ['Kein Genfluss', '−'], ['Artbildung', '']],
      apply: s => { setLane(s, 'niche'); s.fertility -= 0.15; }
    }
  ];

  const BY_ID = Object.create(null);
  for (const t of TRAITS) BY_ID[t.id] = t;

  /* ─────────────── Kombi-Effekte (nur über Vererbung erreichbar) ─────────────── */
  const COMBOS = [
    {
      id: 'coldproof', name: 'Kältefest', need: ['fur', 'size'],
      desc: 'Isolation plus günstiges Oberflächen-Volumen-Verhältnis.',
      apply: s => { s.tempTol += 2.5; s.tempOpt -= 2; }
    },
    {
      id: 'ambush', name: 'Lauerjäger', need: ['speed', 'camo'],
      desc: 'Ungesehen anschleichen, dann losstürmen.',
      apply: s => { s.attack += 1.3; }
    },
    {
      id: 'thermo', name: 'Thermoregulation', need: ['fur', 'heatshed'],
      desc: 'Gegensätzliche Merkmale ergeben einen echten Generalisten.',
      apply: s => { s.tempTol += 3.5; }
    },
    {
      id: 'vigilant', name: 'Wachsame Herde', need: ['herd', 'warncall'],
      desc: 'Viele Augen, eine Stimme.',
      apply: s => { s.defense += 0.7; }
    },
    {
      id: 'fortress', name: 'Wandelnde Festung', need: ['armor', 'size'],
      desc: 'Für Jäger praktisch unangreifbar.',
      apply: s => { s.defense += 0.9; s.priority -= 0.2; }
    },
    {
      id: 'quickbreed', name: 'Schnellbrüter', need: ['efficiency', 'rstrategy'],
      desc: 'Wenig Bedarf, viel Nachwuchs.',
      apply: s => { s.fertility += 0.35; }
    },
    {
      id: 'shadowhunter', name: 'Schattenjäger', need: ['nocturnal', 'camo'],
      desc: 'Nachts praktisch unsichtbar.',
      apply: s => { s.preyWeight *= 0.55; s.attack += 0.4; }
    },
    {
      id: 'coursing', name: 'Hetzjäger', need: ['carnivore', 'speed'],
      desc: 'Ausdauerjagd über weite Strecken.',
      apply: s => { s.attack += 0.8; }
    },
    {
      id: 'swarmsym', name: 'Schwarmsymbiose', need: ['symbiosis', 'herd'],
      desc: 'Gemischte Herden teilen Wachdienst und Weide.',
      apply: s => { s.bonusFood += 0.25; s.defense += 0.3; }
    },
    {
      id: 'nurturedgiant', name: 'Behüteter Riese', need: ['gigantism', 'broodcare'],
      desc: 'Wenige, aber fast unverwundbare Nachkommen.',
      apply: s => { s.rearing += 0.2; }
    }
  ];

  /** Alle im gewählten Pack spielbaren Merkmale. */
  function deckFor(pack) {
    return TRAITS.filter(t => t.pack === 'basis' || pack === 'advanced');
  }

  /** Merkmale mit kleinem Effekt – Startausstattung & Wiedergründung. */
  function starterPool(pack) {
    return deckFor(pack).filter(t => t.rarity === 'common' && t.id !== 'neutral');
  }

  EA.traits = {
    RARITY, TRAITS, BY_ID, COMBOS,
    deckFor, starterPool,
    get: id => BY_ID[id]
  };
})(window);
