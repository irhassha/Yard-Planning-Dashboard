// ===================================================================
// YARD MAP VISUALIZATION MODULE
// Dependencies: invData, isInvLoaded, DEFAULT_CAPACITY from yp.js
// ===================================================================

const YARD_CARRIER_PALETTE = [
    '#E74C3C', '#3498DB', '#2ECC71', '#F39C12', '#9B59B6',
    '#1ABC9C', '#E67E22', '#C0392B', '#16A085', '#2980B9',
    '#8E44AD', '#27AE60', '#D35400', '#E91E63', '#00BCD4',
    '#FF5722', '#795548', '#4CAF50', '#FF9800', '#607D8B',
    '#673AB7', '#03A9F4', '#009688', '#FFC107', '#536DFE',
    '#FF4081', '#69F0AE', '#EA80FC', '#FFAB40', '#80DEEA'
];

let yardCarrierColorMap = {};
let yardActiveHighlight = new Set(); // Changed to Set for multi-select
let yardMapZoom = null; // Will auto-fit if null
let yardTextHidden = true; // Default to true

// ── UI Controls ──────────────────────────────────────────────────────

function zoomYardMap(delta) {
    const yardEl = document.querySelector('.ym-yard');
    if (!yardEl) return;

    if (delta === 0) {
        fitYardMapToScreen();
    } else {
        // Initialize if auto-fitted previously
        if (yardMapZoom === null) {
            yardMapZoom = parseFloat(getComputedStyle(yardEl).zoom) || 1.0;
        }
        yardMapZoom += delta;
        if (yardMapZoom < 0.3) yardMapZoom = 0.3;
        if (yardMapZoom > 2.0) yardMapZoom = 2.0;
        applyYardMapZoom();
    }
}

function applyYardMapZoom() {
    const yardEl = document.querySelector('.ym-yard');
    if (yardEl && yardMapZoom !== null) {
        yardEl.style.zoom = yardMapZoom;
    }
}

function fitYardMapToScreen() {
    const contentBox = document.getElementById('yardMapContent');
    const yardEl = document.querySelector('.ym-yard');
    const grid = document.querySelector('.ym-sections-grid');
    if (contentBox && grid && yardEl) {
        yardEl.style.zoom = 1; // Temporarily reset to measure width
        // Small delay to allow reflow, or direct measurement
        const contentPadding = 64;
        const availableWidth = contentBox.clientWidth - contentPadding;
        const naturalWidth = grid.scrollWidth;

        if (naturalWidth > 0 && availableWidth > 0) {
            // Calculate scale to fit width
            yardMapZoom = availableWidth / naturalWidth;
            if (yardMapZoom > 1) yardMapZoom = 1; // Don't scale up beyond 1.0 automatically
            applyYardMapZoom();
        }
    }
}

function toggleYardText() {
    yardTextHidden = !yardTextHidden;
    const yardEl = document.querySelector('.ym-yard');
    const btn = document.getElementById('yardTextToggleBtn');

    if (yardEl) {
        if (yardTextHidden) {
            yardEl.classList.add('ym-text-hidden');
            if (btn) btn.innerHTML = '<span class="material-symbols-outlined text-[16px]">visibility</span> Show Text';
        } else {
            yardEl.classList.remove('ym-text-hidden');
            if (btn) btn.innerHTML = '<span class="material-symbols-outlined text-[16px]">visibility_off</span> Hide Text';
        }
    }
}

// ── Helpers ──────────────────────────────────────────────────────────

function isYardExport(item) {
    const move = String(item.move || '').toLowerCase();
    return !(move.includes('import') || move.includes('disc') || move.includes('vessel') || move.includes('transhipment') || move.includes('t/s'));
}

function buildYardColorMap() {
    yardCarrierColorMap = {};
    const counts = {};
    const allowedBlocks = new Set([
        'C08', 'C07', 'C06', 'C05', 'C04', 'C03', 'C02', 'C01',
        'B08', 'B07', 'B06', 'B05', 'B04', 'B03', 'B02', 'B01',
        'A08', 'A07', 'A06', 'A05', 'A04', 'A03', 'A02', 'A01'
    ]);

    invData.forEach(c => {
        if (
            isYardExport(c) &&
            c.carrier &&
            c.carrier !== '0' &&
            c.carrier !== 'NIL' &&
            c.carrier !== 'UNKNOWN' &&
            allowedBlocks.has(c.block)
        ) {
            counts[c.carrier] = (counts[c.carrier] || 0) + 1;
        }
    });

    Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([carrier], idx) => {
            if (idx < YARD_CARRIER_PALETTE.length) {
                yardCarrierColorMap[carrier] = YARD_CARRIER_PALETTE[idx];
            } else {
                let hash = 0;
                for (let i = 0; i < carrier.length; i++) {
                    hash = carrier.charCodeAt(i) + ((hash << 5) - hash);
                }
                yardCarrierColorMap[carrier] = `hsl(${Math.abs(hash) % 360}, 60%, 50%)`;
            }
        });
}

function getYardColor(carrier) {
    return yardCarrierColorMap[carrier] || '#94A3B8';
}

function yardContrastText(hex) {
    if (!hex || hex.startsWith('hsl') || hex.startsWith('rgb')) return '#fff';
    try {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#1e293b' : '#ffffff';
    } catch (e) { return '#fff'; }
}

// ── Slot Processing ─────────────────────────────────────────────────
// Build a left-to-right display list for one block.
// Slot numbering: 1 (rightmost) … maxSlots (leftmost)
// Display order: maxSlots → 1  (left → right)

function buildYardSlotItems(containers, maxSlots, blockName) {
    const occ = {}; // slotNum → cell info

    // Define the allowed blocks for export coloring
    const allowedBlocks = new Set([
        'C08', 'C07', 'C06', 'C05', 'C04', 'C03', 'C02', 'C01',
        'B08', 'B07', 'B06', 'B05', 'B04', 'B03', 'B02', 'B01',
        'A08', 'A07', 'A06', 'A05', 'A04', 'A03', 'A02', 'A01'
    ]);

    // Check if the current block is one of the allowed blocks
    const isAllowedBlock = allowedBlocks.has(blockName);

    // Sort: imports first, exports last (exports visually override)
    // Within same move: 20ft first, 40ft last (40ft may claim adjacent slot)
    const sorted = [...containers].sort((a, b) => {
        // If not an allowed block, treat everything as import for sorting override purposes
        const ae = isYardExport(a) && isAllowedBlock ? 1 : 0;
        const be = isYardExport(b) && isAllowedBlock ? 1 : 0;
        if (ae !== be) return ae - be;
        const al = String(a.length || '20').startsWith('4') ? 1 : 0;
        const bl = String(b.length || '20').startsWith('4') ? 1 : 0;
        return al - bl;
    });

    sorted.forEach(c => {
        const s = c.slot;
        if (s < 1 || s > maxSlots) return;

        const len = String(c.length || '20');
        const is40 = len.startsWith('40') || len.startsWith('45');

        // Only classify as export (and thus color it) if it's in the allowed blocks
        const exp = isYardExport(c) && isAllowedBlock;
        const color = exp ? getYardColor(c.carrier) : '#FFFFFF';
        const info = { color, carrier: c.carrier || '', isExport: exp };

        if (is40) {
            // 40ft extends LEFT → slot s+1 (higher number = leftward)
            const ext = s + 1;
            const canExtend = ext <= maxSlots &&
                (!occ[ext] || occ[ext].type === 'cont' || (!occ[ext].isExport && exp));
            if (canExtend) {
                occ[ext] = { ...info, type: 'start40', src: s };
                occ[s] = { ...info, type: 'cont', src: s };
            } else {
                // Cannot extend – render as single-width
                if (!occ[s] || (!occ[s].isExport && exp) || occ[s].type === 'cont') {
                    occ[s] = { ...info, type: '20ft', src: s };
                }
            }
        } else {
            // 20ft
            if (!occ[s] || (!occ[s].isExport && exp) || occ[s].type === 'cont') {
                occ[s] = { ...info, type: '20ft', src: s };
            }
        }
    });

    // Walk from left (maxSlots) to right (1)
    const items = [];
    let p = maxSlots;
    while (p >= 1) {
        const cell = occ[p];
        if (!cell) {
            items.push({ t: 'e', s: p });           // empty
            p--;
        } else if (cell.type === 'start40') {
            items.push({ t: '4', c: cell.color, cr: cell.carrier, ex: cell.isExport, s: cell.src });
            p -= 2;
        } else if (cell.type === 'cont') {
            // Orphan continuation – show as single occupied
            items.push({ t: '2', c: cell.color, cr: cell.carrier, ex: cell.isExport, s: p });
            p--;
        } else {
            items.push({ t: '2', c: cell.color, cr: cell.carrier, ex: cell.isExport, s: cell.src });
            p--;
        }
    }
    return items;
}

// ── Main Render ─────────────────────────────────────────────────────

function renderYardMap() {
    const content = document.getElementById('yardMapContent');
    const legend = document.getElementById('yardMapLegend');
    if (!content) return;

    if (!isInvLoaded || !invData.length) {
        content.innerHTML = `<div class="p-12 text-center text-slate-400 border-dashed border-2 border-slate-200 rounded-2xl bg-white/30">
            <span class="material-symbols-outlined text-5xl block mb-2 opacity-50">grid_view</span>
            Upload Unit List to visualize yard.
        </div>`;
        if (legend) legend.innerHTML = '';
        return;
    }

    buildYardColorMap();

    // Group by block
    const blockMap = {};
    invData.forEach(c => {
        if (!c.block || !c.slot || c.slot <= 0) return;
        (blockMap[c.block] = blockMap[c.block] || []).push(c);
    });

    const CAP = typeof activeCapacity !== 'undefined' ? activeCapacity : DEFAULT_CAPACITY;
    const sections = [
        { label: 'BLOCK C', blocks: ['C08', 'C07', 'C06', 'C05', 'C04', 'C03', 'C02', 'C01'] },
        { label: 'BLOCK B', blocks: ['B08', 'B07', 'B06', 'B05', 'B04', 'B03', 'B02', 'B01'] },
        { label: 'BLOCK A', blocks: ['A08', 'A07', 'A06', 'A05', 'A04', 'A03', 'A02', 'A01'] }
    ];

    // ── Legend ────────────────────────────────────────────────────────
    if (legend) {
        const entries = Object.entries(yardCarrierColorMap).sort((a, b) => a[0].localeCompare(b[0]));
        let lh = `<div class="flex items-center gap-2 flex-wrap text-[10px]">
            <span class="font-bold text-slate-500 uppercase tracking-wider">Export Vessels</span>
            <div class="h-3 w-px bg-slate-300"></div>
            <div class="ym-legend-chip ${yardActiveHighlight.size === 0 ? 'ym-legend-active' : ''}" onclick="highlightYardCarrier(null)" title="Clear highlight">
                <span class="w-3 h-3 rounded-sm bg-white border border-slate-300 inline-block"></span>
                <span class="font-bold text-slate-500">All</span>
            </div>
            <div class="h-3 w-px bg-slate-300"></div>`;
        entries.forEach(([c, col]) => {
            const activeCls = yardActiveHighlight.has(c) ? 'ym-legend-active' : '';
            lh += `<div class="ym-legend-chip ${activeCls}" data-carrier="${c}" onclick="highlightYardCarrier('${c}')" title="${c}">
                <span class="w-3 h-3 rounded-sm inline-block" style="background:${col}"></span>
                <span class="font-bold text-slate-600">${c}</span>
            </div>`;
        });
        lh += '</div>';
        legend.innerHTML = lh;
    }

    // ── Statistics ────────────────────────────────────────────────────

    // Get YOR values from the Overview dashboard DOM
    const rawYorOverall = document.getElementById('yorTotal')?.innerText || '0%';
    const rawYorExp = document.getElementById('yorExp')?.innerText || '0%';
    const rawYorImp = document.getElementById('yorImp')?.innerText || '0%';
    const carrierCount = Object.keys(yardCarrierColorMap).length;

    let html = '<div class="ym-yard">';
    html += `<div class="ym-stats-bar">
        <span>🌐 YOR Overall: <strong class="text-blue-400">${rawYorOverall}</strong></span>
        <span>🟢 YOR Export: <strong class="text-emerald-400">${rawYorExp}</strong></span>
        <span>⬜ YOR Import: <strong class="text-amber-400">${rawYorImp}</strong></span>
        <span>🎨 Carriers: <strong>${carrierCount}</strong></span>
    </div>`;

    html += '<div class="ym-sections-grid">';

    // ── Sections C → B → A ───────────────────────────────────────────
    sections.forEach(sec => {
        html += `<div class="ym-section"><div class="ym-section-header">${sec.label}</div>`;

        // Group blocks in pairs: [08,07] [06,05] [04,03] [02,01]
        for (let p = 0; p < sec.blocks.length; p += 2) {
            html += '<div class="ym-block-pair">';

            for (let b = 0; b < 2 && p + b < sec.blocks.length; b++) {
                const bn = sec.blocks[p + b];
                const ms = (CAP[bn] || {}).slots || 37;
                const ctrs = blockMap[bn] || [];
                const items = buildYardSlotItems(ctrs, ms, bn);
                const count = ctrs.length;

                html += `<div class="ym-block">`;
                html += `<div class="ym-block-label">${bn}</div>`;
                html += `<div class="ym-slots">`;

                items.forEach(item => {
                    if (item.t === 'e') {
                        html += `<div class="ym-slot ym-empty" title="Slot ${item.s}"></div>`;
                    } else if (item.t === '4') {
                        const tc = yardContrastText(item.c);
                        const bc = item.ex ? 'rgba(0,0,0,0.18)' : '#cbd5e1';
                        html += `<div class="ym-slot ym-40${item.ex ? ' ym-exp' : ' ym-imp'}" style="background:${item.c};border-color:${bc}" title="Slot ${item.s}: ${item.cr} (40ft)" data-carrier="${item.cr}"><span style="color:${tc}">${item.cr}</span></div>`;
                    } else {
                        const bc = item.ex ? 'rgba(0,0,0,0.15)' : '#cbd5e1';
                        html += `<div class="ym-slot ym-20${item.ex ? ' ym-exp' : ' ym-imp'}" style="background:${item.c};border-color:${bc}" title="Slot ${item.s}: ${item.cr}" data-carrier="${item.cr}"></div>`;
                    }
                });

                html += `</div>`;  // ym-slots
                html += `<div class="ym-block-count" title="${count} units">${count}</div>`;
                html += `</div>`;  // ym-block
            }

            html += '</div>'; // ym-block-pair
        }

        html += '</div>'; // ym-section
    });

    html += '</div>'; // ym-sections-grid

    // ── Slot number ticks ─────────────────────────────────────────────
    html += `<div class="ym-slot-ticks">
        <span class="text-[9px] text-white/50 font-mono">← Higher slots</span>
        <span class="text-[9px] text-white/50 font-mono">Slot 01 →</span>
    </div>`;

    html += '</div>'; // ym-yard
    content.innerHTML = html;

    // Apply auto-fit for first load, or re-apply previously set zoom
    if (yardMapZoom === null) {
        fitYardMapToScreen();
    } else {
        applyYardMapZoom();
    }

    if (yardTextHidden) {
        document.querySelector('.ym-yard').classList.add('ym-text-hidden');
    }
}

// ── Carrier Highlight ───────────────────────────────────────────────

function highlightYardCarrier(carrier) {
    if (carrier === null) {
        yardActiveHighlight.clear();
    } else {
        if (yardActiveHighlight.has(carrier)) {
            yardActiveHighlight.delete(carrier);
        } else {
            yardActiveHighlight.add(carrier);
        }
    }

    const hasSelection = yardActiveHighlight.size > 0;

    document.querySelectorAll('.ym-slot[data-carrier]').forEach(el => {
        if (!hasSelection) {
            el.style.opacity = '1';
            el.style.filter = '';
        } else if (yardActiveHighlight.has(el.dataset.carrier)) {
            el.style.opacity = '1';
            el.style.filter = '';
        } else {
            el.style.opacity = '0.1';
            el.style.filter = 'grayscale(1)';
        }
    });

    document.querySelectorAll('.ym-empty').forEach(el => {
        el.style.opacity = hasSelection ? '0.25' : '1';
    });

    document.querySelectorAll('.ym-legend-chip').forEach(el => {
        const c = el.dataset.carrier;
        if (!c) {
            // "All" chip
            if (!hasSelection) el.classList.add('ym-legend-active');
            else el.classList.remove('ym-legend-active');
        } else if (yardActiveHighlight.has(c)) {
            el.classList.add('ym-legend-active');
        } else {
            el.classList.remove('ym-legend-active');
        }
    });
}
