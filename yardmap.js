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
let yardRowMode = false; // Default row mode off

// ── UI Controls ──────────────────────────────────────────────────────

function toggleYardRowMode() {
    yardRowMode = !yardRowMode;
    const btn = document.getElementById('yardRowModeBtn');
    if (btn) {
        if (yardRowMode) {
            btn.innerHTML = '<span class="material-symbols-outlined text-[16px]">view_comfy</span> Hide Rows';
        } else {
            btn.innerHTML = '<span class="material-symbols-outlined text-[16px]">view_column</span> Show Rows';
        }
    }
    renderYardMap();
}

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

function buildYardRowGrid(containers, maxSlots, blockName) {
    const occ = {}; // row -> slot -> cell info
    for (let r = 1; r <= 6; r++) occ[r] = {};

    const allowedBlocks = new Set([
        'C08','C07','C06','C05','C04','C03','C02','C01',
        'B08','B07','B06','B05','B04','B03','B02','B01',
        'A08','A07','A06','A05','A04','A03','A02','A01'
    ]);
    const isAllowedBlock = allowedBlocks.has(blockName);

    const sorted = [...containers].sort((a, b) => {
        const ae = isYardExport(a) && isAllowedBlock ? 1 : 0;
        const be = isYardExport(b) && isAllowedBlock ? 1 : 0;
        if (ae !== be) return ae - be;
        const al = String(a.length || '20').startsWith('4') ? 1 : 0;
        const bl = String(b.length || '20').startsWith('4') ? 1 : 0;
        return al - bl;
    });

    sorted.forEach(c => {
        const s = c.slot;
        let r = c.row;
        if (s < 1 || s > maxSlots) return;
        if (!r || r < 1 || r > 6) r = 1; // Default to row 1 if invalid

        const len = String(c.length || '20');
        const is40 = len.startsWith('40') || len.startsWith('45');
        const exp = isYardExport(c) && isAllowedBlock;
        const color = exp ? getYardColor(c.carrier) : '#FFFFFF';
        const info = { color, carrier: c.carrier || '', isExport: exp };

        if (is40) {
            const ext = s + 1;
            const canExtend = ext <= maxSlots &&
                (!occ[r][ext] || occ[r][ext].type === 'cont' || (!occ[r][ext].isExport && exp));
            if (canExtend) {
                occ[r][ext] = { ...info, type: 'start40', src: s };
                occ[r][s]   = { ...info, type: 'cont',    src: s };
            } else {
                if (!occ[r][s] || (!occ[r][s].isExport && exp) || occ[r][s].type === 'cont') {
                    occ[r][s] = { ...info, type: '20ft', src: s };
                }
            }
        } else {
            if (!occ[r][s] || (!occ[r][s].isExport && exp) || occ[r][s].type === 'cont') {
                occ[r][s] = { ...info, type: '20ft', src: s };
            }
        }
    });

    const items = [];
    for (let r = 1; r <= 6; r++) {
        let p = maxSlots;
        while (p >= 1) {
            const cell = occ[r][p];
            const col = maxSlots - p + 1;
            
            if (!cell) {
                items.push({ t: 'e', r: r, cSpan: 1, col: col, s: p }); 
                p--;
            } else if (cell.type === 'start40') {
                items.push({ t: '4', c: cell.color, cr: cell.carrier, ex: cell.isExport, s: cell.src, r: r, cSpan: 2, col: col });
                p -= 2;
            } else if (cell.type === 'cont') {
                items.push({ t: '2', c: cell.color, cr: cell.carrier, ex: cell.isExport, s: p, r: r, cSpan: 1, col: col });
                p--;
            } else {
                items.push({ t: '2', c: cell.color, cr: cell.carrier, ex: cell.isExport, s: cell.src, r: r, cSpan: 1, col: col });
                p--;
            }
        }
    }
    return items;
}

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

    // Calculate new extra stats
    let emptyInsideBlock = 0; // TEUS
    let emptyOutsideBlock = 0; // TEUS
    let oogCount = 0; // TEUS
    let longstayCount = 0; // TEUS
    let serviceMap = {}; // service -> Set of carriers

    const allowedBlocks = new Set([
        'C08','C07','C06','C05','C04','C03','C02','C01',
        'B08','B07','B06','B05','B04','B03','B02','B01',
        'A08','A07','A06','A05','A04','A03','A02','A01'
    ]);

    function parseDate(dStr) {
        if (!dStr || dStr === 'UNKNOWN') return null;
        let parts = dStr.split('/');
        if (parts.length === 3) {
            return new Date(parts[2], parseInt(parts[1])-1, parts[0]);
        }
        return null;
    }
    const today = new Date();
    today.setHours(0,0,0,0);

    invData.forEach(c => {
        const teu = String(c.length || '20').startsWith('4') ? 2 : 1;
        
        // 1 & 2: Empty Containers
        const status = c.loadStatus || '';
        if (status === 'MTY' || status === 'MT' || status === 'E' || status === 'EMPTY') {
            if (allowedBlocks.has(c.block)) {
                emptyInsideBlock += teu;
            } else if (c.block && c.block.startsWith('E')) {
                // empty outside block AND block starts with E
                emptyOutsideBlock += teu;
            }
        }

        // 3: OOG
        if (c.oog === 'Y') oogCount += teu;

        // 4: Longstay > 7 days
        // (Abaikan jika block berawalan "8")
        if (!c.block || !c.block.startsWith('8')) {
            let ad = parseDate(c.arrivalDate);
            if (ad) {
                let diffTime = today.getTime() - ad.getTime();
                let diffDays = Math.floor(diffTime / (1000 * 3600 * 24));
                if (diffDays > 7) {
                    longstayCount += teu;
                }
            }
        }
        
        // 5: Double call per service
        // (hanya carrier yang ada di dalam list export, yaitu yardCarrierColorMap)
        // (ABAikan JIKA TIDAK ADA ETA/ARRIVAL DATE)
        const arrivalDateStr = String(c.arrivalDate || '').toUpperCase().trim();
        const hasEta = arrivalDateStr && arrivalDateStr !== 'UNKNOWN' && arrivalDateStr !== 'NIL' && arrivalDateStr !== '0' && arrivalDateStr !== '';
        
        if (hasEta && isYardExport(c) && c.service && c.service !== 'UNKNOWN' && c.service !== '' && c.carrier && c.carrier !== 'UNKNOWN' && c.carrier !== 'NIL' && c.carrier !== '0') {
            if (yardCarrierColorMap.hasOwnProperty(c.carrier)) {
                if (!serviceMap[c.service]) serviceMap[c.service] = new Set();
                serviceMap[c.service].add(c.carrier);
            }
        }
    });

    let doubleCallHtml = '';
    let doubleCallCount = 0;
    Object.keys(serviceMap).forEach(srv => {
        if (serviceMap[srv].size >= 2) {
            doubleCallCount++;
            const carriers = Array.from(serviceMap[srv]).join(', ');
            doubleCallHtml += `<div class="bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-[2px] rounded text-[10px]"><span class="font-bold">${srv}</span>: ${carriers}</div>`;
        }
    });

    if (doubleCallHtml === '') {
        doubleCallHtml = `<div class="text-slate-400 italic text-[10px]">No double calls detected</div>`;
    }

    let html = '<div class="ym-yard">';
    html += `<div class="ym-stats-bar">
        <span>🌐 YOR Overall: <strong class="text-blue-400">${rawYorOverall}</strong></span>
        <span>🟢 YOR Export: <strong class="text-emerald-400">${rawYorExp}</strong></span>
        <span>⬜ YOR Import: <strong class="text-amber-400">${rawYorImp}</strong></span>
        <span>🎨 Carriers: <strong>${carrierCount}</strong></span>
    </div>`;

    // Extra KPI Banner (Layout diperlebar untuk double call)
    html += `<div class="p-3 mb-3 bg-gradient-to-r from-slate-50 to-white/80 border border-slate-200/60 rounded-xl shadow-sm flex flex-col md:flex-row gap-4 justify-between backdrop-blur-md items-start" style="font-size:11px;">
        <div class="flex flex-wrap items-center gap-6 shrink-0 pt-1">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"><span class="material-symbols-outlined text-[16px]">check_box_outline_blank</span></div>
                <div class="flex flex-col">
                    <span class="text-slate-400 font-semibold mb-0.5 uppercase tracking-wider text-[9px]">Empty In Block</span>
                    <span class="font-black text-slate-700 text-sm">${emptyInsideBlock} <span class="text-[9px] font-bold text-slate-400">TEUS</span></span>
                </div>
            </div>
            
            <div class="h-8 w-px bg-slate-200 hidden md:block"></div>
            
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"><span class="material-symbols-outlined text-[16px]">tab_unselected</span></div>
                <div class="flex flex-col">
                    <span class="text-slate-400 font-semibold mb-0.5 uppercase tracking-wider text-[9px]">Empty Out Block</span>
                    <span class="font-black text-slate-700 text-sm">${emptyOutsideBlock} <span class="text-[9px] font-bold text-slate-400">TEUS</span></span>
                </div>
            </div>
            
            <div class="h-8 w-px bg-slate-200 hidden md:block"></div>
            
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center text-orange-500"><span class="material-symbols-outlined text-[16px]">warning</span></div>
                <div class="flex flex-col">
                    <span class="text-orange-400 font-semibold mb-0.5 uppercase tracking-wider text-[9px]">Total OOG</span>
                    <span class="font-black text-orange-600 text-sm">${oogCount} <span class="text-[9px] font-bold text-orange-300">TEUS</span></span>
                </div>
            </div>
            
            <div class="h-8 w-px bg-slate-200 hidden md:block"></div>
            
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-red-500"><span class="material-symbols-outlined text-[16px]">timer</span></div>
                <div class="flex flex-col">
                    <span class="text-red-400 font-semibold mb-0.5 uppercase tracking-wider text-[9px]">Longstay > 7 Days</span>
                    <span class="font-black text-red-600 text-sm">${longstayCount} <span class="text-[9px] font-bold text-red-300">TEUS</span></span>
                </div>
            </div>
        </div>

        <div class="flex flex-col ml-auto border-t md:border-t-0 md:border-l border-slate-200/60 pt-3 md:pt-0 pl-0 md:pl-5 md:min-w-[320px]">
            <div class="flex items-center justify-between mb-1.5">
                <span class="text-slate-500 font-semibold flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-[14px]">call_split</span> Double Call per Service
                </span>
                <span class="bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider">${doubleCallCount} Services</span>
            </div>
            <div class="flex flex-wrap gap-1.5 custom-scrollbar overflow-y-auto max-h-16 pr-1">${doubleCallHtml}</div>
        </div>
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
                const count = ctrs.length;

                html += `<div class="ym-block">`;
                html += `<div class="ym-block-label">${bn}</div>`;
                
                if (yardRowMode) {
                    html += `<div class="ym-block-grid" style="grid-template-columns: repeat(${ms}, 11px); grid-template-rows: repeat(6, 11px);">`;
                    const items = buildYardRowGrid(ctrs, ms, bn);
                    items.forEach(item => {
                        const styleNode = `grid-column: ${item.col} / span ${item.cSpan}; grid-row: ${item.r};`;
                        if (item.t === 'e') {
                            html += `<div class="ym-slot ym-empty" style="${styleNode} height: 11px;" title="Slot ${item.s} Row ${item.r}" data-block="${bn}" data-slot="${item.s}"></div>`;
                        } else if (item.t === '4') {
                            const tc = yardContrastText(item.c);
                            const bc = item.ex ? 'rgba(0,0,0,0.18)' : '#cbd5e1';
                            html += `<div class="ym-slot ym-40${item.ex ? ' ym-exp' : ' ym-imp'}" style="${styleNode} background:${item.c};border-color:${bc}; height: 11px; font-size:4px;" title="Slot ${item.s} Row ${item.r}: ${item.cr} (40ft)" data-carrier="${item.cr}" data-block="${bn}" data-slot="${item.s}"><span style="color:${tc}">${item.cr}</span></div>`;
                        } else {
                            const bc = item.ex ? 'rgba(0,0,0,0.15)' : '#cbd5e1';
                            html += `<div class="ym-slot ym-20${item.ex ? ' ym-exp' : ' ym-imp'}" style="${styleNode} background:${item.c};border-color:${bc}; height: 11px;" title="Slot ${item.s} Row ${item.r}: ${item.cr}" data-carrier="${item.cr}" data-block="${bn}" data-slot="${item.s}"></div>`;
                        }
                    });
                    html += `</div>`;
                } else {
                    html += `<div class="ym-slots">`;
                    const items = buildYardSlotItems(ctrs, ms, bn);
                    items.forEach(item => {
                        if (item.t === 'e') {
                            html += `<div class="ym-slot ym-empty" title="Slot ${item.s}" data-block="${bn}" data-slot="${item.s}"></div>`;
                        } else if (item.t === '4') {
                            const tc = yardContrastText(item.c);
                            const bc = item.ex ? 'rgba(0,0,0,0.18)' : '#cbd5e1';
                            html += `<div class="ym-slot ym-40${item.ex ? ' ym-exp' : ' ym-imp'}" style="background:${item.c};border-color:${bc}" title="Slot ${item.s}: ${item.cr} (40ft)" data-carrier="${item.cr}" data-block="${bn}" data-slot="${item.s}"><span style="color:${tc}">${item.cr}</span></div>`;
                        } else {
                            const bc = item.ex ? 'rgba(0,0,0,0.15)' : '#cbd5e1';
                            html += `<div class="ym-slot ym-20${item.ex ? ' ym-exp' : ' ym-imp'}" style="background:${item.c};border-color:${bc}" title="Slot ${item.s}: ${item.cr}" data-carrier="${item.cr}" data-block="${bn}" data-slot="${item.s}"></div>`;
                        }
                    });
                    html += `</div>`;  // ym-slots
                }
                
                html += `<div class="ym-block-count" title="${count} units">${count}</div>`;
                html += `</div>`;  // ym-block
            }

            html += '</div>'; // ym-block-pair
        }

        html += '</div>'; // ym-section
    });

    html += '</div>'; // ym-sections-grid



    html += '</div>'; // ym-yard
    content.innerHTML = html;

    // Apply auto-fit always on render to ensure it fits the screen
    fitYardMapToScreen();

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

// ── Yard Slot Click → Open Drawer ───────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const content = document.getElementById('yardMapContent');
    if (!content) return;
    content.addEventListener('click', function(e) {
        const slot = e.target.closest('.ym-slot[data-block][data-slot]');
        if (!slot) return;
        const block = slot.dataset.block;
        const slotNum = parseInt(slot.dataset.slot);
        if (!block || isNaN(slotNum)) return;
        showYardSlotDetail(block, slotNum);
    });
});

function showYardSlotDetail(block, slotNum) {
    if (!invData || !invData.length) return;
    const blockRows = invData.filter(it => it.block === block);
    if (blockRows.length === 0) return;
    const slotRows = blockRows.filter(it => {
        const s = parseInt(it.slot) || 0;
        const len = String(it.length || '20');
        const is40 = len.startsWith('40') || len.startsWith('45');
        return s === slotNum || (is40 && (s === slotNum || s + 1 === slotNum));
    });
    const SPOD_PALETTE = [
        {bg:'#3b82f6',text:'#fff'},{bg:'#ef4444',text:'#fff'},{bg:'#22c55e',text:'#fff'},
        {bg:'#f59e0b',text:'#000'},{bg:'#8b5cf6',text:'#fff'},{bg:'#06b6d4',text:'#000'},
        {bg:'#ec4899',text:'#fff'},{bg:'#14b8a6',text:'#fff'},{bg:'#f97316',text:'#fff'},
        {bg:'#6366f1',text:'#fff'}
    ];
    const spodColors = {}; let spIdx = 0;
    const allSpods = new Set();
    slotRows.forEach(it => allSpods.add(String(it.spod||'UNKNOWN').toUpperCase()));
    Array.from(allSpods).sort().forEach(sp => { spodColors[sp] = SPOD_PALETTE[spIdx++ % SPOD_PALETTE.length]; });
    const parseTier = raw => { if (!raw) return 1; const s = String(raw); if (!s.includes('-')) return 1; const p = s.split('-'); return p.length >= 4 ? (parseInt(p[3])||1) : (p.length >= 3 ? (parseInt(p[p.length-1])||1) : 1); };
    const parseRow = raw => { if (!raw) return 1; const s = String(raw); if (!s.includes('-')) return 1; const p = s.split('-'); return p.length >= 3 ? (parseInt(p[2])||1) : 1; };
    const CAP = typeof activeCapacity !== 'undefined' ? activeCapacity : DEFAULT_CAPACITY;
    const blockTierMax = (CAP[block] && CAP[block].tier) || 5;
    const rowTierMap = {}; let maxTier = blockTierMax;
    slotRows.forEach(it => {
        const r = it.row || parseRow(it._raw_slot);
        const t = parseTier(it._raw_slot);
        if (t > maxTier) maxTier = t;
        if (!rowTierMap[r]) rowTierMap[r] = {};
        const sz = String(it.length||'20').startsWith('20') ? '20' : (String(it.length||'').startsWith('45') ? '45' : '40');
        const mv = String(it.move||'').toLowerCase();
        const isExp = !mv.includes('import') && !mv.includes('disc') && !mv.includes('vessel') && !mv.includes('transhipment');
        const ls = String(it.loadStatus||'FULL').toUpperCase();
        const fe = (ls.includes('EMPTY') || ls === 'MT') ? 'E' : 'F';
        rowTierMap[r][t] = {size:sz, spod:String(it.spod||'UNKNOWN').toUpperCase(), wc:String(it.wtcl||'-').toUpperCase(), carrier:it.carrier||'', fe, isExport:isExp};
    });
    const rows = Object.keys(rowTierMap).map(Number).sort((a,b) => a-b);
    let maxRow = Math.max(6, ...rows);
    const allRows = []; for (let r = 1; r <= maxRow; r++) allRows.push(r);
    const expCnt = slotRows.filter(it => { const m = String(it.move||'').toLowerCase(); return !m.includes('import') && !m.includes('disc') && !m.includes('vessel'); }).length;
    const othCnt = slotRows.length - expCnt;
    let h = `<div class="mb-3 flex flex-wrap items-center gap-1.5">
        <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">view_module</span> Slot View</span>
        <span class="text-slate-300 mx-1">|</span>
        ${Object.entries(spodColors).map(([sp,c]) => `<span class="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded" style="background:${c.bg};color:${c.text}">${sp}</span>`).join('')}
        <span class="text-slate-300 mx-1">|</span>
        <span class="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded slot-cell-other text-slate-500" style="min-width:48px;text-align:center">Other</span>
        <span class="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded slot-cell-import text-amber-800" style="min-width:48px;text-align:center">Import</span>
    </div>`;
    h += `<div class="mb-2 flex items-center gap-2">
        <span class="text-xs font-black text-slate-800 bg-slate-100 px-2 py-1 rounded border border-slate-200">SLOT ${String(slotNum).padStart(2,'0')}</span>
        <span class="text-xs text-slate-500 font-semibold">${slotRows.length} units</span>
        ${othCnt > 0 ? `<span class="text-xs text-slate-400">(+${othCnt} other)</span>` : ''}
    </div>`;
    h += `<div class="overflow-x-auto custom-scrollbar"><table class="border-collapse text-[10px]"><thead><tr>`;
    allRows.forEach(r => { h += `<th class="py-2 px-3 border border-slate-200 bg-slate-50 text-center font-bold text-slate-600 min-w-[72px]">${String(r).padStart(2,'0')}</th>`; });
    h += `</tr></thead><tbody>`;
    for (let t = maxTier; t >= 1; t--) {
        h += `<tr>`;
        allRows.forEach(r => {
            const c = rowTierMap[r] && rowTierMap[r][t];
            if (c) {
                const col = spodColors[c.spod] || {bg:'#94a3b8',text:'#fff'};
                const feB = c.fe==='E' ? 'rgba(251,146,60,0.3)' : 'rgba(74,222,128,0.3)';
                const feC = c.fe==='E' ? '#c2410c' : '#166534';
                const feBadge = `<span style="background:${c.isExport?'rgba(255,255,255,0.3)':feB};color:${c.isExport?col.text:feC};padding:0 2px;border-radius:2px;font-size:7px">${c.fe}</span>`;
                if (!c.isExport) {
                    h += `<td class="border border-slate-300 p-0" style="min-width:72px"><div class="px-1 py-0.5 text-center" style="background:repeating-linear-gradient(45deg,#fef3c7,#fef3c7 3px,#fde68a 3px,#fde68a 6px);min-height:52px;display:flex;flex-direction:column;justify-content:center;align-items:center"><span class="text-[9px] font-extrabold leading-none text-amber-700">${c.size}' ${feBadge}</span><span class="text-[8px] font-bold leading-tight text-amber-800">${c.spod}</span><span class="text-[7px] font-semibold leading-none text-amber-600">${c.wc}</span><span class="text-[7px] font-bold leading-none text-amber-900 mt-0.5">${c.carrier||'IMP'}</span></div></td>`;
                } else {
                    h += `<td class="border border-slate-300 p-0" style="min-width:72px"><div class="px-1 py-0.5 text-center" style="background:${col.bg};color:${col.text};min-height:52px;display:flex;flex-direction:column;justify-content:center;align-items:center"><span class="text-[9px] font-extrabold leading-none">${c.size}' ${feBadge}</span><span class="text-[8px] font-bold leading-tight">${c.spod}</span><span class="text-[7px] font-semibold opacity-80 leading-none">${c.wc}</span><span class="text-[7px] font-bold leading-none opacity-70 mt-0.5">${c.carrier}</span></div></td>`;
                }
            } else {
                h += `<td class="border border-slate-200 p-0" style="min-width:72px"><div style="min-height:52px;background:repeating-linear-gradient(45deg,#f8fafc,#f8fafc 4px,#f1f5f9 4px,#f1f5f9 8px)"></div></td>`;
            }
        });
        h += `</tr>`;
    }
    h += `</tbody></table></div>`;
    
    // Build summary by Carrier -> SPOD -> WC
    const summary = {};
    slotRows.forEach(it => {
        const carrier = (it.carrier || 'IMP').toUpperCase();
        const spod = (it.spod || 'UNKNOWN').toUpperCase();
        const wc = (it.wtcl || '-').toUpperCase();
        const key = `${carrier}|${spod}|${wc}`;
        if (!summary[key]) {
            summary[key] = { carrier, spod, wc, count: 0 };
        }
        summary[key].count++;
    });

    let summaryHtml = `<div class="mt-4"><h4 class="text-[11px] font-bold text-slate-600 mb-2 uppercase tracking-wider flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">summarize</span> Summary List</h4>`;
    summaryHtml += `<div class="overflow-hidden rounded border border-slate-200 shadow-sm"><table class="w-full text-left text-[10px] border-collapse bg-white">
        <thead class="bg-slate-50 text-slate-500 uppercase">
            <tr>
                <th class="px-3 py-2 border-b border-r border-slate-200 font-bold">Carrier / Vessel</th>
                <th class="px-3 py-2 border-b border-r border-slate-200 font-bold">SPOD</th>
                <th class="px-3 py-2 border-b border-r border-slate-200 font-bold text-center">Weight Class</th>
                <th class="px-3 py-2 border-b border-slate-200 text-center font-bold">Total Units</th>
            </tr>
        </thead>
        <tbody>`;
    
    Object.values(summary).sort((a, b) => {
        if (a.carrier !== b.carrier) return a.carrier.localeCompare(b.carrier);
        if (a.spod !== b.spod) return a.spod.localeCompare(b.spod);
        return a.wc.localeCompare(b.wc);
    }).forEach(item => {
        const spodColor = spodColors[item.spod] || { bg: '#94a3b8', text: '#fff' };
        summaryHtml += `
            <tr class="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td class="px-3 py-1.5 border-r border-slate-100 font-bold text-slate-700">${item.carrier}</td>
                <td class="px-3 py-1.5 border-r border-slate-100"><span class="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold" style="background:${spodColor.bg};color:${spodColor.text}">${item.spod}</span></td>
                <td class="px-3 py-1.5 border-r border-slate-100 font-semibold text-slate-600 text-center">${item.wc}</td>
                <td class="px-3 py-1.5 text-center font-black text-indigo-600">${item.count}</td>
            </tr>`;
    });
    summaryHtml += `</tbody></table></div></div>`;

    const cd = document.getElementById('clusterDetailContent');
    if (!cd) return;
    cd.innerHTML = `<div class="mb-3"><div class="flex items-center gap-2 mb-1"><span class="text-lg font-black text-slate-800">Block ${block}</span><span class="text-slate-300">&middot;</span><span class="text-lg font-bold text-indigo-600">Slot ${slotNum}</span></div></div>${h}${summaryHtml}`;
    const drawer = document.getElementById('clusterDetailDrawer');
    const overlay = document.getElementById('clusterDetailOverlay');
    if (overlay) overlay.classList.remove('hidden');
    if (drawer) drawer.classList.remove('translate-x-full');
}
