/* ==========================================================================
   Storage Engines, Block by Block — Index Structures & Page Trees
   ========================================================================== */

(function () {
  'use strict';

  /* --------------------------------------------------------------------------
   * 5. B+ Trees in Depth: Node Splits & Merges
   * -------------------------------------------------------------------------- */
  OS.register('bplusTreeSplit', function (host) {
    let rootKeys = [20, 50];
    let leaves = [
      { keys: [5, 12, 18], next: 1 },
      { keys: [25, 33], next: 2 },
      { keys: [55, 62, 70], next: null }
    ];
    let splitLog = 'B+ Tree (Order M=4): Maximum 3 keys per node. Leaves chained in doubly linked list.';

    const controls = OS.controls(host);
    OS.button(controls, 'Insert Key 19 (Trigger Leaf Split)', () => {
      // Leaf 0 overflow
      leaves[0].keys = [5, 12];
      const newLeaf = { keys: [18, 19], next: leaves[0].next };
      leaves.splice(1, 0, newLeaf);
      leaves[0].next = 1;
      rootKeys = [18, 20, 50];
      splitLog = '⚡ PAGE SPLIT: Leaf 0 overflowed! Split into 2 leaves; promoted middle key 18 to Root.';
      render();
    }, { primary: true });

    OS.button(controls, 'Sequential Range Scan (12 ➔ 62)', () => {
      splitLog = 'RANGE SCAN: Traversed root to Leaf 0, then hopped leaf pointers directly without touching tree interior!';
      render();
    });

    OS.button(controls, 'Reset B+ Tree', () => {
      rootKeys = [20, 50];
      leaves = [
        { keys: [5, 12, 18], next: 1 },
        { keys: [25, 33], next: 2 },
        { keys: [55, 62, 70], next: null }
      ];
      splitLog = 'B+ Tree reset.';
      render();
    });

    const cv = OS.canvas(host, {
      height: 240,
      render: function (ctx, w, h) {
        ctx.clearRect(0, 0, w, h);

        ctx.font = OS.font(13, 'display', 600);
        ctx.fillStyle = OS.C.ink;
        ctx.fillText(`B+ Tree Index Architecture: Fanout & Leaf Pointer Chains`, 16, 24);

        ctx.font = OS.font(11, 'mono', 400);
        ctx.fillStyle = splitLog.includes('SPLIT') ? OS.C.amber : OS.C.green;
        ctx.fillText(splitLog, 16, 46);

        // Root Node (Top)
        const rx = w / 2 - 60;
        const ry = 65;
        ctx.fillStyle = OS.rgba(OS.C.accent, 0.15);
        ctx.strokeStyle = OS.C.accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(rx, ry, 120, 36, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = OS.C.ink;
        ctx.font = OS.font(11, 'mono', 600);
        ctx.fillText(`Root: [${rootKeys.join(', ')}]`, rx + 10, ry + 22);

        // Leaves (Bottom)
        const lY = 135;
        const lW = Math.min(75, (w - 60) / leaves.length);
        const lH = 45;

        leaves.forEach((l, idx) => {
          const lx = 16 + idx * (lW + 16);

          ctx.fillStyle = OS.rgba(OS.C.teal, 0.12);
          ctx.strokeStyle = OS.C.teal;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.roundRect(lx, lY, lW, lH, 6);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = OS.C.ink;
          ctx.font = OS.font(10, 'mono', 600);
          ctx.fillText(`[${l.keys.join(',')}]`, lx + 6, lY + 28);

          // Sibling arrow
          if (idx < leaves.length - 1) {
            ctx.strokeStyle = OS.C.muted;
            ctx.beginPath();
            ctx.moveTo(lx + lW, lY + lH / 2);
            ctx.lineTo(lx + lW + 12, lY + lH / 2);
            ctx.stroke();
          }
        });

        // Footnote
        ctx.font = OS.font(10, 'sans', 400);
        ctx.fillStyle = OS.C.muted;
        ctx.fillText('All user data tuples reside exclusively in leaf nodes. Internal nodes contain only routing keys.', 16, h - 14);
      }
    });

    function render() { cv.redraw(); }
  });

  /* --------------------------------------------------------------------------
   * 6. B-Tree Concurrency: Latch Crabbing & Coupling
   * -------------------------------------------------------------------------- */
  OS.register('latchCrabbing', function (host) {
    let step = 0;
    let heldLatches = ['Root (Read)'];
    let crabbingLog = 'Latch Crabbing Protocol: Step through tree traversal while releasing parent latches safely.';

    const controls = OS.controls(host);
    OS.button(controls, 'Step Latch Crabbing ➔', () => {
      step = (step + 1) % 3;
      if (step === 0) {
        heldLatches = ['Root (Read)'];
        crabbingLog = 'Step 1: Acquired Shared Read Latch on Root Node.';
      } else if (step === 1) {
        heldLatches = ['Child-2 (Read)'];
        crabbingLog = 'Step 2: Acquired Read Latch on Child-2; safely released Root latch!';
      } else {
        heldLatches = ['Leaf-4 (Write Latch)'];
        crabbingLog = 'Step 3: Acquired Exclusive Write Latch on Leaf-4 for in-place tuple update.';
      }
      render();
    }, { primary: true });

    OS.button(controls, 'Reset Latches', () => {
      step = 0;
      heldLatches = ['Root (Read)'];
      crabbingLog = 'Latches reset to Root.';
      render();
    });

    const cv = OS.canvas(host, {
      height: 230,
      render: function (ctx, w, h) {
        ctx.clearRect(0, 0, w, h);

        ctx.font = OS.font(13, 'display', 600);
        ctx.fillStyle = OS.C.ink;
        ctx.fillText('B-Tree Concurrency: Latch Crabbing (Coupling) Protocol', 16, 24);

        ctx.font = OS.font(11, 'mono', 400);
        ctx.fillStyle = OS.C.accent;
        ctx.fillText(crabbingLog, 16, 46);

        // Latch status card
        const boxX = 20;
        const boxY = 70;
        const boxW = Math.max(260, w - 40);
        const boxH = 95;

        ctx.fillStyle = OS.C.surface;
        ctx.strokeStyle = heldLatches[0].includes('Write') ? OS.C.rose : OS.C.teal;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 8);
        ctx.fill();
        ctx.stroke();

        ctx.font = OS.font(12, 'mono', 600);
        ctx.fillStyle = OS.C.ink;
        ctx.fillText('Active Thread Latch Set: ' + heldLatches.join(', '), boxX + 16, boxY + 28);

        ctx.font = OS.font(10, 'sans', 400);
        ctx.fillStyle = OS.C.muted;
        ctx.fillText('Rule: A thread cannot release a parent node latch until it has safely acquired the child node latch.', boxX + 16, boxY + 56);
        ctx.fillText('Locks protect logical database transactions; Latches protect physical in-memory page structures.', boxX + 16, boxY + 78);
      }
    });

    function render() { cv.redraw(); }
  });

  /* --------------------------------------------------------------------------
   * 7. LSM-Trees: MemTable, WAL & SSTables
   * -------------------------------------------------------------------------- */
  OS.register('lsmSstable', function (host) {
    let memTable = ['user:101', 'user:102'];
    let l0SSTables = [['user:090', 'user:099'], ['user:080', 'user:089']];
    let bloomHitMsg = 'Ready to query key across SSTables.';

    const controls = OS.controls(host);
    OS.button(controls, 'Write user:103 (MemTable)', () => {
      memTable.push('user:103');
      bloomHitMsg = 'WROTE: user:103 inserted into in-memory skiplist MemTable.';
      render();
    }, { primary: true });

    OS.button(controls, 'Flush MemTable to L0 SSTable', () => {
      l0SSTables.unshift([...memTable]);
      memTable = [];
      bloomHitMsg = 'FLUSH: MemTable flushed to disk as immutable sorted SSTable file with Bloom filter index.';
      render();
    });

    OS.button(controls, 'Point Query: user:099 (Bloom Filter)', () => {
      bloomHitMsg = 'BLOOM HIT: Bloom filter confirmed key 099 might exist in SSTable L0; 1 disk read executed.';
      render();
    });

    const cv = OS.canvas(host, {
      height: 230,
      render: function (ctx, w, h) {
        ctx.clearRect(0, 0, w, h);

        ctx.font = OS.font(13, 'display', 600);
        ctx.fillStyle = OS.C.ink;
        ctx.fillText('LSM-Tree: In-Memory MemTable Flush ➔ Immutable SSTables', 16, 24);

        ctx.font = OS.font(11, 'mono', 400);
        ctx.fillStyle = bloomHitMsg.includes('BLOOM') ? OS.C.green : OS.C.accent;
        ctx.fillText(bloomHitMsg, 16, 46);

        // Architecture
        const colW = Math.min(180, (w - 60) / 2);
        const yTop = 68;
        const boxH = 85;

        // RAM MemTable
        ctx.fillStyle = OS.rgba(OS.C.teal, 0.12);
        ctx.strokeStyle = OS.C.teal;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(16, yTop, colW, boxH, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = OS.C.ink;
        ctx.font = OS.font(11, 'mono', 600);
        ctx.fillText('RAM: Skiplist MemTable', 26, yTop + 24);
        ctx.font = OS.font(9, 'mono', 400);
        ctx.fillStyle = OS.C.teal;
        ctx.fillText(memTable.join(', ') || '[Empty / Flushed]', 26, yTop + 54);

        // Disk SSTables
        const dX = colW + 32;
        ctx.fillStyle = OS.rgba(OS.C.accent, 0.12);
        ctx.strokeStyle = OS.C.accent;
        ctx.beginPath();
        ctx.roundRect(dX, yTop, colW, boxH, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = OS.C.ink;
        ctx.font = OS.font(11, 'mono', 600);
        ctx.fillText(`Disk: L0 SSTables (${l0SSTables.length})`, dX + 12, yTop + 24);
        ctx.font = OS.font(9, 'mono', 400);
        ctx.fillStyle = OS.C.muted;
        ctx.fillText(l0SSTables[0] ? l0SSTables[0].join(', ') : 'None', dX + 12, yTop + 54);

        // Footnote
        ctx.font = OS.font(10, 'sans', 400);
        ctx.fillStyle = OS.C.muted;
        ctx.fillText('Each SSTable includes a block index and a Bloom filter to avoid loading non-matching SSTables from disk.', 16, h - 14);
      }
    });

    function render() { cv.redraw(); }
  });

  /* --------------------------------------------------------------------------
   * 8. Compaction Strategies: Leveled vs Size-Tiered
   * -------------------------------------------------------------------------- */
  OS.register('compactionArena', function (host) {
    let mode = 'leveled'; // leveled vs stcs
    let spaceAmp = 1.1; // 10% overhead
    let writeAmp = 12; // 12x
    let compLog = 'Leveled Compaction (RocksDB): Low space amplification (~1.1x); higher write amplification (~10-30x).';

    const controls = OS.controls(host);
    OS.segmented(controls, {
      label: 'Compaction Strategy',
      options: [
        { label: 'Leveled (RocksDB / LevelDB)', value: 'leveled' },
        { label: 'Size-Tiered (Cassandra STCS)', value: 'stcs' }
      ],
      value: mode,
      onChange: (v) => {
        mode = v;
        if (mode === 'leveled') {
          spaceAmp = 1.1;
          writeAmp = 16;
          compLog = 'Leveled: Non-overlapping key ranges per level. Predictable low disk space overhead (~10%).';
        } else {
          spaceAmp = 1.7; // 70% space overhead
          writeAmp = 6;
          compLog = 'Size-Tiered: Lower write amplification; high space amplification (needs ~50% free disk space to compact).';
        }
        render();
      }
    });

    OS.button(controls, 'Simulate Heavy Write Burst', () => {
      compLog = mode === 'leveled'
        ? 'LEVELED COMPACTION: Merged L0 SSTables into L1 via merge-sort. Zero dead space retained.'
        : 'STCS COMPACTION: Compacted 4 similar-sized SSTables into 1 larger SSTable. Required temporary duplicate disk space!';
      render();
    }, { primary: true });

    const cv = OS.canvas(host, {
      height: 230,
      render: function (ctx, w, h) {
        ctx.clearRect(0, 0, w, h);

        ctx.font = OS.font(13, 'display', 600);
        ctx.fillStyle = OS.C.ink;
        ctx.fillText(`Compaction Engine: ${mode === 'leveled' ? 'Leveled Compaction Strategy (LCS)' : 'Size-Tiered Compaction Strategy (STCS)'}`, 16, 24);

        ctx.font = OS.font(11, 'mono', 400);
        ctx.fillStyle = OS.C.accent;
        ctx.fillText(compLog, 16, 46);

        // Trade-off cards
        const cardW = Math.min(180, (w - 60) / 2);
        const yTop = 68;
        const cardH = 85;

        // Space Amplification
        ctx.fillStyle = OS.rgba(OS.C.accent, 0.12);
        ctx.strokeStyle = OS.C.accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(16, yTop, cardW, cardH, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = OS.C.ink;
        ctx.font = OS.font(11, 'mono', 600);
        ctx.fillText('Space Amplification', 26, yTop + 24);
        ctx.font = OS.font(16, 'display', 700);
        ctx.fillStyle = spaceAmp > 1.3 ? OS.C.rose : OS.C.green;
        ctx.fillText(`${spaceAmp}x Disk Footprint`, 26, yTop + 54);
        ctx.font = OS.font(9, 'sans', 400);
        ctx.fillStyle = OS.C.muted;
        ctx.fillText('Disk Space Used / Logical Data Size', 26, yTop + 72);

        // Write Amplification
        const c2X = cardW + 32;
        ctx.fillStyle = OS.rgba(OS.C.teal, 0.12);
        ctx.strokeStyle = OS.C.teal;
        ctx.beginPath();
        ctx.roundRect(c2X, yTop, cardW, cardH, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = OS.C.ink;
        ctx.font = OS.font(11, 'mono', 600);
        ctx.fillText('Write Amplification', c2X + 12, yTop + 24);
        ctx.font = OS.font(16, 'display', 700);
        ctx.fillStyle = writeAmp > 10 ? OS.C.amber : OS.C.green;
        ctx.fillText(`${writeAmp}x Disk Rewrites`, c2X + 12, yTop + 54);
        ctx.font = OS.font(9, 'sans', 400);
        ctx.fillStyle = OS.C.muted;
        ctx.fillText('Bytes Written to Storage / User Writes', c2X + 12, yTop + 72);

        // Footnote
        ctx.font = OS.font(10, 'sans', 400);
        ctx.fillStyle = OS.C.muted;
        ctx.fillText('RocksDB Leveled Compaction achieves higher read performance by eliminating overlapping keys in levels L1 and above.', 16, h - 14);
      }
    });

    function render() { cv.redraw(); }
  });

})();
