/* ============================================================
   Evolution Arena — Netzwerkprotokoll

   Das Spiel läuft im Lockstep: jeder Client rechnet dieselbe
   Simulation aus demselben Seed. Übertragen werden deshalb nur die
   Entscheidungen, die NICHT aus dem Seed ableitbar sind – also
   ausschließlich die Draft-Wahl menschlicher Teams. KI-Teams,
   Ereigniskarten, Mutationsziele, Jagd, Selektion und Vermehrung
   ergeben sich auf jedem Gerät identisch aus game.rng.
   ============================================================ */
(function (global) {
  'use strict';
  const EA = global.EA;

  /** Bei inkompatiblen Änderungen erhöhen – ältere Clients werden abgewiesen. */
  const VERSION = 1;

  /* ---------- Nachrichtentypen ---------- */
  const MSG = {
    HELLO:    'hello',      // Beitritt: bitte Roster schicken
    ROSTER:   'roster',     // Gastgeber → alle: verbindliche Lobby
    RENAME:   'rename',     // Spieler → Gastgeber: Artname geändert
    START:    'start',      // Gastgeber → alle: Partie beginnt (Seed + Aufstellung)
    GATE:     'gate',       // Gastgeber → alle: Phase freigeben
    DRAFT:    'draft',      // Spieler → alle: Draft-Entscheidung
    RESUME:   'resume',     // Gastgeber → Wiedereinsteiger: kompletter Verlauf
    CHECKSUM: 'checksum',   // alle: Rundenprüfsumme (Desync-Erkennung)
    BYE:      'bye'         // Spieler → alle: sauberes Verlassen
  };

  /* ---------- Einladecodes ----------
     Ohne 0/O/1/I/L – die werden beim Abtippen und Vorlesen verwechselt. */
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  function makeCode(len) {
    const n = len || 6;
    let out = '';
    const buf = new Uint32Array(n);
    if (global.crypto && global.crypto.getRandomValues) {
      global.crypto.getRandomValues(buf);
      for (let i = 0; i < n; i++) out += ALPHABET[buf[i] % ALPHABET.length];
    } else {
      for (let i = 0; i < n; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    return out;
  }

  /** Tippfehler abfangen: Kleinschreibung, Leerzeichen, Bindestriche.
      0/O/1/I/L kommen im Alphabet nicht vor und fallen einfach weg. */
  function normalizeCode(raw) {
    return String(raw || '').toUpperCase()
      .split('').filter(c => ALPHABET.indexOf(c) !== -1).join('')
      .slice(0, 6);
  }

  const isValidCode = code => typeof code === 'string' && code.length === 6 &&
    code.split('').every(c => ALPHABET.indexOf(c) !== -1);

  /**
   * Eigene Kennung – bewusst im sessionStorage, nicht im localStorage:
   *   - überlebt einen Reload, damit der Wiedereinstieg den Platz zurückgibt
   *   - ist aber pro Tab eigen, sodass zwei Fenster auf demselben Rechner
   *     als zwei Spieler gelten (zum Ausprobieren und Vorführen)
   */
  function playerId() {
    const KEY = 'ea.net.playerId';
    try {
      let id = global.sessionStorage.getItem(KEY);
      if (!id) {
        id = 'p_' + makeCode(10).toLowerCase();
        global.sessionStorage.setItem(KEY, id);
      }
      return id;
    } catch (e) {
      // Privater Modus o. Ä.: Kennung nur für diese Sitzung im Speicher.
      if (!playerId._fallback) playerId._fallback = 'p_' + makeCode(10).toLowerCase();
      return playerId._fallback;
    }
  }

  /* ---------- Desync-Erkennung ----------
     Verdichtet den spielrelevanten Zustand zu einer kurzen Signatur.
     Weicht sie zwischen zwei Geräten ab, ist die Simulation
     auseinandergelaufen – dann ist weiterspielen sinnlos. */
  function stateHash(game) {
    const parts = [game.round, game.env.temp, Math.round(game.env.foodMod * 1000), game.predationPressure];
    for (const team of game.teams) {
      parts.push(team.id, team.individuals.length, team.extinctions);
      // Merkmalszählung sortiert – Objektreihenfolge soll nicht einfließen.
      const counts = Object.create(null);
      for (const ind of team.individuals) {
        for (const t of ind.traits) counts[t] = (counts[t] || 0) + 1;
      }
      parts.push(Object.keys(counts).sort().map(k => k + ':' + counts[k]).join(','));
    }
    // FNV-1a, 32 Bit – reicht als Fingerabdruck vollkommen aus.
    const s = parts.join('|');
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  EA.protocol = { VERSION, MSG, ALPHABET, makeCode, normalizeCode, isValidCode, playerId, stateHash };
})(window);
