/* ============================================================
   Evolution Arena — Artnamen & Teamfarben
   ============================================================ */
(function (global) {
  'use strict';
  const EA = global.EA;

  /** Teamfarben: hoher Kontrast untereinander, alle gut auf Dunkel lesbar. */
  const TEAM_COLORS = [
    { hex: '#34d399', name: 'Smaragd' },
    { hex: '#60a5fa', name: 'Azur'    },
    { hex: '#fbbf24', name: 'Bernstein' },
    { hex: '#c084fc', name: 'Amethyst' },
    { hex: '#fb7185', name: 'Koralle' },
    { hex: '#22d3ee', name: 'Türkis'  }
  ];

  const PREFIX = [
    'Steppen', 'Nebel', 'Dorn', 'Fels', 'Ur', 'Schatten', 'Salz', 'Wüsten',
    'Moor', 'Tundra', 'Wolken', 'Glut', 'Frost', 'Sand', 'Schilf', 'Basalt',
    'Distel', 'Geröll', 'Klippen', 'Savannen', 'Rot', 'Silber'
  ];

  const SUFFIX = [
    'läufer', 'greifer', 'schnabel', 'hörnchen', 'kriecher', 'grasler',
    'wühler', 'springer', 'gänger', 'schleicher', 'beißer', 'klauer',
    'huf', 'zahn', 'rücken', 'schweif', 'mähne', 'flanke'
  ];

  /** Erzeugt n paarweise verschiedene Artnamen. */
  function speciesNames(rng, n) {
    const out = [];
    const used = new Set();
    let guard = 0;
    while (out.length < n && guard++ < 400) {
      const name = rng.pick(PREFIX) + rng.pick(SUFFIX);
      if (used.has(name)) continue;
      used.add(name);
      out.push(name);
    }
    while (out.length < n) out.push('Art ' + (out.length + 1));
    return out;
  }

  /** Für die Wiedergründung nach dem Aussterben: erkennbar verwandter Name. */
  function successorName(rng, previous) {
    return rng.pick(PREFIX) + rng.pick(SUFFIX);
  }

  EA.names = { TEAM_COLORS, speciesNames, successorName };
})(window);
