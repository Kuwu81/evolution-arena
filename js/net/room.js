/* ============================================================
   Evolution Arena — Onlineraum

   Ein Raum ist ein Supabase-Realtime-Channel; sein Name IST der
   Einladecode. Es gibt keine Datenbank und keine Anmeldung – der
   Code ist das Geheimnis.

   Rollenverteilung:
     Gastgeber  hält die verbindliche Lobby (Roster), startet die
                Partie, gibt die Phasen frei und beantwortet den
                Wiedereinstieg.
     Alle       senden ihre eigene Draft-Entscheidung und rechnen
                die Simulation selbst – identisch, weil derselbe Seed.

   Nachrichten werden gepuffert: Der Rundenablauf fragt sie
   asynchron ab, sie können also vor dem Warten eintreffen.
   ============================================================ */
(function (global) {
  'use strict';
  const EA = global.EA;
  const U = EA.util;
  const P = EA.protocol;
  const { MSG } = P;

  const JOIN_TIMEOUT = 9000;     // ms, bis „Raum nicht gefunden“
  const MAX_PLAYERS = 6;

  function Room() {
    const bus = U.Emitter();
    const self = {
      bus,
      code: null,
      playerId: P.playerId(),
      isHost: false,
      hostId: null,
      hostOnline: true,
      players: [],                 // [{ id, name, teamIndex, online }]
      setup: { rounds: 10, pack: 'basis', startPop: 6, aiTeams: 0 },
      started: false,
      startPayload: null,
      client: null,
      channel: null,
      status: 'idle',              // idle | connecting | open | closed | error

      /* Puffer für den Rundenablauf */
      gates: new Set(),            // "runde:phase", die der Gastgeber freigegeben hat
      drafts: new Map(),           // "runde:teamId" -> { traitId, mode, auto }
      draftLog: [],                // Gastgeber: vollständiger Verlauf für den Wiedereinstieg
      checksums: new Map(),        // "runde" -> Map(playerId -> hash)
      desynced: false,

      on: bus.on
    };

    /* ============================================================
       Verbindung
       ============================================================ */
    function makeClient() {
      const cfg = EA.netConfig.get();
      if (!EA.netConfig.hasSdk()) throw new Error('Das Realtime-SDK konnte nicht geladen werden. Besteht eine Internetverbindung?');
      if (!cfg.url || !cfg.key) throw new Error('Es sind keine Zugangsdaten hinterlegt.');
      return global.supabase.createClient(cfg.url, cfg.key, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 20 } }
      });
    }

    function connect(code, name, asHost) {
      self.code = code;
      self.isHost = asHost;
      self.status = 'connecting';
      self.client = makeClient();

      self.channel = self.client.channel('ea-' + code, {
        config: {
          // self:true – eigene Nachrichten kommen zurück, dadurch läuft jede
          // Entscheidung auf JEDEM Gerät durch denselben Codepfad.
          broadcast: { self: true },
          presence: { key: self.playerId }
        }
      });

      self.channel.on('broadcast', { event: 'ea' }, ({ payload }) => handle(payload));
      self.channel.on('presence', { event: 'sync' }, onPresence);
      self.channel.on('presence', { event: 'join' }, onPresence);
      self.channel.on('presence', { event: 'leave' }, onPresence);

      return new Promise((resolve, reject) => {
        let settled = false;
        const fail = msg => { if (!settled) { settled = true; self.status = 'error'; reject(new Error(msg)); } };

        self.channel.subscribe(async status => {
          if (status === 'SUBSCRIBED') {
            self.status = 'open';
            await self.channel.track({ id: self.playerId, name, v: P.VERSION });

            if (asHost) {
              self.hostId = self.playerId;
              upsertPlayer(self.playerId, name);
              publishRoster();
              settled = true;
              resolve(self);
            } else {
              // Der Gastgeber antwortet mit dem Roster – erst dann sind wir drin.
              // Bewusst auf 'roster:msg' warten, nicht auf 'roster': Letzteres
              // feuert auch bei jeder Präsenzänderung und wäre schon vor der
              // Antwort des Gastgebers – mit leerer Liste – ausgelöst worden.
              send(MSG.HELLO, { name });
              const timer = setTimeout(() => {
                fail('Kein Raum mit dem Code ' + code + ' gefunden. Stimmt der Code, und ist der Gastgeber noch verbunden?');
                self.close();
              }, JOIN_TIMEOUT);
              const off = bus.on('roster:msg', () => {
                if (settled) return;
                clearTimeout(timer); off();
                settled = true;
                resolve(self);
              });
            }
          } else if (status === 'CHANNEL_ERROR') {
            fail('Die Verbindung zum Realtime-Dienst ist fehlgeschlagen. Stimmen die Zugangsdaten?');
          } else if (status === 'TIMED_OUT') {
            fail('Zeitüberschreitung beim Verbinden.');
          } else if (status === 'CLOSED' && !settled) {
            fail('Die Verbindung wurde geschlossen.');
          }
        });
      });
    }

    function send(type, payload) {
      if (!self.channel || self.status !== 'open') return;
      const msg = Object.assign({ v: P.VERSION, t: type, from: self.playerId }, payload || {});
      self.channel.send({ type: 'broadcast', event: 'ea', payload: msg });
    }

    /* ============================================================
       Präsenz → wer ist online
       ============================================================ */
    function onPresence() {
      if (!self.channel) return;
      const state = self.channel.presenceState();
      const onlineIds = Object.create(null);
      const namesById = Object.create(null);
      for (const key in state) {
        for (const meta of state[key]) {
          onlineIds[meta.id] = true;
          namesById[meta.id] = meta.name;
        }
      }

      for (const p of self.players) p.online = !!onlineIds[p.id];
      self.hostOnline = !self.hostId || !!onlineIds[self.hostId];

      if (self.isHost) {
        // Neue Präsenzen aufnehmen (nach einem Reload meldet sich derselbe
        // Spieler erneut und bekommt seinen Platz zurück – die id bleibt).
        for (const id in onlineIds) upsertPlayer(id, namesById[id]);
        publishRoster();
      }
      bus.emit('roster', self.players);
      bus.emit('presence', self.players);
    }

    function upsertPlayer(id, name) {
      let p = self.players.find(x => x.id === id);
      if (p) {
        if (name && !self.started) p.name = name;
        p.online = true;
        return p;
      }
      if (self.players.length >= MAX_PLAYERS) return null;
      if (self.started) return null;          // laufende Partie nimmt niemanden neu auf
      p = { id, name: name || 'Spieler', teamIndex: self.players.length, online: true };
      self.players.push(p);
      return p;
    }

    function publishRoster() {
      if (!self.isHost) return;
      send(MSG.ROSTER, {
        hostId: self.playerId,
        players: self.players.map(p => ({ id: p.id, name: p.name, teamIndex: p.teamIndex })),
        setup: self.setup,
        started: self.started
      });
    }

    /* ============================================================
       Eingehende Nachrichten
       ============================================================ */
    function handle(m) {
      if (!m || m.v !== P.VERSION) {
        if (m && m.v !== P.VERSION) bus.emit('error', 'Ein Mitspieler nutzt eine andere Spielversion. Bitte alle Seiten neu laden.');
        return;
      }

      switch (m.t) {
        case MSG.HELLO:
          if (!self.isHost) return;
          upsertPlayer(m.from, m.name);
          publishRoster();
          // Wiedereinstieg in eine laufende Partie
          if (self.started && self.startPayload) {
            send(MSG.RESUME, {
              forPlayer: m.from,
              start: self.startPayload,
              drafts: self.draftLog,
              gates: Array.from(self.gates)
            });
          }
          break;

        case MSG.ROSTER:
          self.hostId = m.hostId;
          self.hostOnline = true;
          if (!self.isHost) {
            self.players = m.players.map(p => Object.assign({ online: true }, p));
            self.setup = m.setup;
            self.started = m.started;
            onPresenceMarkOnline();
          }
          bus.emit('roster:msg', self.players);   // verbindlich, vom Gastgeber
          bus.emit('roster', self.players);       // für die Oberfläche
          break;

        case MSG.RENAME: {
          if (!self.isHost) return;
          const p = self.players.find(x => x.id === m.from);
          if (p && !self.started) { p.name = m.name; publishRoster(); }
          break;
        }

        case MSG.START:
          // Frischer Start: alles verwerfen, was vor der Partie im Raum lag.
          // Sonst würde eine Nachricht aus der Lobbyphase als Entscheidung
          // für Runde 1 gelten. (Der Wiedereinstieg läuft über RESUME und
          // füllt die Puffer bewusst.)
          self.gates.clear();
          self.drafts.clear();
          self.draftLog.length = 0;
          self.checksums.clear();
          self.desynced = false;
          self.started = true;
          self.startPayload = m.start;
          bus.emit('start', m.start);
          break;

        case MSG.GATE:
          self.gates.add(m.round + ':' + m.phase);
          bus.emit('gate', m);
          break;

        case MSG.DRAFT: {
          const key = m.round + ':' + m.teamId;
          if (self.drafts.has(key)) return;                    // erste Meldung zählt
          const d = { traitId: m.traitId, mode: m.mode, auto: !!m.auto };
          self.drafts.set(key, d);
          if (self.isHost) self.draftLog.push({ round: m.round, teamId: m.teamId, traitId: m.traitId, mode: m.mode, auto: d.auto });
          bus.emit('draft', { round: m.round, teamId: m.teamId, decision: d });
          break;
        }

        case MSG.RESUME:
          if (m.forPlayer !== self.playerId || self.started) return;
          for (const d of m.drafts) self.drafts.set(d.round + ':' + d.teamId, { traitId: d.traitId, mode: d.mode, auto: d.auto });
          for (const g of m.gates) self.gates.add(g);
          self.started = true;
          self.startPayload = m.start;
          bus.emit('resume', { start: m.start, upToRound: m.drafts.reduce((a, d) => Math.max(a, d.round), 0) });
          break;

        case MSG.CHECKSUM: {
          if (!self.checksums.has(m.round)) self.checksums.set(m.round, new Map());
          const forRound = self.checksums.get(m.round);
          forRound.set(m.from, m.hash);
          const values = Array.from(new Set(forRound.values()));
          if (values.length > 1 && !self.desynced) {
            self.desynced = true;
            bus.emit('desync', { round: m.round });
          }
          break;
        }

        case MSG.BYE: {
          const p = self.players.find(x => x.id === m.from);
          if (p) p.online = false;
          if (m.from === self.hostId) self.hostOnline = false;
          bus.emit('roster', self.players);
          break;
        }
      }
    }

    /** Nach einem Roster vom Gastgeber die eigene Präsenzsicht nachziehen. */
    function onPresenceMarkOnline() {
      if (!self.channel) return;
      const state = self.channel.presenceState();
      const online = Object.create(null);
      for (const key in state) for (const meta of state[key]) online[meta.id] = true;
      for (const p of self.players) p.online = !!online[p.id];
      self.hostOnline = !self.hostId || !!online[self.hostId];
    }

    /* ============================================================
       Öffentliche Aktionen
       ============================================================ */
    self.createRoom = (name) => connect(P.makeCode(6), name, true);
    self.joinRoom = (code, name) => connect(code, name, false);

    self.setName = function (name) {
      if (self.isHost) {
        const p = self.players.find(x => x.id === self.playerId);
        if (p) { p.name = name; publishRoster(); bus.emit('roster', self.players); }
      } else {
        send(MSG.RENAME, { name });
      }
    };

    self.setSetup = function (patch) {
      if (!self.isHost) return;
      Object.assign(self.setup, patch);
      publishRoster();
      bus.emit('roster', self.players);
    };

    self.me = () => self.players.find(p => p.id === self.playerId) || null;

    /** Gastgeber: Partie starten. Der Seed geht mit – ab hier rechnet jeder selbst. */
    self.startGame = function (startPayload) {
      if (!self.isHost) return;
      self.started = true;
      self.startPayload = startPayload;
      send(MSG.START, { start: startPayload });
    };

    /* ---------- Phasenfreigabe ---------- */
    self.openGate = function (round, phase) {
      if (!self.isHost) return;
      send(MSG.GATE, { round, phase });
    };

    /** Wartet, bis der Gastgeber (round, phase) freigegeben hat. */
    self.awaitGate = function (round, phase) {
      const key = round + ':' + phase;
      if (self.gates.has(key)) return Promise.resolve();
      return new Promise(resolve => {
        const off = bus.on('gate', m => {
          if (m.round === round && m.phase === phase) { off(); resolve(); }
        });
      });
    };

    /* ---------- Draft ---------- */
    self.publishDraft = function (round, teamId, traitId, mode, auto) {
      send(MSG.DRAFT, { round, teamId, traitId, mode, auto: !!auto });
    };

    self.hasDraft = (round, teamId) => self.drafts.has(round + ':' + teamId);
    self.getDraft = (round, teamId) => self.drafts.get(round + ':' + teamId) || null;

    /** Wartet auf die Entscheidungen aller angegebenen Teams. */
    self.awaitDrafts = function (round, teamIds, onProgress) {
      const missing = () => teamIds.filter(id => !self.hasDraft(round, id));
      if (onProgress) onProgress(missing());
      if (!missing().length) return Promise.resolve();
      return new Promise(resolve => {
        const off = bus.on('draft', () => {
          const m = missing();
          if (onProgress) onProgress(m);
          if (!m.length) { off(); resolve(); }
        });
      });
    };

    self.publishChecksum = function (round, hash) {
      send(MSG.CHECKSUM, { round, hash });
    };

    self.close = function () {
      if (self.channel) {
        send(MSG.BYE, {});
        try { self.channel.unsubscribe(); } catch (e) { /* egal */ }
      }
      if (self.client) { try { self.client.removeAllChannels(); } catch (e) { /* egal */ } }
      self.channel = null;
      self.client = null;
      self.status = 'closed';
      bus.emit('closed', null);
    };

    return self;
  }

  EA.net = {
    MAX_PLAYERS,
    room: null,
    create() { return (EA.net.room = Room()); },
    leave() {
      if (EA.net.room) { EA.net.room.close(); EA.net.room = null; }
    },
    /** Läuft gerade eine Onlinepartie? */
    active() { return !!(EA.net.room && EA.net.room.started); }
  };
})(window);
