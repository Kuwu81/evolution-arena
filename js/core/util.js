/* ============================================================
   Evolution Arena — Kern-Hilfsfunktionen
   Deterministischer Zufall (Seed) macht Partien reproduzierbar.
   ============================================================ */
(function (global) {
  'use strict';

  const EA = global.EA = global.EA || {};

  /* ---------- Mathe ---------- */
  const clamp = (v, lo, hi) => v < lo ? lo : (v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const easeOutBack = t => { const c = 1.70158, c3 = c + 1; return 1 + c3 * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

  /* ---------- Seeded RNG (mulberry32) ---------- */
  function Rng(seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    const next = () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      next,
      /** Gleichverteilt in [lo, hi) */
      range: (lo, hi) => lo + next() * (hi - lo),
      /** Ganzzahl in [lo, hi] */
      int: (lo, hi) => Math.floor(lo + next() * (hi - lo + 1)),
      /** true mit Wahrscheinlichkeit p */
      chance: p => next() < p,
      pick: arr => arr[Math.floor(next() * arr.length)],
      /** Fisher-Yates, in-place */
      shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
      },
      /** Gewichtete Auswahl: items = [{...}], weightFn -> Zahl */
      weighted(items, weightFn) {
        let total = 0;
        for (const it of items) total += Math.max(0, weightFn(it));
        if (total <= 0) return items[Math.floor(next() * items.length)];
        let r = next() * total;
        for (const it of items) {
          r -= Math.max(0, weightFn(it));
          if (r <= 0) return it;
        }
        return items[items.length - 1];
      },
      /** Ganzzahl aus Erwartungswert: floor + Rest als Wahrscheinlichkeit */
      stochasticRound(v) {
        const f = Math.floor(v);
        return f + (next() < (v - f) ? 1 : 0);
      }
    };
  }

  /* ---------- DOM ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'style' && typeof v === 'object') {
          for (const p in v) {
            // Eigene CSS-Properties brauchen setProperty, Object.assign greift dort nicht.
            if (p.charAt(0) === '-') node.style.setProperty(p, v[p]);
            else node.style[p] = v[p];
          }
        }
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k.slice(0, 2) === '--') node.style.setProperty(k, v);
        else node.setAttribute(k, v);
      }
    }
    if (children != null) {
      const list = Array.isArray(children) ? children : [children];
      for (const c of list) {
        if (c === null || c === undefined || c === false) continue;
        node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
      }
    }
    return node;
  }

  /** Icon + Text als getrennte Flex-Kinder – nur so greift der gap des Buttons. */
  const iconLabel = (icon, text) => [el('span', { class: 'btn__icon' }, icon), text];

  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  /* ---------- Uhr: pausierbare Wartezeit ----------
     Bewusst NICHT an requestAnimationFrame gekoppelt: rAF steht in
     Hintergrund-Tabs still, der Rundenablauf würde dann einfrieren.
     Ein eigener Intervall-Treiber läuft auch dort weiter. */
  function Clock() {
    const timers = new Set();
    let speed = 1, paused = false, last = 0, driver = 0;

    function step() {
      const now = performance.now();
      const dt = Math.min(200, now - last);   // Sprünge nach Tab-Wechsel begrenzen
      last = now;
      if (paused || timers.size === 0) return;
      const scaled = dt * speed;
      for (const t of Array.from(timers)) {
        t.left -= scaled;
        if (t.left <= 0) { timers.delete(t); t.resolve(); }
      }
    }

    return {
      get speed() { return speed; },
      set speed(v) { speed = v; },
      get paused() { return paused; },
      set paused(v) { paused = v; },
      /** Wartet ms Spielzeit (skaliert mit speed, hält bei Pause an). */
      wait(ms) {
        if (ms <= 0) return Promise.resolve();
        return new Promise(resolve => timers.add({ left: ms, resolve }));
      },
      /** Alle laufenden Wartezeiten sofort auflösen (Abbruch/Skip). */
      flush() {
        for (const t of timers) t.resolve();
        timers.clear();
      },
      start() {
        if (driver) return;
        last = performance.now();
        driver = setInterval(step, 16);
      },
      stop() {
        clearInterval(driver);
        driver = 0;
      }
    };
  }

  /* ---------- Winziger Event-Bus ---------- */
  function Emitter() {
    const map = new Map();
    return {
      on(evt, fn) {
        if (!map.has(evt)) map.set(evt, new Set());
        map.get(evt).add(fn);
        return () => map.get(evt).delete(fn);
      },
      emit(evt, payload) {
        const set = map.get(evt);
        if (set) for (const fn of Array.from(set)) fn(payload);
      }
    };
  }

  /* ---------- Farben ---------- */
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgba(hex, a) {
    const c = hexToRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
  }
  function mixHex(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    const to = v => Math.round(v).toString(16).padStart(2, '0');
    return '#' + to(lerp(A.r, B.r, t)) + to(lerp(A.g, B.g, t)) + to(lerp(A.b, B.b, t));
  }

  /* ---------- Persistenz (defensiv: Private-Mode / file:// ) ---------- */
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem('ea.' + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('ea.' + key, JSON.stringify(value)); } catch (e) { /* ignoriert */ }
    }
  };

  EA.util = {
    clamp, lerp, easeOutCubic, easeOutBack,
    Rng, Clock, Emitter,
    $, $$, el, iconLabel, escapeHtml,
    rgba, mixHex, store
  };
})(window);
