# Storage Engines & Database Internals, Block by Block

> An interactive, visual field guide to storage engine architectures and database internals: from flash memory physics and slotted pages to B+ tree latch crabbing, LSM-Tree leveled compaction, O_DIRECT kernel bypass, ARIES crash recovery, and PostgreSQL MVCC tuple visibility.

---

## 🏛️ Curricular Foundations

This curriculum synthesizes core principles and reference architectures from:
- **Alex Petrov**, *Database Internals: A Deep Dive into How Distributed Data Systems Work* (O'Reilly)
- **C. Mohan et al.**, *ARIES: A Transaction Recovery Method Supporting Fine-Granularity Locking and Partial Rollbacks Using Write-Ahead Logging* (ACM TODS 1992)
- **Joseph M. Hellerstein & Michael Stonebraker**, *Readings in Database Systems* (The Red Book)
- **Goetz Graefe**, *Modern B-Tree Techniques* (Foundations and Trends in Databases)
- **Patrick O'Neil, Edward O'Neil, Gerhard Weikum**, *The LRU-K Page Replacement Algorithm For Database Disk Buffering* (SIGMOD 1993)
- **PostgreSQL Global Development Group**, *PostgreSQL Internal Documentation: MVCC & Buffer Manager*

---

## 🔬 Interactive Simulators Included

| Chapter | Simulator | Key Concepts Demonstrated |
|---|---|---|
| **Figure 00** | `storageHero` | LSM vs B+ Tree WAF & p99 Latency Tradeoff Arena |
| **Chapter 01** | `nandFlash` | Flash 4KB Page Program vs 2MB Erase Block & Garbage Collection |
| **Chapter 02** | `slottedPage` | Slotted Page Layout, Header Slot Directories, In-Page Defragmentation |
| **Chapter 03** | `rowVsColumnar` | NSM Contiguous Rows vs PAX Columnar Memory Strides & Vector Scans |
| **Chapter 04** | `bitcaskLog` | Bitcask Append-Only Log, In-Memory Keydir Hash Table & Merge Compaction |
| **Chapter 05** | `bplusTreeSplit` | B+ Tree Fanout, Leaf Doubly-Linked Lists, Middle Key Promotion Splits |
| **Chapter 06** | `latchCrabbing` | B-Tree Concurrency, Parent/Child Latch Coupling & Safe Node Rules |
| **Chapter 07** | `lsmSstable` | LSM Ingest Pipeline, MemTable, Bloom Filters & SSTable Flushing |
| **Chapter 08** | `compactionArena` | Size-Tiered (STCS) vs Leveled (LCS) Compaction & Range Overlaps |
| **Chapter 09** | `bufferPool` | Buffer Pool Frame Table, Page Hash Table, Pin Count & Dirty Bits |
| **Chapter 10** | `pageEviction` | Sequential Scan Pollution, Classic LRU vs LRU-2 vs 2Q Algorithms |
| **Chapter 11** | `directIoPageCache` | O_DIRECT Zero-Copy DMA vs Linux Kernel Page Cache Double-Buffering |
| **Chapter 12** | `stealNoForce` | STEAL vs FORCE Matrix, WAL Undo/Redo Mathematical Invariants |
| **Chapter 13** | `ariesRecovery` | ARIES 3-Phase Crash Recovery: Analysis, Redo (Repeat History), Undo (CLRs) |
| **Chapter 14** | `twoPhaseLocking` | Two-Phase Locking (2PL), Growing/Shrinking Phases & Strict S2PL |
| **Chapter 15** | `mvccVisibility` | Multi-Version Concurrency (MVCC), xmin/xmax Tuple Headers & VACUUM |

---

## 🧪 Automated Testing & Verification

The suite includes a comprehensive headless test runner that mounts every simulator, exercises all interactive controls (buttons, selects, sliders, segmented pickers), and verifies high-DPI canvas rendering across 4 standard viewports (320px, 480px, 768px, 1200px):

```bash
npm test
```

---

## 🚀 Deployment

Zero-build vanilla web architecture. Built with HTML5, CSS3, and ES6+ Canvas APIs.
Hosted on GitHub Pages.
