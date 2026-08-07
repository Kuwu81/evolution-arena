/* ============================================================
   Evolution Arena — Onlinelobby
   Raum erstellen oder per Einladecode beitreten, Aufstellung
   festlegen, Partie starten.
   ============================================================ */
(function (global) {
  'use strict';
  const EA = global.EA;
  const U = EA.util;
  const { $, el, clamp } = U;
  const P = EA.protocol;

  const Lobby = {
    room: null,
    elRoot: null,
    unsub: [],

    mount() {
      this.elRoot = $('#lobby-body');
      $('[data-action="lobby-leave"]').addEventListener('click', () => this.leave());
    },

    /* ============================================================
       Einstieg
       ============================================================ */
    open(prefillCode) {
      EA.app.show('lobby');
      if (!EA.netConfig.hasSdk()) return this.renderNotice(
        'Keine Verbindung zum Realtime-Dienst',
        'Das SDK für den Onlinemodus konnte nicht geladen werden. Onlinepartien brauchen eine Internetverbindung – ' +
        'im Hotseat-Modus lässt sich das Spiel weiterhin ohne Netz nutzen.',
        [el('button', { class: 'btn', onclick: () => EA.app.show('menu') }, 'Zurück zum Menü')]
      );
      if (!EA.netConfig.isReady()) return this.renderSetupCredentials(prefillCode);
      this.renderEntry(prefillCode);
    },

    renderNotice(title, text, actions) {
      this.elRoot.innerHTML = '';
      this.elRoot.appendChild(el('div', { class: 'panel panel--pad lobby__notice' }, [
        el('h3', { class: 'panel__title' }, title),
        el('p', { class: 'field__hint' }, text),
        el('div', { class: 'lobby__row' }, actions || [])
      ]));
    },

    /** Einmalige Eingabe der Zugangsdaten, falls sie nicht im Code stehen. */
    renderSetupCredentials(prefillCode) {
      const inpUrl = el('input', { class: 'input', type: 'url', placeholder: 'https://xxxxxxxx.supabase.co', autocomplete: 'off' });
      const inpKey = el('input', { class: 'input', type: 'text', placeholder: 'sb_publishable_…', autocomplete: 'off' });
      const err = el('p', { class: 'field__hint lobby__err' });

      this.elRoot.innerHTML = '';
      this.elRoot.appendChild(el('div', { class: 'panel panel--pad lobby__notice' }, [
        el('h3', { class: 'panel__title' }, 'Verbindung einrichten'),
        el('p', { class: 'field__hint' },
          'Der Onlinemodus nutzt Supabase Realtime. Lege ein kostenloses Projekt an und trage hier ' +
          'Projekt-URL und den Publishable Key ein (Project Settings ▸ API Keys). Beides wird nur auf diesem ' +
          'Gerät gespeichert. Wie es genau geht, steht in der README.'),
        el('div', { class: 'field' }, [el('label', {}, 'Projekt-URL'), inpUrl]),
        el('div', { class: 'field' }, [
          el('label', {}, 'Publishable Key'), inpKey,
          el('p', { class: 'field__hint' }, 'Ältere Projekte zeigen hier stattdessen den anon-Key (beginnt mit „eyJhbGciOi…“) – der funktioniert ebenso.')
        ]),
        err,
        el('div', { class: 'lobby__row' }, [
          el('button', { class: 'btn', onclick: () => EA.app.show('menu') }, 'Abbrechen'),
          el('button', {
            class: 'btn btn--primary', onclick: () => {
              const url = inpUrl.value.trim(), key = inpKey.value.trim();
              if (!/^https?:\/\/.+/.test(url) || key.length < 20) {
                err.textContent = 'Bitte eine vollständige Projekt-URL und den Publishable Key eintragen.';
                return;
              }
              EA.netConfig.save({ url, key });
              this.renderEntry(prefillCode);
            }
          }, 'Speichern & weiter ▸')
        ])
      ]));
    },

    /* ============================================================
       Raum erstellen / beitreten
       ============================================================ */
    renderEntry(prefillCode) {
      const savedName = U.store.get('net.name', '');
      const inpName = el('input', {
        class: 'input', type: 'text', maxlength: '22', value: savedName,
        placeholder: 'Dein Artname', autocomplete: 'off'
      });
      const inpCode = el('input', {
        class: 'input input--code', type: 'text', maxlength: '7', value: prefillCode || '',
        placeholder: 'ABC234', autocomplete: 'off', spellcheck: 'false',
        oninput: e => { e.target.value = P.normalizeCode(e.target.value); }
      });
      const err = el('p', { class: 'field__hint lobby__err' });

      const nameOr = () => {
        const n = inpName.value.trim();
        return n || EA.names.speciesNames(U.Rng(Date.now() & 0xffff), 1)[0];
      };

      const busy = (btn, on) => {
        btn.disabled = on;
        btn.textContent = on ? 'Verbinde …' : btn.dataset.label;
      };

      const btnCreate = el('button', { class: 'btn btn--primary btn--xl', 'data-label': 'Raum erstellen ▸' }, 'Raum erstellen ▸');
      const btnJoin = el('button', { class: 'btn btn--xl', 'data-label': 'Beitreten ▸' }, 'Beitreten ▸');

      btnCreate.addEventListener('click', async () => {
        err.textContent = '';
        busy(btnCreate, true);
        const name = nameOr();
        U.store.set('net.name', name);
        try {
          const room = EA.net.create();
          await room.createRoom(name);
          this.bindRoom(room);
          this.renderRoom();
        } catch (e) {
          EA.net.leave();
          err.textContent = e.message;
          busy(btnCreate, false);
        }
      });

      btnJoin.addEventListener('click', async () => {
        err.textContent = '';
        const code = P.normalizeCode(inpCode.value);
        if (!P.isValidCode(code)) { err.textContent = 'Ein Einladecode besteht aus 6 Zeichen.'; return; }
        busy(btnJoin, true);
        const name = nameOr();
        U.store.set('net.name', name);
        try {
          const room = EA.net.create();
          await room.joinRoom(code, name);
          this.bindRoom(room);
          this.renderRoom();
        } catch (e) {
          EA.net.leave();
          err.textContent = e.message;
          busy(btnJoin, false);
        }
      });

      inpCode.addEventListener('keydown', e => { if (e.key === 'Enter') btnJoin.click(); });

      this.elRoot.innerHTML = '';
      this.elRoot.appendChild(el('div', { class: 'lobby__entry' }, [
        el('div', { class: 'panel panel--pad' }, [
          el('h3', { class: 'panel__title' }, 'Dein Team'),
          el('div', { class: 'field' }, [
            el('label', {}, 'Artname'),
            inpName,
            el('p', { class: 'field__hint' }, 'So heißt deine Art in der Arena. Leer lassen würfelt einen Namen aus.')
          ])
        ]),
        el('div', { class: 'lobby__split' }, [
          el('div', { class: 'panel panel--pad' }, [
            el('h3', { class: 'panel__title' }, 'Neue Partie'),
            el('p', { class: 'field__hint' }, 'Du wirst Gastgeber: Du legst Runden, Karten-Pack und KI-Arten fest und gibst die Phasen frei.'),
            btnCreate
          ]),
          el('div', { class: 'panel panel--pad' }, [
            el('h3', { class: 'panel__title' }, 'Einladung annehmen'),
            el('div', { class: 'field' }, [el('label', {}, 'Einladecode'), inpCode]),
            btnJoin
          ])
        ]),
        err
      ]));
    },

    /* ============================================================
       Raumansicht
       ============================================================ */
    bindRoom(room) {
      this.room = room;
      this.unsub.forEach(f => f());
      this.unsub = [
        room.on('roster', () => this.renderRoom()),
        room.on('start', payload => { this.teardown(); EA.app.startOnlineGame(room, payload); }),
        room.on('resume', d => { this.teardown(); EA.app.startOnlineGame(room, d.start, d.upToRound); }),
        room.on('error', msg => EA.hud.toast(msg, 'bad', 5000))
      ];
    },

    teardown() {
      this.unsub.forEach(f => f());
      this.unsub = [];
    },

    shareLink(code) {
      const base = global.location.origin + global.location.pathname;
      return base + '?join=' + code;
    },

    renderRoom() {
      const room = this.room;
      if (!room || EA.app.screen !== 'lobby') return;

      const isHost = room.isHost;
      const total = room.players.length + room.setup.aiTeams;
      const tooFew = total < 2;
      const tooMany = total > EA.net.MAX_PLAYERS;

      /* ---------- Code + Teilen ---------- */
      const codeBox = el('div', { class: 'panel panel--pad lobby__code' }, [
        el('h3', { class: 'panel__title' }, 'Einladecode'),
        el('div', { class: 'lobby__code-val' }, room.code.split('').map(c => el('span', {}, c))),
        el('p', { class: 'field__hint' }, 'Mitspielende öffnen dieselbe Seite und geben diesen Code ein.'),
        el('div', { class: 'lobby__row' }, [
          el('button', {
            class: 'btn btn--sm', onclick: async e => {
              try { await navigator.clipboard.writeText(room.code); EA.hud.toast('Code kopiert', 'good', 1400); }
              catch (err) { EA.hud.toast('Kopieren nicht möglich – Code bitte abtippen', 'info', 2200); }
            }
          }, U.iconLabel('📋', 'Code kopieren')),
          el('button', {
            class: 'btn btn--sm', onclick: async () => {
              const link = this.shareLink(room.code);
              try { await navigator.clipboard.writeText(link); EA.hud.toast('Einladelink kopiert', 'good', 1400); }
              catch (err) { EA.hud.toast(link, 'info', 6000); }
            }
          }, U.iconLabel('🔗', 'Link kopieren'))
        ])
      ]);

      /* ---------- Spielerliste ---------- */
      const rows = room.players.map((p, i) => {
        const color = EA.names.TEAM_COLORS[p.teamIndex % 6].hex;
        const isMe = p.id === room.playerId;
        return el('div', { class: 'lobby__player' + (p.online ? '' : ' is-off') }, [
          el('span', { class: 'swatch', style: { background: color } }, String.fromCharCode(65 + p.teamIndex)),
          el('div', { class: 'lobby__player-main' }, [
            el('span', { class: 'lobby__player-name' }, p.name),
            el('span', { class: 'lobby__player-tags' }, [
              p.id === room.hostId ? el('span', { class: 'tagpill' }, '★ Gastgeber') : null,
              isMe ? el('span', { class: 'tagpill' }, 'Du') : null,
              !p.online ? el('span', { class: 'tagpill tagpill--warn' }, 'getrennt') : null
            ])
          ])
        ]);
      });

      for (let i = 0; i < room.setup.aiTeams; i++) {
        const idx = room.players.length + i;
        const color = EA.names.TEAM_COLORS[idx % 6].hex;
        rows.push(el('div', { class: 'lobby__player lobby__player--ai' }, [
          el('span', { class: 'swatch', style: { background: color } }, String.fromCharCode(65 + idx)),
          el('div', { class: 'lobby__player-main' }, [
            el('span', { class: 'lobby__player-name' }, 'KI-Art'),
            el('span', { class: 'lobby__player-tags' }, [el('span', { class: 'tagpill' }, '🤖 Computer')])
          ])
        ]));
      }

      const playerBox = el('div', { class: 'panel panel--pad' }, [
        el('h3', { class: 'panel__title' }, [
          'Arten am Wasserloch',
          el('span', { class: 'panel__hint' }, total + ' von ' + EA.net.MAX_PLAYERS)
        ]),
        el('div', { class: 'lobby__players' }, rows),
        !room.hostOnline ? el('p', { class: 'field__hint lobby__err' },
          'Der Gastgeber ist nicht verbunden. Ohne ihn kann die Partie nicht starten.') : null
      ]);

      /* ---------- Einstellungen (nur Gastgeber) ---------- */
      const seg = (label, key, values, fmt) => el('div', { class: 'field' }, [
        el('label', {}, label),
        el('div', { class: 'seg' }, values.map(v => el('button', {
          class: 'seg__btn' + (room.setup[key] === v ? ' is-active' : ''),
          disabled: !isHost,
          onclick: () => room.setSetup({ [key]: v })
        }, fmt ? fmt(v) : String(v))))
      ]);

      const maxAi = Math.max(0, EA.net.MAX_PLAYERS - room.players.length);
      const setupBox = el('div', { class: 'panel panel--pad' }, [
        el('h3', { class: 'panel__title' }, [
          'Partie',
          isHost ? null : el('span', { class: 'panel__hint' }, 'legt der Gastgeber fest')
        ]),
        seg('Rundenanzahl', 'rounds', [8, 10, 12]),
        seg('Startpopulation je Art', 'startPop', [4, 6, 8]),
        seg('Karten-Pack', 'pack', ['basis', 'advanced'], v => v === 'basis' ? 'Basis' : 'Advanced'),
        el('div', { class: 'field field--row' }, [
          el('label', {}, 'Zusätzliche KI-Arten'),
          el('div', { class: 'stepper' }, [
            el('button', {
              class: 'stepper__btn', disabled: !isHost || room.setup.aiTeams <= 0,
              onclick: () => room.setSetup({ aiTeams: clamp(room.setup.aiTeams - 1, 0, maxAi) })
            }, '−'),
            el('output', { class: 'stepper__val' }, String(room.setup.aiTeams)),
            el('button', {
              class: 'stepper__btn', disabled: !isHost || room.setup.aiTeams >= maxAi,
              onclick: () => room.setSetup({ aiTeams: clamp(room.setup.aiTeams + 1, 0, maxAi) })
            }, '+')
          ])
        ]),
        el('p', { class: 'field__hint' },
          'Mindestens zwei Arten teilen sich das Wasserloch. KI-Arten füllen auf, wenn ihr zu zweit spielt.')
      ]);

      /* ---------- Start ---------- */
      const hint = tooFew
        ? (isHost
            ? 'Eine Partie braucht mindestens zwei Arten. Gib den Code weiter und warte auf Mitspielende – oder stelle über „Zusätzliche KI-Arten“ eine Computerart dazu.'
            : 'Eine Partie braucht mindestens zwei Arten. Der Gastgeber wartet noch auf Mitspielende.')
        : (tooMany ? 'Zu viele Arten: höchstens ' + EA.net.MAX_PLAYERS + '.' : null);

      const foot = el('div', { class: 'lobby__foot' }, [
        hint
          ? el('p', { class: 'lobby__blocked' }, [el('span', {}, '⚠️'), hint])
          : el('p', { class: 'field__hint' },
              isHost ? 'Du gibst während der Partie die Phasen frei – alle sehen dieselbe Runde.'
                     : 'Sobald der Gastgeber startet, geht es für alle gleichzeitig los.'),
        isHost
          ? el('button', {
              class: 'btn btn--primary btn--xl', disabled: tooFew || tooMany,
              onclick: () => this.start()
            }, 'Partie starten ▸')
          : el('div', { class: 'lobby__waiting' }, [el('span', { class: 'spinner' }), 'Warten auf den Gastgeber …'])
      ]);

      this.elRoot.innerHTML = '';
      this.elRoot.appendChild(el('div', { class: 'lobby__room' }, [
        el('div', { class: 'lobby__col' }, [codeBox, playerBox]),
        el('div', { class: 'lobby__col' }, [setupBox, foot])
      ]));
    },

    /** Gastgeber: Aufstellung einfrieren und an alle senden. */
    start() {
      const room = this.room;
      const teams = room.players
        .slice()
        .sort((a, b) => a.teamIndex - b.teamIndex)
        .map((p, i) => ({
          name: p.name,
          color: EA.names.TEAM_COLORS[i % 6].hex,
          controller: 'human',
          playerId: p.id
        }));

      for (let i = 0; i < room.setup.aiTeams; i++) {
        const idx = teams.length;
        teams.push({ name: '', color: EA.names.TEAM_COLORS[idx % 6].hex, controller: 'ai', playerId: null });
      }

      room.startGame({
        seed: Math.floor(Math.random() * 1e9) + 1,
        rounds: room.setup.rounds,
        pack: room.setup.pack,
        startPop: room.setup.startPop,
        teams
      });
    },

    leave() {
      this.teardown();
      EA.net.leave();
      this.room = null;
      EA.app.show('menu');
    }
  };

  EA.lobby = Lobby;
})(window);
