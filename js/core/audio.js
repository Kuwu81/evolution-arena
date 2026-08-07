/* ============================================================
   Evolution Arena — Audio
   Versucht zuerst Sample-Assets aus assets/audio/ zu laden.
   Fehlen sie (Auslieferung ohne Assets, file://), wird derselbe
   Klang prozedural über die WebAudio-API synthetisiert.
   ============================================================ */
(function (global) {
  'use strict';

  const EA = global.EA = global.EA || {};
  const store = EA.util.store;

  /**
   * Optionale Sample-Dateien werden über assets/audio/manifest.json angemeldet.
   * Ist dort nichts eingetragen (Auslieferungszustand), klingt das Spiel
   * vollständig über die WebAudio-Synthese weiter unten – ohne Netzwerkzugriff.
   */
  const MANIFEST_URL = 'assets/audio/manifest.json';
  const ASSET_DIR = 'assets/audio/';

  const AudioEngine = {
    ctx: null,
    master: null,
    musicGain: null,
    buffers: Object.create(null),
    enabled: store.get('sound', true),
    musicEnabled: store.get('music', true),
    _musicNodes: null,
    _lastPlay: Object.create(null),

    init() {
      if (this.ctx) return;
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      try { this.ctx = new AC(); } catch (e) { this.enabled = false; return; }

      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.85 : 0;
      // Sanfte Höhendämpfung – nimmt synthetischen Klängen die Härte.
      const shelf = this.ctx.createBiquadFilter();
      shelf.type = 'highshelf';
      shelf.frequency.value = 6500;
      shelf.gain.value = -6;
      this.master.connect(shelf).connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0;
      this.musicGain.connect(this.master);

      this._loadSamples();
    },

    /** Angemeldete Samples nachladen – Fehlschläge sind still, Synthese greift. */
    _loadSamples() {
      if (global.location && global.location.protocol === 'file:') return; // fetch ist dort blockiert
      fetch(MANIFEST_URL)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(manifest => {
          const sounds = (manifest && manifest.sounds) || {};
          for (const key in sounds) {
            if (!SYNTH[key]) continue;                 // unbekannte Klangnamen ignorieren
            fetch(ASSET_DIR + sounds[key])
              .then(r => r.ok ? r.arrayBuffer() : Promise.reject())
              .then(buf => this.ctx.decodeAudioData(buf))
              .then(decoded => { this.buffers[key] = decoded; })
              .catch(() => {});
          }
        })
        .catch(() => { /* kein Manifest: reine Synthese */ });
    },

    /** Muss aus einer Nutzergeste heraus laufen (Autoplay-Policy). */
    unlock() {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    setEnabled(on) {
      this.enabled = on;
      store.set('sound', on);
      if (this.master) {
        const t = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.setTargetAtTime(on ? 0.85 : 0, t, 0.05);
      }
      if (!on) this.stopMusic();
    },

    play(name, opts) {
      if (!this.enabled || !this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      // Ratenbegrenzung: verhindert Kammfilter-Artefakte bei Massen-Events.
      const now = this.ctx.currentTime;
      const minGap = (opts && opts.minGap) || 0.028;
      if (this._lastPlay[name] && now - this._lastPlay[name] < minGap) return;
      this._lastPlay[name] = now;

      if (this.buffers[name]) return this._playBuffer(name, opts);
      const synth = SYNTH[name];
      if (synth) synth(this.ctx, this.master, opts || {});
    },

    _playBuffer(name, opts) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers[name];
      src.playbackRate.value = (opts && opts.rate) || 1;
      const g = this.ctx.createGain();
      g.gain.value = (opts && opts.gain) || 1;
      src.connect(g).connect(this.master);
      src.start();
    },

    /* ---------- Ambient-Pad ---------- */
    startMusic() {
      if (!this.enabled || !this.musicEnabled || !this.ctx || this._musicNodes) return;
      const ctx = this.ctx;
      const nodes = [];
      // Zwei leicht verstimmte Oszillatoren + langsames Filter-Sweep = ruhiges Savannen-Pad.
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      filter.Q.value = 3;
      filter.connect(this.musicGain);

      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.045;
      lfoGain.gain.value = 190;
      lfo.connect(lfoGain).connect(filter.frequency);
      lfo.start();
      nodes.push(lfo);

      [55, 82.4, 110.5, 164.8].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = i % 2 ? 'triangle' : 'sawtooth';
        o.frequency.value = f * (1 + (i - 1.5) * 0.0016);
        const g = ctx.createGain();
        g.gain.value = 0.075 / (i * .5 + 1);
        o.connect(g).connect(filter);
        o.start();
        nodes.push(o);
      });

      this._musicNodes = nodes;
      this.musicGain.gain.setTargetAtTime(0.5, ctx.currentTime, 2.5);
    },

    stopMusic() {
      if (!this._musicNodes) return;
      const nodes = this._musicNodes;
      this._musicNodes = null;
      const t = this.ctx.currentTime;
      this.musicGain.gain.setTargetAtTime(0, t, 0.6);
      setTimeout(() => nodes.forEach(n => { try { n.stop(); } catch (e) {} }), 2200);
    },

    setMusic(on) {
      this.musicEnabled = on;
      store.set('music', on);
      if (on) this.startMusic(); else this.stopMusic();
    },

    /** Kurzzeitig leiser, z. B. während Modals. */
    duckMusic(on) {
      if (!this.musicGain || !this._musicNodes) return;
      this.musicGain.gain.setTargetAtTime(on ? 0.16 : 0.5, this.ctx.currentTime, 0.35);
    }
  };

  /* ============================================================
     Prozedurale Klangerzeugung (Fallback ohne Assets)
     ============================================================ */

  function env(ctx, dest, { attack = 0.004, decay = 0.18, peak = 0.3, sustain = 0, release = 0.05 } = {}) {
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    if (sustain > 0) {
      g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0002), t + attack + decay);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay + release);
    } else {
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    }
    g.connect(dest);
    return { node: g, stopAt: t + attack + decay + release + 0.05 };
  }

  function tone(ctx, dest, { freq = 440, type = 'sine', glide = 0, ...envOpts }) {
    const o = ctx.createOscillator();
    o.type = type;
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), t + (envOpts.decay || 0.18));
    const e = env(ctx, dest, envOpts);
    o.connect(e.node);
    o.start(t);
    o.stop(e.stopAt);
    return o;
  }

  let noiseBuffer = null;
  function noise(ctx, dest, { dur = 0.3, filterType = 'bandpass', freq = 900, q = 1, peak = 0.25, sweep = 0 }) {
    if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
      const len = ctx.sampleRate * 2;
      noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    const t = ctx.currentTime;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    f.Q.value = q;
    const e = env(ctx, dest, { attack: 0.005, decay: dur, peak });
    src.connect(f).connect(e.node);
    src.start(t);
    src.stop(e.stopAt);
  }

  const SYNTH = {
    click: (ctx, out) => tone(ctx, out, { freq: 660, type: 'triangle', attack: 0.002, decay: 0.055, peak: 0.16, glide: 0.85 }),
    hover: (ctx, out) => tone(ctx, out, { freq: 1180, type: 'sine', attack: 0.002, decay: 0.04, peak: 0.045 }),

    phase: (ctx, out) => {
      tone(ctx, out, { freq: 392, type: 'sine', attack: 0.01, decay: 0.3, peak: 0.14 });
      tone(ctx, out, { freq: 587.3, type: 'sine', attack: 0.02, decay: 0.4, peak: 0.09 });
    },

    cardDeal: (ctx, out) => noise(ctx, out, { dur: 0.16, filterType: 'highpass', freq: 2400, peak: 0.1, sweep: 0.5 }),

    cardPick: (ctx, out) => {
      tone(ctx, out, { freq: 523.3, type: 'triangle', attack: 0.003, decay: 0.1, peak: 0.16 });
      setTimeout(() => tone(ctx, out, { freq: 784, type: 'triangle', attack: 0.003, decay: 0.16, peak: 0.13 }), 60);
    },

    mutation: (ctx, out) => {
      // Aufsteigendes Arpeggio: „etwas Neues ist entstanden“.
      [523.3, 659.3, 880, 1174.7].forEach((f, i) => {
        setTimeout(() => tone(ctx, out, { freq: f, type: 'sine', attack: 0.004, decay: 0.32, peak: 0.15 - i * 0.02 }), i * 72);
      });
    },

    food: (ctx, out) => {
      [392, 523.3, 659.3].forEach((f, i) => {
        setTimeout(() => tone(ctx, out, { freq: f, type: 'triangle', attack: 0.004, decay: 0.22, peak: 0.13 }), i * 55);
      });
    },

    drink: (ctx, out, o) => tone(ctx, out, { freq: 300 + (o.rate || 1) * 120, type: 'sine', attack: 0.003, decay: 0.11, peak: 0.075, glide: 1.7 }),

    birth: (ctx, out) => tone(ctx, out, { freq: 720, type: 'sine', attack: 0.004, decay: 0.17, peak: 0.11, glide: 1.9 }),

    death: (ctx, out) => {
      tone(ctx, out, { freq: 180, type: 'sine', attack: 0.004, decay: 0.24, peak: 0.13, glide: 0.45 });
      noise(ctx, out, { dur: 0.16, filterType: 'lowpass', freq: 620, peak: 0.07, sweep: 0.35 });
    },

    hunt: (ctx, out) => {
      noise(ctx, out, { dur: 0.2, filterType: 'bandpass', freq: 1500, q: 1.3, peak: 0.16, sweep: 0.28 });
      tone(ctx, out, { freq: 220, type: 'sawtooth', attack: 0.003, decay: 0.16, peak: 0.09, glide: 0.5 });
    },

    extinct: (ctx, out) => {
      [440, 349.2, 261.6, 196].forEach((f, i) => {
        setTimeout(() => tone(ctx, out, { freq: f, type: 'triangle', attack: 0.01, decay: 0.5, peak: 0.14 }), i * 150);
      });
    },

    catastrophe: (ctx, out) => {
      noise(ctx, out, { dur: 1.5, filterType: 'lowpass', freq: 380, peak: 0.4, sweep: 0.18 });
      tone(ctx, out, { freq: 68, type: 'sawtooth', attack: 0.02, decay: 1.3, peak: 0.3, glide: 0.4 });
      tone(ctx, out, { freq: 101, type: 'square', attack: 0.05, decay: 1.0, peak: 0.1, glide: 0.5 });
    },

    victory: (ctx, out) => {
      [523.3, 659.3, 784, 1046.5, 1318.5].forEach((f, i) => {
        setTimeout(() => {
          tone(ctx, out, { freq: f, type: 'triangle', attack: 0.006, decay: 0.55, peak: 0.17 });
          tone(ctx, out, { freq: f * 2, type: 'sine', attack: 0.006, decay: 0.4, peak: 0.05 });
        }, i * 130);
      });
    }
  };

  EA.audio = AudioEngine;
})(window);
