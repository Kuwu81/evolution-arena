/* ============================================================
   Evolution Arena — Canvas-Darstellung des Wasserlochs

   Zeichnet die Population als einzelne Tokens: Größe, Form und
   Verzierung leiten sich direkt aus den Merkmalen ab, damit der
   Genpool im Bild sichtbar ist und nicht nur in Balken.
   ============================================================ */
(function (global) {
  'use strict';
  const EA = global.EA;
  const U = EA.util;
  const { clamp, lerp, easeOutCubic, easeOutBack, rgba } = U;

  const TAU = Math.PI * 2;
  /** Obergrenze für Partikel – schützt Bildrate und Speicher bei großen Populationen. */
  const MAX_PARTICLES = 900;

  const Arena = {
    canvas: null, ctx: null, overlay: null, wrap: null,
    w: 0, h: 0, dpr: 1,
    game: null,
    time: 0,
    mode: 'idle',
    particles: [],
    ripples: [],
    attackLines: [],
    shakeAmount: 0,

    init(canvas, overlay, wrap) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.overlay = overlay;
      this.wrap = wrap;

      const ro = global.ResizeObserver ? new ResizeObserver(() => this.resize()) : null;
      if (ro) ro.observe(wrap); else global.addEventListener('resize', () => this.resize());
      this.resize();
    },

    resize() {
      if (!this.wrap) return;
      const r = this.wrap.getBoundingClientRect();
      this.w = Math.max(1, r.width);
      this.h = Math.max(1, r.height);
      this.dpr = Math.min(global.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(this.w * this.dpr);
      this.canvas.height = Math.round(this.h * this.dpr);
      this.canvas.style.width = this.w + 'px';
      this.canvas.style.height = this.h + 'px';
      this.layout(true);
    },

    setGame(game) {
      this.game = game;
      this.particles.length = 0;
      this.ripples.length = 0;
      this.attackLines.length = 0;
      this.layout(true);
    },

    /* ---------- Geometrie ---------- */
    poolRadius() {
      const base = Math.min(this.w, this.h) * 0.155;
      const mod = this.game ? this.game.env.foodMod : 1;
      return base * (0.72 + 0.34 * clamp(mod, 0.3, 1.6));
    },

    /** Verteilt jedes Individuum auf einen festen Platz im Sektor seines Teams. */
    layout(snap) {
      // Solange die Canvasgröße unbekannt ist, würden alle Plätze bei (0,0)
      // landen. Dann lieber nichts setzen – resize() holt das Layout nach.
      if (!this.game || this.w < 8 || this.h < 8) return;
      const cx = this.w / 2, cy = this.h / 2;
      const teams = this.game.teams;
      const n = Math.max(1, teams.length);
      const pr = this.poolRadius();
      const maxR = Math.min(this.w, this.h) * 0.47;
      const sector = TAU / n;

      teams.forEach((team, ti) => {
        const centerAngle = -Math.PI / 2 + sector * ti + sector / 2;
        const count = team.individuals.length;
        const perRow = Math.max(3, Math.min(8, Math.ceil(Math.sqrt(count * 1.6))));
        const rows = Math.ceil(count / perRow);
        const rowStep = clamp((maxR - pr - 22) / Math.max(1, rows), 20, 34);

        team.individuals.forEach((ind, j) => {
          const row = Math.floor(j / perRow);
          const col = j % perRow;
          const inRow = Math.min(perRow, count - row * perRow);
          const r = pr + 26 + row * rowStep;
          const angSpan = Math.min(sector * 0.86, (inRow * 30) / Math.max(r, 1));
          const a = centerAngle + (inRow === 1 ? 0 : (col / (inRow - 1) - 0.5) * angSpan);

          ind.homeX = cx + Math.cos(a) * r;
          ind.homeY = cy + Math.sin(a) * r * 0.86;
          ind.drinkX = cx + Math.cos(a) * (pr * 0.94);
          ind.drinkY = cy + Math.sin(a) * (pr * 0.94) * 0.86;
          ind.angle = a;

          if (snap || (ind.x === 0 && ind.y === 0)) {
            ind.x = ind.homeX; ind.y = ind.homeY;
          }
          ind.tx = ind.homeX; ind.ty = ind.homeY;
        });
      });
    },

    setMode(mode) {
      this.mode = mode;
      if (!this.game) return;
      for (const team of this.game.teams) {
        for (const ind of team.individuals) {
          const drink = mode === 'feeding' && ind.stats && ind.stats.lane !== 'meat';
          ind.tx = drink ? ind.drinkX : ind.homeX;
          ind.ty = drink ? ind.drinkY : ind.homeY;
        }
      }
    },

    /* ---------- Effekte ---------- */
    shake(amount) { this.shakeAmount = Math.max(this.shakeAmount, amount || 12); },

    flash(color, ms) {
      if (!this.overlay) return;
      const f = U.el('div', { class: 'flash', style: { background: color } });
      this.overlay.appendChild(f);
      requestAnimationFrame(() => f.classList.add('is-on'));
      setTimeout(() => f.remove(), ms || 750);
    },

    ripple(x, y, color) {
      this.ripples.push({ x, y, r: 4, max: 34 + Math.random() * 14, life: 1, color: color || '#7fd8ff' });
    },

    burst(x, y, color, count, opts) {
      const o = opts || {};
      const n = Math.min(count || 10, MAX_PARTICLES - this.particles.length);
      if (n <= 0) return;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const sp = (o.speed || 60) * (0.35 + Math.random());
        this.particles.push({
          x, y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - (o.lift || 20),
          g: o.gravity === undefined ? 90 : o.gravity,
          life: o.life || 0.8,
          max: o.life || 0.8,
          size: (o.size || 3) * (0.6 + Math.random() * 0.8),
          color,
          shape: o.shape || 'dot'
        });
      }
    },

    floatText(x, y, text, color) {
      if (!this.overlay) return;
      const node = U.el('div', {
        class: 'float-num',
        style: { left: x + 'px', top: y + 'px', color: color || '#fff' },
        text
      });
      this.overlay.appendChild(node);
      setTimeout(() => node.remove(), 1200);
    },

    /* ---------- Simulation ---------- */
    update(dt) {
      this.time += dt;
      const s = dt / 1000;

      if (this.shakeAmount > 0) this.shakeAmount = Math.max(0, this.shakeAmount - s * 42);

      if (this.game) {
        for (const team of this.game.teams) {
          for (const ind of team.individuals) {
            // Weiches Anfahren des Zielplatzes
            const k = 1 - Math.pow(0.0016, s);
            ind.x = lerp(ind.x, ind.tx, k);
            ind.y = lerp(ind.y, ind.ty, k);

            const v = ind.vis;
            v.t += s;
            if (v.state === 'born') {
              v.scale = easeOutBack(clamp(v.t / 0.5, 0, 1));
              if (v.t > 0.55) { v.state = 'idle'; v.scale = 1; }
            } else if (v.state === 'dying') {
              v.alpha = 1 - clamp(v.t / 0.6, 0, 1);
              v.scale = 1 - clamp(v.t / 0.6, 0, 1) * 0.6;
            } else {
              v.scale = lerp(v.scale, 1, 1 - Math.pow(0.002, s));
              v.alpha = 1;
              if ((v.state === 'mutating' || v.state === 'boosted') && v.t > 1.6) v.state = 'idle';
            }
          }
        }
      }

      // Partikel
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= s;
        if (p.life <= 0) { this.particles.splice(i, 1); continue; }
        p.x += p.vx * s;
        p.y += p.vy * s;
        p.vy += p.g * s;
        p.vx *= 0.985;
      }

      for (let i = this.ripples.length - 1; i >= 0; i--) {
        const r = this.ripples[i];
        r.r += s * 46;
        r.life -= s * 1.3;
        if (r.life <= 0 || r.r > r.max) this.ripples.splice(i, 1);
      }

      for (let i = this.attackLines.length - 1; i >= 0; i--) {
        const l = this.attackLines[i];
        l.life -= s;
        if (l.life <= 0) this.attackLines.splice(i, 1);
      }

      this.spawnWeather(s);
    },

    spawnWeather(s) {
      if (!this.game || this.particles.length >= MAX_PARTICLES) return;
      const t = this.game.env.temp;
      const rate = (t < 10 || t > 28) ? 14 : 3;
      if (Math.random() > rate * s) return;
      if (t < 10) {
        this.particles.push({
          x: Math.random() * this.w, y: -6,
          vx: -8 + Math.random() * 16, vy: 16 + Math.random() * 22, g: 0,
          life: 6, max: 6, size: 1 + Math.random() * 1.6,
          color: 'rgba(220,240,255,.7)', shape: 'dot'
        });
      } else if (t > 28) {
        this.particles.push({
          x: Math.random() * this.w, y: this.h + 6,
          vx: -6 + Math.random() * 12, vy: -12 - Math.random() * 14, g: 0,
          life: 5, max: 5, size: 1 + Math.random() * 1.8,
          color: 'rgba(255,190,120,.4)', shape: 'dot'
        });
      } else {
        this.particles.push({
          x: Math.random() * this.w, y: this.h * (0.5 + Math.random() * 0.5),
          vx: 10 + Math.random() * 16, vy: -3 - Math.random() * 5, g: 0,
          life: 4.5, max: 4.5, size: 1 + Math.random() * 1.4,
          color: 'rgba(226,200,150,.28)', shape: 'dot'
        });
      }
    },

    /* ---------- Zeichnen ---------- */
    draw() {
      const ctx = this.ctx;
      if (!ctx) return;
      ctx.save();
      ctx.scale(this.dpr, this.dpr);
      ctx.clearRect(0, 0, this.w, this.h);

      if (this.shakeAmount > 0) {
        const a = this.shakeAmount;
        ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
      }

      this.drawBackground(ctx);
      this.drawPool(ctx);
      if (this.game) {
        this.drawTeamLabels(ctx);
        this.drawAttackLines(ctx);
        this.drawCreatures(ctx);
      }
      this.drawParticles(ctx);
      this.drawVignette(ctx);
      ctx.restore();
    },

    drawBackground(ctx) {
      const temp = this.game ? this.game.env.temp : 20;
      const cold = clamp((14 - temp) / 20, 0, 1);
      const hot = clamp((temp - 24) / 16, 0, 1) * 0.8;

      const sky = ctx.createLinearGradient(0, 0, 0, this.h);
      sky.addColorStop(0, U.mixHex(U.mixHex('#123044', '#1d4a63', cold), '#6d3418', hot));
      sky.addColorStop(0.45, U.mixHex(U.mixHex('#123243', '#20455c', cold), '#8a4a1e', hot));
      sky.addColorStop(1, U.mixHex(U.mixHex('#1a2b26', '#233a45', cold), '#3a2413', hot));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, this.w, this.h);

      // Warmer Horizontschimmer bzw. kalter Dunst über dem Wasserloch
      if (hot > 0.05 || cold > 0.05) {
        const glow = ctx.createRadialGradient(this.w / 2, this.h * 0.52, 0, this.w / 2, this.h * 0.52, Math.max(this.w, this.h) * 0.6);
        glow.addColorStop(0, hot > cold ? rgba('#ffb066', 0.13 * hot) : rgba('#bfe4ff', 0.11 * cold));
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, this.w, this.h);
      }

      // Bodenstruktur: konzentrische Trampelpfade zum Wasserloch
      const cx = this.w / 2, cy = this.h / 2;
      ctx.save();
      ctx.globalAlpha = 0.13;
      ctx.strokeStyle = hot > 0.3 ? '#c99a5e' : '#7ba58f';
      ctx.lineWidth = 1;
      for (let i = 1; i <= 6; i++) {
        const r = this.poolRadius() + i * Math.min(this.w, this.h) * 0.055;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r, r * 0.86, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    },

    drawPool(ctx) {
      const cx = this.w / 2, cy = this.h / 2;
      const r = this.poolRadius();
      const t = this.time / 1000;

      // Uferzone
      ctx.save();
      const shore = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 1.45);
      shore.addColorStop(0, 'rgba(90,72,45,.55)');
      shore.addColorStop(1, 'rgba(90,72,45,0)');
      ctx.fillStyle = shore;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 1.45, r * 1.45 * 0.86, 0, 0, TAU);
      ctx.fill();

      // Wasserfläche
      const water = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.3, r * 0.1, cx, cy, r);
      water.addColorStop(0, '#6fd5f5');
      water.addColorStop(0.55, '#2c9ac9');
      water.addColorStop(1, '#12495f');
      ctx.fillStyle = water;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.86, 0, 0, TAU);
      ctx.fill();

      // Glanzlichter
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const a = t * (0.25 + i * 0.09) + i * 1.7;
        const rr = r * (0.28 + i * 0.16);
        ctx.strokeStyle = 'rgba(190,240,255,' + (0.1 - i * 0.018) + ')';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(a) * r * 0.06, cy + Math.sin(a) * r * 0.04, rr, rr * 0.86, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';

      // Ringe von Trinkbewegungen
      for (const rp of this.ripples) {
        ctx.strokeStyle = rgba(rp.color === '#7fd8ff' ? '#7fd8ff' : rp.color, Math.max(0, rp.life) * 0.5);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(rp.x, rp.y, rp.r, rp.r * 0.6, 0, 0, TAU);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(255,255,255,.14)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.86, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    },

    drawTeamLabels(ctx) {
      const cx = this.w / 2, cy = this.h / 2;
      const n = Math.max(1, this.game.teams.length);
      const sector = TAU / n;
      const rad = Math.min(this.w, this.h) * 0.475;

      ctx.save();
      ctx.font = '600 11px ' + getComputedStyle(document.body).fontFamily;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      this.game.teams.forEach((team, i) => {
        const a = -Math.PI / 2 + sector * i + sector / 2;
        const x = cx + Math.cos(a) * rad;
        const y = cy + Math.sin(a) * rad * 0.86;
        const alive = team.individuals.length;
        ctx.globalAlpha = alive ? 0.9 : 0.35;
        ctx.fillStyle = team.color;
        ctx.fillText(team.name + '  ' + alive, clamp(x, 54, this.w - 54), clamp(y, 14, this.h - 14));
      });
      ctx.restore();
    },

    drawAttackLines(ctx) {
      if (!this.attackLines.length) return;
      ctx.save();
      ctx.lineCap = 'round';
      for (const l of this.attackLines) {
        const p = clamp(l.life / l.max, 0, 1);
        const e = easeOutCubic(1 - p);
        ctx.strokeStyle = rgba(l.success ? '#ff5a4a' : '#9fb4c4', p * 0.85);
        ctx.lineWidth = 1 + p * 2.2;
        ctx.setLineDash(l.success ? [] : [4, 4]);
        ctx.beginPath();
        ctx.moveTo(l.x1, l.y1);
        ctx.lineTo(lerp(l.x1, l.x2, e), lerp(l.y1, l.y2, e));
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    },

    drawCreatures(ctx) {
      const list = [];
      for (const team of this.game.teams) {
        for (const ind of team.individuals) list.push({ ind, team });
      }
      // Tiefensortierung, damit vordere Tiere hintere überlappen
      list.sort((a, b) => a.ind.y - b.ind.y);
      for (const e of list) this.drawCreature(ctx, e.ind, e.team);
    },

    drawCreature(ctx, ind, team) {
      const v = ind.vis;
      if (v.alpha <= 0.01 || ind.homeX === undefined) return;
      const st = ind.stats || EA.genetics.baseStats();
      const has = id => ind.traits.indexOf(id) !== -1;

      const bob = Math.sin(this.time / 520 + ind.seed) * 1.6;
      const x = ind.x, y = ind.y + bob;
      const base = Math.min(this.w, this.h) * 0.0165;
      const R = base * clamp(st.bodyScale, 0.6, 2.2) * clamp(v.scale, 0, 1.4);
      if (R < 0.4) return;

      ctx.save();
      ctx.globalAlpha = v.alpha * (has('camo') ? 0.62 : 1);

      // Schatten
      ctx.fillStyle = 'rgba(0,0,0,.32)';
      ctx.beginPath();
      ctx.ellipse(x, y + R * 0.95, R * 1.05, R * 0.36, 0, 0, TAU);
      ctx.fill();

      // Aura bei besonderen Zuständen
      if (v.state === 'mutating' || v.state === 'boosted') {
        const p = clamp(v.t / 1.6, 0, 1);
        const col = v.state === 'mutating' ? '#b491ff' : '#fbbf24';
        ctx.strokeStyle = rgba(col, (1 - p) * 0.85);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, R * (1.4 + p * 2.4), 0, TAU);
        ctx.stroke();
      }
      if (has('brightcolor')) {
        ctx.fillStyle = rgba('#ffe066', 0.14 + Math.sin(this.time / 320 + ind.seed) * 0.05);
        ctx.beginPath();
        ctx.arc(x, y, R * 2.1, 0, TAU);
        ctx.fill();
      }
      if (has('isolation')) {
        ctx.strokeStyle = rgba('#8fd8f5', 0.5);
        ctx.setLineDash([3, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, R * 1.75, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Fell als weiche Kontur
      if (has('fur')) {
        ctx.strokeStyle = rgba('#f0e2c8', 0.5);
        ctx.lineWidth = 1;
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU + Math.sin(this.time / 900 + ind.seed) * 0.1;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a) * R * 0.95, y + Math.sin(a) * R * 0.85);
          ctx.lineTo(x + Math.cos(a) * R * 1.42, y + Math.sin(a) * R * 1.28);
          ctx.stroke();
        }
      }

      // Körper
      const bodyColor = has('carnivore') ? U.mixHex(team.color, '#ff5a4a', 0.42) : team.color;
      const g = ctx.createLinearGradient(x, y - R, x, y + R);
      g.addColorStop(0, U.mixHex(bodyColor, '#ffffff', 0.34));
      g.addColorStop(1, U.mixHex(bodyColor, '#000000', 0.34));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, R * 1.12, R, 0, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = rgba('#04121a', 0.55);
      ctx.lineWidth = Math.max(0.6, R * 0.1);
      ctx.stroke();

      // Panzerplatte
      if (has('armor')) {
        ctx.strokeStyle = rgba('#d7e6f0', 0.75);
        ctx.lineWidth = Math.max(1, R * 0.22);
        ctx.beginPath();
        ctx.arc(x, y, R * 0.78, Math.PI * 1.08, Math.PI * 1.92);
        ctx.stroke();
      }

      // Geschwindigkeitsstreifen
      if (has('speed')) {
        ctx.strokeStyle = rgba('#ffffff', 0.42);
        ctx.lineWidth = Math.max(0.7, R * 0.13);
        for (let i = 0; i < 2; i++) {
          const yy = y - R * 0.25 + i * R * 0.5;
          ctx.beginPath();
          ctx.moveTo(x - R * 2.0, yy);
          ctx.lineTo(x - R * 1.15, yy);
          ctx.stroke();
        }
      }

      // Reißzähne
      if (has('carnivore')) {
        ctx.fillStyle = '#fff4ec';
        ctx.beginPath();
        ctx.moveTo(x + R * 0.75, y + R * 0.05);
        ctx.lineTo(x + R * 1.22, y + R * 0.3);
        ctx.lineTo(x + R * 0.72, y + R * 0.42);
        ctx.closePath();
        ctx.fill();
      }

      // Auge
      ctx.fillStyle = has('nocturnal') ? '#ffe9a8' : '#0a1620';
      ctx.beginPath();
      ctx.arc(x + R * 0.42, y - R * 0.24, Math.max(0.8, R * 0.19), 0, TAU);
      ctx.fill();

      // Kleine Merkmalsmarker über dem Rücken
      const markers = [];
      if (has('herd')) markers.push('#9fe8c4');
      if (has('warncall')) markers.push('#ffd166');
      if (has('scavenger')) markers.push('#c9b79a');
      if (has('symbiosis')) markers.push('#8fd8f5');
      if (has('rstrategy')) markers.push('#ffb3d1');
      if (has('broodcare')) markers.push('#b491ff');
      if (has('neutral')) markers.push('#8fa3b3');
      markers.slice(0, 4).forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x - R * 0.6 + i * R * 0.42, y - R * 1.45, Math.max(0.7, R * 0.15), 0, TAU);
        ctx.fill();
      });

      // Sattheitsanzeige – erst sichtbar, wenn die Fütterung aufgelöst wurde
      if (this.mode === 'feeding' && ind.fedRevealed) {
        const okay = ind.fed;
        ctx.fillStyle = okay ? rgba('#4fe0a6', 0.95) : rgba('#ff6a5a', 0.9);
        ctx.beginPath();
        ctx.arc(x + R * 1.35, y - R * 1.2, Math.max(1.2, R * 0.3), 0, TAU);
        ctx.fill();
      }

      ctx.restore();
    },

    drawParticles(ctx) {
      for (const p of this.particles) {
        const a = clamp(p.life / p.max, 0, 1);
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        if (p.shape === 'square') {
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    },

    drawVignette(ctx) {
      const g = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.32,
                                         this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,.55)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);
    },

    /* ---------- Von den Phasen aufgerufene Kurzeffekte ---------- */
    fxDrink(ind) {
      this.ripple(ind.x, ind.y, '#7fd8ff');
      this.burst(ind.x, ind.y, 'rgba(150,225,255,.9)', 4, { speed: 34, life: 0.5, size: 1.8, gravity: 60 });
    },
    fxDeath(ind, team, cause) {
      const col = cause === 'starved' ? '#c9a978' : (cause === 'drift' ? '#ff8f7a' : '#ff6a5a');
      this.burst(ind.x, ind.y, col, 12, { speed: 70, life: 0.85, size: 2.6 });
      this.floatText(ind.x, ind.y, '✕', col);
    },
    fxBirth(ind, team) {
      this.burst(ind.x, ind.y, U.mixHex(team.color, '#ffffff', 0.4), 9, { speed: 46, life: 0.7, size: 2.2, gravity: -20 });
    },
    fxHunt(hunter, prey, success) {
      this.attackLines.push({
        x1: hunter.x, y1: hunter.y, x2: prey.x, y2: prey.y,
        life: 0.55, max: 0.55, success: !!success
      });
      if (success) {
        this.burst(prey.x, prey.y, '#ff5a4a', 14, { speed: 95, life: 0.7, size: 2.8 });
      } else {
        this.burst(prey.x, prey.y, '#9fb4c4', 6, { speed: 55, life: 0.45, size: 1.8 });
      }
      this.burst(hunter.x, hunter.y, '#ffb199', 5, { speed: 50, life: 0.5, size: 2 });
    },
    fxMutation(ind) {
      this.burst(ind.x, ind.y, '#b491ff', 16, { speed: 80, life: 1.0, size: 2.4, gravity: -35 });
      this.floatText(ind.x, ind.y, '🧬', '#b491ff');
    }
  };

  EA.arena = Arena;
})(window);
