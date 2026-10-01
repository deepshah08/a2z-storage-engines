/* ==========================================================================
   Storage Engines, Block by Block — Recovery & Transaction Simulators
   ========================================================================== */

(function () {
  'use strict';

  /* --------------------------------------------------------------------------
   * 9. Buffer Pool Management & Hash Tables
   * -------------------------------------------------------------------------- */
  OS.register('bufferPool', function (host) {
    const frames = [
      { frameId: 0, pageId: 101, pinCount: 2, dirty: false },
      { frameId: 1, pageId: 204, pinCount: 0, dirty: true },
      { frameId: 2, pageId: 308, pinCount: 1, dirty: false },
      { frameId: 3, pageId: null, pinCount: 0, dirty: false },
    ];
    let freeList = [3];
    let logMsg = 'Buffer Pool (4 Frames): Page Table maps page_id to frame_id in RAM. Pin Count prevents eviction.';

    let cv = null;
    function render() {
      if (cv && cv.redraw) cv.redraw();
    }

    const controls = OS.controls(host);
    OS.button(controls, 'Read & Pin Page 512', () => {
      // Find frame or use free frame
      const existing = frames.find(f => f.pageId === 512);
      if (existing) {
        existing.pinCount++;
        logMsg = 'CACHE HIT: Page 512 is already in Frame ' + existing.frameId + '. Pin count incremented to ' + existing.pinCount;
      } else if (freeList.length > 0) {
        const freeId = freeList.shift();
        frames[freeId].pageId = 512;
        frames[freeId].pinCount = 1;
        frames[freeId].dirty = false;
        logMsg = 'CACHE MISS: Allocated free Frame ' + freeId + ' from Free List. Read Page 512 from disk (Pin=1).';
      } else {
        // Evict unpinned frame
        const victim = frames.find(f => f.pinCount === 0);
        if (victim) {
          const evictedPage = victim.pageId;
          const wasDirty = victim.dirty;
          victim.pageId = 512;
          victim.pinCount = 1;
          victim.dirty = false;
          logMsg = `EVICTION: Frame ${victim.frameId} (Page ${evictedPage}) evicted.${wasDirty ? ' Flushed dirty data to disk first!' : ''} Loaded Page 512.`;
        } else {
          logMsg = 'BUFFER POOL FULL: All frames currently pinned! Caller must wait for unpin.';
        }
      }
      render();
    }, { primary: true });

    OS.button(controls, 'Write/Dirty Page 101', () => {
      const f = frames.find(f => f.pageId === 101);
      if (f) {
        f.dirty = true;
        logMsg = `DIRTY WRITE: Frame ${f.frameId} (Page 101) marked dirty. In-memory data now differs from disk!`;
      }
      render();
    });

    OS.button(controls, 'Unpin Page 101', () => {
      const f = frames.find(f => f.pageId === 101);
      if (f && f.pinCount > 0) {
        f.pinCount--;
        logMsg = `UNPIN: Frame ${f.frameId} pin count decremented to ${f.pinCount}.${f.pinCount === 0 ? ' Frame is now candidate for eviction.' : ''}`;
      }
      render();
    });

    OS.button(controls, 'Flush Dirty Frames', () => {
      let flushed = 0;
      frames.forEach(f => {
        if (f.dirty) {
          f.dirty = false;
          flushed++;
        }
      });
      logMsg = `FLUSH DISK: Synchronously flushed ${flushed} dirty frames to durable NVMe storage.`;
      render();
    });

    OS.button(controls, 'Reset Pool', () => {
      frames[0] = { frameId: 0, pageId: 101, pinCount: 2, dirty: false };
      frames[1] = { frameId: 1, pageId: 204, pinCount: 0, dirty: true };
      frames[2] = { frameId: 2, pageId: 308, pinCount: 1, dirty: false };
      frames[3] = { frameId: 3, pageId: null, pinCount: 0, dirty: false };
      freeList = [3];
      logMsg = 'Buffer pool reset to initial state.';
      render();
    });

    cv = OS.canvas(host, {
      height: 250,
      render: function (ctx, w, h) {
        ctx.clearRect(0, 0, w, h);

        ctx.font = OS.font(13, 'display', 600);
        ctx.fillStyle = OS.C.ink;
        ctx.fillText('DBMS Buffer Pool Frame Table & Hash Map in RAM', 16, 24);

        ctx.font = OS.font(11, 'mono', 400);
        ctx.fillStyle = logMsg.includes('CACHE MISS') || logMsg.includes('FULL') ? OS.C.red : (logMsg.includes('DIRTY') ? OS.C.amber : OS.C.green);
        ctx.fillText(logMsg, 16, 46);

        // Render frames
        const frameW = Math.min(130, (w - 48) / 4);
        const frameH = 115;
        const startY = 75;

        frames.forEach((f, idx) => {
          const fx = 16 + idx * (frameW + 10);

          ctx.fillStyle = f.dirty ? OS.rgba(OS.C.amber, 0.15) : (f.pageId ? OS.rgba(OS.C.accent, 0.1) : OS.rgba(OS.C.muted, 0.08));
          ctx.strokeStyle = f.dirty ? OS.C.amber : (f.pinCount > 0 ? OS.C.accent : OS.C.muted);
          ctx.lineWidth = f.pinCount > 0 ? 2 : 1;
          ctx.beginPath();
          ctx.roundRect(fx, startY, frameW, frameH, 6);
          ctx.fill();
          ctx.stroke();

          // Title
          ctx.fillStyle = OS.C.ink;
          ctx.font = OS.font(11, 'mono', 700);
          ctx.fillText(`Frame #${f.frameId}`, fx + 10, startY + 22);

          // Content
          ctx.font = OS.font(10, 'mono', 500);
          ctx.fillStyle = f.pageId ? OS.C.ink : OS.C.muted;
          ctx.fillText(`Page: ${f.pageId !== null ? f.pageId : 'EMPTY'}`, fx + 10, startY + 45);

          ctx.fillStyle = f.pinCount > 0 ? OS.C.accent : OS.C.muted;
          ctx.fillText(`Pin Count: ${f.pinCount}`, fx + 10, startY + 68);

          ctx.fillStyle = f.dirty ? OS.C.red : OS.C.green;
          ctx.fillText(`Dirty: ${f.dirty ? 'TRUE (MOD)' : 'FALSE'}`, fx + 10, startY + 91);
        });

        // Summary footer
        ctx.font = OS.font(10, 'sans', 400);
        ctx.fillStyle = OS.C.muted;
        ctx.fillText(`Free List: [${freeList.length ? freeList.join(', ') : 'Empty'}] | Eviction rule: Frame can be replaced only when Pin Count == 0`, 16, h - 16);
      }
    });
    render();
  });

  /* --------------------------------------------------------------------------
   * 10. Page Eviction Policies: LRU-K & 2Q
   * -------------------------------------------------------------------------- */
  OS.register('pageEviction', function (host) {
    let policy = 'LRU'; // 'LRU' or 'LRU-2'
    let capacity = 4;
    let lruQueue = [1, 2, 3, 4]; // recently used pages
    let lruKHistory = { 1: [10], 2: [12], 3: [15], 4: [18] }; // timestamps
    let hits = 14;
    let misses = 4;
    let logMsg = 'LRU vulnerability: Sequential table scan will flush hot working sets entirely out of the cache!';

    let cv = null;
    function render() {
      if (cv && cv.redraw) cv.redraw();
    }

    const controls = OS.controls(host);
    OS.select(controls, 'Eviction Policy', [
      { value: 'LRU', label: 'Classic LRU (Vulnerable to Scans)' },
      { value: 'LRU-2', label: 'LRU-K (K=2) (Scan-Resistant Distance)' },
      { value: '2Q', label: '2Q (Two Queues: FIFO In + LRU Hot)' }
    ], (val) => {
      policy = val;
      lruQueue = [1, 2, 3, 4];
      logMsg = `Policy switched to ${val}.`;
      render();
    });

    OS.button(controls, 'Simulate Scan Attack (Pages 101➔104)', () => {
      const scanPages = [101, 102, 103, 104];
      if (policy === 'LRU') {
        // Classic LRU gets completely evicted
        lruQueue = scanPages;
        misses += 4;
        logMsg = '❌ SCAN POLLUTION: Classic LRU evicted all 4 hot pages (1, 2, 3, 4) in favor of one-time scan blocks!';
      } else if (policy === 'LRU-2') {
        // In LRU-2, pages accessed only once have infinite backward distance; hot pages with 2+ accesses stay protected
        misses += 4;
        logMsg = '🛡️ LRU-2 PROTECTED: One-hit scan blocks have backward distance = ∞. Hot pages (accessed ≥2 times) retained!';
      } else {
        // 2Q: Put in A1in queue without polluting Am queue
        misses += 4;
        logMsg = '🛡️ 2Q PROTECTED: Scan items entered FIFO intake queue (A1in) and expired without displacing main hot queue (Am)!';
      }
      render();
    }, { primary: true });

    OS.button(controls, 'Access Hot Page #1', () => {
      if (lruQueue.includes(1)) {
        hits++;
        // Move to MRU position
        lruQueue = lruQueue.filter(p => p !== 1);
        lruQueue.push(1);
        logMsg = '🎯 CACHE HIT: Hot Page #1 accessed and moved to Most-Recently-Used (MRU) slot.';
      } else {
        misses++;
        lruQueue.shift();
        lruQueue.push(1);
        logMsg = '⚠️ CACHE MISS: Hot Page #1 had to be re-read from NVMe storage!';
      }
      render();
    });

    OS.button(controls, 'Reset Working Set', () => {
      lruQueue = [1, 2, 3, 4];
      hits = 14;
      misses = 4;
      logMsg = 'Working set reset to hot pages [1, 2, 3, 4].';
      render();
    });

    cv = OS.canvas(host, {
      height: 250,
      render: function (ctx, w, h) {
        ctx.clearRect(0, 0, w, h);

        ctx.font = OS.font(13, 'display', 600);
        ctx.fillStyle = OS.C.ink;
        ctx.fillText(`Cache Eviction Dynamics (${policy}) — Sequential Scan Resistance`, 16, 24);

        ctx.font = OS.font(11, 'mono', 400);
        ctx.fillStyle = logMsg.includes('POLLUTION') ? OS.C.red : (logMsg.includes('PROTECTED') || logMsg.includes('HIT') ? OS.C.green : OS.C.amber);
        ctx.fillText(logMsg, 16, 46);

        // Draw slots
        const slotW = Math.min(100, (w - 60) / 4);
        const slotH = 75;
        const startY = 85;

        lruQueue.forEach((page, idx) => {
          const sx = 16 + idx * (slotW + 14);
          const isHot = page <= 4;

          ctx.fillStyle = isHot ? OS.rgba(OS.C.accent, 0.15) : OS.rgba(OS.C.red, 0.15);
          ctx.strokeStyle = isHot ? OS.C.accent : OS.C.red;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(sx, startY, slotW, slotH, 6);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = OS.C.ink;
          ctx.font = OS.font(12, 'mono', 700);
          ctx.fillText(`Page #${page}`, sx + 14, startY + 32);

          ctx.font = OS.font(10, 'sans', 500);
          ctx.fillStyle = isHot ? OS.C.accent : OS.C.red;
          ctx.fillText(idx === 0 ? '← LRU (Victim)' : (idx === lruQueue.length - 1 ? 'MRU (Safe) →' : 'Active'), sx + 10, startY + 56);
        });

        // Hit Ratio
        const total = hits + misses;
        const ratio = total > 0 ? ((hits / total) * 100).toFixed(1) : 0;
        ctx.font = OS.font(11, 'mono', 600);
        ctx.fillStyle = OS.C.ink;
        ctx.fillText(`Metrics: Hits: ${hits} | Misses: ${misses} | Hit Rate: ${ratio}%`, 16, h - 20);
      }
    });
    render();
  });

  /* --------------------------------------------------------------------------
   * 11. Direct I/O vs Linux Page Cache & fsync
   * -------------------------------------------------------------------------- */
  OS.register('directIoPageCache', function (host) {
    let mode = 'DIRECT_IO'; // 'BUFFERED' vs 'DIRECT_IO'
    let dirtyInKernel = 0;
    let writtenToDisk = 0;
    let fsyncNeeded = false;
    let statusText = 'O_DIRECT bypasses OS page cache, eliminating double-buffering and uncoordinated flush latency spikes.';

    let cv = null;
    function render() {
      if (cv && cv.redraw) cv.redraw();
    }

    const controls = OS.controls(host);
    OS.select(controls, 'I/O Path', [
      { value: 'DIRECT_IO', label: 'Direct I/O (O_DIRECT / O_SYNC) — Zero-Copy DBMS Path' },
      { value: 'BUFFERED', label: 'Standard Buffered I/O (OS Page Cache Double Buffering)' }
    ], (val) => {
      mode = val;
      dirtyInKernel = 0;
      fsyncNeeded = false;
      statusText = val === 'DIRECT_IO' 
        ? 'Switched to O_DIRECT: DBMS buffer pool transfers straight to NVMe via DMA.'
        : 'Switched to Buffered I/O: Writes copy into Linux kernel page cache. Requires explicit fsync() for durability!';
      render();
    });

    OS.button(controls, 'Write 64KB Block', () => {
      if (mode === 'BUFFERED') {
        dirtyInKernel += 64;
        fsyncNeeded = true;
        statusText = `WRITE BUFFERED: 64KB copied to Linux Page Cache. Total uncommitted kernel dirty: ${dirtyInKernel}KB. (NOT safe against power loss!)`;
      } else {
        writtenToDisk += 64;
        statusText = `WRITE O_DIRECT: 64KB transferred directly to NVMe storage via DMA! Immediately durable on disk.`;
      }
      render();
    }, { primary: true });

    OS.button(controls, 'Call fsync() Barrier', () => {
      if (dirtyInKernel > 0) {
        writtenToDisk += dirtyInKernel;
        const flushed = dirtyInKernel;
        dirtyInKernel = 0;
        fsyncNeeded = false;
        statusText = `fsync() EXECUTED: Blocked calling thread, flushed ${flushed}KB dirty kernel pages to storage with disk cache barrier.`;
      } else {
        statusText = 'fsync() returned instantly: 0 dirty pages in kernel.';
      }
      render();
    });

    OS.button(controls, 'Reset I/O State', () => {
      dirtyInKernel = 0;
      writtenToDisk = 0;
      fsyncNeeded = false;
      statusText = 'State reset.';
      render();
    });

    cv = OS.canvas(host, {
      height: 250,
      render: function (ctx, w, h) {
        ctx.clearRect(0, 0, w, h);

        ctx.font = OS.font(13, 'display', 600);
        ctx.fillStyle = OS.C.ink;
        ctx.fillText(`I/O Subsystem Architecture: Direct I/O (O_DIRECT) vs Linux Page Cache`, 16, 24);

        ctx.font = OS.font(11, 'mono', 400);
        ctx.fillStyle = fsyncNeeded ? OS.C.amber : OS.C.green;
        ctx.fillText(statusText, 16, 46);

        // Architecture Layers
        const colW = Math.min(180, (w - 60) / 3);
        const colH = 110;
        const startY = 75;

        // Layer 1: User Space DBMS
        ctx.fillStyle = OS.rgba(OS.C.accent, 0.1);
        ctx.strokeStyle = OS.C.accent;
        ctx.beginPath();
        ctx.roundRect(16, startY, colW, colH, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = OS.C.ink;
        ctx.font = OS.font(11, 'mono', 700);
        ctx.fillText('User Space DBMS', 26, startY + 24);
        ctx.font = OS.font(10, 'sans', 400);
        ctx.fillText('DBMS Buffer Pool', 26, startY + 45);
        ctx.fillText('(Alignment: 4KB/512B)', 26, startY + 65);

        // Layer 2: Linux Kernel / Page Cache
        const kx = 16 + colW + 16;
        ctx.fillStyle = mode === 'BUFFERED' ? OS.rgba(OS.C.amber, 0.15) : OS.rgba(OS.C.muted, 0.05);
        ctx.strokeStyle = mode === 'BUFFERED' ? OS.C.amber : OS.C.border;
        ctx.beginPath();
        ctx.roundRect(kx, startY, colW, colH, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = OS.C.ink;
        ctx.font = OS.font(11, 'mono', 700);
        ctx.fillText('Linux Kernel', kx + 10, startY + 24);
        ctx.font = OS.font(10, 'sans', 400);
        ctx.fillStyle = mode === 'BUFFERED' ? OS.C.amber : OS.C.muted;
        ctx.fillText(mode === 'BUFFERED' ? `Page Cache: ${dirtyInKernel}KB Dirty` : 'BYPASSED (Zero Copy)', kx + 10, startY + 45);
        ctx.fillText(mode === 'BUFFERED' ? `Requires fsync() barrier` : 'No OS Cache Pollution', kx + 10, startY + 65);

        // Layer 3: Physical Storage
        const dx = kx + colW + 16;
        ctx.fillStyle = OS.rgba(OS.C.teal, 0.12);
        ctx.strokeStyle = OS.C.teal;
        ctx.beginPath();
        ctx.roundRect(dx, startY, colW, colH, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = OS.C.ink;
        ctx.font = OS.font(11, 'mono', 700);
        ctx.fillText('Physical Storage', dx + 10, startY + 24);
        ctx.font = OS.font(10, 'sans', 400);
        ctx.fillText('NVMe / SSD Flash Tier', dx + 10, startY + 45);
        ctx.fillStyle = OS.C.teal;
        ctx.fillText(`Durable On Disk: ${writtenToDisk}KB`, dx + 10, startY + 65);

        // Footnote
        ctx.font = OS.font(10, 'mono', 400);
        ctx.fillStyle = OS.C.muted;
        ctx.fillText(`Mode: ${mode} | Double-Buffering Penalty: ${mode === 'BUFFERED' ? 'YES (Memory wasted 2x)' : 'NO (Direct DMA)'}`, 16, h - 16);
      }
    });
    render();
  });

  /* --------------------------------------------------------------------------
   * 12. Write-Ahead Logging & STEAL/NO-FORCE Matrix
   * -------------------------------------------------------------------------- */
  OS.register('stealNoForce', function (host) {
    let steal = true;
    let force = false;
    let logSummary = 'STEAL + NO-FORCE: The universal standard for high-performance DBMS. Maximum write throughput; requires WAL with both UNDO and REDO logging.';

    let cv = null;
    function render() {
      if (cv && cv.redraw) cv.redraw();
    }

    const controls = OS.controls(host);
    OS.select(controls, 'Buffer Policy Combination', [
      { value: 'STEAL_NOFORCE', label: 'STEAL + NO-FORCE (Standard: Postgres, MySQL, Oracle)' },
      { value: 'NOSTEAL_NOFORCE', label: 'NO-STEAL + NO-FORCE (Redo only, High RAM usage)' },
      { value: 'STEAL_FORCE', label: 'STEAL + FORCE (Undo only, Abysmal write throughput)' },
      { value: 'NOSTEAL_FORCE', label: 'NO-STEAL + FORCE (Trivial recovery, Infeasible scale)' }
    ], (val) => {
      if (val === 'STEAL_NOFORCE') { steal = true; force = false; }
      else if (val === 'NOSTEAL_NOFORCE') { steal = false; force = false; }
      else if (val === 'STEAL_FORCE') { steal = true; force = true; }
      else { steal = false; force = true; }

      logSummary = `Configured: ${steal ? 'STEAL' : 'NO-STEAL'} and ${force ? 'FORCE' : 'NO-FORCE'}.`;
      render();
    });

    OS.button(controls, 'Simulate Crash & Recovery', () => {
      const needsUndo = steal;
      const needsRedo = !force;
      logSummary = `CRASH RECOVERY: Undo Needed = ${needsUndo ? 'YES (Dirty pages leaked to disk)' : 'NO'}. Redo Needed = ${needsRedo ? 'YES (Committed pages delayed in RAM)' : 'NO'}.`;
      render();
    }, { primary: true });

    cv = OS.canvas(host, {
      height: 250,
      render: function (ctx, w, h) {
        ctx.clearRect(0, 0, w, h);

        ctx.font = OS.font(13, 'display', 600);
        ctx.fillStyle = OS.C.ink;
        ctx.fillText('The Fundamental DBMS Recovery Matrix: STEAL vs FORCE', 16, 24);

        ctx.font = OS.font(11, 'mono', 400);
        ctx.fillStyle = OS.C.ink;
        ctx.fillText(logSummary, 16, 46);

        // 2x2 Matrix Grid
        const cellW = Math.min(180, (w - 60) / 2);
        const cellH = 65;
        const startX = 24;
        const startY = 70;

        // Header labels
        ctx.font = OS.font(10, 'mono', 600);
        ctx.fillStyle = OS.C.muted;
        ctx.fillText('NO-FORCE (Fast Commits)', startX + 30, startY - 6);
        ctx.fillText('FORCE (Slow Commits)', startX + cellW + 35, startY - 6);

        // STEAL row
        const isStealNoForce = (steal && !force);
        ctx.fillStyle = isStealNoForce ? OS.rgba(OS.C.accent, 0.2) : OS.rgba(OS.C.muted, 0.05);
        ctx.strokeStyle = isStealNoForce ? OS.C.accent : OS.C.border;
        ctx.lineWidth = isStealNoForce ? 2 : 1;
        ctx.beginPath();
        ctx.roundRect(startX, startY, cellW, cellH, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = OS.C.ink;
        ctx.font = OS.font(11, 'mono', 700);
        ctx.fillText('STEAL / NO-FORCE', startX + 10, startY + 22);
        ctx.font = OS.font(10, 'sans', 400);
        ctx.fillText('Requires UNDO + REDO', startX + 10, startY + 42);
        ctx.fillStyle = OS.C.accent;
        ctx.fillText('★ Modern Production Standard', startX + 10, startY + 56);

        // STEAL / FORCE
        const isStealForce = (steal && force);
        const x2 = startX + cellW + 12;
        ctx.fillStyle = isStealForce ? OS.rgba(OS.C.accent, 0.2) : OS.rgba(OS.C.muted, 0.05);
        ctx.strokeStyle = isStealForce ? OS.C.accent : OS.C.border;
        ctx.beginPath();
        ctx.roundRect(x2, startY, cellW, cellH, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = OS.C.ink;
        ctx.font = OS.font(11, 'mono', 700);
        ctx.fillText('STEAL / FORCE', x2 + 10, startY + 22);
        ctx.font = OS.font(10, 'sans', 400);
        ctx.fillText('Requires UNDO only', x2 + 10, startY + 42);
        ctx.fillStyle = OS.C.red;
        ctx.fillText('Random disk I/O on every commit', x2 + 10, startY + 56);

        // NO-STEAL / NO-FORCE
        const y2 = startY + cellH + 10;
        const isNoStealNoForce = (!steal && !force);
        ctx.fillStyle = isNoStealNoForce ? OS.rgba(OS.C.accent, 0.2) : OS.rgba(OS.C.muted, 0.05);
        ctx.strokeStyle = isNoStealNoForce ? OS.C.accent : OS.C.border;
        ctx.beginPath();
        ctx.roundRect(startX, y2, cellW, cellH, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = OS.C.ink;
        ctx.font = OS.font(11, 'mono', 700);
        ctx.fillText('NO-STEAL / NO-FORCE', startX + 10, y2 + 22);
        ctx.font = OS.font(10, 'sans', 400);
        ctx.fillText('Requires REDO only', startX + 10, y2 + 42);
        ctx.fillStyle = OS.C.muted;
        ctx.fillText('Huge buffer memory required', startX + 10, y2 + 56);

        // NO-STEAL / FORCE
        const isNoStealForce = (!steal && force);
        ctx.fillStyle = isNoStealForce ? OS.rgba(OS.C.accent, 0.2) : OS.rgba(OS.C.muted, 0.05);
        ctx.strokeStyle = isNoStealForce ? OS.C.accent : OS.C.border;
        ctx.beginPath();
        ctx.roundRect(x2, y2, cellW, cellH, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = OS.C.ink;
        ctx.font = OS.font(11, 'mono', 700);
        ctx.fillText('NO-STEAL / FORCE', x2 + 10, y2 + 22);
        ctx.font = OS.font(10, 'sans', 400);
        ctx.fillText('NO UNDO, NO REDO', x2 + 10, y2 + 42);
        ctx.fillStyle = OS.C.red;
        ctx.fillText('Impractical in real workloads', x2 + 10, y2 + 56);
      }
    });
    render();
  });

  /* --------------------------------------------------------------------------
   * 13. ARIES Crash Recovery: Analysis, Redo, Undo
   * -------------------------------------------------------------------------- */
  OS.register('ariesRecovery', function (host) {
    let currentPhase = 'NORMAL'; // 'NORMAL', 'ANALYSIS', 'REDO', 'UNDO', 'DONE'
    let stepDescription = 'System running normally with active WAL. Click "Simulate Power Outage" to trigger ARIES 3-phase crash recovery.';

    let cv = null;
    function render() {
      if (cv && cv.redraw) cv.redraw();
    }

    const controls = OS.controls(host);
    OS.button(controls, 'Simulate Power Outage / Crash', () => {
      currentPhase = 'CRASHED';
      stepDescription = '⚡ CRASH! System rebooted. RAM state lost. Disk contains WAL log + older checkpoint image.';
      render();
    }, { primary: true });

    OS.button(controls, 'Phase 1: Analysis (Scan Forward)', () => {
      currentPhase = 'ANALYSIS';
      stepDescription = '1. ANALYSIS: Scanned WAL from last Checkpoint forward to end of log. Reconstructed Dirty Page Table (DPT) & Active Txn Table (TT). Identified Loser Txn T2.';
      render();
    });

    OS.button(controls, 'Phase 2: Redo ("Repeat History")', () => {
      currentPhase = 'REDO';
      stepDescription = '2. REDO: Scanned forward from smallest RecLSN. Reapplied all logged updates (even uncommitted ones) to restore exact state at instant of crash.';
      render();
    });

    OS.button(controls, 'Phase 3: Undo (Reverse Losers & CLRs)', () => {
      currentPhase = 'UNDO';
      stepDescription = '3. UNDO: Scanned backward reversing active loser Txn T2. Wrote Compensation Log Records (CLRs) to prevent cascading undo if crash recurs!';
      render();
    });

    OS.button(controls, 'Reset Engine', () => {
      currentPhase = 'NORMAL';
      stepDescription = 'System reset to clean normal operational state.';
      render();
    });

    cv = OS.canvas(host, {
      height: 250,
      render: function (ctx, w, h) {
        ctx.clearRect(0, 0, w, h);

        ctx.font = OS.font(13, 'display', 600);
        ctx.fillStyle = OS.C.ink;
        ctx.fillText('ARIES Algorithm: Analysis ➔ Redo (Repeat History) ➔ Undo (Reverse Losers)', 16, 24);

        ctx.font = OS.font(11, 'mono', 400);
        ctx.fillStyle = currentPhase === 'CRASHED' ? OS.C.red : (currentPhase === 'UNDO' ? OS.C.green : OS.C.accent);
        ctx.fillText(stepDescription, 16, 46);

        // Visual WAL Timeline
        const logEntries = [
          { lsn: 101, txn: 'T1', type: 'UPDATE', page: 'P1' },
          { lsn: 102, txn: 'T2', type: 'UPDATE', page: 'P2' },
          { lsn: 103, txn: 'T1', type: 'COMMIT', page: '-' },
          { lsn: 104, txn: 'T2', type: 'UPDATE', page: 'P3' },
          { lsn: 105, txn: '-', type: '⚡CRASH', page: '-' }
        ];

        const boxW = Math.min(85, (w - 60) / 5);
        const boxH = 65;
        const startY = 80;

        logEntries.forEach((entry, idx) => {
          const bx = 16 + idx * (boxW + 12);
          const isCrash = entry.type === '⚡CRASH';

          ctx.fillStyle = isCrash ? OS.rgba(OS.C.red, 0.2) : OS.rgba(OS.C.accent, 0.1);
          ctx.strokeStyle = isCrash ? OS.C.red : OS.C.accent;
          ctx.beginPath();
          ctx.roundRect(bx, startY, boxW, boxH, 6);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = OS.C.ink;
          ctx.font = OS.font(10, 'mono', 700);
          ctx.fillText(`LSN ${entry.lsn}`, bx + 8, startY + 20);

          ctx.font = OS.font(10, 'sans', 500);
          ctx.fillStyle = entry.type === 'COMMIT' ? OS.C.green : (isCrash ? OS.C.red : OS.C.ink);
          ctx.fillText(`${entry.txn}: ${entry.type}`, bx + 8, startY + 40);

          ctx.font = OS.font(9, 'mono', 400);
          ctx.fillStyle = OS.C.muted;
          ctx.fillText(entry.page !== '-' ? `Page ${entry.page}` : '', bx + 8, startY + 56);
        });

        // Recovery Status Box
        const statY = startY + boxH + 20;
        ctx.font = OS.font(11, 'mono', 600);
        ctx.fillStyle = OS.C.ink;
        ctx.fillText(`Current Phase: [${currentPhase}]`, 16, statY + 16);

        ctx.font = OS.font(10, 'sans', 400);
        ctx.fillStyle = OS.C.muted;
        ctx.fillText('Analysis: Finds RecLSN & active txns | Redo: Applies changes from RecLSN | Undo: Writes CLRs backward for T2', 16, statY + 36);
      }
    });
    render();
  });

  /* --------------------------------------------------------------------------
   * 14. Concurrency Control: 2PL & Strict 2PL
   * -------------------------------------------------------------------------- */
  OS.register('twoPhaseLocking', function (host) {
    let protocol = 'STRICT_2PL'; // 'CONSERVATIVE', 'STRICT_2PL', 'RIGOROUS_2PL'
    let t1State = 'GROWING'; // 'GROWING', 'SHRINKING', 'COMMITTED', 'ABORTED'
    let lockHolders = { rowA: 'T1 (Exclusive)', rowB: 'None' };
    let simText = 'Strict 2PL: All Exclusive locks held until COMMIT/ABORT. Completely prevents cascading aborts.';

    let cv = null;
    function render() {
      if (cv && cv.redraw) cv.redraw();
    }

    const controls = OS.controls(host);
    OS.select(controls, 'Locking Protocol', [
      { value: 'STRICT_2PL', label: 'Strict 2PL (Hold Exclusive locks until Commit)' },
      { value: 'RIGOROUS_2PL', label: 'Rigorous 2PL (Hold Shared & Exclusive locks until Commit)' },
      { value: 'BASIC_2PL', label: 'Basic 2PL (Release early in Shrinking Phase — Cascade Risk!)' }
    ], (val) => {
      protocol = val;
      t1State = 'GROWING';
      lockHolders = { rowA: 'T1 (Exclusive)', rowB: 'None' };
      simText = `Switched to ${val}.`;
      render();
    });

    OS.button(controls, 'T1 Acquires Row B Lock', () => {
      if (t1State === 'GROWING') {
        lockHolders.rowB = 'T1 (Exclusive)';
        simText = 'GROWING PHASE: T1 acquired X-Lock on Row B. Can still acquire locks.';
      } else {
        simText = 'ERROR: Cannot acquire locks in SHRINKING phase (2PL Invariant Violation)!';
      }
      render();
    }, { primary: true });

    OS.button(controls, 'T1 Releases Row A Lock Early', () => {
      if (protocol === 'BASIC_2PL') {
        lockHolders.rowA = 'None';
        t1State = 'SHRINKING';
        simText = 'SHRINKING PHASE: T1 released Row A early. T2 can now read Row A before T1 commits (Cascading abort danger)!';
      } else {
        simText = 'BLOCKED: Strict/Rigorous 2PL forbids releasing locks before transaction termination!';
      }
      render();
    });

    OS.button(controls, 'T1 Commits Transaction', () => {
      t1State = 'COMMITTED';
      lockHolders.rowA = 'None';
      lockHolders.rowB = 'None';
      simText = 'COMMIT: T1 committed successfully. All held locks atomicaly released.';
      render();
    });

    OS.button(controls, 'Reset Concurrency State', () => {
      t1State = 'GROWING';
      lockHolders = { rowA: 'T1 (Exclusive)', rowB: 'None' };
      simText = 'State reset to Growing phase.';
      render();
    });

    cv = OS.canvas(host, {
      height: 250,
      render: function (ctx, w, h) {
        ctx.clearRect(0, 0, w, h);

        ctx.font = OS.font(13, 'display', 600);
        ctx.fillStyle = OS.C.ink;
        ctx.fillText(`Two-Phase Locking (2PL) Invariants: Growing vs Shrinking Phases`, 16, 24);

        ctx.font = OS.font(11, 'mono', 400);
        ctx.fillStyle = simText.includes('ERROR') || simText.includes('BLOCKED') ? OS.C.red : (simText.includes('COMMIT') ? OS.C.green : OS.C.accent);
        ctx.fillText(simText, 16, 46);

        // Lock Table Display
        const cardW = Math.min(180, (w - 60) / 2);
        const cardH = 90;
        const startY = 80;

        // Row A Lock Card
        ctx.fillStyle = lockHolders.rowA.includes('T1') ? OS.rgba(OS.C.accent, 0.15) : OS.rgba(OS.C.muted, 0.05);
        ctx.strokeStyle = lockHolders.rowA.includes('T1') ? OS.C.accent : OS.C.border;
        ctx.beginPath();
        ctx.roundRect(16, startY, cardW, cardH, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = OS.C.ink;
        ctx.font = OS.font(11, 'mono', 700);
        ctx.fillText('Row A (Table: accounts)', 26, startY + 25);
        ctx.font = OS.font(10, 'sans', 500);
        ctx.fillText(`Lock Status: ${lockHolders.rowA}`, 26, startY + 48);
        ctx.fillStyle = OS.C.muted;
        ctx.fillText('Protected Data item', 26, startY + 68);

        // Row B Lock Card
        const x2 = 16 + cardW + 16;
        ctx.fillStyle = lockHolders.rowB.includes('T1') ? OS.rgba(OS.C.accent, 0.15) : OS.rgba(OS.C.muted, 0.05);
        ctx.strokeStyle = lockHolders.rowB.includes('T1') ? OS.C.accent : OS.C.border;
        ctx.beginPath();
        ctx.roundRect(x2, startY, cardW, cardH, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = OS.C.ink;
        ctx.font = OS.font(11, 'mono', 700);
        ctx.fillText('Row B (Table: audit_log)', x2 + 10, startY + 25);
        ctx.font = OS.font(10, 'sans', 500);
        ctx.fillText(`Lock Status: ${lockHolders.rowB}`, x2 + 10, startY + 48);
        ctx.fillStyle = OS.C.muted;
        ctx.fillText('Protected Data item', x2 + 10, startY + 68);

        // Status summary
        ctx.font = OS.font(10, 'mono', 500);
        ctx.fillStyle = OS.C.ink;
        ctx.fillText(`Transaction T1 Phase: [${t1State}] | Protocol: ${protocol}`, 16, h - 16);
      }
    });
    render();
  });

  /* --------------------------------------------------------------------------
   * 15. Multi-Version Concurrency Control (MVCC)
   * -------------------------------------------------------------------------- */
  OS.register('mvccVisibility', function (host) {
    let versions = [
      { id: 1, val: 'Balance: $100', xmin: 100, xmax: 105 },
      { id: 2, val: 'Balance: $150', xmin: 105, xmax: 0 } // 0 means active/alive
    ];
    let readerTxn = 102;
    let visibilityResult = 'Txn 102 reads Version 1: xmin(100) <= 102 and xmax(105) > 102. Sees original $100!';

    let cv = null;
    function render() {
      if (cv && cv.redraw) cv.redraw();
    }

    const controls = OS.controls(host);
    OS.select(controls, 'Reader Transaction ID', [
      { value: '102', label: 'Reader Txn 102 (Snapshot before Txn 105 commit)' },
      { value: '108', label: 'Reader Txn 108 (Snapshot after Txn 105 commit)' },
      { value: '99', label: 'Reader Txn 99 (Snapshot before row was created)' }
    ], (val) => {
      readerTxn = parseInt(val, 10);
      evaluateVisibility();
      render();
    });

    OS.button(controls, 'Txn 110 Updates Row ($200)', () => {
      if (versions.length === 2) {
        versions[1].xmax = 110;
        versions.push({ id: 3, val: 'Balance: $200', xmin: 110, xmax: 0 });
        evaluateVisibility();
      }
      render();
    }, { primary: true });

    OS.button(controls, 'Run VACUUM (Purge Dead Tuples)', () => {
      // If lowest active txn > xmax, tuple is dead to all readers
      const initialCount = versions.length;
      versions = versions.filter(v => v.xmax === 0 || v.xmax >= readerTxn);
      const purged = initialCount - versions.length;
      visibilityResult = `VACUUM COMPLETED: Reclaimed ${purged} obsolete dead tuple versions.`;
      render();
    });

    OS.button(controls, 'Reset MVCC State', () => {
      versions = [
        { id: 1, val: 'Balance: $100', xmin: 100, xmax: 105 },
        { id: 2, val: 'Balance: $150', xmin: 105, xmax: 0 }
      ];
      readerTxn = 102;
      evaluateVisibility();
      render();
    });

    function evaluateVisibility() {
      // Find visible version
      const visible = versions.find(v => v.xmin <= readerTxn && (v.xmax === 0 || v.xmax > readerTxn));
      if (visible) {
        visibilityResult = `Txn ${readerTxn} VISIBILITY: Sees Version #${visible.id} (${visible.val}) [xmin=${visible.xmin}, xmax=${visible.xmax || 'INF'}]`;
      } else {
        visibilityResult = `Txn ${readerTxn} VISIBILITY: No visible version found (Row did not exist yet for this snapshot).`;
      }
    }

    cv = OS.canvas(host, {
      height: 250,
      render: function (ctx, w, h) {
        ctx.clearRect(0, 0, w, h);

        ctx.font = OS.font(13, 'display', 600);
        ctx.fillStyle = OS.C.ink;
        ctx.fillText(`MVCC Tuple Version Chain: xmin / xmax Visibility Rule`, 16, 24);

        ctx.font = OS.font(11, 'mono', 400);
        ctx.fillStyle = visibilityResult.includes('VISIBILITY') ? OS.C.accent : OS.C.green;
        ctx.fillText(visibilityResult, 16, 46);

        // Draw Version Chain
        const boxW = Math.min(130, (w - 60) / versions.length);
        const boxH = 95;
        const startY = 75;

        versions.forEach((v, idx) => {
          const bx = 16 + idx * (boxW + 24);
          const isVisible = v.xmin <= readerTxn && (v.xmax === 0 || v.xmax > readerTxn);

          ctx.fillStyle = isVisible ? OS.rgba(OS.C.green, 0.15) : OS.rgba(OS.C.muted, 0.08);
          ctx.strokeStyle = isVisible ? OS.C.green : OS.C.border;
          ctx.lineWidth = isVisible ? 2 : 1;
          ctx.beginPath();
          ctx.roundRect(bx, startY, boxW, boxH, 6);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = OS.C.ink;
          ctx.font = OS.font(11, 'mono', 700);
          ctx.fillText(`Version #${v.id}`, bx + 10, startY + 22);

          ctx.font = OS.font(10, 'sans', 600);
          ctx.fillStyle = isVisible ? OS.C.green : OS.C.ink;
          ctx.fillText(v.val, bx + 10, startY + 42);

          ctx.font = OS.font(9, 'mono', 400);
          ctx.fillStyle = OS.C.muted;
          ctx.fillText(`xmin: ${v.xmin}`, bx + 10, startY + 62);
          ctx.fillText(`xmax: ${v.xmax === 0 ? '0 (ALIVE)' : v.xmax}`, bx + 10, startY + 80);

          // Pointer arrow to next version
          if (idx < versions.length - 1) {
            ctx.strokeStyle = OS.C.accent;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(bx + boxW, startY + boxH / 2);
            ctx.lineTo(bx + boxW + 20, startY + boxH / 2);
            ctx.stroke();
          }
        });

        // Legend footer
        ctx.font = OS.font(10, 'mono', 400);
        ctx.fillStyle = OS.C.muted;
        ctx.fillText(`Rule: Tuple visible to T if xmin <= T and (xmax > T or xmax == 0). Vacuum cleans when xmax < min(active_txns).`, 16, h - 16);
      }
    });
    render();
  });

})();
