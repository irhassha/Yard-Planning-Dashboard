// ===================================================================
// STOWAGE VIEW MODULE — EDI BAPLIE Parser & Bay Mapping
// Dependencies: yardmap.js (highlightYardContainers)
// ===================================================================

let stowageData = null; // { vesselName, bayMap }
let stowageViewActive = false;

// DIS toggle default (hidden) and GCR default (25 box/hour)
if (typeof window.showDisBay === 'undefined') window.showDisBay = false;
if (typeof window.stowageGCR === 'undefined') window.stowageGCR = 25;

// ── EDI BAPLIE Parser ───────────────────────────────────────────────

function parseEdiFile(text) {
    // Normalize line breaks and split by EDI segment terminator '
    const raw = text.replace(/\r\n/g, '\n').replace(/\n/g, '');
    const segments = raw.split("'").map(s => s.trim()).filter(Boolean);

    // Extract vessel name from TDT segment
    let vesselName = 'UNKNOWN VESSEL';
    const tdtSeg = segments.find(s => s.startsWith('TDT+'));
    if (tdtSeg) {
        // Example: TDT+20+1188-107B+++EMC:172:20+++3EUL8:103:ZZZ:EVER BIRTH
        const parts = tdtSeg.split('+');
        const lastPart = parts[parts.length - 1] || '';
        const subParts = lastPart.split(':');
        
        if (subParts.length >= 4) {
            vesselName = subParts.slice(3).join(':').trim(); // Captures EVER BIRTH
        } else if (subParts.length > 0) {
            vesselName = subParts[subParts.length - 1].trim(); // Fallback
        }
    }

    // Parse containers — group segments between LOC+147 anchors
    const containers = [];
    let current = null;

    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];

        if (seg.startsWith('LOC+147+')) {
            // Save previous container if valid
            if (current && current.loc147) {
                containers.push(current);
            }
            // Start new container context
            current = { loc147: seg, loadPort: '', cntr: '', iso: '', weight: '', fpod: '', dpod: '' };
        } else if (current) {
            if (seg.startsWith('LOC+9+')) {
                current.loadPort = seg.replace('LOC+9+', '').split(':')[0].trim();
            } else if (seg.startsWith('LOC+11+')) {
                current.fpod = seg.replace('LOC+11+', '').split(':')[0].trim();
            } else if (seg.startsWith('LOC+83+')) {
                current.dpod = seg.replace('LOC+83+', '').split(':')[0].trim();
            } else if (seg.startsWith('EQD+CN+')) {
                const eqParts = seg.split('+');
                current.cntr = (eqParts[2] || '').split(':')[0].trim();
                current.iso = (eqParts[3] || '').split(':')[0].trim();
            } else if (seg.startsWith('MEA+VGM')) {
                const meaParts = seg.split(':');
                current.weight = meaParts[meaParts.length - 1] || '';
            } else if (seg.startsWith('NAD+CA')) {
                // End of this container's segment group — push and reset
                containers.push(current);
                current = null;
            }
        }
    }
    // Push last container if pending
    if (current && current.loc147) containers.push(current);

    // Parse LOC+147 position string and filter IDJKT
    const bayMap = {};
    let totalIdjkt = 0;

    containers.forEach(c => {
        if (c.loadPort !== 'IDJKT') return;

        // LOC+147+0381008::5 → extract position string "0381008"
        const locParts = c.loc147.replace('LOC+147+', '').split(':');
        const posStr = (locParts[0] || '').trim();

        if (posStr.length < 7) return;

        // Format: BBBRRTT (3-digit bay, 2-digit row, 2-digit tier)
        // But looking at sample: 0381008 = 7 chars
        // Bay = first 3 digits (038 → 38), Row = next 2 (10), Tier = last 2 (08)
        const bayNum = parseInt(posStr.substring(0, 3));
        const tierNum = parseInt(posStr.substring(5, 7));

        if (isNaN(bayNum) || isNaN(tierNum)) return;

        const deckLabel = tierNum >= 80 ? 'OD' : 'UD';
        const bayKey = `BAY ${String(bayNum).padStart(2, '0')} ${deckLabel}`;

        if (!bayMap[bayKey]) bayMap[bayKey] = [];

        // Determine size from ISO code
        let size = '40';
        if (c.iso.startsWith('2')) size = '20';
        else if (c.iso.startsWith('4')) size = '40';
        else if (c.iso.startsWith('L')) size = '45';

        bayMap[bayKey].push({
            cntr: c.cntr,
            iso: c.iso,
            size,
            weight: c.weight,
            fpod: c.fpod,
            dpod: c.dpod
        });

        totalIdjkt++;
    });

    return { vesselName, bayMap, totalContainers: containers.length, totalIdjkt };
}

// ── File Upload Handler ─────────────────────────────────────────────

function handleEdiUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const result = parseEdiFile(e.target.result);
            stowageData = result;
            renderStowageView(result);
        } catch (err) {
            alert('Error parsing EDI file: ' + err.message);
            console.error(err);
        }
    };
    reader.readAsText(file);
}
window.handleEdiUpload = handleEdiUpload;

// ── Toggle Berth ↔ Stowage View ────────────────────────────────────

function toggleBerthStowageView() {
    stowageViewActive = !stowageViewActive;

    const ganttWrapper = document.getElementById('berthGanttWrapper');
    const stowageEl = document.getElementById('stowageContent');
    const ganttControls = document.getElementById('ganttControlsBar');
    const stowageControls = document.getElementById('stowageControlsBar');
    const toggleBtn = document.getElementById('berthStowageToggleBtn');

    if (stowageViewActive) {
        if (ganttWrapper) ganttWrapper.classList.add('hidden');
        if (stowageEl) stowageEl.classList.remove('hidden');
        if (ganttControls) ganttControls.classList.add('hidden');
        if (stowageControls) stowageControls.classList.remove('hidden');
        if (toggleBtn) {
            toggleBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">anchor</span> Berth View';
        }
    } else {
        if (ganttWrapper) ganttWrapper.classList.remove('hidden');
        if (stowageEl) stowageEl.classList.add('hidden');
        if (ganttControls) ganttControls.classList.remove('hidden');
        if (stowageControls) stowageControls.classList.add('hidden');
        if (toggleBtn) {
            toggleBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">directions_boat</span> Stowage View';
        }
        // Clear stowage highlight when switching back
        if (typeof highlightYardContainers === 'function') highlightYardContainers(null);
    }
}
window.toggleBerthStowageView = toggleBerthStowageView;

// ── Render Stowage View ─────────────────────────────────────────────

function renderStowageView(data) {
    const container = document.getElementById('stowageContent');
    if (!container) return;

    if (!data && !window.sequenceData) {
        container.innerHTML = `<div class="flex flex-col items-center justify-center py-16 text-slate-400">
            <span class="material-symbols-outlined text-5xl mb-3 opacity-30">directions_boat</span>
            <p class="text-sm font-semibold text-slate-500">Upload BAPLIE EDI or Work Sequence PDF to view stowage plan.</p>
        </div>`;
        return;
    }

    if (data && (!data.bayMap || Object.keys(data.bayMap).length === 0)) {
        container.innerHTML = `<div class="flex flex-col items-center justify-center py-16 text-slate-400">
            <span class="material-symbols-outlined text-5xl mb-3 opacity-30">warning</span>
            <p class="text-sm font-semibold text-slate-500">No IDJKT containers found in EDI file.</p>
        </div>`;
        return;
    }

    // Sort bay keys: numerically by bay number, then OD before UD
    let sortedKeys = [];
    if (data && data.bayMap) {
        sortedKeys = Object.keys(data.bayMap).sort((a, b) => {
            const numA = parseInt(a.match(/\d+/)?.[0] || '0');
            const numB = parseInt(b.match(/\d+/)?.[0] || '0');
            if (numA !== numB) return numA - numB;
            return a.includes('OD') ? -1 : 1;
        });
    }

    // Summary stats
    let totalUnits = 0;
    let size20 = 0, size40 = 0, size45 = 0;
    let vesselName = "UNKNOWN VESSEL";
    let totalContainers = 0;

    if (data && data.bayMap) {
        vesselName = data.vesselName || vesselName;
        totalContainers = data.totalContainers || 0;
        Object.values(data.bayMap).forEach(units => {
            totalUnits += units.length;
            units.forEach(u => {
                if (u.size === '20') size20++;
                else if (u.size === '45') size45++;
                else size40++;
            });
        });
    } else if (window.sequenceData) {
        vesselName = window.sequenceData.vesselName || vesselName;
    }

    // Build discharge map from sequence data (DIS entries per bay/deck)
    const dischargeMap = {};
    let totalDischarge = 0;
    if (window.sequenceData && window.sequenceData.cranes) {
        Object.values(window.sequenceData.cranes).forEach(seqs => {
            seqs.forEach(s => {
                if (s.action === 'DIS') {
                    const bayNum = (s.bayStr.match(/^\d+/) || ['0'])[0];
                    if (!dischargeMap[bayNum]) dischargeMap[bayNum] = { WD: 0, UD: 0 };
                    dischargeMap[bayNum][s.deck] += s.total;
                    totalDischarge += s.total;
                }
            });
        });
    }

    // DIS visibility controlled by toggle (default hidden)
    const showDis = window.showDisBay && totalDischarge > 0;

    // GCR setting (default 25 box/hour)
    const gcr = window.stowageGCR || 25;

    // Find ETB from vessel schedule by matching vessel name
    let etbDate = null;
    if (window.scheduleData && window.scheduleData.length && vesselName !== 'UNKNOWN VESSEL') {
        const vesselUpper = vesselName.toUpperCase().trim();
        const match = window.scheduleData.find(s =>
            s.carrier && s.carrier.toUpperCase().trim() === vesselUpper
        );
        if (match && match.eta) {
            etbDate = match.eta;
        }
    }

    let html = '';

    // Header info
    html += `<div class="p-4 space-y-4">`;

    // Vessel Info Banner
    html += `<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl border border-indigo-200/60 shadow-sm">
        <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center text-white shadow-md">
                <span class="material-symbols-outlined text-xl">directions_boat</span>
            </div>
            <div>
                <h3 class="text-lg font-black text-slate-800">${vesselName}</h3>
                <p class="text-xs text-slate-500">BAPLIE Preload · <strong class="text-indigo-600">${totalUnits}</strong> units LOD from IDJKT${showDis ? ` · <strong class="text-rose-600">${totalDischarge}</strong> units DIS` : ''} · Total onboard: ${totalContainers}</p>
            </div>
        </div>
        <div class="flex items-center gap-3 text-[11px]">
            <div class="bg-white rounded-lg px-3 py-2 border border-slate-200 shadow-sm text-center">
                <div class="text-slate-400 font-bold uppercase text-[9px]">20'</div>
                <div class="font-black text-blue-600 text-sm">${size20}</div>
            </div>
            <div class="bg-white rounded-lg px-3 py-2 border border-slate-200 shadow-sm text-center">
                <div class="text-slate-400 font-bold uppercase text-[9px]">40'</div>
                <div class="font-black text-emerald-600 text-sm">${size40}</div>
            </div>
            <div class="bg-white rounded-lg px-3 py-2 border border-slate-200 shadow-sm text-center">
                <div class="text-slate-400 font-bold uppercase text-[9px]">45'</div>
                <div class="font-black text-amber-600 text-sm">${size45}</div>
            </div>
            ${showDis ? `<div class="w-px h-8 bg-slate-200"></div>
            <div class="bg-rose-50 rounded-lg px-3 py-2 border border-rose-200 shadow-sm text-center">
                <div class="text-rose-400 font-bold uppercase text-[9px]">DIS</div>
                <div class="font-black text-rose-600 text-sm">${totalDischarge}</div>
            </div>` : ''}
        </div>
    </div>`;

    // Bay Instruction
    html += `<div class="flex items-center gap-2 text-[11px] text-slate-500">
        <span class="material-symbols-outlined text-[14px]">info</span>
        <span><strong>Click</strong> a bay to highlight containers on Yard Map · <strong>Double-click</strong> for Bay summary popup</span>
    </div>`;

    // Extract unique bay numbers from both BAPLIE and Sequence PDF
    const baySet = new Set();
    if (data && data.bayMap) {
        Object.keys(data.bayMap).forEach(k => baySet.add(k.replace('BAY ', '').replace(' OD', '').replace(' UD', '').trim()));
    }
    let maxSeq = 0;
    if (window.sequenceData && window.sequenceData.cranes) {
        Object.values(window.sequenceData.cranes).forEach(seqs => {
            seqs.forEach(s => {
                const bNum = (s.bayStr.match(/^\d+/) || ['0'])[0];
                baySet.add(bNum);
                if (s.seq > maxSeq) maxSeq = s.seq;
            });
        });
    }

    const uniqueBays = Array.from(baySet).sort((a,b) => parseInt(a) - parseInt(b));

    // Zoom setup
    if (typeof window.stowageZoomLevel === 'undefined') {
        window.stowageZoomLevel = 1.0;
    }
    
    window.setStowageZoom = function(scale) {
        window.stowageZoomLevel = Math.max(0.4, Math.min(scale, 2.0));
        const wrapper = document.getElementById('stowageZoomWrapper');
        if (wrapper) wrapper.style.zoom = window.stowageZoomLevel;
        
        const labelBtn = document.getElementById('stowageZoomLabelBtn');
        if (labelBtn) labelBtn.innerText = Math.round(window.stowageZoomLevel * 100) + '%';
    };

    html += `<div id="stowageZoomWrapper" class="relative pb-8 mt-4" style="zoom: ${window.stowageZoomLevel}; width: max-content;">`;

    // renderBtn helper function
    const renderBtn = (units, key, isOD) => {
        if (!units || !units.length) return `<div class="h-[42px] w-[46px] flex items-center justify-center opacity-40 bg-slate-50/50 rounded-lg border border-slate-200 border-dashed text-slate-300 text-xs">-</div>`;
        
        const bgClass = isOD ? 'bg-sky-50 border-sky-300 hover:bg-sky-100 text-sky-800' : 'bg-amber-50 border-amber-300 hover:bg-amber-100 text-amber-800';
        return `<button class="stowage-bay-badge h-[42px] w-[46px] flex items-center justify-center rounded-lg border-2 ${bgClass} transition-all cursor-pointer shadow-sm hover:shadow-md active:scale-95 select-none"
            data-bay-key="${key}"
            onclick="onStowageBayClick('${key}')"
            ondblclick="onStowageBayDblClick('${key}')"
            title="${key}: ${units.length} units">
            <span class="font-black text-[13px]">${units.length}</span>
        </button>`;
    };

    // renderDisBtn helper — discharge badge
    const renderDisBtn = (count) => {
        if (!count) return `<div class="h-[32px] w-[46px]"></div>`;
        return `<div class="h-[32px] w-[46px] flex items-center justify-center rounded-lg border-2 bg-rose-50 border-rose-300 text-rose-700 shadow-sm" title="Discharge: ${count} units">
            <span class="font-black text-[12px]">${count}</span>
        </div>`;
    };

    // ROW 1: Header (Bays, OD, UD) - Sticky Top
    html += `<div class="sticky top-0 z-40 bg-white shadow-sm flex items-start border-b border-slate-200 pb-2">`;
    // Top-Left Sticky Label
    html += `<div class="flex flex-col sticky left-0 top-0 bg-white z-[50] pr-4 py-1 border-r border-slate-200" style="min-width: 100px;">
        <div class="h-5 mb-2"></div>
        ${showDis ? '<div class="h-[32px] flex items-center justify-end text-[9px] font-black text-rose-500">DIS ▲</div>' : ''}
        <div class="h-[42px] flex items-center justify-end text-[10px] font-black text-sky-700">LOD ▼</div>
        <div class="h-2 w-full my-1.5 flex items-center justify-end"></div>
        ${showDis ? '<div class="h-[32px] flex items-center justify-end text-[9px] font-black text-rose-500">DIS ▲</div>' : ''}
        <div class="h-[42px] flex items-center justify-end text-[10px] font-black text-amber-700">LOD ▼</div>
    </div>`;
    // Bay Columns
    html += `<div class="flex pl-4 gap-[4px] pt-1">`;
    uniqueBays.forEach((bayNum) => {
        const odKey = `BAY ${bayNum} OD`;
        const udKey = `BAY ${bayNum} UD`;
        const odUnits = (data && data.bayMap && data.bayMap[odKey]) ? data.bayMap[odKey] : [];
        const udUnits = (data && data.bayMap && data.bayMap[udKey]) ? data.bayMap[udKey] : [];

        const odDis = dischargeMap[bayNum] ? dischargeMap[bayNum].WD : 0;
        const udDis = dischargeMap[bayNum] ? dischargeMap[bayNum].UD : 0;

        html += `<div class="flex flex-col items-center w-[46px]">
            <!-- Bay Number Header -->
            <div class="h-5 text-[12px] font-black text-slate-800 mb-2">${bayNum}</div>
            ${showDis ? `<!-- OD DIS Badge -->${renderDisBtn(odDis)}` : ''}
            <!-- OD LOD Button -->
            ${renderBtn(odUnits, odKey, true)}
            <!-- Separator (Hatch Cover) -->
            <div class="h-2 bg-slate-700 rounded-sm my-1.5 shadow-[0_1px_1px_rgba(0,0,0,0.2)] border-t border-slate-600 border-b border-slate-800" style="width: calc(100% + 4px);"></div>
            ${showDis ? `<!-- UD DIS Badge -->${renderDisBtn(udDis)}` : ''}
            <!-- UD LOD Button -->
            ${renderBtn(udUnits, udKey, false)}
        </div>`;
    });
    html += `</div></div>`; // Close Row 1

    // ROW 2: Sequence Matrix (Time-based)
    if (maxSeq > 0) {
        // Build per-crane cumulative time map
        const PX_PER_HOUR = 60; // pixels per hour on the Y-axis
        const craneTimeMap = {}; // crane -> { seq -> { startHour, durationHour } }
        let totalHours = 0;

        if (window.sequenceData && window.sequenceData.cranes) {
            Object.keys(window.sequenceData.cranes).forEach(crane => {
                const seqs = window.sequenceData.cranes[crane];
                let cumHours = 0;
                craneTimeMap[crane] = {};
                seqs.forEach(s => {
                    const dur = s.total / gcr;
                    craneTimeMap[crane][s.seq] = { startHour: cumHours, durationHour: dur };
                    cumHours += dur;
                });
                if (cumHours > totalHours) totalHours = cumHours;
            });
        }

        const totalHoursCeil = Math.ceil(totalHours) || 1;
        const totalPx = totalHoursCeil * PX_PER_HOUR;

        const formatTimeLabel = (hourOffset) => {
            if (etbDate) {
                const t = new Date(etbDate.getTime() + hourOffset * 3600000);
                const hh = String(t.getHours()).padStart(2, '0');
                const mm = String(t.getMinutes()).padStart(2, '0');
                return `${hh}:${mm}`;
            }
            return `+${hourOffset}h`;
        };

        html += `<div class="flex items-start">`;
        // Bottom-Left Sticky Label + Hourly Y-axis
        html += `<div class="flex flex-col sticky left-0 bg-white z-30 pr-4 py-1 border-r border-slate-200" style="min-width: 100px;">
            <div class="h-8 w-full mt-4 flex items-center justify-end"></div>
            <div class="flex items-center justify-end text-[10px] font-black text-slate-500 mb-1">WORK SEQUENCE</div>
            <div class="text-[9px] text-slate-400 text-right opacity-70 mb-1">GCR: ${gcr} b/h${etbDate ? ' · ETB: ' + formatTimeLabel(0) : ''}</div>
            <div class="relative" style="height: ${totalPx}px;">`;
        for (let h = 0; h <= totalHoursCeil; h++) {
            html += `<div class="absolute right-0 flex items-center gap-1" style="top: ${h * PX_PER_HOUR - 6}px;">
                <span class="text-[9px] font-bold text-slate-400 font-mono">${formatTimeLabel(h)}</span>
                <div class="w-2 h-px bg-slate-300"></div>
            </div>`;
        }
        html += `</div></div>`;
        
        // Sequence Blocks Area
        html += `<div class="flex pl-4 gap-[4px] pt-1">`;
        uniqueBays.forEach((bayNum) => {
            let blocksHtml = '';
            if (window.sequenceData && window.sequenceData.cranes) {
                Object.keys(window.sequenceData.cranes).forEach(crane => {
                    const seqs = window.sequenceData.cranes[crane];
                    seqs.forEach(s => {
                        if (s.baseBay == parseInt(bayNum)) {
                            let span = 1;
                            if (s.bayStr.includes('..')) {
                                const parts = s.bayStr.split('..');
                                const start = parseInt(parts[0], 10);
                                const end = parseInt(parts[1], 10);
                                if (!isNaN(start) && !isNaN(end)) {
                                    span = uniqueBays.filter(b => parseInt(b) >= start && parseInt(b) <= end).length;
                                }
                            }
                            const c = window.getCraneColors ? window.getCraneColors(crane) : { bg: 'bg-slate-400', border: 'border-slate-500', text: 'text-white' };
                            const timeInfo = craneTimeMap[crane] && craneTimeMap[crane][s.seq];
                            const topPx = timeInfo ? timeInfo.startHour * PX_PER_HOUR : (s.seq - 1) * 36;
                            const heightPx = timeInfo ? Math.max(timeInfo.durationHour * PX_PER_HOUR, 24) : 32;
                            const width = span * 50 - 4;
                            const deckIcon = s.deck === 'WD' ? 'expand_less' : 'expand_more';
                            const actionStyle = s.action === 'DIS' ? 'bg-stripes-black-10' : '';
                            
                            blocksHtml += `
                                <div class="sequence-block absolute rounded-md shadow-sm border flex items-center justify-center cursor-pointer transition-transform hover:scale-[1.02] ${c.bg} ${c.border} ${c.text} z-20 ${actionStyle}"
                                     style="top: ${topPx}px; left: 0; width: ${width}px; height: ${heightPx}px;"
                                     title="QC ${crane} | Seq ${s.seq} | ${s.deck} ${s.action} | ${s.total} units | ${timeInfo ? (timeInfo.durationHour * 60).toFixed(0) + ' min' : ''}"
                                     data-seq-id="${crane}-${s.seq}"
                                     onclick="onSequenceBlockClick('${crane}', ${s.seq}, '${s.bayStr}', '${s.deck}')">
                                    <div class="absolute left-1 top-1 flex flex-col gap-0.5">
                                        <span class="material-symbols-outlined text-[8px] font-black leading-none opacity-80">${deckIcon}</span>
                                    </div>
                                    <span class="text-xs font-black drop-shadow-sm">${s.total}</span>
                                    <div class="absolute right-1 bottom-0.5 opacity-80 flex flex-col items-end">
                                        <span class="text-[6px] font-bold leading-tight">QC${crane}</span>
                                        <span class="text-[8px] font-black leading-none">#${s.seq}</span>
                                    </div>
                                </div>
                            `;
                        }
                    });
                });
            }

            let gridLines = '';
            for(let h = 0; h <= totalHoursCeil; h++) {
                gridLines += `<div class="absolute left-0 w-full border-t ${h === 0 ? 'border-slate-300' : 'border-slate-100'}" style="top: ${h * PX_PER_HOUR}px; height: 0;"></div>`;
            }

            html += `<div class="flex flex-col items-center w-[46px]">
                <div class="w-full relative mt-8 border-l border-r border-slate-50" style="height: ${totalPx}px;">
                    ${gridLines}
                    ${blocksHtml}
                </div>
            </div>`;
        });
        html += `</div></div>`; // Close Row 2
    }

    html += `</div>`; // Close stowageZoomWrapper

    // Clear Highlight button
    html += `<button onclick="
        if(typeof highlightYardContainers==='function') highlightYardContainers(null);
        document.querySelectorAll('.stowage-bay-badge').forEach(b=>b.classList.remove('stowage-bay-active', 'ring-4', 'ring-indigo-400', 'shadow-lg', 'scale-105'));
        document.querySelectorAll('.sequence-block').forEach(b=>b.classList.remove('ring-4', 'ring-white', 'scale-110', 'shadow-xl', 'z-50'));
        if(window.stowageActiveBays) window.stowageActiveBays.clear();
        if(window.stowageActiveSeqs) window.stowageActiveSeqs.clear();
    " class="secondary-pill text-xs mt-2">
        <span class="material-symbols-outlined text-[14px]">restart_alt</span> Clear Highlight
    </button>`;

    container.innerHTML = html;
}

// ── Bay Click Handlers ──────────────────────────────────────────────

window.stowageActiveBays = new Set();
window.stowageActiveSeqs = new Set();

function updateYardHighlightFromSelection() {
    if (!stowageData) return;
    let allCntrIds = [];
    window.stowageActiveBays.forEach(bayKey => {
        if (stowageData.bayMap[bayKey]) {
            allCntrIds.push(...stowageData.bayMap[bayKey].map(u => u.cntr).filter(Boolean));
        }
    });

    if (typeof highlightYardContainers === 'function') {
        highlightYardContainers(allCntrIds.length > 0 ? allCntrIds : null);
    }
}

function onStowageBayClick(bayKey) {
    if (!stowageData || !stowageData.bayMap[bayKey]) return;

    const badge = document.querySelector(`[data-bay-key="${bayKey}"]`);
    
    // Toggle active state
    if (window.stowageActiveBays.has(bayKey)) {
        window.stowageActiveBays.delete(bayKey);
        if (badge) badge.classList.remove('stowage-bay-active', 'ring-4', 'ring-indigo-400', 'shadow-lg', 'scale-105');
    } else {
        window.stowageActiveBays.add(bayKey);
        if (badge) badge.classList.add('stowage-bay-active', 'ring-4', 'ring-indigo-400', 'shadow-lg', 'scale-105');
    }

    updateYardHighlightFromSelection();
}
window.onStowageBayClick = onStowageBayClick;

function onSequenceBlockClick(crane, seq, bayStr, deck) {
    const seqId = `${crane}-${seq}`;
    const el = document.querySelector(`[data-seq-id="${seqId}"]`);
    let isSelected = false;
    
    // Toggle active state for sequence block
    if (window.stowageActiveSeqs.has(seqId)) {
        window.stowageActiveSeqs.delete(seqId);
        if (el) el.classList.remove('ring-4', 'ring-white', 'scale-110', 'shadow-xl', 'z-50');
    } else {
        window.stowageActiveSeqs.add(seqId);
        isSelected = true;
        if (el) el.classList.add('ring-4', 'ring-white', 'scale-110', 'shadow-xl', 'z-50');
    }

    // Determine target bays (OD/UD) to toggle
    const deckKey = deck === 'WD' ? 'OD' : 'UD';
    let baysToToggle = [];
    if (bayStr.includes('..')) {
        const parts = bayStr.split('..');
        const start = parseInt(parts[0], 10);
        const end = parseInt(parts[1], 10);
        if (!isNaN(start) && !isNaN(end)) {
            for(let b = start; b <= end; b++) {
                baysToToggle.push(`BAY ${b.toString().padStart(2, '0')} ${deckKey}`);
            }
        }
    } else {
        baysToToggle.push(`BAY ${bayStr} ${deckKey}`);
    }

    // Add or remove target bays
    baysToToggle.forEach(bayKey => {
        const badge = document.querySelector(`.stowage-bay-badge[data-bay-key="${bayKey}"]`);
        if (isSelected) {
            window.stowageActiveBays.add(bayKey);
            if (badge) badge.classList.add('stowage-bay-active', 'ring-4', 'ring-indigo-400', 'shadow-lg', 'scale-105');
        } else {
            window.stowageActiveBays.delete(bayKey);
            if (badge) badge.classList.remove('stowage-bay-active', 'ring-4', 'ring-indigo-400', 'shadow-lg', 'scale-105');
        }
    });

    updateYardHighlightFromSelection();
}
window.onSequenceBlockClick = onSequenceBlockClick;

let _stowageDblClickTimer = null;

function onStowageBayDblClick(bayKey) {
    if (!stowageData || !stowageData.bayMap[bayKey]) return;
    showBaySummaryModal(bayKey, stowageData.bayMap[bayKey]);
}
window.onStowageBayDblClick = onStowageBayDblClick;

// ── Bay Summary Modal ───────────────────────────────────────────────

function showBaySummaryModal(bayKey, units) {
    const modal = document.getElementById('vesselSummaryModal');
    const title = document.getElementById('vesselSummaryModalTitle');
    const subtitle = document.getElementById('vesselSummaryModalSubtitle');
    const body = document.getElementById('vesselSummaryModalBody');
    if (!modal || !body) return;

    const vesselName = stowageData ? stowageData.vesselName : '';
    const isOD = bayKey.includes('OD');

    title.innerHTML = `<span class="material-symbols-outlined ${isOD ? 'text-sky-600' : 'text-amber-600'}">directions_boat</span> ${bayKey}`;
    subtitle.textContent = `${vesselName} · ${units.length} units · ${isOD ? 'On Deck' : 'Under Deck'}`;

    // Build SPOD summary
    const fpodStats = {};
    units.forEach(u => {
        const fpod = u.fpod || 'UNKNOWN';
        if (!fpodStats[fpod]) fpodStats[fpod] = { c20: 0, c40: 0, c45: 0, total: 0, totalWeight: 0 };
        if (u.size === '20') fpodStats[fpod].c20++;
        else if (u.size === '45') fpodStats[fpod].c45++;
        else fpodStats[fpod].c40++;
        fpodStats[fpod].total++;
        fpodStats[fpod].totalWeight += parseInt(u.weight) || 0;
    });

    let html = '';

    // Summary by SPOD
    html += `<div class="px-5 py-4 border-b border-slate-200 bg-white">
        <h5 class="font-bold text-xs mb-3 inline-block px-3 py-1 rounded-lg border shadow-sm ${isOD ? 'text-sky-700 bg-sky-50 border-sky-200' : 'text-amber-700 bg-amber-50 border-amber-200'}">SUMMARY BY SPOD</h5>
        <div class="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
            <table class="w-full text-left bg-white">
                <thead class="bg-slate-100 text-[11px] uppercase text-slate-500 font-bold border-b border-slate-200">
                    <tr>
                        <th class="px-4 py-2 border-r border-slate-200">SPOD</th>
                        <th class="px-4 py-2 border-r border-slate-200 text-center">20'</th>
                        <th class="px-4 py-2 border-r border-slate-200 text-center">40'</th>
                        <th class="px-4 py-2 border-r border-slate-200 text-center">45'</th>
                        <th class="px-4 py-2 border-r border-slate-200 text-center bg-slate-200/50">TOTAL</th>
                        <th class="px-4 py-2 text-center">Weight (kg)</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 text-xs">`;

    let g20 = 0, g40 = 0, g45 = 0, gTotal = 0, gWeight = 0;
    Object.keys(fpodStats).sort().forEach(fpod => {
        const s = fpodStats[fpod];
        g20 += s.c20; g40 += s.c40; g45 += s.c45; gTotal += s.total; gWeight += s.totalWeight;
        html += `<tr class="hover:bg-slate-50 transition-colors">
            <td class="px-4 py-2 font-semibold text-slate-700 border-r border-slate-100">${fpod}</td>
            <td class="px-4 py-2 text-center border-r border-slate-100">${s.c20 || '-'}</td>
            <td class="px-4 py-2 text-center border-r border-slate-100">${s.c40 || '-'}</td>
            <td class="px-4 py-2 text-center border-r border-slate-100">${s.c45 || '-'}</td>
            <td class="px-4 py-2 text-center font-bold text-slate-800 bg-slate-50/50 border-r border-slate-100">${s.total}</td>
            <td class="px-4 py-2 text-center text-slate-500 font-mono">${s.totalWeight.toLocaleString()}</td>
        </tr>`;
    });

    html += `</tbody>
                <tfoot class="bg-slate-50 border-t border-slate-200 font-bold text-xs">
                    <tr>
                        <td class="px-4 py-2 text-slate-800 border-r border-slate-200 uppercase tracking-wide">TOTAL</td>
                        <td class="px-4 py-2 text-center text-blue-600 border-r border-slate-200">${g20}</td>
                        <td class="px-4 py-2 text-center text-blue-600 border-r border-slate-200">${g40}</td>
                        <td class="px-4 py-2 text-center text-blue-600 border-r border-slate-200">${g45}</td>
                        <td class="px-4 py-2 text-center text-emerald-600 bg-slate-100/80 border-r border-slate-200">${gTotal}</td>
                        <td class="px-4 py-2 text-center text-slate-600 font-mono">${gWeight.toLocaleString()}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
    </div>`;

    // Container List
    html += `<div class="px-5 py-4 bg-slate-50/50">
        <h5 class="font-bold text-xs mb-3 inline-block px-3 py-1 rounded-lg border shadow-sm text-slate-700 bg-slate-50 border-slate-200">CONTAINER LIST</h5>
        <div class="overflow-x-auto rounded-xl border border-slate-200 shadow-sm max-h-[300px] overflow-y-auto custom-scrollbar">
            <table class="w-full text-left bg-white text-[11px]">
                <thead class="bg-slate-100 text-[10px] uppercase text-slate-500 font-bold border-b border-slate-200 sticky top-0">
                    <tr>
                        <th class="px-3 py-2 border-r border-slate-200">#</th>
                        <th class="px-3 py-2 border-r border-slate-200">Container No</th>
                        <th class="px-3 py-2 border-r border-slate-200 text-center">ISO</th>
                        <th class="px-3 py-2 border-r border-slate-200 text-center">Size</th>
                        <th class="px-3 py-2 border-r border-slate-200">SPOD</th>
                        <th class="px-3 py-2 border-r border-slate-200">DPOD</th>
                        <th class="px-3 py-2 text-center">Weight</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">`;

    units.forEach((u, idx) => {
        html += `<tr class="hover:bg-blue-50/30 transition-colors">
            <td class="px-3 py-1.5 text-slate-400 font-mono border-r border-slate-100">${idx + 1}</td>
            <td class="px-3 py-1.5 font-bold text-slate-800 font-mono border-r border-slate-100">${u.cntr}</td>
            <td class="px-3 py-1.5 text-center text-slate-600 border-r border-slate-100">${u.iso}</td>
            <td class="px-3 py-1.5 text-center font-bold border-r border-slate-100">${u.size}'</td>
            <td class="px-3 py-1.5 text-slate-700 border-r border-slate-100">${u.fpod}</td>
            <td class="px-3 py-1.5 text-slate-700 border-r border-slate-100">${u.dpod}</td>
            <td class="px-3 py-1.5 text-center text-slate-500 font-mono">${parseInt(u.weight).toLocaleString()}</td>
        </tr>`;
    });

    html += `</tbody></table></div></div>`;

    body.innerHTML = html;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}
