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
        clearRect: () => {}, fillRect: (x, y, w, h) => checkCoords(x, y, w, h),
        strokeRect: (x, y, w, h) => checkCoords(x, y, w, h),
        beginPath: () => {}, arc: (x, y, r) => checkCoords(x, y, r),
        closePath: () => {},
        fill: () => {}, stroke: () => {},
        roundRect: (x, y, w, h) => checkCoords(x, y, w, h),
        moveTo: (x, y) => checkCoords(x, y), lineTo: (x, y) => checkCoords(x, y),
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
console.log(`\n======================================================`);
console.log(`RUNNING FULL AUTOMATED AUDIT ON ${simNames.length} VISUALIZERS`);
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
    
    // 2. Test sliders through range
    for (const s of sliders) {
      const min = parseFloat(s.attributes.min || 0);
      const max = parseFloat(s.attributes.max || 100);
      const step = parseFloat(s.attributes.step || 1);
      
      [min, (min + max) / 2, max].forEach(val => {
        s.value = String(val);
        s.dispatchEvent('input');
      });
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
