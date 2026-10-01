/* ==========================================================================
   Storage Engines, Block by Block — Core Interactive Engine (core.js)
   ========================================================================== */

(function () {
  'use strict';

  const OS = (window.OS = {
    registry: {},
    redraws: new Set(),
    instances: new Map()
  });

  const root = document.documentElement;
  OS.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Theme Tokens ---------- */
  const TOKENS = [
    'bg', 'surface', 'sunk', 'ink', 'muted', 'faint', 'line',
    'accent', 'user', 'kernel', 'amber', 'teal', 'rose', 'violet', 'green',
    'p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'
  ];

  OS.C = {};

  function readColors() {
    const cs = getComputedStyle(root);
    for (const t of TOKENS) {
      OS.C[t] = cs.getPropertyValue('--' + t).trim() || '#888888';
    }
    OS.C.palette = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => OS.C['p' + i]);
  }

  readColors();

  function themeChanged() {
    readColors();
    OS.redraws.forEach((f) => {
      try { f(); } catch (err) { console.error('Redraw error:', err); }
    });
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  new MutationObserver(themeChanged).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => OS.redraws.forEach((f) => f()));
  }

  /* ---------- Math & Systems Utilities ---------- */
  OS.clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  OS.lerp = (a, b, t) => a + (b - a) * t;
  OS.ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  OS.rgba = function (hex, a) {
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    if (Number.isNaN(n)) return hex;
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  OS.mix = function (hexA, hexB, t) {
    const pa = parseInt(hexA.replace('#', ''), 16), pb = parseInt(hexB.replace('#', ''), 16);
    const ch = (p, s) => (p >> s) & 255;
    const m = (s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t);
    return `rgb(${m(16)},${m(8)},${m(0)})`;
  };

  OS.font = function (px, kind, weight) {
    const fam = kind === 'sans' ? '"IBM Plex Sans", system-ui, sans-serif'
      : kind === 'display' ? '"Bricolage Grotesque", system-ui, sans-serif'
      : '"IBM Plex Mono", ui-monospace, Menlo, monospace';
    return `${weight || 400} ${px}px ${fam}`;
  };

  OS.fmtBytes = function (b) {
    const u = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    let i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return (b >= 100 || i === 0 ? b.toFixed(0) : b >= 10 ? b.toFixed(1) : b.toFixed(2)) + ' ' + u[i];
  };

  OS.fmtHex = function (val, digits = 4) {
    return '0x' + (val >>> 0).toString(16).toUpperCase().padStart(digits, '0');
  };

  OS.fmtNs = function (ns) {
    if (ns < 1000) return `${ns.toFixed(0)} ns`;
    if (ns < 1000000) return `${(ns / 1000).toFixed(1)} µs`;
    if (ns < 1000000000) return `${(ns / 1000000).toFixed(1)} ms`;
    return `${(ns / 1000000000).toFixed(2)} s`;
  };

  /* ---------- DOM Creation Helpers ---------- */
  OS.el = function (tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') e.className = attrs[k];
        else if (k === 'text') e.textContent = attrs[k];
        else if (k === 'html') e.innerHTML = attrs[k];
        else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
        else e.setAttribute(k, attrs[k]);
      }
    }
    if (children) {
      for (const c of [].concat(children)) {
        if (c != null) e.append(c);
      }
    }
    return e;
  };

  OS.controls = function (host) {
    const bar = OS.el('div', { class: 'controls' });
    host.appendChild(bar);
    return bar;
  };

  OS.button = function (bar, label, onClick, opts = {}) {
    const b = OS.el('button', {
      class: 'btn' + (opts.primary ? ' primary' : ''),
      type: 'button',
      text: label
    });
    b.addEventListener('click', onClick);
    bar.appendChild(b);
    return b;
  };

  OS.slider = function (bar, o) {
    const wrap = OS.el('span', { class: 'slider' });
    const lab = OS.el('label', { for: o.id, text: o.label });
    const inp = OS.el('input', {
      type: 'range',
      id: o.id,
      min: o.min,
      max: o.max,
      step: o.step || 1,
      value: o.value
    });
    const out = OS.el('output', { for: o.id });
    const fmt = o.format || ((v) => v);
    const update = () => { out.textContent = fmt(parseFloat(inp.value)); };
    inp.addEventListener('input', () => {
      update();
      if (o.onInput) o.onInput(parseFloat(inp.value));
    });
    update();
    wrap.append(lab, inp, out);
    bar.appendChild(wrap);
    return {
      input: inp,
      get value() { return parseFloat(inp.value); },
      set(v) { inp.value = v; update(); }
    };
  };

  OS.segmented = function (bar, o) {
    const wrap = OS.el('span', { class: 'seg', role: 'group', 'aria-label': o.label || 'Options' });
    const btns = o.options.map((opt) => {
      const b = OS.el('button', {
        class: 'btn',
        type: 'button',
        text: opt.label,
        'aria-pressed': String(opt.value === o.value)
      });
      b.addEventListener('click', () => {
        set(opt.value);
        o.onChange(opt.value);
      });
      wrap.appendChild(b);
      return b;
    });

    function set(v) {
      o.options.forEach((opt, i) => {
        btns[i].setAttribute('aria-pressed', String(opt.value === v));
      });
    }

    bar.appendChild(wrap);
    return { set };
  };

  OS.select = function (bar, o, opts, cb) {
    if (typeof o === 'string') {
      o = {
        label: o,
        options: opts || [],
        onChange: cb || (() => {}),
        value: opts && opts[0] ? opts[0].value : undefined
      };
    }
    const wrap = OS.el('span', { class: 'select' });
    const lab = OS.el('label', { for: o.id || '', text: o.label });
    const sel = OS.el('select', { id: o.id || '' });
    (o.options || []).forEach((opt) => sel.appendChild(OS.el('option', { value: opt.value, text: opt.label })));
    if (o.value !== undefined) sel.value = o.value;
    sel.addEventListener('change', () => o.onChange && o.onChange(sel.value));
    wrap.append(lab, sel);
    bar.appendChild(wrap);
    return sel;
  };

  OS.readout = function (host) {
    const r = OS.el('div', { class: 'readout', 'aria-live': 'polite' });
    host.appendChild(r);
    return r;
  };

  /* ---------- High-DPI Responsive Canvas ---------- */
  OS.canvas = function (host, opts) {
    const stage = OS.el('div', { class: 'stage' });
    const c = OS.el('canvas', { class: 'viz-canvas' });
    if (opts.label) {
      c.setAttribute('role', 'img');
      c.setAttribute('aria-label', opts.label);
    }
    stage.appendChild(c);
    host.appendChild(stage);

    const ctx = c.getContext('2d');
    let width = 0, height = 0;

    function resize() {
      const rect = stage.getBoundingClientRect();
      const w = Math.max(280, Math.floor(rect.width));
      const h = typeof opts.height === 'function' ? opts.height(w) : (opts.height || 260);
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

      if (width !== w || height !== h || c.width !== Math.floor(w * dpr)) {
        width = w;
        height = h;
        c.width = Math.floor(w * dpr);
        c.height = Math.floor(h * dpr);
        c.style.height = h + 'px';
      }

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const drawFn = opts.draw || opts.render || (() => {});
      drawFn(ctx, w, h);
      ctx.restore();
    }

    const ro = new ResizeObserver(() => resize());
    ro.observe(stage);

    OS.redraws.add(resize);

    return {
      canvas: c,
      stage,
      redraw: resize,
      destroy: () => {
        ro.disconnect();
        OS.redraws.delete(resize);
      }
    };
  };

  /* ---------- Registration & Bootstrapping ---------- */
  OS.register = function (name, mountFn) {
    OS.registry[name] = mountFn;
  };

  OS.boot = function () {
    // 1. Mount all visualizers
    document.querySelectorAll('figure[data-viz]').forEach((fig) => {
      const name = fig.getAttribute('data-viz');
      const mount = OS.registry[name];
      if (!mount) {
        console.warn(`Visualizer "${name}" not registered.`);
        return;
      }
      const body = OS.el('div', { class: 'viz-body' });
      fig.insertBefore(body, fig.querySelector('figcaption'));
      try {
        mount(body, fig);
      } catch (err) {
        console.error(`Error mounting visualizer "${name}":`, err);
        body.appendChild(OS.el('div', { class: 'callout danger', text: `Failed to load simulator: ${err.message}` }));
      }
    });

    // 2. Setup Theme Switcher
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      const saved = localStorage.getItem('os-theme');
      if (saved) {
        root.setAttribute('data-theme', saved);
      }
      toggle.addEventListener('click', () => {
        const isDark = root.getAttribute('data-theme') === 'dark' ||
          (!root.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
        const next = isDark ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        localStorage.setItem('os-theme', next);
      });
    }

    // 3. Setup Scrollspy for Table of Contents
    const chapters = document.querySelectorAll('.chapter, .part-head');
    const tocLinks = document.querySelectorAll('.toc-list a');

    if ('IntersectionObserver' in window && chapters.length && tocLinks.length) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            tocLinks.forEach((link) => {
              if (link.getAttribute('href') === '#' + id) {
                link.classList.add('active');
              } else {
                link.classList.remove('active');
              }
            });
          }
        });
      }, { rootMargin: '-15% 0px -75% 0px' });

      chapters.forEach((ch) => observer.observe(ch));
    }
  };

})();
