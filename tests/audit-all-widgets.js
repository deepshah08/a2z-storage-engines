/**
 * Comprehensive Automated Interactive Audit Harness for Storage Engines Simulators
 * Tests every button, slider, select, and segmented control at various viewports.
 */

const fs = require('fs');
const path = require('path');

// Setup mock browser environment with canvas instrumentation
global.window = {
  matchMedia: () => ({ matches: false, addEventListener: () => {} }),
  devicePixelRatio: 2
};

let currentWidth = 800;
let currentHeight = 240;

const trackedElements = [];

global.document = {
  documentElement: {
    getAttribute: () => null,
    setAttribute: () => {}
  },
  createElement: (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      className: '',
      children: [],
      style: {},
      attributes: {},
      textContent: '',
      innerHTML: '',
      get value() { return el._value !== undefined ? el._value : (el.attributes['value'] !== undefined ? el.attributes['value'] : ''); },
      set value(v) { el._value = v; el.attributes['value'] = v; },
      disabled: false,
      listeners: {},
      setAttribute: (k, v) => { el.attributes[k] = v; if (k === 'value') el._value = v; },
      getAttribute: (k) => el.attributes[k],
      appendChild: (c) => { el.children.push(c); return c; },
      append: (...args) => args.forEach(a => el.children.push(a)),
      addEventListener: (evt, cb) => {
        if (!el.listeners[evt]) el.listeners[evt] = [];
        el.listeners[evt].push(cb);
      },
      removeEventListener: (evt, cb) => {
        if (el.listeners[evt]) {
          el.listeners[evt] = el.listeners[evt].filter(f => f !== cb);
        }
      },
      dispatchEvent: (evtName) => {
        if (el.listeners[evtName]) {
          el.listeners[evtName].forEach(cb => cb({ target: el }));
        }
      },
      getContext: () => ({
        save: () => {}, restore: () => {}, setTransform: () => {},
        translate: (x, y) => checkCoords(x, y),
        rotate: (ang) => checkCoords(ang),
        clearRect: () => {}, fillRect: (x, y, w, h) => checkCoords(x, y, w, h),
        strokeRect: (x, y, w, h) => checkCoords(x, y, w, h),
        beginPath: () => {}, arc: (x, y, r) => checkCoords(x, y, r),
        closePath: () => {},
        fill: () => {}, stroke: () => {},
        roundRect: (x, y, w, h) => checkCoords(x, y, w, h),
        moveTo: (x, y) => checkCoords(x, y), lineTo: (x, y) => checkCoords(x, y),
        quadraticCurveTo: (cpx, cpy, x, y) => checkCoords(cpx, cpy, x, y),
        bezierCurveTo: (cp1x, cp1y, cp2x, cp2y, x, y) => checkCoords(cp1x, cp1y, cp2x, cp2y, x, y),
        fillText: (txt, x, y) => checkCoords(x, y),
        measureText: (txt) => ({ width: String(txt).length * 7 }),
        setLineDash: () => {}
      }),
      getBoundingClientRect: () => ({ width: currentWidth, height: currentHeight }),
      classList: {
        add: (c) => { el.className += ' ' + c; },
        remove: (c) => { el.className = el.className.replace(c, ''); },
        contains: (c) => el.className.includes(c)
      }
    };
    trackedElements.push(el);
    return el;
  },
  getElementById: (id) => null,
  querySelectorAll: () => []
};

function checkCoords(...vals) {
  global._totalCanvasDrawCalls = (global._totalCanvasDrawCalls || 0) + 1;
  for (const v of vals) {
    if (typeof v === 'number' && (isNaN(v) || !isFinite(v))) {
      throw new Error(`Invalid NaN/Infinite coordinate in canvas drawing: ${v}`);
    }
  }
}

global.getComputedStyle = () => ({ getPropertyValue: () => '#333333' });
global.MutationObserver = class { observe() {} };
global.ResizeObserver = class { observe() {} disconnect() {} };

eval(fs.readFileSync(path.join(process.cwd(), 'assets', 'core.js'), 'utf8'));
global.OS = window.OS;

const assetsDir = path.join(process.cwd(), 'assets');
const vizFiles = fs.readdirSync(assetsDir).filter(f => f.startsWith('viz-') && f.endsWith('.js'));
vizFiles.forEach(f => {
  eval(fs.readFileSync(path.join(assetsDir, f), 'utf8'));
});

const simNames = Object.keys(OS.registry);

// ============================================================================
// STAGE 1: DOCUMENT, TYPOGRAPHY & MATH FORMATTING AUDIT
// ============================================================================
console.log(`\n======================================================`);
console.log(`STAGE 1: DOCUMENT, TYPOGRAPHY & MATH FORMATTING AUDIT`);
console.log(`======================================================\n`);

let formattingErrors = [];
const htmlPath = path.join(process.cwd(), 'index.html');
const cssPath = path.join(process.cwd(), 'assets', 'style.css');

if (!fs.existsSync(htmlPath)) {
  formattingErrors.push('Missing index.html');
} else {
  const html = fs.readFileSync(htmlPath, 'utf8');

  // 1. Math formulas vs KaTeX integration
  const strippedHtml = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(pre|code|script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');

  const inlineMath = strippedHtml.match(/\$([^\$\n\r]+)\$/g) || [];
  const displayMath = strippedHtml.match(/\$\$([\s\S]+?)\$\$/g) || [];
  const mathCount = inlineMath.length + displayMath.length;

  if (mathCount > 0) {
    const hasKatexCss = /katex(\.min)?\.css/i.test(html);
    const hasKatexJs = /katex(\.min)?\.js/i.test(html);
    const hasAutoRender = /auto-render(\.min)?\.js/i.test(html);
    const hasRenderCall = /renderMathInElement/i.test(html) || /renderMath/i.test(html);

    if (!hasKatexCss) {
      formattingErrors.push(`Found ${mathCount} LaTeX math expressions, but KaTeX CSS is missing in index.html`);
    }
    if (!hasKatexJs) {
      formattingErrors.push(`Found ${mathCount} LaTeX math expressions, but KaTeX JS is missing in index.html`);
    }
    if (!hasAutoRender) {
      formattingErrors.push(`Found ${mathCount} LaTeX math expressions, but KaTeX auto-render extension is missing in index.html`);
    }
    if (!hasRenderCall) {
      formattingErrors.push(`Found ${mathCount} LaTeX math expressions, but renderMathInElement initialization is missing in index.html/core.js`);
    }
    if (hasKatexCss && hasKatexJs && hasAutoRender && hasRenderCall) {
      console.log(`  ✅ KaTeX Math Engine: Configured (${mathCount} expressions: ${inlineMath.length} inline, ${displayMath.length} display)`);
    }
  } else {
    console.log(`  ℹ️ KaTeX Math Engine: No math expressions detected.`);
  }

  // 2. Chapter metadata formatting & separation (prevent glued tags like "01Physical Clocks")
  const gluedMeta = html.match(/<span class="ch-num">[^<]+<\/span><span class="ch-tag">/g);
  if (gluedMeta) {
    formattingErrors.push(`Found ${gluedMeta.length} concatenated chapter metadata tags (<span class="ch-num">..</span><span class="ch-tag">..</span>). Add whitespace separation between spans.`);
  } else {
    const chMetaMatches = html.match(/class="ch-meta"/g) || [];
    console.log(`  ✅ Chapter Metadata Typography: ${chMetaMatches.length} chapters verified (0 concatenated tags)`);
  }

  // 3. CSS rules validation
  if (fs.existsSync(cssPath)) {
    const css = fs.readFileSync(cssPath, 'utf8');
    const chMetaCount = (html.match(/class="ch-meta"/g) || []).length;
    if (chMetaCount > 0) {
      if (!/\.ch-meta\s*\{[^}]*display\s*:\s*(inline-)?flex/i.test(css)) {
        formattingErrors.push('Missing or non-flex CSS rule for .ch-meta in assets/style.css');
      }
      if (!/\.ch-tag\s*\{/i.test(css)) {
        formattingErrors.push('Missing CSS rule for .ch-tag in assets/style.css');
      }
      if (!formattingErrors.some(e => e.includes('.ch-meta') || e.includes('.ch-tag'))) {
        console.log(`  ✅ CSS Metadata Stylesheet Rules: .ch-meta (flex layout) and .ch-tag verified`);
      }
    }
  }

  // 4. Anchor integrity: TOC links to section IDs
  const tocMatches = [...html.matchAll(/<a[^>]+href="#([^"]+)"[^>]*>/g)].map(m => m[1]);
  let brokenAnchors = 0;
  for (const anchor of tocMatches) {
    if (anchor.startsWith('part-') || anchor === 'top') continue;
    const re = new RegExp(`id=["']${anchor}["']`, 'i');
    if (!re.test(html)) {
      formattingErrors.push(`Broken TOC anchor: href="#${anchor}" has no matching id="${anchor}" in index.html`);
      brokenAnchors++;
    }
  }
  if (brokenAnchors === 0 && tocMatches.length > 0) {
    console.log(`  ✅ TOC Navigation Anchors: All ${tocMatches.length} anchors resolve to existing section IDs`);
  }

  // 5. Visualizer Figure IDs vs registered visualizers
  const vizFigures = [...html.matchAll(/data-viz="([^"]+)"/g)].map(m => m[1]);
  let missingViz = 0;
  for (const vName of vizFigures) {
    if (!OS.registry[vName]) {
      formattingErrors.push(`Figure has data-viz="${vName}", but "${vName}" is not registered in OS.registry`);
      missingViz++;
    }
  }
  if (missingViz === 0 && vizFigures.length > 0) {
    console.log(`  ✅ Visualizer Bindings: All ${vizFigures.length} figure data-viz attributes match registered simulators`);
  }
}

if (formattingErrors.length > 0) {
  console.log(`\n❌ STAGE 1 FORMATTING AUDIT FAILED (${formattingErrors.length} issues):`);
  formattingErrors.forEach(err => console.log(`   - ${err}`));
  process.exit(1);
} else {
  console.log(`\n✨ STAGE 1 PASSED: All document formatting and math checks passed.\n`);
}

console.log(`======================================================`);
console.log(`STAGE 2: INTERACTIVE SIMULATOR & VIEWPORT AUDIT (${simNames.length} VISUALIZERS)`);
console.log(`======================================================\n`);

let totalPassed = 0;
let totalFailed = 0;
const results = [];

const VIEWPORTS = [320, 480, 768, 1200];

for (const name of simNames) {
  const simReport = { name, buttons: 0, sliders: 0, selects: 0, segs: 0, errors: [] };
  const mountFn = OS.registry[name];
  
  try {
    const host = document.createElement('div');
    const startElemCount = trackedElements.length;
    
    // Mount the simulator
    mountFn(host);
    
    const simElements = trackedElements.slice(startElemCount);
    
    // Find controls
    const buttons = simElements.filter(e => e.tagName === 'BUTTON');
    const sliders = simElements.filter(e => e.tagName === 'INPUT' && e.attributes.type === 'range');
    const selects = simElements.filter(e => e.tagName === 'SELECT');
    
    simReport.buttons = buttons.length;
    simReport.sliders = sliders.length;
    simReport.selects = selects.length;
    
    // 1. Test clicking all buttons multiple times
    for (const btn of buttons) {
      if (btn.listeners['click']) {
        for (let i = 0; i < 3; i++) {
          btn.listeners['click'].forEach(cb => cb());
        }
      }
    }
    
    // 2. Test sliders through range and assert active canvas reactivity
    for (const s of sliders) {
      const min = parseFloat(s.attributes.min || 0);
      const max = parseFloat(s.attributes.max || 100);
      const step = parseFloat(s.attributes.step || 1);
      
      const beforeCalls = global._totalCanvasDrawCalls || 0;
      [min, (min + max) / 2, max].forEach(val => {
        s.value = String(val);
        s.dispatchEvent('input');
        s.dispatchEvent('change');
      });
      const afterCalls = global._totalCanvasDrawCalls || 0;
      if (afterCalls <= beforeCalls) {
        throw new Error(`Dead Slider Detected: Slider did not trigger any canvas drawing or redraw upon input/change! Check onChange/onInput wiring.`);
      }
    }
    
    // 3. Test selects through all options
    for (const sel of selects) {
      const options = sel.children.filter(c => c.tagName === 'OPTION');
      options.forEach(opt => {
        sel.value = opt.value;
        sel.dispatchEvent('change');
      });
    }
    
    // 4. Test rendering at all viewport widths
    for (const vp of VIEWPORTS) {
      currentWidth = vp;
      OS.redraws.forEach(cb => cb());
    }
    
    simReport.status = 'PASS';
    totalPassed++;
  } catch (err) {
    simReport.status = 'FAIL';
    simReport.errors.push(err.message + '\n' + err.stack);
    totalFailed++;
  } finally {
    // Clear redraws to isolate next test
    OS.redraws.clear();
  }
  
  results.push(simReport);
}

// Print results
console.log(String('SIMULATOR NAME').padEnd(25) + String('BTNS').padEnd(8) + String('SLIDERS').padEnd(10) + String('SELECTS').padEnd(10) + 'STATUS');
console.log('-'.repeat(60));
for (const r of results) {
  const line = String(r.name).padEnd(25) + 
               String(r.buttons).padEnd(8) + 
               String(r.sliders).padEnd(10) + 
               String(r.selects).padEnd(10) + 
               (r.status === 'PASS' ? '✅ PASS' : '❌ FAIL');
  console.log(line);
  if (r.errors.length) {
    console.log('   Errors:', r.errors[0]);
  }
}

console.log(`\nAUDIT SUMMARY: ${totalPassed} PASSED, ${totalFailed} FAILED out of ${simNames.length} total.`);

if (totalFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
