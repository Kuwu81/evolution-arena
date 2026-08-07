/* ============================================================
   Evolution Arena — Diagramme (reines Canvas, keine Bibliothek)
   ============================================================ */
(function (global) {
  'use strict';
  const EA = global.EA;
  const U = EA.util;
  const { clamp, rgba, el } = U;

  const PAD = { l: 42, r: 18, t: 22, b: 26 };

  function prepare(canvas) {
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(120, rect.width);
    const h = Math.max(90, rect.height || 240);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  /**
   * Liniendiagramm.
   * series: [{ label, color, values:[Zahl|null] }]
   * opts:   { xLabels, yMax, yTicks, yFormat, markers:[{x, label, color}] }
   */
  function lineChart(canvas, series, opts) {
    const o = opts || {};
    const { ctx, w, h } = prepare(canvas);
    const font = getComputedStyle(document.body).fontFamily;

    const n = Math.max(1, (o.xLabels || []).length);
    const yMax = o.yMax || Math.max(1, series.reduce((m, s) =>
      Math.max(m, s.values.reduce((mm, v) => Math.max(mm, v === null ? 0 : v), 0)), 0) * 1.15);

    const x0 = PAD.l, x1 = w - PAD.r, y0 = PAD.t, y1 = h - PAD.b;
    const px = i => n <= 1 ? x0 : x0 + (i / (n - 1)) * (x1 - x0);
    const py = v => y1 - clamp(v / yMax, 0, 1) * (y1 - y0);

    // Gitter
    const ticks = o.yTicks || 4;
    ctx.font = '10px ' + font;
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= ticks; i++) {
      const v = (yMax / ticks) * i;
      const y = py(v);
      ctx.strokeStyle = 'rgba(150,195,220,.09)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, y + .5);
      ctx.lineTo(x1, y + .5);
      ctx.stroke();
      ctx.fillStyle = 'rgba(143,163,179,.85)';
      ctx.textAlign = 'right';
      ctx.fillText(o.yFormat ? o.yFormat(v) : String(Math.round(v)), x0 - 7, y);
    }

    // X-Beschriftung
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const step = Math.ceil(n / 12);
    (o.xLabels || []).forEach((lab, i) => {
      if (i % step !== 0 && i !== n - 1) return;
      ctx.fillStyle = 'rgba(143,163,179,.85)';
      ctx.fillText(lab, px(i), y1 + 7);
    });

    // Markierungen (z. B. Katastrophenrunden)
    for (const m of (o.markers || [])) {
      const x = px(m.x);
      ctx.strokeStyle = rgba(m.color || '#ff6a5a', 0.45);
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
      ctx.setLineDash([]);
      if (m.label) {
        ctx.fillStyle = rgba(m.color || '#ff6a5a', 0.9);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = '11px ' + font;
        ctx.fillText(m.label, x, y0 - 2);
        ctx.font = '10px ' + font;
      }
    }

    // Linien
    for (const s of series) {
      // Flächenverlauf
      const grad = ctx.createLinearGradient(0, y0, 0, y1);
      grad.addColorStop(0, rgba(s.color, 0.24));
      grad.addColorStop(1, rgba(s.color, 0));
      ctx.beginPath();
      let started = false;
      s.values.forEach((v, i) => {
        if (v === null) return;
        const X = px(i), Y = py(v);
        if (!started) { ctx.moveTo(X, Y); started = true; } else ctx.lineTo(X, Y);
      });
      if (started) {
        const lastIdx = s.values.length - 1;
        ctx.lineTo(px(lastIdx), y1);
        ctx.lineTo(px(0), y1);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }

      ctx.beginPath();
      started = false;
      s.values.forEach((v, i) => {
        if (v === null) return;
        const X = px(i), Y = py(v);
        if (!started) { ctx.moveTo(X, Y); started = true; } else ctx.lineTo(X, Y);
      });
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.2;
      ctx.lineJoin = 'round';
      ctx.shadowColor = rgba(s.color, 0.55);
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Punkte
      s.values.forEach((v, i) => {
        if (v === null) return;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(px(i), py(v), 2.6, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  function legend(container, series) {
    container.innerHTML = '';
    for (const s of series) {
      container.appendChild(el('span', { class: 'legend-item' }, [
        el('span', { class: 'legend-item__sw', style: { '--c': s.color } }),
        s.label
      ]));
    }
  }

  EA.charts = { lineChart, legend };
})(window);
