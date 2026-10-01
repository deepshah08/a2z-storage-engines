/* ==========================================================================
   Storage Engines, Block by Block — Storage Media & On-Disk Layouts
   ========================================================================== */

(function () {
  'use strict';

  /* --------------------------------------------------------------------------
   * HERO: Unified Storage Engine Arena (B+ Tree vs LSM-Tree)
   * -------------------------------------------------------------------------- */
  OS.register('storageHero', function (host) {
    let engineType = 'lsm'; // 'lsm' vs 'btree'
    let writeRatio = 0.8; // 80% writes
    let totalOps = 5000;
    let waf = 2.4; // Write Amplification Factor
    let p99LatencyMs = 8;
    let heroMsg = 'LSM-Tree: High write throughput via sequential append-only MemTable & WAL.';

    function updateMetrics() {
      if (engineType === 'lsm') {
        waf = (1.8 + writeRatio * 1.5).toFixed(1);
        p99LatencyMs = Math.round(4 + (1 - writeRatio) * 12); // writes fast, reads slightly slower due to SSTable tier checks
        heroMsg = `LSM-Tree: Write Amplification WAF = ${waf}x (Sequential I/O). Read p99 = ${p99LatencyMs}ms.`;
      } else {
        waf = (3.5 + writeRatio * 4.5).toFixed(1); // random in-place page splits
        p99LatencyMs = Math.round(2 + writeRatio * 18); // random disk I/O under heavy writes
        heroMsg = `B+ Tree: Random Page Updates. Write Amplification WAF = ${waf}x. p99 Latency = ${p99LatencyMs}ms.`;
      }
      render();
    }

    const controls = OS.controls(host);
    OS.segmented(controls, {
      label: 'Storage Architecture',
      options: [
        { label: 'Log-Structured Merge-Tree (LSM)', value: 'lsm' },
        { label: 'B+ Tree (In-Place Page Updates)', value: 'btree' }
      ],
      value: engineType,
      onChange: (v) => { engineType = v; updateMetrics(); }
    });

    OS.segmented(controls, {
      label: 'Workload Profile',
      options: [
        { label: 'Heavy Writes (80% Write)', value: 0.8 },
        { label: 'Balanced (50% Write)', value: 0.5 },
        { label: 'Heavy Reads (10% Write)', value: 0.1 }
      ],
      value: writeRatio,
      onChange: (v) => { writeRatio = parseFloat(v); updateMetrics(); }
    });

    OS.button(controls, 'Simulate 10,000 Ops Surge', () => {
      totalOps += 10000;
      updateMetrics();
    }, { primary: true });

    const cv = OS.canvas(host, {
      height: 250,
      render: function (ctx, w, h) {
        ctx.clearRect(0, 0, w, h);

        ctx.font = OS.font(13, 'display', 600);
        ctx.fillStyle = OS.C.ink;
        ctx.fillText(`Database Engine Arena: ${engineType === 'lsm' ? 'LSM-Tree (Append-Only)' : 'B+ Tree (In-Place Pages)'} — Ops: ${totalOps.toLocaleString()}`, 16, 24);

        ctx.font = OS.font(11, 'mono', 400);
        ctx.fillStyle = engineType === 'lsm' ? OS.C.teal : OS.C.accent;
        ctx.fillText(heroMsg, 16, 46);

        // Architecture Metric Cards
        const cardW = Math.min(180, (w - 60) / 2);
        const yTop = 68;
        const cardH = 85;

        // Card 1: WAF
        ctx.fillStyle = OS.rgba(OS.C.accent, 0.12);
        ctx.strokeStyle = OS.C.accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(16, yTop, cardW, cardH, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = OS.C.ink;
        ctx.font = OS.font(11, 'mono', 600);
        ctx.fillText('Write Amplification (WAF)', 26, yTop + 24);
        ctx.font = OS.font(16, 'display', 700);
        ctx.fillStyle = waf > 4 ? OS.C.rose : OS.C.green;
        ctx.fillText(`${waf}x Bytes Written`, 26, yTop + 54);
        ctx.font = OS.font(9, 'sans', 400);
        ctx.fillStyle = OS.C.muted;
        ctx.fillText('WAF = Disk Bytes Written / User Bytes Written', 26, yTop + 72);

        // Card 2: p99 Latency
        const c2X = cardW + 32;
        ctx.fillStyle = OS.rgba(OS.C.teal, 0.12);
        ctx.strokeStyle = OS.C.teal;
        ctx.beginPath();
        ctx.roundRect(c2X, yTop, cardW, cardH, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = OS.C.ink;
        ctx.font = OS.font(11, 'mono', 600);
        ctx.fillText('p99 Query Latency', c2X + 12, yTop + 24);
        ctx.font = OS.font(16, 'display', 700);
        ctx.fillStyle = p99LatencyMs > 15 ? OS.C.rose : OS.C.teal;
        ctx.fillText(`${p99LatencyMs} ms`, c2X + 12, yTop + 54);
        ctx.font = OS.font(9, 'sans', 400);
        ctx.fillStyle = OS.C.muted;
        ctx.fillText(engineType === 'lsm' ? 'Point reads query Bloom filters + SSTables' : 'Random page lookups in Buffer Pool', c2X + 12, yTop + 72);

        // Summary
        ctx.font = OS.font(10, 'sans', 400);
        ctx.fillStyle = OS.C.muted;
        ctx.fillText('RUM Conjecture: You cannot simultaneously optimize Read overhead (R), Update overhead (U), and Memory overhead (M).', 16, h - 14);
      }
    });

    function render() { cv.redraw(); }
  });

  /* --------------------------------------------------------------------------
   * 1. Physical Media: SSD NAND Flash Pages & Blocks
   * -------------------------------------------------------------------------- */
  OS.register('nandFlash', function (host) {
    let pages = [
      { id: 'P0', status: 'VALID', data: 'k1:v1' },
      { id: 'P1', status: 'VALID', data: 'k2:v2' },
      { id: 'P2', status: 'INVALID', data: 'k1:stale' }, // Invalidate on overwrite
      { id: 'P3', status: 'FREE', data: '' }
    ];
    let eraseCount = 14;
    let flashLog = 'NAND Rule: Read/Write in Pages (4KB); Erase only in Blocks (2MB). In-place overwrite impossible.';

    const controls = OS.controls(host);
    OS.button(controls, 'Update k1 ➔ Write to Free Page', () => {
      pages[0].status = 'INVALID'; // mark old page invalid
      pages[3].status = 'VALID';
      pages[3].data = 'k1:v3';
      flashLog = 'OUT-OF-PLACE WRITE: P0 marked INVALID; fresh value written to free page P3. FTL maps logical address.';
      render();
    }, { primary: true });

    OS.button(controls, 'Trigger Block Garbage Collection & Erase', () => {
      eraseCount++;
      pages = [
        { id: 'P0', status: 'VALID', data: 'k2:v2' },
        { id: 'P1', status: 'VALID', data: 'k1:v3' },
        { id: 'P2', status: 'FREE', data: '' },
        { id: 'P3', status: 'FREE', data: '' }
      ];
      flashLog = `GC & ERASE: Valid pages relocated; block high-voltage erased (Erase cycles: ${eraseCount})! P2 and P3 now FREE.`;
      render();
    });

    OS.button(controls, 'Reset Flash Block', () => {
      pages = [
        { id: 'P0', status: 'VALID', data: 'k1:v1' },
        { id: 'P1', status: 'VALID', data: 'k2:v2' },
        { id: 'P2', status: 'FREE', data: '' },
        { id: 'P3', status: 'FREE', data: '' }
      ];
      flashLog = 'Flash block reset.';
      render();
    });

    const cv = OS.canvas(host, {
      height: 230,
      render: function (ctx, w, h) {
        ctx.clearRect(0, 0, w, h);

        ctx.font = OS.font(13, 'display', 600);
        ctx.fillStyle = OS.C.ink;
        ctx.fillText(`SSD NAND Flash Erase Block (Pages: 4, Block Erase Cycles: ${eraseCount})`, 16, 24);

        ctx.font = OS.font(11, 'mono', 400);
        ctx.fillStyle = flashLog.includes('ERASE') ? OS.C.green : OS.C.accent;
        ctx.fillText(flashLog, 16, 46);

        // Draw Pages in Block
        const pW = Math.min(85, (w - 70) / 4);
        const pH = 85;
        const startY = 70;

        pages.forEach((p, idx) => {
          const px = 16 + idx * (pW + 14);
          const isValid = p.status === 'VALID';
          const isInvalid = p.status === 'INVALID';

          ctx.fillStyle = isValid ? OS.rgba(OS.C.green, 0.15) : isInvalid ? OS.rgba(OS.C.rose, 0.15) : OS.rgba(OS.C.surface, 0.9);
          ctx.strokeStyle = isValid ? OS.C.green : isInvalid ? OS.C.rose : OS.C.line;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(px, startY, pW, pH, 6);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = OS.C.ink;
          ctx.font = OS.font(11, 'mono', 600);
          ctx.fillText(`Page ${p.id}`, px + 8, startY + 24);

          ctx.font = OS.font(9, 'sans', 700);
          ctx.fillStyle = isValid ? OS.C.green : isInvalid ? OS.C.rose : OS.C.faint;
          ctx.fillText(p.status, px + 8, startY + 46);

          ctx.font = OS.font(9, 'mono', 400);
          ctx.fillStyle = OS.C.muted;
          ctx.fillText(p.data || '[Free]', px + 8, startY + 68);
        });

        // Summary
        ctx.font = OS.font(10, 'sans', 400);
        ctx.fillStyle = OS.C.muted;
        ctx.fillText('Flash Translation Layer (FTL) performs wear-leveling to prevent individual flash cells from burning out prematurely.', 16, h - 14);
      }
    });

    function render() { cv.redraw(); }
  });

  /* --------------------------------------------------------------------------
   * 2. Slotted-Page Architecture & Binary Tuples
   * -------------------------------------------------------------------------- */
  OS.register('slottedPage', function (host) {
    let slots = [
      { id: 0, offset: 320, len: 80, tuple: 'User#1 (Alice)' },
      { id: 1, offset: 220, len: 100, tuple: 'User#2 (Bob)' }
    ];
    let freeSpaceOffset = 220; // grows downwards from page end
    let pageLog = 'Slotted Page Layout: Slot pointers grow Left-to-Right; Tuple records grow Right-to-Left.';

    const controls = OS.controls(host);
    OS.button(controls, 'Insert User#3 (Carol)', () => {
      if (slots.length < 4) {
        const len = 90;
        freeSpaceOffset -= len;
        slots.push({ id: slots.length, offset: freeSpaceOffset, len: len, tuple: `User#3 (Carol)` });
        pageLog = `INSERT: Added slot #${slots.length - 1} at top; placed 90B tuple bytes at offset ${freeSpaceOffset}.`;
      }
      render();
    }, { primary: true });

    OS.button(controls, 'Delete User#2 (Mark Tombstone)', () => {
      if (slots.length > 1) {
        slots[1].tuple = '[DELETED / TOMBSTONE]';
        pageLog = 'TOMBSTONE: Slot #1 marked deleted. Free space fragmented until vacuum / defragmentation.';
      }
      render();
    });

    OS.button(controls, 'Reset Page', () => {
      slots = [
        { id: 0, offset: 320, len: 80, tuple: 'User#1 (Alice)' },
        { id: 1, offset: 220, len: 100, tuple: 'User#2 (Bob)' }
      ];
      freeSpaceOffset = 220;
      pageLog = 'Page reset to initial state.';
      render();
    });

    const cv = OS.canvas(host, {
      height: 230,
      render: function (ctx, w, h) {
        ctx.clearRect(0, 0, w, h);

        ctx.font = OS.font(13, 'display', 600);
        ctx.fillStyle = OS.C.ink;
        ctx.fillText(`Database 4KB Slotted-Page Layout (Slots: ${slots.length}, Free Window: 0x00A0 ➔ 0x${freeSpaceOffset.toString(16)})`, 16, 24);

        ctx.font = OS.font(11, 'mono', 400);
        ctx.fillStyle = pageLog.includes('TOMBSTONE') ? OS.C.rose : OS.C.accent;
        ctx.fillText(pageLog, 16, 46);

        // Draw Slotted Page Block
        const boxX = 20;
        const boxY = 70;
        const boxW = Math.max(260, w - 40);
        const boxH = 95;

        ctx.fillStyle = OS.C.surface;
        ctx.strokeStyle = OS.C.line;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 8);
        ctx.fill();
        ctx.stroke();

        // Slots Array (Left)
        ctx.fillStyle = OS.rgba(OS.C.accent, 0.15);
        ctx.fillRect(boxX + 10, boxY + 10, 110, boxH - 20);
        ctx.strokeStyle = OS.C.accent;
        ctx.strokeRect(boxX + 10, boxY + 10, 110, boxH - 20);

        ctx.fillStyle = OS.C.ink;
        ctx.font = OS.font(10, 'mono', 600);
        ctx.fillText('Header + Slots', boxX + 16, boxY + 28);
        slots.forEach((s, idx) => {
          ctx.font = OS.font(8, 'mono', 400);
          ctx.fillText(`Slot ${s.id}: -> 0x${s.offset.toString(16)}`, boxX + 16, boxY + 46 + idx * 16);
        });

        // Free Space (Middle)
        const freeX = boxX + 130;
        const freeW = boxW - 270;
        if (freeW > 40) {
          ctx.fillStyle = OS.rgba(OS.C.faint, 0.1);
          ctx.fillRect(freeX, boxY + 10, freeW, boxH - 20);
          ctx.strokeStyle = OS.C.line;
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(freeX, boxY + 10, freeW, boxH - 20);
          ctx.setLineDash([]);

          ctx.fillStyle = OS.C.faint;
          ctx.font = OS.font(9, 'sans', 400);
          ctx.fillText('Free Space', freeX + 10, boxY + 45);
        }

        // Tuples (Right)
        const tupX = boxX + boxW - 130;
        ctx.fillStyle = OS.rgba(OS.C.green, 0.15);
        ctx.fillRect(tupX, boxY + 10, 120, boxH - 20);
        ctx.strokeStyle = OS.C.green;
        ctx.strokeRect(tupX, boxY + 10, 120, boxH - 20);

        ctx.fillStyle = OS.C.ink;
        ctx.font = OS.font(10, 'mono', 600);
        ctx.fillText('Tuple Records', tupX + 8, boxY + 28);
        slots.forEach((s, idx) => {
          ctx.font = OS.font(8, 'mono', 400);
          ctx.fillStyle = s.tuple.includes('DELETED') ? OS.C.rose : OS.C.ink;
          ctx.fillText(s.tuple.slice(0, 14), tupX + 8, boxY + 46 + idx * 16);
        });

        // Footnote
        ctx.font = OS.font(10, 'sans', 400);
        ctx.fillStyle = OS.C.muted;
        ctx.fillText('Tuple ID (RID / TID) = (PageNumber, SlotIndex). Allows internal tuple relocation without changing external row pointer IDs.', 16, h - 14);
      }
    });

    function render() { cv.redraw(); }
  });

  /* --------------------------------------------------------------------------
   * 3. Row-Oriented vs Columnar Storage Engines
   * -------------------------------------------------------------------------- */
  OS.register('rowVsColumnar', function (host) {
    let mode = 'columnar'; // 'row' vs 'columnar'
    let scanLog = 'Columnar Engine (Parquet/ClickHouse): Reads only requested columns from disk.';

    const controls = OS.controls(host);
    OS.segmented(controls, {
      label: 'Storage Layout',
      options: [
        { label: 'Columnar (OLAP - Parquet / ClickHouse)', value: 'columnar' },
        { label: 'Row-Oriented (OLTP - Postgres / InnoDB)', value: 'row' }
      ],
      value: mode,
      onChange: (v) => {
        mode = v;
        scanLog = mode === 'columnar'
          ? 'Query: SELECT AVG(price) ➔ Scanned ONLY 40KB price column (90% disk I/O eliminated)!'
          : 'Query: SELECT AVG(price) ➔ Forced to scan all 400KB row tuples (id, name, desc, price) from disk!';
        render();
      }
    });

    OS.button(controls, 'Run Analytical Aggregation', () => {
      scanLog = mode === 'columnar'
        ? '✓ COLUMNAR WIN: Vectorized SIMD scanned compressed column with Dictionary + RLE.'
        : '⚠️ ROW OVERHEAD: High memory bus pressure pulling unused row attributes into L3 cache.';
      render();
    }, { primary: true });

    const cv = OS.canvas(host, {
      height: 230,
      render: function (ctx, w, h) {
        ctx.clearRect(0, 0, w, h);

        ctx.font = OS.font(13, 'display', 600);
        ctx.fillStyle = OS.C.ink;
        ctx.fillText(`Data Layout: ${mode === 'columnar' ? 'Columnar Vector Chunk (Parquet)' : 'Row-Store Tuples (PostgreSQL)'}`, 16, 24);

        ctx.font = OS.font(11, 'mono', 400);
        ctx.fillStyle = scanLog.includes('WIN') || scanLog.includes('eliminated') ? OS.C.green : OS.C.amber;
        ctx.fillText(scanLog, 16, 46);

        // Draw Visual Representation
        const boxX = 20;
        const boxY = 70;
        const boxW = Math.max(260, w - 40);
        const boxH = 95;

        ctx.fillStyle = OS.C.surface;
        ctx.strokeStyle = OS.C.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 8);
        ctx.fill();
        ctx.stroke();

        ctx.font = OS.font(11, 'mono', 600);
        ctx.fillStyle = OS.C.ink;
        if (mode === 'columnar') {
          ctx.fillText('Disk Block 1: [ID: 1, 2, 3, 4] (Bit-Packed)', boxX + 16, boxY + 28);
          ctx.fillStyle = OS.C.green;
          ctx.fillText('Disk Block 2: [Price: $10, $20, $15, $90] ➔ ACTIVE SCAN TARGET', boxX + 16, boxY + 54);
          ctx.fillStyle = OS.C.muted;
          ctx.fillText('Disk Block 3: [Bio: "Text...", "Text...", "Text..."] ➔ SKIPPED (0 Byte Read)', boxX + 16, boxY + 80);
        } else {
          ctx.fillText('Disk Block 1: [Row 1: ID=1, Name="Alice", Price=$10, Bio="..."]', boxX + 16, boxY + 28);
          ctx.fillText('Disk Block 2: [Row 2: ID=2, Name="Bob",   Price=$20, Bio="..."]', boxX + 16, boxY + 54);
          ctx.fillStyle = OS.C.rose;
          ctx.fillText('Full page read required even if query only touches 1 column.', boxX + 16, boxY + 80);
        }
      }
    });

    function render() { cv.redraw(); }
  });

  /* --------------------------------------------------------------------------
   * 4. Append-Only Log Engines: Bitcask Key-Value Store
   * -------------------------------------------------------------------------- */
  OS.register('bitcaskLog', function (host) {
    let keyDir = new Map([
      ['user:1', { fileId: 'data.1', offset: 0, size: 32 }],
      ['user:2', { fileId: 'data.1', offset: 32, size: 28 }]
    ]);
    let logEntries = ['user:1=Alice (32B)', 'user:2=Bob (28B)'];
    let bitcaskMsg = 'Bitcask: All keys fit in RAM (KeyDir). Values read in 1 direct disk seek.';

    const controls = OS.controls(host);
    OS.button(controls, 'Write user:1=Alice_V2 (Append)', () => {
      logEntries.push('user:1=Alice_V2 (35B)');
      keyDir.set('user:1', { fileId: 'data.1', offset: 60, size: 35 });
      bitcaskMsg = 'APPEND: New entry written to disk tail. KeyDir updated offset 0 ➔ 60 in RAM.';
      render();
    }, { primary: true });

    OS.button(controls, 'Trigger Merge Compaction', () => {
      logEntries = ['user:2=Bob (28B)', 'user:1=Alice_V2 (35B)'];
      keyDir.set('user:2', { fileId: 'merge.1', offset: 0, size: 28 });
      keyDir.set('user:1', { fileId: 'merge.1', offset: 28, size: 35 });
      bitcaskMsg = '✓ COMPACTED: Dead values pruned; new immutable merged data file created!';
      render();
    });

    const cv = OS.canvas(host, {
      height: 230,
      render: function (ctx, w, h) {
        ctx.clearRect(0, 0, w, h);

        ctx.font = OS.font(13, 'display', 600);
        ctx.fillStyle = OS.C.ink;
        ctx.fillText(`Bitcask Engine: In-Memory KeyDir Index + Append-Only Log File`, 16, 24);

        ctx.font = OS.font(11, 'mono', 400);
        ctx.fillStyle = bitcaskMsg.includes('COMPACTED') ? OS.C.green : OS.C.accent;
        ctx.fillText(bitcaskMsg, 16, 46);

        // Two Cards: KeyDir (RAM) vs Append Log (Disk)
        const colW = Math.min(180, (w - 60) / 2);
        const yTop = 68;
        const boxH = 85;

        // KeyDir
        ctx.fillStyle = OS.rgba(OS.C.teal, 0.12);
        ctx.strokeStyle = OS.C.teal;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(16, yTop, colW, boxH, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = OS.C.ink;
        ctx.font = OS.font(11, 'mono', 600);
        ctx.fillText('RAM: KeyDir Hash Table', 26, yTop + 24);
        ctx.font = OS.font(9, 'mono', 400);
        let kIdx = 0;
        keyDir.forEach((val, k) => {
          if (kIdx < 2) {
            ctx.fillText(`${k} -> offset:${val.offset}`, 26, yTop + 48 + kIdx * 18);
            kIdx++;
          }
        });

        // Disk Log
        const dX = colW + 32;
        ctx.fillStyle = OS.rgba(OS.C.amber, 0.12);
        ctx.strokeStyle = OS.C.amber;
        ctx.beginPath();
        ctx.roundRect(dX, yTop, colW, boxH, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = OS.C.ink;
        ctx.font = OS.font(11, 'mono', 600);
        ctx.fillText('Disk: Append-Only Data File', dX + 12, yTop + 24);
        ctx.font = OS.font(9, 'mono', 400);
        ctx.fillStyle = OS.C.muted;
        logEntries.slice(-2).forEach((e, idx) => {
          ctx.fillText(e, dX + 12, yTop + 48 + idx * 18);
        });

        // Footnote
        ctx.font = OS.font(10, 'sans', 400);
        ctx.fillStyle = OS.C.muted;
        ctx.fillText('Limitation: All keys must fit in RAM. Suitable for write-heavy key-value caches and logs.', 16, h - 14);
      }
    });

    function render() { cv.redraw(); }
  });

})();
