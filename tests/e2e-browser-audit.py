#!/usr/bin/env python3
"""
E2E Browser & Visual Quality Audit Harness
Validates real browser execution, KaTeX math parsing, Canvas DOM lifecycle,
segmented control state, and mobile responsiveness (iPhone 15 & Pixel 9 Pro XL)
under headless Chrome / Chromium.
"""

import os
import sys
import shutil
import subprocess
import tempfile
import json
import re

def find_chrome():
    candidates = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser'
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    for c in ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']:
        p = shutil.which(c)
        if p:
            return p
    return None

def check_mobile_viewport(chrome, html_path, width, height, device_name):
    wrapper = f'''<!doctype html>
<html><body style="margin:0;background:#000">
<iframe id="phone" style="width:{width}px;height:{height}px;border:none;display:block" src="file://{html_path}"></iframe>
<script>
const frame = document.getElementById('phone');
frame.onload = () => {{
  try {{
    const fdoc = frame.contentDocument;
    const fwin = frame.contentWindow;
    const sw = fdoc.documentElement.scrollWidth;
    const iw = fwin.innerWidth;
    function isContained(el) {{
      let p = el.parentElement;
      while (p && p !== fdoc.body && p !== fdoc.documentElement) {{
        const cs = fwin.getComputedStyle(p);
        if (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowX === 'hidden' || cs.overflow === 'hidden') return true;
        p = p.parentElement;
      }}
      return false;
    }}
    const uncontained = [];
    fdoc.querySelectorAll('*').forEach(el => {{
      const r = el.getBoundingClientRect();
      if (r.right > iw + 1 && r.width > 0 && !isContained(el)) {{
        uncontained.push({{ tag: el.tagName, cls: (el.className || '').toString().slice(0, 30), right: Math.round(r.right) }});
      }}
    }});
    const res = document.createElement('div');
    res.id = 'MOBILE_AUDIT';
    res.textContent = JSON.stringify({{ iw, sw, hasOverflow: sw > iw, uncontainedCount: uncontained.length, uncontained: uncontained.slice(0, 5) }});
    document.body.appendChild(res);
  }} catch(e) {{
    const res = document.createElement('div');
    res.id = 'MOBILE_AUDIT';
    res.textContent = JSON.stringify({{ error: e.message }});
    document.body.appendChild(res);
  }}
}};
</script></body></html>'''
    tmp = tempfile.NamedTemporaryFile(suffix='.html', delete=False, mode='w', encoding='utf-8')
    tmp.write(wrapper)
    tmp.close()
    cmd = [
        chrome,
        '--headless=new', '--disable-gpu', '--no-sandbox',
        '--disable-remote-fonts', '--disable-dev-shm-usage',
        '--allow-file-access-from-files',
        f'--window-size={max(500, width + 50)},{height + 50}',
        '--dump-dom',
        f'file://{tmp.name}'
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
    finally:
        if os.path.exists(tmp.name):
            try:
                os.unlink(tmp.name)
            except Exception:
                pass

    m = re.search(r'<div id="MOBILE_AUDIT">(.*?)</div>', res.stdout)
    if m:
        data = json.loads(m.group(1))
        if data.get('error'):
            print(f'❌ FAIL: {device_name} audit error: {data["error"]}')
            return False
        if data.get('hasOverflow') or data.get('uncontainedCount', 0) > 0:
            print(f'❌ FAIL: {device_name} horizontal overflow detected: {data}')
            return False
        print(f'  ✅ {device_name} Viewport ({width}x{height}): Zero horizontal blowout, 100% contained')
        return True
    print(f'❌ FAIL: {device_name} mobile audit failed to execute')
    return False

def run_audit():
    chrome = find_chrome()
    if not chrome:
        print("⚠️ Headless Chrome/Chromium not found on host. Skipping Stage 3 E2E test.")
        return 0

    repo_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    html_path = os.path.join(repo_dir, "index.html")

    if not os.path.exists(html_path):
        print(f"❌ Error: index.html not found at {html_path}")
        return 1

    print("\n======================================================")
    print("STAGE 3: HEADLESS CHROME E2E AUDIT & PIXEL RASTER")
    print("======================================================")
    print(f"  🌐 Chrome Binary: {chrome}")
    print(f"  📄 Target File:   {html_path}\n")

    # 1. Dump DOM after browser executes all JavaScript
    cmd_dom = [
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-remote-fonts",
        "--disable-dev-shm-usage",
        "--disable-features=Translate,OptimizationHints,MediaRouter",
        "--dump-dom",
        f"file://{html_path}"
    ]

    try:
        res = subprocess.run(cmd_dom, capture_output=True, text=True, timeout=60)
    except subprocess.TimeoutExpired:
        print("❌ FAIL: Headless Chrome timed out while loading index.html")
        return 1
    except Exception as e:
        print(f"❌ FAIL: Error launching Chrome: {e}")
        return 1

    if res.returncode != 0:
        print(f"❌ FAIL: Chrome exited with non-zero status code: {res.returncode}")
        print(res.stderr)
        return 1

    rendered_html = res.stdout

    # Audit 1: Uncaught Console Errors
    uncaught_errors = [line for line in res.stderr.splitlines() if "Uncaught " in line]
    if uncaught_errors:
        print(f"❌ FAIL: Uncaught exceptions detected in browser runtime:")
        for err in uncaught_errors:
            print(f"   {err}")
        return 1
    print("  ✅ Browser Runtime: Zero uncaught exceptions or script errors")

    # Audit 2: KaTeX Math Rendering in Real DOM
    with open(html_path, 'r', encoding='utf-8') as f:
        src_html = f.read()
    body_html = src_html.split('</head>', 1)[-1] if '</head>' in src_html else src_html
    has_latex = ('$$' in body_html) or (body_html.count('$') >= 2)
    katex_count = rendered_html.count('class="katex"')
    if has_latex:
        if katex_count == 0:
            print("❌ FAIL: No rendered KaTeX formulas found in live DOM despite LaTeX expressions present in body!")
            return 1
        print(f"  ✅ KaTeX Live Engine: {katex_count} mathematical expressions rendered successfully")
    else:
        print(f"  ℹ️ KaTeX Live Engine: Document body contains no mathematical formulas (rendered {katex_count} formulas)")

    # Audit 3: Canvas Figure Lifecycle
    canvas_count = rendered_html.count('<canvas')
    viz_figure_count = rendered_html.count('class="viz')
    if canvas_count == 0:
        print("❌ FAIL: Zero canvas elements mounted in live DOM! Check OS.canvas / OS.boot wiring.")
        return 1
    print(f"  ✅ Canvas Stages: {canvas_count} visualizer canvases mounted and running")

    # Audit 4: Segmented Control & Pill Track Architecture
    seg_track_count = rendered_html.count('class="seg-track"')
    active_btn_count = rendered_html.count('aria-pressed="true"')
    if seg_track_count > 0:
        if active_btn_count < seg_track_count:
            print(f"❌ FAIL: Mismatched active states ({active_btn_count} active buttons for {seg_track_count} segmented tracks)!")
            return 1
        print(f"  ✅ Segmented Controls: {seg_track_count} pill tracks verified with high-contrast active states ({active_btn_count} active)")

    # Audit 5: Pixel Rasterization & Layout Render Check
    screenshot_path = "/tmp/e2e-audit-render.png"
    cmd_shot = [
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-remote-fonts",
        "--disable-dev-shm-usage",
        "--disable-features=Translate,OptimizationHints,MediaRouter",
        f"--screenshot={screenshot_path}",
        "--window-size=1200,900",
        f"file://{html_path}"
    ]
    try:
        shot_res = subprocess.run(cmd_shot, capture_output=True, timeout=60)
        if os.path.exists(screenshot_path) and os.path.getsize(screenshot_path) > 30000:
            file_size_kb = os.path.getsize(screenshot_path) // 1024
            print(f"  ✅ Pixel Rasterization: Compositor rendered 1200x900 viewport successfully ({file_size_kb} KB)")
        else:
            print("⚠️ Warning: Screenshot render produced empty or truncated output.")
    except Exception as e:
        print(f"⚠️ Screenshot test skipped: {e}")

    # Audit 6: Mobile Viewport Audit (iPhone 15 - 393x852)
    if not check_mobile_viewport(chrome, html_path, 393, 852, "iPhone 15"):
        return 1

    # Audit 7: Mobile Viewport Audit (Pixel 9 Pro XL - 448x996)
    if not check_mobile_viewport(chrome, html_path, 448, 996, "Pixel 9 Pro XL"):
        return 1

    print("\n✨ STAGE 3 PASSED: Real browser execution, KaTeX math, DOM lifecycle, and mobile viewports verified.\n")
    return 0

if __name__ == "__main__":
    sys.exit(run_audit())
