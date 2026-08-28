// ===================================================================
// YARD TEMPLATE MODULE
// Yard planning reservation system for upcoming vessel stacking
// Dependencies: invData, isInvLoaded, DEFAULT_CAPACITY, activeCapacity,
//               npct1ScheduleData, scheduleData, yardmap.js functions
// ===================================================================

// ── State ────────────────────────────────────────────────────────────

let ytSelectedVessel = null;          // { key, vesselName, service, carrier, color }
let ytReservations = {};              // vesselKey -> [{ block, slotStart, slotEnd }]
let ytRangeStart = null;              // { block, slot } — first click of range
let ytVesselScheduleMap = [];         // Matched active vessels array
let ytTemplateZoom = null;
let ytTemplateTextHidden = true;
let ytShowBerthed = false;
let ytShowUpcoming = false;

// ── Persistence (localStorage) ───────────────────────────────────────
const YT_STORAGE_KEY = 'npct1_yard_template_reservations_v1';

function ytSaveReservationsToStorage() {
    try {
        localStorage.setItem(YT_STORAGE_KEY, JSON.stringify(ytReservations));
    } catch (e) {
        console.warn('Failed to save yard reservations to localStorage:', e);
    }
}

function ytLoadReservationsFromStorage() {
    try {
        const saved = localStorage.getItem(YT_STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                ytReservations = parsed;
            }
        }
    } catch (e) {
        console.warn('Failed to load yard reservations from localStorage:', e);
    }
}

// Initial restore on file evaluation
ytLoadReservationsFromStorage();

// Blocks excluded from clash analysis: C01, C02, BR9, RC9, D01, OOG
function isYardClashIgnoredBlock(blockName) {
    if (!blockName) return true;
    const b = String(blockName).toUpperCase().trim();
    if (b === 'C01' || b === 'C1' || b === 'C02' || b === 'C2') return true;
    if (b === 'BR9' || b === 'BR09') return true;
    if (b === 'RC9' || b === 'RC09') return true;
    if (b === 'D01' || b === 'D1') return true;
    if (b.startsWith('OOG') || b === 'OOG') return true;
    return false;
}

function formatClashTime(dt) {
    if (!dt) return '';
    const d = new Date(dt);
    if (isNaN(d)) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month} ${hours}:${mins}`;
}

// ── Vessel Matching & Active Open Stack ──────────────────────────────
// Unit List has carrier alias (e.g. "ASLOP"), Vessel Schedule has full
// name (e.g. "AS PENELOPE"). Match by service + ETB proximity (±1-2 days).

function getActiveOpenStackVessels() {
    let schedule = (typeof npct1ScheduleData !== 'undefined' && npct1ScheduleData && npct1ScheduleData.length)
        ? npct1ScheduleData
        : (window.npct1ScheduleData || []);

    if (!schedule.length && !window._ytFetchingSchedule) {
        window._ytFetchingSchedule = true;
        fetch('./data/vessel_schedule.json')
            .then(res => res.json())
            .then(data => {
                window.npct1ScheduleData = data.vessels || [];
                window._ytFetchingSchedule = false;
                renderActiveVesselTable();
            })
            .catch(err => {
                console.warn('Fallback schedule fetch failed:', err);
                window._ytFetchingSchedule = false;
            });
    }

    const inv = window.invData || [];
    const callListSchedule = window.scheduleData || [];
    const now = new Date();

    // 1. Filter schedule for active open stacking: openStacking <= now and closingPhysic >= now
    const activeFromSchedule = schedule.filter(v => {
        if (!v.openStacking) return false;
        const os = new Date(v.openStacking);
        if (isNaN(os) || os > now) return false;

        if (v.closingPhysic) {
            const cp = new Date(v.closingPhysic);
            if (!isNaN(cp) && cp < now) return false; // Closing has passed
        }
        return true;
    });

    // 2. Pre-index invData export carriers by service: service -> [carrier1, carrier2, ...]
    const invCarriersByService = {};
    const invUnitsByCarrier = {}; // carrier||service -> [units]
    inv.forEach(it => {
        if (!it.move.includes('export')) return;
        const c = (it.carrier || '').toUpperCase().trim();
        const s = (it.service || '').toUpperCase().trim();
        if (!c || c === '0' || c === 'NIL' || c === 'UNKNOWN') return;

        if (!invCarriersByService[s]) invCarriersByService[s] = new Set();
        invCarriersByService[s].add(c);

        const csKey = `${c}||${s}`;
        if (!invUnitsByCarrier[csKey]) invUnitsByCarrier[csKey] = [];
        invUnitsByCarrier[csKey].push(it);
    });

    // 3. Pre-index callListSchedule by service + eta
    const callListByService = {};
    (callListSchedule || []).forEach(row => {
        const s = (row.service || '').toUpperCase().trim();
        const c = (row.carrier || '').toUpperCase().trim();
        if (!callListByService[s]) callListByService[s] = [];
        callListByService[s].push({ carrier: c, eta: row.eta, etd: row.etd });
    });

    // 4. Match each active schedule vessel to carrier alias
    const result = [];
    const usedCarrierKeys = new Set();

    activeFromSchedule.forEach(sv => {
        const svService = (sv.service || '').toUpperCase().trim();
        const svEtb = sv.etb ? new Date(sv.etb) : null;
        let matchedCarrier = null;

        let liveEtb = svEtb;
        let liveEtd = sv.etd ? new Date(sv.etd) : null;

        // Step A: Check callListSchedule for matching service and ETB proximity (±2.5 days)
        // Opsi A: Prioritize uploaded Call List ETA/ETD if available
        if (svEtb && !isNaN(svEtb) && callListByService[svService]) {
            let bestDiff = Infinity;
            callListByService[svService].forEach(cl => {
                if (cl.eta) {
                    const diffDays = Math.abs(cl.eta - svEtb) / (1000 * 60 * 60 * 24);
                    if (diffDays <= 2.5 && diffDays < bestDiff) {
                        bestDiff = diffDays;
                        matchedCarrier = cl.carrier;
                        liveEtb = new Date(cl.eta);
                        if (cl.etd) liveEtd = new Date(cl.etd);
                    }
                }
            });
        }

        // Step B: If not found in callList, check invData carriers for this service
        if (!matchedCarrier && invCarriersByService[svService]) {
            const possibleCarriers = Array.from(invCarriersByService[svService]);
            if (possibleCarriers.length === 1) {
                matchedCarrier = possibleCarriers[0];
            } else {
                // If multiple carriers for same service, try substring/similarity match with vessel name
                const normVessel = (sv.vessel || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                for (const cand of possibleCarriers) {
                    const normCand = cand.replace(/[^A-Z0-9]/g, '');
                    if (normVessel.includes(normCand) || normCand.includes(normVessel.substring(0, 4))) {
                        matchedCarrier = cand;
                        break;
                    }
                }
                // Fallback to first carrier not yet used
                if (!matchedCarrier) {
                    matchedCarrier = possibleCarriers.find(c => !usedCarrierKeys.has(`${c}||${svService}`)) || possibleCarriers[0];
                }
            }
        }

        // If no carrier found in invData (vessel has 0 containers in yard yet), use vessel name or line
        const finalCarrier = matchedCarrier || sv.line || sv.vessel;
        const key = `${sv.vessel}||${svService}`;
        usedCarrierKeys.add(key);

        const units = invUnitsByCarrier[`${finalCarrier}||${svService}`] || [];

        result.push({
            key: key,
            invCarrier: finalCarrier,
            service: svService,
            vesselName: sv.vessel,
            line: sv.line || '',
            etb: liveEtb,
            etd: liveEtd,
            openStacking: sv.openStacking,
            closingPhysic: sv.closingPhysic,
            closingDocument: sv.closingDocument || '',
            units: units,
            scheduleMatch: sv
        });
    });

    // Sort by ETB ascending
    return result.sort((a, b) => {
        const da = a.etb ? new Date(a.etb) : new Date('2099-01-01');
        const db = b.etb ? new Date(b.etb) : new Date('2099-01-01');
        return da - db;
    });
}

function getUpcomingOpenStackVessels() {
    const schedule = (window.npct1ScheduleData && window.npct1ScheduleData.length)
        ? window.npct1ScheduleData
        : (window.scheduleData || []);
    const inv = window.invData || [];
    const now = new Date();

    const upcoming = [];
    const seenKeys = new Set();

    schedule.forEach(v => {
        const vName = (v.vessel || v.carrier || '').trim();
        if (!vName) return;

        let os = null;
        if (v.openStacking) {
            os = new Date(v.openStacking);
        } else if (v.etb) {
            // Default 4 days prior to ETB if not explicitly set
            os = new Date(new Date(v.etb).getTime() - 4 * 24 * 3600 * 1000);
        }
        if (!os || isNaN(os)) return;

        // Condition: openStacking has not started yet (os > now) and will start within 8 hours
        const diffMs = os.getTime() - now.getTime();
        const diffHrs = diffMs / (1000 * 60 * 60);

        if (diffMs > 0 && diffHrs <= 8) {
            const svService = (v.service || '').toUpperCase().trim();
            const svEtb = v.etb ? new Date(v.etb) : null;
            const line = (v.line || v.carrier || vName).toUpperCase().trim();
            const invCarrier = matchVesselToCarrierCode(vName, svService, svEtb, line);
            const key = `${vName.toUpperCase()}||${svService}`;

            if (seenKeys.has(key)) return;
            seenKeys.add(key);

            // Existing export boxes in yard for this vessel
            const existing = calculateExistingCapacity(invCarrier, svService);

            upcoming.push({
                key,
                vesselName: vName,
                service: svService || '—',
                line: line,
                invCarrier: invCarrier,
                etb: svEtb,
                etd: v.etd ? new Date(v.etd) : null,
                openStacking: os,
                closingPhysic: v.closingPhysic ? new Date(v.closingPhysic) : null,
                closingDocument: v.closingDocument || '',
                diffMs,
                diffHrs,
                boxCount: existing.totalBox,
                color: getYardColor(invCarrier || line)
            });
        }
    });

    upcoming.sort((a, b) => a.openStacking - b.openStacking);
    return upcoming;
}

// ── Capacity Calculation ─────────────────────────────────────────────

const YT_EXPORT_BLOCKS = [
    'A01', 'A02', 'A03', 'A04', 'A05',
    'B01', 'B02', 'B03', 'B04', 'B05',
    'C03', 'C04'
];

const YT_ALL_BLOCKS = [
    'A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08',
    'B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08',
    'C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08'
];

/**
 * Calculates empty slots and available 40ft positions across blocks
 */
function calculateAvailableCapacity() {
    const inv = window.invData || [];
    const CAP = typeof activeCapacity !== 'undefined' ? activeCapacity : DEFAULT_CAPACITY;
    const result = {};

    YT_ALL_BLOCKS.forEach(block => {
        const cap = CAP[block];
        if (!cap) return;
        const maxSlots = cap.slots || 37;
        const maxTier = cap.tier || 5;
        const maxRows = 6;

        // Build occupancy grid: slot -> row -> max tier occupied
        const occ = {};
        inv.forEach(it => {
            if ((it.block || '').toUpperCase() !== block) return;
            const s = parseInt(it.slot) || 0;
            const r = parseInt(it.row) || 1;
            if (s < 1 || s > maxSlots || r < 1 || r > maxRows) return;

            let tier = 1;
            const rawSlot = (it._raw_slot || '').trim();
            if (rawSlot.includes('-')) {
                const parts = rawSlot.split('-');
                if (parts.length >= 4) tier = parseInt(parts[3]) || 1;
                else if (parts.length >= 3) tier = parseInt(parts[parts.length - 1]) || 1;
            }

            if (!occ[s]) occ[s] = {};
            if (!occ[s][r] || tier > occ[s][r]) occ[s][r] = tier;
        });

        // Count empty slots (slots with no container in any row)
        let emptySlots = 0;
        for (let s = 1; s <= maxSlots; s++) {
            if (!occ[s] || Object.keys(occ[s]).length === 0) {
                emptySlots++;
            }
        }

        // Count available 40ft positions (consecutive empty slot pairs)
        let avail40 = 0;
        for (let s = 1; s < maxSlots; s++) {
            const s1Empty = !occ[s] || Object.keys(occ[s]).length === 0;
            const s2Empty = !occ[s + 1] || Object.keys(occ[s + 1]).length === 0;
            if (s1Empty && s2Empty) {
                avail40++;
            }
        }

        result[block] = {
            maxSlots,
            maxTier,
            maxRows,
            emptySlots,
            avail40Positions: avail40
        };
    });

    return result;
}

/**
 * Calculate existing containers already in yard for this vessel
 * Returns actual box count: 20ft, 40ft, 45ft, total box, total TEU
 */
function calculateExistingCapacity(carrierOrKey, maybeService) {
    const inv = window.invData || [];
    let carrier = '';
    let svc = '';

    if (carrierOrKey && carrierOrKey.includes('||')) {
        const p = carrierOrKey.split('||');
        // Find if this key matches a vessel in ytVesselScheduleMap to get real invCarrier
        const matched = ytVesselScheduleMap.find(v => v.key === carrierOrKey);
        carrier = matched ? matched.invCarrier : p[0];
        svc = matched ? matched.service : (p[1] || '');
    } else {
        carrier = carrierOrKey || '';
        svc = maybeService || '';
    }

    carrier = carrier.toUpperCase().trim();
    svc = svc.toUpperCase().trim();

    let box20 = 0, box40 = 0, box45 = 0;
    const blockBreakdown = {};

    inv.forEach(it => {
        if (!it.move.includes('export')) return;
        const c = (it.carrier || '').toUpperCase().trim();
        const s = (it.service || '').toUpperCase().trim();
        if (c !== carrier) return;
        if (svc && s && s !== svc) return;

        const len = String(it.length || '20');
        if (len.startsWith('20')) box20++;
        else if (len.startsWith('45')) box45++;
        else box40++;

        const blk = it.block || 'N';
        if (!blockBreakdown[blk]) blockBreakdown[blk] = { b20: 0, b40: 0, b45: 0 };
        if (len.startsWith('20')) blockBreakdown[blk].b20++;
        else if (len.startsWith('45')) blockBreakdown[blk].b45++;
        else blockBreakdown[blk].b40++;
    });

    return {
        box20, box40, box45,
        totalBox: box20 + box40 + box45,
        totalTEU: box20 + ((box40 + box45) * 2),
        blockBreakdown
    };
}

/**
 * Smart Replan Concept Available Capacity:
 * Calculates available box capacity (20ft and 40ft) for a specific vessel.
 * - On existing 20ft stacks (tier < maxTier) -> available 20ft boxes
 * - On existing 40ft stacks (tier < maxTier) -> available 40ft boxes
 * - In empty rows within matching BLOCK-SLOTs of that vessel -> available 20ft or 40ft boxes
 */
function calculateVesselAvailableCapacity(invCarrier, service) {
    const inv = window.invData || [];
    const CAP = typeof activeCapacity !== 'undefined' ? activeCapacity : DEFAULT_CAPACITY;
    if (!inv.length) return { avail20: 0, avail40: 0, totalAvailBox: 0 };

    const normCarrier = (invCarrier || '').toUpperCase().trim();
    const normService = (service || '').toUpperCase().trim();

    // 1. Find all export containers of this vessel
    const vesselContainers = inv.filter(it => {
        if (!it.move.includes('export')) return false;
        const c = (it.carrier || '').toUpperCase().trim();
        const s = (it.service || '').toUpperCase().trim();
        return (c === normCarrier) && (!normService || !s || s === normService);
    });

    if (!vesselContainers.length) return { avail20: 0, avail40: 0, totalAvailBox: 0 };

    // 2. Track all occupied tiers in yard: base -> max occupied tier
    const allStacks = {};
    inv.forEach(m => {
        let raw = (m._raw_slot || '').trim();
        if (raw.includes('-')) {
            let p = raw.split('-');
            let tier = parseInt(p.pop());
            let base = p.join('-');
            if (!isNaN(tier)) {
                allStacks[base] = Math.max(allStacks[base] || 0, tier);
            }
        }
    });

    // 3. Stacks where this vessel has containers
    const stackInfo = {}; // base -> { maxTier, is40, block, slot, row }
    const matchingSlots = new Set(); // "BLOCK-SLOT"

    vesselContainers.forEach(m => {
        let raw = (m._raw_slot || '').trim();
        if (!raw.includes('-')) return;
        let p = raw.split('-');
        let tier = parseInt(p.pop());
        let base = p.join('-');
        if (isNaN(tier)) return;

        const blk = p[0];
        const sNum = parseInt(p[1]) || 0;
        const rNum = parseInt(p[2]) || 1;
        const len = String(m.length || '20');
        const is40 = len.startsWith('40') || len.startsWith('45');

        if (!stackInfo[base] || tier > stackInfo[base].maxTier) {
            stackInfo[base] = { maxTier: tier, is40, block: blk, slot: sNum, row: rNum };
        }

        if (p.length >= 2) matchingSlots.add(`${blk}-${sNum}`);
    });

    let avail20 = 0;
    let avail40 = 0;

    // 4. Calculate available tiers on top of existing stacks
    Object.entries(stackInfo).forEach(([base, info]) => {
        const blkCap = CAP[info.block] || { tier: 5 };
        const maxBlockTier = blkCap.tier || 5;
        const allOccupied = allStacks[base] || info.maxTier;

        // Skip if something else was stacked on top
        if (allOccupied > info.maxTier) return;

        const remaining = Math.max(0, maxBlockTier - allOccupied);
        if (info.is40) {
            avail40 += remaining;
        } else {
            avail20 += remaining;
        }
    });

    // 5. Empty rows in matching slots
    matchingSlots.forEach(bs => {
        const parts = bs.split('-');
        const blk = parts[0];
        const slotNum = parseInt(parts[1]);
        const blkCap = CAP[blk] || { tier: 5 };
        const maxBlockTier = blkCap.tier || 5;

        for (let r = 1; r <= 6; r++) {
            const padR = String(r).padStart(2, '0');
            const base1 = `${bs}-${padR}`;
            const base2 = `${bs}-${r}`;
            if (allStacks[base1] || allStacks[base2]) continue;

            // Empty row: determine if 20ft or 40ft based on other stacks in this slot
            const isSlot40 = Object.values(stackInfo).some(st => st.block === blk && st.slot === slotNum && st.is40);
            if (isSlot40) {
                avail40 += maxBlockTier;
            } else {
                avail20 += maxBlockTier;
            }
        }
    });

    return {
        avail20,
        avail40,
        totalAvailBox: avail20 + avail40
    };
}

// ── Vessel Container Match Helper ────────────────────────────────────

function isVesselContainerMatch(carrier, isExport) {
    if (!ytSelectedVessel) return true; // No vessel selected -> show all
    if (!isExport) return false;        // Import containers are dimmed in export vessel reservation mode
    if (!carrier) return false;

    const targetCarrier = (ytSelectedVessel.carrier || '').toUpperCase().trim();
    const itemCr = (carrier || '').toUpperCase().trim();

    if (itemCr === targetCarrier) return true;

    // Substring / prefix match
    if (targetCarrier.length >= 3 && itemCr.length >= 3) {
        if (targetCarrier.includes(itemCr) || itemCr.includes(targetCarrier)) return true;
    }

    // Check target vesselName against carrier alias
    const targetVessel = (ytSelectedVessel.vesselName || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const cleanCr = itemCr.replace(/[^A-Z0-9]/g, '');
    if (cleanCr.length >= 3 && (targetVessel.includes(cleanCr) || cleanCr.includes(targetVessel.substring(0, 4)))) {
        return true;
    }

    return false;
}

// ── Yard Template Rendering ──────────────────────────────────────────

function renderYardTemplate() {
    const content = document.getElementById('ytYardContent');
    const legend = document.getElementById('ytYardLegend');
    if (!content) return;

    if (!isInvLoaded || !invData.length) {
        content.innerHTML = `<div class="p-12 text-center text-slate-400 border-dashed border-2 border-slate-200 rounded-2xl bg-white/30">
            <span class="material-symbols-outlined text-5xl block mb-2 opacity-50">grid_view</span>
            Upload Unit List to visualize yard template.
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

    // Build reservation lookup: block -> slot -> vesselKey
    const reservedSlots = {};
    Object.entries(ytReservations).forEach(([vesselKey, reservations]) => {
        reservations.forEach(res => {
            if (!reservedSlots[res.block]) reservedSlots[res.block] = {};
            for (let s = res.slotStart; s <= res.slotEnd; s++) {
                reservedSlots[res.block][s] = vesselKey;
            }
        });
    });

    // Legend
    if (legend) {
        const entries = Object.entries(yardCarrierColorMap).sort((a, b) => a[0].localeCompare(b[0]));
        let lh = `<div class="flex items-center gap-2 flex-wrap text-[10px]">
            <span class="font-bold text-slate-500 uppercase tracking-wider">Export Vessels</span>
            <div class="h-3 w-px bg-slate-300"></div>
            <div class="ym-legend-chip ${!ytSelectedVessel ? 'ym-legend-active' : ''}" onclick="ytClearVesselSelection()" title="Clear selection">
                <span class="w-3 h-3 rounded-sm bg-white border border-slate-300 inline-block"></span>
                <span class="font-bold text-slate-500">All</span>
            </div>
            <div class="h-3 w-px bg-slate-300"></div>`;
        entries.forEach(([c, col]) => {
            const isMatch = ytSelectedVessel ? isVesselContainerMatch(c, true) : false;
            let chipCls = 'ym-legend-chip';
            if (ytSelectedVessel) {
                chipCls += isMatch ? ' ym-legend-active' : ' opacity-30';
            }
            lh += `<div class="${chipCls}" data-carrier="${c}" title="${c}">
                <span class="w-3 h-3 rounded-sm inline-block" style="background:${col}"></span>
                <span class="font-bold text-slate-600">${c}</span>
            </div>`;
        });
        lh += '</div>';
        legend.innerHTML = lh;
    }

    let html = '<div class="ym-yard yt-yard">';

    // Mode indicator banner
    if (ytSelectedVessel) {
        const rec = ytFindBestBlockRecommendation(ytSelectedVessel.key);
        html += `<div class="yt-mode-bar flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-[18px]">edit_note</span>
                <span>Reservation Mode: <strong>${ytSelectedVessel.vesselName}</strong> (${ytSelectedVessel.service})</span>
            </div>
            ${rec ? `
                <div class="yt-recommendation-pill" title="Safest continuous empty slots with zero clashes">
                    <span class="material-symbols-outlined text-[15px] text-amber-500">lightbulb</span>
                    <span>Best Block: <strong>${rec.block}</strong> (Slots ${rec.slotStart}–${rec.slotEnd} · ${rec.length} free · 0 clash)</span>
                    <button onclick="ytApplyRecommendation('${ytSelectedVessel.key}', '${rec.block}', ${rec.slotStart}, ${rec.slotEnd}); event.stopPropagation();" 
                        class="yt-quick-apply-btn" title="Click to immediately reserve these slots">
                        Quick Apply
                    </button>
                </div>
            ` : ''}
            <div class="flex items-center gap-2">
                ${ytRangeStart ? `<span class="yt-range-indicator"><span class="material-symbols-outlined text-[14px]">radio_button_checked</span> Start: ${ytRangeStart.block}-${ytRangeStart.slot}</span>` : `<span class="yt-mode-hint">Click two empty slots in the same block to reserve</span>`}
                <button onclick="ytClearVesselSelection()" class="yt-mode-close" title="Exit reservation mode">
                    <span class="material-symbols-outlined text-[16px]">close</span>
                </button>
            </div>
        </div>`;
    }

    html += '<div class="ym-sections-grid">';

    const clashData = getYardTemplateClashMap();
    const targetClashMap = clashData.target || {};
    const otherClashMap = clashData.other || {};

    const opData = getOperationalVessels();
    const berthedVessels = opData.berthed || [];
    const upcomingVessels = opData.upcoming || [];

    sections.forEach(sec => {
        html += `<div class="ym-section"><div class="ym-section-header">${sec.label}</div>`;

        for (let p = 0; p < sec.blocks.length; p += 2) {
            html += '<div class="ym-block-pair">';

            for (let b = 0; b < 2 && p + b < sec.blocks.length; b++) {
                const bn = sec.blocks[p + b];
                const ms = (CAP[bn] || {}).slots || 37;
                const ctrs = blockMap[bn] || [];
                const count = ctrs.length;
                const blockReserved = reservedSlots[bn] || {};

                html += `<div class="ym-block">`;
                html += `<div class="ym-block-label">${bn}</div>`;
                html += `<div class="ym-slots">`;

                const items = buildYardSlotItems(ctrs, ms, bn);
                items.forEach(item => {
                    const isReserved = !!blockReserved[item.s];
                    const isRangeStart = ytRangeStart && ytRangeStart.block === bn && ytRangeStart.slot === item.s;
                    
                    const isIgnoredClashBlock = isYardClashIgnoredBlock(bn);

                    // Check if target vessel slot is in clash (skipped for C01, C02, BR9, RC9, D01, OOG)
                    const targetClash = (!isIgnoredClashBlock && targetClashMap[bn] && (targetClashMap[bn][item.s] || (item.t === '4' && targetClashMap[bn][item.s + 1]))) ? 
                                        (targetClashMap[bn][item.s] || targetClashMap[bn][item.s + 1]) : null;

                    // Check if this slot belongs to another vessel impacted by clash
                    const otherClash = (!isIgnoredClashBlock && otherClashMap[bn] && (otherClashMap[bn][item.s] || (item.t === '4' && otherClashMap[bn][item.s + 1]))) ? 
                                       (otherClashMap[bn][item.s] || otherClashMap[bn][item.s + 1]) : null;

                    let clashTriangle = '';
                    let clashTitle = '';

                    if (targetClash) {
                        const oEtb = targetClash.otherETB ? ` (ETB: ${formatClashTime(targetClash.otherETB)})` : '';
                        const otherDesc = `${targetClash.otherVessel}${oEtb}`;
                        const vsDesc = targetClash.targetVessel ? `${targetClash.targetVessel} vs ${otherDesc}` : `vs ${otherDesc}`;
                        clashTriangle = `<span class="yt-clash-triangle" title="⚠️ POTENTIAL CLASH: Proximity ${targetClash.distance} slot(s) [${vsDesc}] (Slot ${targetClash.otherSlot}) · Overlap: ${targetClash.overlapHrs}h">▲</span>`;
                        clashTitle = ` [⚠️ POTENTIAL CLASH: ${targetClash.distance}s ${vsDesc} (Slot ${targetClash.otherSlot})]`;
                    } else if (otherClash) {
                        const oEtb = otherClash.otherETB ? ` (ETB: ${formatClashTime(otherClash.otherETB)})` : '';
                        const otherDesc = `${otherClash.otherVessel}${oEtb}`;
                        clashTriangle = `<span class="yt-clash-triangle" title="⚠️ IMPACTED CONFLICT: ${otherDesc} (Slot ${otherClash.slot}) · Proximity ${otherClash.distance} slot(s) from ${otherClash.targetVessel} (Slot ${otherClash.targetSlot}) · Overlap: ${otherClash.overlapHrs}h">▲</span>`;
                        clashTitle = ` [⚠️ IMPACTED CONFLICT: ${otherDesc} · ${otherClash.distance}s from ${otherClash.targetVessel} (Slot ${otherClash.targetSlot})]`;
                    }

                    if (item.t === 'e') {
                        // Empty slot — can be reserved or clickable
                        let cls = 'ym-slot ym-empty';
                        let style = '';
                        let extraAttr = '';

                        if (isReserved) {
                            const rVesselKey = blockReserved[item.s];
                            const matchedV = ytVesselScheduleMap.find(v => v.key === rVesselKey);
                            const rColor = getYardColor(matchedV ? matchedV.invCarrier : rVesselKey.split('||')[0]);
                            const isMyReservation = !ytSelectedVessel || (ytSelectedVessel.key === rVesselKey);

                            if (isMyReservation) {
                                cls += ' yt-reserved';
                                style = `background: repeating-linear-gradient(-45deg, ${rColor}50, ${rColor}50 3px, ${rColor}15 3px, ${rColor}15 6px); border-color: ${rColor};`;
                            } else if (otherClash) {
                                // Conflicting vessel's reservation: illuminate faded!
                                cls += ' yt-reserved yt-slot-conflicting';
                                style = `background: repeating-linear-gradient(-45deg, ${rColor}70, ${rColor}70 3px, ${rColor}25 3px, ${rColor}25 6px); border-color: #ef4444;`;
                            } else {
                                cls += ' yt-reserved yt-reserved-dimmed';
                                style = `background: repeating-linear-gradient(-45deg, #cbd5e130, #cbd5e130 3px, #cbd5e110 3px, #cbd5e110 6px); border-color: #cbd5e1;`;
                            }
                            extraAttr = `data-reserved-vessel="${rVesselKey}"`;
                        } else if (isRangeStart) {
                            cls += ' yt-range-start';
                        }

                        if (ytSelectedVessel && !isReserved) {
                            cls += ' yt-clickable';
                        }

                        if (targetClash) cls += ' yt-clash-slot';

                        html += `<div class="${cls}" style="${style}" title="Slot ${item.s}${isReserved ? ' [PLAN RESERVED]' : (ytSelectedVessel ? ' [Drag or click to reserve]' : '')}${clashTitle}" data-block="${bn}" data-slot="${item.s}" ${extraAttr} onmousedown="ytSlotMouseDown(event, '${bn}', ${item.s})" onmouseenter="ytSlotMouseEnter('${bn}', ${item.s})" onmouseup="ytSlotMouseUp(event, '${bn}', ${item.s})" onclick="ytSlotClick('${bn}', ${item.s})">${clashTriangle}</div>`;
                    } else if (item.t === '4') {
                        const tc = yardContrastText(item.c);
                        const isMatch = isVesselContainerMatch(item.cr, item.ex);
                        let cls = `ym-slot ym-40${item.ex ? ' ym-exp' : ' ym-imp'}`;
                        let style = '';
                        let innerSpan = '';
                        let opTitle = '';

                        const berthedMatch = (ytShowBerthed && !isMatch) ? berthedVessels.find(bv => isCarrierMatchVessel(item.cr, bv)) : null;
                        const upcomingMatch = (ytShowUpcoming && !isMatch) ? upcomingVessels.find(uv => isCarrierMatchVessel(item.cr, uv)) : null;

                        if (isMatch) {
                            const bc = item.ex ? 'rgba(0,0,0,0.18)' : '#cbd5e1';
                            cls += ytSelectedVessel ? ' yt-slot-active' : '';
                            if (targetClash) cls += ' yt-clash-slot';
                            style = `background:${item.c};border-color:${bc}`;
                            innerSpan = `<span style="color:${tc}">${item.cr}</span>`;
                        } else if (otherClash) {
                            // Impacted conflicting vessel container: FADED (opacity: 0.6 in CSS) with red dashed border!
                            cls += ' yt-slot-conflicting';
                            style = `background:${item.c};border-color:rgba(239,68,68,0.85);`;
                            innerSpan = `<span style="color:${tc}">${item.cr}</span>`;
                        } else if (berthedMatch) {
                            // Operational Currently Berthed: Faded (0.65) with cyan outline
                            cls += ' yt-slot-op-berthed';
                            style = `background:${item.c};border-color:#0284c7;`;
                            innerSpan = `<span style="color:${tc}">${item.cr}</span>`;
                            opTitle = ` [BERTHED: ${berthedMatch.vessel}]`;
                        } else if (upcomingMatch) {
                            // Operational Upcoming (≤ 4h): Faded (0.65) with amber outline
                            cls += ' yt-slot-op-upcoming';
                            style = `background:${item.c};border-color:#f59e0b;`;
                            innerSpan = `<span style="color:${tc}">${item.cr}</span>`;
                            opTitle = ` [UPCOMING ≤4H: ${upcomingMatch.vessel}]`;
                        } else {
                            cls += ' yt-slot-dimmed';
                        }

                        html += `<div class="${cls}" style="${style}" title="Slot ${item.s}: ${item.cr} (40ft)${clashTitle}${opTitle}" data-carrier="${item.cr}" data-block="${bn}" data-slot="${item.s}">${clashTriangle}${innerSpan}</div>`;
                    } else {
                        const isMatch = isVesselContainerMatch(item.cr, item.ex);
                        let cls = `ym-slot ym-20${item.ex ? ' ym-exp' : ' ym-imp'}`;
                        let style = '';
                        let opTitle = '';

                        const berthedMatch = (ytShowBerthed && !isMatch) ? berthedVessels.find(bv => isCarrierMatchVessel(item.cr, bv)) : null;
                        const upcomingMatch = (ytShowUpcoming && !isMatch) ? upcomingVessels.find(uv => isCarrierMatchVessel(item.cr, uv)) : null;

                        if (isMatch) {
                            const bc = item.ex ? 'rgba(0,0,0,0.15)' : '#cbd5e1';
                            cls += ytSelectedVessel ? ' yt-slot-active' : '';
                            if (targetClash) cls += ' yt-clash-slot';
                            style = `background:${item.c};border-color:${bc}`;
                        } else if (otherClash) {
                            // Impacted conflicting vessel container: FADED (opacity: 0.6)
                            cls += ' yt-slot-conflicting';
                            style = `background:${item.c};border-color:rgba(239,68,68,0.85);`;
                        } else if (berthedMatch) {
                            // Operational Currently Berthed: Faded (0.65) with cyan outline
                            cls += ' yt-slot-op-berthed';
                            style = `background:${item.c};border-color:#0284c7;`;
                            opTitle = ` [BERTHED: ${berthedMatch.vessel}]`;
                        } else if (upcomingMatch) {
                            // Operational Upcoming (≤ 4h): Faded (0.65) with amber outline
                            cls += ' yt-slot-op-upcoming';
                            style = `background:${item.c};border-color:#f59e0b;`;
                            opTitle = ` [UPCOMING ≤4H: ${upcomingMatch.vessel}]`;
                        } else {
                            cls += ' yt-slot-dimmed';
                        }

                        html += `<div class="${cls}" style="${style}" title="Slot ${item.s}: ${item.cr}${clashTitle}${opTitle}" data-carrier="${item.cr}" data-block="${bn}" data-slot="${item.s}">${clashTriangle}</div>`;
                    }
                });

                html += `</div>`; // ym-slots

                // Block count + reserved count
                const reservedCount = Object.keys(blockReserved).length;
                let countHtml = '';
                if (ytSelectedVessel) {
                    const vesselUnitsInBlock = ctrs.filter(c => isVesselContainerMatch(c.carrier, isYardExport(c))).length;
                    if (vesselUnitsInBlock > 0) {
                        countHtml = `<span class="font-bold text-indigo-700">${vesselUnitsInBlock}</span><span class="text-[9px] text-slate-400">/${count}</span>`;
                    } else {
                        countHtml = `<span class="text-slate-400 opacity-60">0/${count}</span>`;
                    }
                } else {
                    countHtml = `${count}`;
                }

                if (reservedCount > 0) {
                    countHtml += ` <span class="yt-reserved-badge">+${reservedCount}P</span>`;
                }
                html += `<div class="ym-block-count" title="${count} existing units${reservedCount ? ', ' + reservedCount + ' plan slots' : ''}">${countHtml}</div>`;
                html += `</div>`; // ym-block
            }

            html += '</div>'; // ym-block-pair
        }

        html += '</div>'; // ym-section
    });

    html += '</div>'; // ym-sections-grid
    html += '</div>'; // ym-yard

    content.innerHTML = html;

    // Auto-fit
    ytFitToScreen();

    if (ytTemplateTextHidden) {
        const yard = content.querySelector('.ym-yard');
        if (yard) yard.classList.add('ym-text-hidden');
    }
}

// ── Active Vessel Table ──────────────────────────────────────────────

function renderActiveVesselTable() {
    const body = document.getElementById('ytVesselBody');
    const countEl = document.getElementById('ytVesselCount');
    if (!body) return;

    const vessels = getActiveOpenStackVessels();
    const upcomingVessels = getUpcomingOpenStackVessels();
    ytVesselScheduleMap = [...vessels, ...upcomingVessels];

    if (countEl) countEl.textContent = `${vessels.length} vessel${vessels.length !== 1 ? 's' : ''}`;

    if (!vessels.length) {
        body.innerHTML = `<tr><td colspan="12" class="px-4 py-12 text-center text-slate-400">
            <span class="material-symbols-outlined text-4xl block mb-2 opacity-40">directions_boat</span>
            <span class="text-sm font-medium">No vessels with active open stacking found.</span>
            <br><span class="text-xs mt-1 block">Make sure vessel schedule data is loaded.</span>
        </td></tr>`;
        renderUpcomingOpenStackVessels();
        return;
    }

    const now = new Date();

    const rows = vessels.map((v, i) => {
        const existing = calculateExistingCapacity(v.invCarrier, v.service);
        const avail = calculateVesselAvailableCapacity(v.invCarrier, v.service);
        const isSelected = ytSelectedVessel && ytSelectedVessel.key === v.key;
        const color = getYardColor(v.invCarrier);

        // Reservation stats for this vessel
        const resList = ytReservations[v.key] || [];
        const reservedSlots = resList.reduce((sum, r) => sum + (r.slotEnd - r.slotStart + 1), 0);
        // Capacity plan for reserved empty slots in TEUs (1 slot across 6 rows × 5 tiers = 30 TEU)
        const planTEU = reservedSlots * 30;

        const resDetail = resList.map((r, idx) =>
            `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-white border border-slate-200 shadow-sm">
                ${r.block}: ${r.slotStart}-${r.slotEnd} (${r.slotEnd - r.slotStart + 1}s)
                <button onclick="ytRemoveReservation('${v.key}', ${idx}); event.stopPropagation();" class="text-red-400 hover:text-red-600 ml-0.5 font-black" title="Remove">×</button>
            </span>`
        ).join(' ');

        const formatDt = (raw) => {
            if (!raw) return '<span class="text-slate-300">—</span>';
            const d = new Date(raw);
            if (isNaN(d)) return `<span class="text-slate-500">${raw}</span>`;
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const hh = String(d.getHours()).padStart(2, '0');
            const mi = String(d.getMinutes()).padStart(2, '0');
            return `${dd}/${mm} <span class="text-slate-400">${hh}:${mi}</span>`;
        };

        return `<tr class="yt-vessel-row ${isSelected ? 'yt-vessel-selected' : ''} hover:bg-indigo-50/40 transition-colors cursor-pointer" onclick="ytSelectVessel('${v.key}', '${v.vesselName.replace(/'/g, "\\'")}', '${v.service}', '${v.invCarrier}')" ondblclick="ytSelectVesselFullscreen('${v.key}', '${v.vesselName.replace(/'/g, "\\'")}', '${v.service}', '${v.invCarrier}')" title="Click to select · Double-click for Fullscreen Mode">
            <td class="px-2 py-2 text-center text-slate-400 font-mono text-[10px]">${i + 1}</td>
            <td class="px-3 py-2">
                <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${color}"></span>
                    <div>
                        <div class="font-bold text-slate-800 text-[11px]">${v.vesselName}</div>
                        <div class="text-[9px] text-slate-400 font-mono">${v.invCarrier}</div>
                    </div>
                </div>
            </td>
            <td class="px-2 py-2 text-center"><span class="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-bold text-slate-600">${v.service}</span></td>
            <td class="px-2 py-2 text-center font-mono text-[10px]">${formatDt(v.etb)}</td>
            <td class="px-2 py-2 text-center font-mono text-[10px] bg-amber-50/30">${formatDt(v.openStacking)}</td>
            <td class="px-2 py-2 text-center font-mono text-[10px] bg-red-50/30">${formatDt(v.closingPhysic)}</td>
            <td class="px-3 py-2 text-center font-black text-slate-700 text-[11px]" title="${existing.box20}x20' + ${existing.box40 + existing.box45}x40'">
                ${existing.totalBox}
            </td>
            <td class="px-3 py-2 text-center font-black text-emerald-700 text-[11px] bg-emerald-50/30" title="${avail.avail20}x20' + ${avail.avail40}x40'">
                ${avail.totalAvailBox}
            </td>
            <td class="px-2 py-2 text-center font-black text-violet-700 text-[11px]">
                ${reservedSlots > 0 ? `<span class="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 border border-violet-200">${reservedSlots} slots</span>` : '<span class="text-slate-300">—</span>'}
            </td>
            <td class="px-2 py-2 text-center font-black text-emerald-800 text-[11px]">
                ${planTEU > 0 ? `<span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 font-black">+${planTEU} TEU</span>` : '<span class="text-slate-300">—</span>'}
            </td>
            <td class="px-3 py-2" onclick="event.stopPropagation();">
                ${resList.length > 0 ? `<div class="flex flex-wrap gap-1">${resDetail}</div>` : '<span class="text-slate-300">—</span>'}
            </td>
            <td class="px-2 py-2 text-center" onclick="event.stopPropagation();">
                ${resList.length > 0 ? `<button onclick="ytClearVesselReservations('${v.key}'); event.stopPropagation();" class="px-2 py-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors">Clear</button>` : '<span class="text-slate-300">—</span>'}
            </td>
        </tr>`;
    });

    body.innerHTML = rows.join('');
    renderUpcomingOpenStackVessels();
}

function renderUpcomingOpenStackVessels() {
    const container = document.getElementById('ytUpcomingOpenStackContent');
    const badge = document.getElementById('ytUpcomingOpenStackBadge');
    if (!container) return;

    const upcoming = getUpcomingOpenStackVessels();
    if (badge) badge.textContent = `${upcoming.length} vessel${upcoming.length !== 1 ? 's' : ''}`;

    if (upcoming.length === 0) {
        container.innerHTML = `
            <div class="p-3 text-center text-slate-400 text-xs italic bg-white/40 rounded-xl border border-slate-200/60">
                No vessels scheduled to start open stacking within the next 8 hours.
            </div>`;
        return;
    }

    const formatDt = (raw) => {
        if (!raw) return '<span class="text-slate-300">—</span>';
        const d = new Date(raw);
        if (isNaN(d)) return `<span class="text-slate-500">${raw}</span>`;
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        return `${dd}/${mm} <span class="text-slate-400">${hh}:${mi}</span>`;
    };

    const rows = upcoming.map((v, i) => {
        const existing = calculateExistingCapacity(v.invCarrier, v.service);
        const avail = calculateVesselAvailableCapacity(v.invCarrier, v.service);
        const isSelected = ytSelectedVessel && ytSelectedVessel.key === v.key;
        const color = getYardColor(v.invCarrier);

        // Reservation stats for this vessel
        const resList = ytReservations[v.key] || [];
        const reservedSlots = resList.reduce((sum, r) => sum + (r.slotEnd - r.slotStart + 1), 0);
        const planTEU = reservedSlots * 30;

        const resDetail = resList.map((r, idx) =>
            `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-white border border-slate-200 shadow-sm">
                ${r.block}: ${r.slotStart}-${r.slotEnd} (${r.slotEnd - r.slotStart + 1}s)
                <button onclick="ytRemoveReservation('${v.key}', ${idx}); event.stopPropagation();" class="text-red-400 hover:text-red-600 ml-0.5 font-black" title="Remove">×</button>
            </span>`
        ).join(' ');

        const totalMins = Math.round(v.diffMs / 60000);
        const hrs = Math.floor(totalMins / 60);
        const mins = totalMins % 60;
        const countdownBadge = `<span class="inline-block px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-900 font-mono text-[9px] font-bold border border-amber-300 ml-1">in ${hrs > 0 ? hrs + 'h ' : ''}${mins}m</span>`;

        return `<tr class="yt-vessel-row ${isSelected ? 'yt-vessel-selected' : ''} hover:bg-indigo-50/40 transition-colors cursor-pointer" onclick="ytSelectVessel('${v.key}', '${v.vesselName.replace(/'/g, "\\'")}', '${v.service}', '${v.invCarrier}')" ondblclick="ytSelectVesselFullscreen('${v.key}', '${v.vesselName.replace(/'/g, "\\'")}', '${v.service}', '${v.invCarrier}')" title="Click to select · Double-click for Fullscreen Mode">
            <td class="px-2 py-2 text-center text-slate-400 font-mono text-[10px]">${i + 1}</td>
            <td class="px-3 py-2">
                <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${color}"></span>
                    <div>
                        <div class="font-bold text-slate-800 text-[11px]">${v.vesselName}</div>
                        <div class="text-[9px] text-slate-400 font-mono">${v.invCarrier}</div>
                    </div>
                </div>
            </td>
            <td class="px-2 py-2 text-center"><span class="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-bold text-slate-600 font-mono">${v.service}</span></td>
            <td class="px-2 py-2 text-center font-mono text-[10px]">${formatDt(v.etb)}</td>
            <td class="px-2 py-2 text-center font-mono text-[10px] bg-amber-50/30">
                ${formatDt(v.openStacking)} ${countdownBadge}
            </td>
            <td class="px-2 py-2 text-center font-mono text-[10px] bg-red-50/30">${formatDt(v.closingPhysic)}</td>
            <td class="px-3 py-2 text-center font-black text-slate-700 text-[11px]" title="${existing.box20}x20' + ${existing.box40 + existing.box45}x40'">
                ${existing.totalBox}
            </td>
            <td class="px-3 py-2 text-center font-black text-emerald-700 text-[11px] bg-emerald-50/30" title="${avail.avail20}x20' + ${avail.avail40}x40'">
                ${avail.totalAvailBox}
            </td>
            <td class="px-2 py-2 text-center font-black text-violet-700 text-[11px]">
                ${reservedSlots > 0 ? `<span class="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 border border-violet-200">${reservedSlots} slots</span>` : '<span class="text-slate-300">—</span>'}
            </td>
            <td class="px-2 py-2 text-center font-black text-emerald-800 text-[11px]">
                ${planTEU > 0 ? `<span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 font-black">+${planTEU} TEU</span>` : '<span class="text-slate-300">—</span>'}
            </td>
            <td class="px-3 py-2" onclick="event.stopPropagation();">
                ${resList.length > 0 ? `<div class="flex flex-wrap gap-1">${resDetail}</div>` : '<span class="text-slate-300">—</span>'}
            </td>
            <td class="px-2 py-2 text-center" onclick="event.stopPropagation();">
                ${resList.length > 0 ? `<button onclick="ytClearVesselReservations('${v.key}'); event.stopPropagation();" class="px-2 py-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors">Clear</button>` : `<button onclick="ytSelectVessel('${v.key}', '${v.vesselName.replace(/'/g, "\\'")}', '${v.service}', '${v.invCarrier}'); event.stopPropagation();" class="px-2.5 py-0.5 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded hover:bg-indigo-100 transition-colors">Pre-Plan</button>`}
            </td>
        </tr>`;
    });

    container.innerHTML = `
        <table class="w-full text-left text-[11px] table-fixed" id="ytUpcomingVesselTable">
            <colgroup>
                <col style="width: 3%; min-width: 28px;">
                <col style="width: 16%; min-width: 150px;">
                <col style="width: 6%; min-width: 55px;">
                <col style="width: 9%; min-width: 90px;">
                <col style="width: 11%; min-width: 110px;">
                <col style="width: 9%; min-width: 90px;">
                <col style="width: 8%; min-width: 75px;">
                <col style="width: 9%; min-width: 90px;">
                <col style="width: 8%; min-width: 80px;">
                <col style="width: 9%; min-width: 90px;">
                <col style="width: 12%; min-width: 120px;">
                <col style="width: 6%; min-width: 60px;">
            </colgroup>
            <thead class="bg-indigo-50/80 uppercase text-[10px] text-indigo-700 font-bold">
                <tr>
                    <th class="px-2 py-2 border-b border-indigo-200 text-center w-7">#</th>
                    <th class="px-3 py-2 border-b border-indigo-200">Vessel Name</th>
                    <th class="px-2 py-2 border-b border-indigo-200 text-center">Service</th>
                    <th class="px-2 py-2 border-b border-indigo-200 text-center">ETB</th>
                    <th class="px-2 py-2 border-b border-indigo-200 text-center bg-amber-50/50">Open Stack</th>
                    <th class="px-2 py-2 border-b border-indigo-200 text-center bg-red-50/50">Closing</th>
                    <th class="px-3 py-2 border-b border-indigo-200 text-center" title="Existing containers in yard">Existing (Box)</th>
                    <th class="px-3 py-2 border-b border-indigo-200 text-center bg-emerald-50/60 text-emerald-800" title="Smart Replan: Available box capacity from stacks">Existing Avail (Box)</th>
                    <th class="px-2 py-2 border-b border-indigo-200 text-center bg-violet-50/40 text-violet-800">Planned Slots</th>
                    <th class="px-2 py-2 border-b border-indigo-200 text-center bg-emerald-100/60 text-emerald-900">Planned Capacity</th>
                    <th class="px-3 py-2 border-b border-indigo-200">Reserved Ranges</th>
                    <th class="px-2 py-2 border-b border-indigo-200 text-center">Actions</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white/50">
                ${rows.join('')}
            </tbody>
        </table>`;
}

// ── Reservation Summary (Merged into Active Vessel Table) ────────────

function renderReservationSummary() {
    renderActiveVesselTable();
}

// ── Reservation Actions (Range Selection) ────────────────────────────

function ytScrollToReservationView() {
    setTimeout(() => {
        const modeBar = document.querySelector('.yt-mode-bar');
        const visual = document.getElementById('ytYardContent');
        const target = modeBar || visual;
        if (target) {
            const rect = target.getBoundingClientRect();
            // Align with top of screen considering floating controls
            const targetY = window.pageYOffset + rect.top - 15;
            window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
        }
    }, 80);
}

function ytSelectVessel(key, vesselName, service, carrier) {
    const color = getYardColor(carrier);
    ytSelectedVessel = { key, vesselName, service, carrier, color };
    ytRangeStart = null;
    renderActiveVesselTable();
    renderYardTemplate();
    renderYardTemplateClashes();

    // Auto scroll to Yard Template visual
    ytScrollToReservationView();
}

// ── Fullscreen Reservation Mode ──────────────────────────────────────
let ytIsFullscreen = false;

function ytEnterFullscreen() {
    const card = document.getElementById('ytVisualCard');
    if (!card) return;
    ytIsFullscreen = true;
    card.classList.add('yt-fullscreen');
    document.body.classList.add('yt-fullscreen-active');
    const btn = document.getElementById('ytFullscreenBtn');
    if (btn) {
        btn.innerHTML = `<span class="material-symbols-outlined text-[16px]">fullscreen_exit</span> Exit Fullscreen (Esc)`;
        btn.style.color = '#f43f5e';
        btn.style.borderColor = '#fda4af';
    }
    if (document.fullscreenEnabled && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
    }
    setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
}

function ytExitFullscreen() {
    const card = document.getElementById('ytVisualCard');
    if (!card) return;
    ytIsFullscreen = false;
    card.classList.remove('yt-fullscreen');
    document.body.classList.remove('yt-fullscreen-active');
    const btn = document.getElementById('ytFullscreenBtn');
    if (btn) {
        btn.innerHTML = `<span class="material-symbols-outlined text-[16px]">fullscreen</span> Fullscreen`;
        btn.style.color = '#0284c7';
        btn.style.borderColor = '#bae6fd';
    }
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }
    setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
}

function ytToggleFullscreen() {
    if (ytIsFullscreen) {
        ytExitFullscreen();
    } else {
        ytEnterFullscreen();
    }
}

function ytSelectVesselFullscreen(key, vesselName, service, carrier) {
    ytSelectVessel(key, vesselName, service, carrier);
    ytEnterFullscreen();
}

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && ytIsFullscreen) {
        ytExitFullscreen();
    }
});

document.addEventListener('fullscreenchange', function () {
    if (!document.fullscreenElement && ytIsFullscreen) {
        ytExitFullscreen();
    }
});

function ytClearVesselSelection() {
    ytSelectedVessel = null;
    ytRangeStart = null;
    renderActiveVesselTable();
    renderUpcomingOpenStackVessels();
    renderYardTemplate();
    renderYardTemplateClashes();
}

// ── Slot Availability & Drag-to-Select State ─────────────────────────
let ytIsDragging = false;
let ytDragStart = null;    // { block: 'A01', slot: 5 }
let ytDragCurrent = null;  // { block: 'A01', slot: 12 }
let ytHasDragged = false;
let ytLastDragMouseUpTime = 0;

function ytIsSlotAvailable(block, slot) {
    if (!block || !slot) return false;
    // Check if slot is already reserved
    for (const resList of Object.values(ytReservations)) {
        for (const res of resList) {
            if (res.block === block && slot >= res.slotStart && slot <= res.slotEnd) {
                return false;
            }
        }
    }
    // Check if slot is occupied by existing container
    const inv = window.invData || [];
    const isOccupied = inv.some(it => (it.block || '').toUpperCase() === block && parseInt(it.slot) === slot);
    if (isOccupied) return false;

    return true;
}

function ytValidateRange(block, slotStart, slotEnd) {
    const minS = Math.min(slotStart, slotEnd);
    const maxS = Math.max(slotStart, slotEnd);
    for (let s = minS; s <= maxS; s++) {
        if (!ytIsSlotAvailable(block, s)) return false;
    }
    return true;
}

function ytSlotMouseDown(e, block, slot) {
    if (!ytSelectedVessel) return;
    if (e.button !== 0) return; // Only left mouse button
    if (!ytIsSlotAvailable(block, slot)) return;

    e.preventDefault(); // Prevent text/box selection during drag
    ytIsDragging = true;
    ytHasDragged = false;
    ytDragStart = { block, slot };
    ytDragCurrent = { block, slot };

    const yardEl = document.querySelector('.ym-yard');
    if (yardEl) yardEl.classList.add('yt-dragging');

    ytUpdateDragPreview();
}

function ytSlotMouseEnter(block, slot) {
    if (!ytIsDragging || !ytDragStart) return;
    if (ytDragStart.block !== block) return; // Keep drag within same block

    ytDragCurrent = { block, slot };
    if (ytDragCurrent.slot !== ytDragStart.slot) {
        ytHasDragged = true;
    }
    ytUpdateDragPreview();
}

function ytUpdateDragPreview() {
    if (!ytDragStart || !ytDragCurrent) return;

    const blk = ytDragStart.block;
    // Remove preview classes from all slots in this block
    const allBlockSlots = document.querySelectorAll(`[data-block="${blk}"][data-slot]`);
    allBlockSlots.forEach(el => el.classList.remove('yt-drag-preview', 'yt-drag-invalid'));

    const minS = Math.min(ytDragStart.slot, ytDragCurrent.slot);
    const maxS = Math.max(ytDragStart.slot, ytDragCurrent.slot);
    const isValid = ytValidateRange(blk, minS, maxS);
    const previewClass = isValid ? 'yt-drag-preview' : 'yt-drag-invalid';

    for (let s = minS; s <= maxS; s++) {
        const el = document.querySelector(`[data-block="${blk}"][data-slot="${s}"]`);
        if (el) el.classList.add(previewClass);
    }
}

function ytClearDragPreview() {
    const previews = document.querySelectorAll('.yt-drag-preview, .yt-drag-invalid');
    previews.forEach(el => el.classList.remove('yt-drag-preview', 'yt-drag-invalid'));
    const yardEl = document.querySelector('.ym-yard');
    if (yardEl) yardEl.classList.remove('yt-dragging');
}

function ytSlotMouseUp(e, block, slot) {
    if (!ytIsDragging || !ytDragStart) return;

    const blk = ytDragStart.block;
    const endSlot = (block === blk) ? slot : (ytDragCurrent ? ytDragCurrent.slot : ytDragStart.slot);
    const slotStart = Math.min(ytDragStart.slot, endSlot);
    const slotEnd = Math.max(ytDragStart.slot, endSlot);
    const wasDragged = ytHasDragged || (slotStart !== slotEnd);

    ytClearDragPreview();
    ytIsDragging = false;
    ytDragStart = null;
    ytDragCurrent = null;
    ytLastDragMouseUpTime = Date.now();

    if (wasDragged) {
        // Direct drag release -> commit reservation!
        if (ytValidateRange(blk, slotStart, slotEnd)) {
            ytAddReservation(ytSelectedVessel.key, blk, slotStart, slotEnd);
            ytRangeStart = null;
            renderYardTemplate();
            renderActiveVesselTable();
            renderUpcomingOpenStackVessels();
            renderReservationSummary();
            renderYardTemplateClashes();
        } else {
            alert('Range contains occupied or already reserved slots! Please select a completely empty range.');
        }
    }
}

// Global safety mouseup listener
window.addEventListener('mouseup', function (e) {
    if (ytIsDragging) {
        const currentB = ytDragCurrent ? ytDragCurrent.block : null;
        const currentS = ytDragCurrent ? ytDragCurrent.slot : null;
        ytSlotMouseUp(e, currentB, currentS);
    }
});

function ytSlotClick(block, slot) {
    if (Date.now() - ytLastDragMouseUpTime < 150) return;
    if (!ytSelectedVessel) return;
    if (!ytIsSlotAvailable(block, slot)) return;

    if (!ytRangeStart) {
        // First click: select range start
        ytRangeStart = { block, slot };
        renderYardTemplate();
    } else {
        // Second click: range end (must be same block)
        if (ytRangeStart.block !== block) {
            // Different block: re-start range with new block
            ytRangeStart = { block, slot };
            renderYardTemplate();
            return;
        }

        const slotStart = Math.min(ytRangeStart.slot, slot);
        const slotEnd = Math.max(ytRangeStart.slot, slot);

        if (!ytValidateRange(block, slotStart, slotEnd)) {
            alert('Range contains occupied or already reserved slots! Please select a completely empty range.');
            ytRangeStart = null;
            renderYardTemplate();
            return;
        }

        // Add reservation
        ytAddReservation(ytSelectedVessel.key, block, slotStart, slotEnd);
        ytRangeStart = null;
        renderYardTemplate();
        renderActiveVesselTable();
        renderUpcomingOpenStackVessels();
        renderReservationSummary();
        renderYardTemplateClashes();
    }
}

function ytAddReservation(vesselKey, block, slotStart, slotEnd) {
    if (!ytReservations[vesselKey]) ytReservations[vesselKey] = [];
    ytReservations[vesselKey].push({ block, slotStart, slotEnd });
    ytSaveReservationsToStorage();
}

function ytRemoveReservation(vesselKey, index) {
    if (!ytReservations[vesselKey]) return;
    ytReservations[vesselKey].splice(index, 1);
    if (ytReservations[vesselKey].length === 0) delete ytReservations[vesselKey];
    ytSaveReservationsToStorage();
    renderYardTemplate();
    renderActiveVesselTable();
    renderReservationSummary();
    renderYardTemplateClashes();
}

function ytClearVesselReservations(vesselKey) {
    if (!confirm(`Clear all reservations for this vessel?`)) return;
    delete ytReservations[vesselKey];
    ytSaveReservationsToStorage();
    renderYardTemplate();
    renderActiveVesselTable();
    renderReservationSummary();
    renderYardTemplateClashes();
}

function ytClearAllReservations() {
    if (!confirm('Clear ALL reservations?')) return;
    ytReservations = {};
    ytSaveReservationsToStorage();
    renderYardTemplate();
    renderActiveVesselTable();
    renderReservationSummary();
    renderYardTemplateClashes();
}

// ── Smart Slot Recommendation (Auto-Suggest Best Blocks) ────────────

function ytFindBestBlockRecommendation(vesselKey) {
    if (!vesselKey) return null;

    const exportBlocks = ['A01', 'A02', 'A03', 'A04', 'A05', 'B01', 'B02', 'B03', 'B04', 'B05', 'C03', 'C04'];
    const inv = window.invData || [];
    const blockMap = {};
    inv.forEach(c => {
        if (!blockMap[c.block]) blockMap[c.block] = [];
        blockMap[c.block].push(c);
    });

    const CAP = (typeof activeCapacity !== 'undefined' && activeCapacity) ? activeCapacity : DEFAULT_CAPACITY;
    const clashData = getYardTemplateClashMap();
    const targetClashMap = clashData.target || {};

    const reservedSlots = {};
    Object.keys(ytReservations).forEach(vk => {
        (ytReservations[vk] || []).forEach(r => {
            if (!reservedSlots[r.block]) reservedSlots[r.block] = {};
            for (let s = r.slotStart; s <= r.slotEnd; s++) {
                reservedSlots[r.block][s] = vk;
            }
        });
    });

    let bestRun = null;
    let highestScore = -Infinity;

    exportBlocks.forEach(bn => {
        if (isYardClashIgnoredBlock(bn)) return;
        const ms = (CAP[bn] || {}).slots || 37;
        const ctrs = blockMap[bn] || [];
        const items = buildYardSlotItems(ctrs, ms, bn);
        const blockReserved = reservedSlots[bn] || {};

        let currentRun = null;
        const runs = [];

        items.forEach(item => {
            const isEmpty = item.t === 'e' && !blockReserved[item.s];
            if (isEmpty) {
                if (!currentRun) {
                    currentRun = { block: bn, slotStart: item.s, slotEnd: item.s, count: 1, clashes: 0 };
                } else {
                    currentRun.slotEnd = item.s;
                    currentRun.count++;
                }
                if (targetClashMap[bn] && targetClashMap[bn][item.s]) {
                    currentRun.clashes++;
                }
            } else {
                if (currentRun) {
                    runs.push(currentRun);
                    currentRun = null;
                }
            }
        });
        if (currentRun) runs.push(currentRun);

        runs.forEach(r => {
            if (r.count < 3) return;
            const score = (r.count * 10) - (r.clashes * 180);
            if (score > highestScore) {
                highestScore = score;
                bestRun = r;
            }
        });
    });

    return bestRun ? {
        block: bestRun.block,
        slotStart: bestRun.slotStart,
        slotEnd: bestRun.slotEnd,
        length: bestRun.count,
        clashes: bestRun.clashes
    } : null;
}

function ytApplyRecommendation(vesselKey, block, slotStart, slotEnd) {
    ytAddReservation(vesselKey, block, slotStart, slotEnd);
    ytRangeStart = null;
    renderYardTemplate();
    renderActiveVesselTable();
    renderReservationSummary();
    renderYardTemplateClashes();
}

// ── Export Yard Template Plan (Excel) ────────────────────────────────

function ytExportReservationExcel() {
    if (typeof XLSX === 'undefined') {
        alert('SheetJS (XLSX) library is not available. Please ensure network connection.');
        return;
    }

    const vesselKeys = Object.keys(ytReservations || {});
    if (vesselKeys.length === 0) {
        alert('No reservations found to export. Please select a vessel and reserve slots first.');
        return;
    }

    const allVessels = [...(ytVesselScheduleMap || []), ...getUpcomingOpenStackVessels(), ...getActiveOpenStackVessels()];
    const vesselDict = {};
    allVessels.forEach(v => { if (v && v.key) vesselDict[v.key] = v; });

    const formatDtExport = (raw) => {
        if (!raw) return '-';
        const d = new Date(raw);
        if (isNaN(d)) return String(raw);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        const hh = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
    };

    const rows = [];
    let no = 1;

    vesselKeys.forEach(vKey => {
        const resList = ytReservations[vKey] || [];
        const vInfo = vesselDict[vKey] || {};
        const vName = vInfo.vesselName || vKey.split('||')[0];
        const service = vInfo.service || vKey.split('||')[1] || '-';
        const carrier = vInfo.invCarrier || '-';
        const etbStr = formatDtExport(vInfo.etb);
        const openStr = formatDtExport(vInfo.openStacking);
        const closeStr = formatDtExport(vInfo.closingPhysic);

        resList.forEach(r => {
            const slotCount = (r.slotEnd - r.slotStart + 1);
            const estTEU = slotCount * 30;
            rows.push({
                'No': no++,
                'Vessel Name': vName,
                'Service': service,
                'Carrier': carrier,
                'ETB': etbStr,
                'Open Stacking': openStr,
                'Closing Physic': closeStr,
                'Block': r.block,
                'Slot Range': `${r.block}: ${r.slotStart}-${r.slotEnd}`,
                'Total Slots': slotCount,
                'Est Capacity (TEU)': estTEU,
                'Status': 'PLANNED'
            });
        });
    });

    if (rows.length === 0) {
        alert('No reservation details found.');
        return;
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
        { wch: 5 },  // No
        { wch: 24 }, // Vessel Name
        { wch: 10 }, // Service
        { wch: 10 }, // Carrier
        { wch: 18 }, // ETB
        { wch: 18 }, // Open Stacking
        { wch: 18 }, // Closing Physic
        { wch: 8 },  // Block
        { wch: 18 }, // Slot Range
        { wch: 12 }, // Total Slots
        { wch: 18 }, // Est Capacity (TEU)
        { wch: 12 }  // Status
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Yard Template Plan');

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    const filename = `NPCT1_Yard_Template_Plan_${dateStr}.xlsx`;

    XLSX.writeFile(wb, filename);
}

// ── Zoom / Text Toggle ───────────────────────────────────────────────

function ytZoom(delta) {
    const yardEl = document.querySelector('#ytYardContent .ym-yard');
    if (!yardEl) return;

    if (delta === 0) {
        ytFitToScreen();
    } else {
        if (ytTemplateZoom === null) {
            ytTemplateZoom = parseFloat(getComputedStyle(yardEl).zoom) || 1.0;
        }
        ytTemplateZoom += delta;
        if (ytTemplateZoom < 0.3) ytTemplateZoom = 0.3;
        if (ytTemplateZoom > 2.0) ytTemplateZoom = 2.0;
        yardEl.style.zoom = ytTemplateZoom;
    }
}

function ytFitToScreen() {
    const contentBox = document.getElementById('ytYardContent');
    const yardEl = contentBox?.querySelector('.ym-yard');
    const grid = contentBox?.querySelector('.ym-sections-grid');
    if (contentBox && grid && yardEl) {
        yardEl.style.zoom = 1;
        const contentPadding = 64;
        const availableWidth = contentBox.clientWidth - contentPadding;
        const naturalWidth = grid.scrollWidth;

        if (naturalWidth > 0 && availableWidth > 0) {
            ytTemplateZoom = availableWidth / naturalWidth;
            if (ytTemplateZoom > 1) ytTemplateZoom = 1;
            yardEl.style.zoom = ytTemplateZoom;
        }
    }
}

function ytToggleText() {
    ytTemplateTextHidden = !ytTemplateTextHidden;
    const yardEl = document.querySelector('#ytYardContent .ym-yard');
    const btn = document.getElementById('ytTextToggleBtn');

    if (yardEl) {
        if (ytTemplateTextHidden) {
            yardEl.classList.add('ym-text-hidden');
            if (btn) btn.innerHTML = '<span class="material-symbols-outlined text-[16px]">visibility</span> Show Text';
        } else {
            yardEl.classList.remove('ym-text-hidden');
            if (btn) btn.innerHTML = '<span class="material-symbols-outlined text-[16px]">visibility_off</span> Hide Text';
        }
    }
}

// ── Available Capacity Summary ───────────────────────────────────────

function renderAvailableCapacitySummary() {
    const container = document.getElementById('ytCapacitySummary');
    if (!container) return;
    container.innerHTML = '';
}

// ── Potential Clash Map & Indicator for Selected Vessel ─────────────

function getYardTemplateClashMap() {
    const inv = window.invData || [];
    const scheduleList = window.npct1ScheduleData || [];
    const callList = window.scheduleData || [];
    const SLOT_GAP_THRESHOLD = 5;

    // Helper: collect export slots for a given vessel
    function getVesselExportSlots(vKey, vCarrier, vService, vName, vLine) {
        const slotsByBlock = {};
        const matchingCarriers = new Set([
            (vCarrier || '').toUpperCase().trim(),
            (vLine || '').toUpperCase().trim(),
            (vName || '').toUpperCase().trim()
        ]);

        // 1. Existing export containers
        inv.forEach(it => {
            if (!it.block || !it.slot || !it.move || !it.move.includes('export')) return;
            const blk = (it.block || '').toUpperCase().trim();
            if (isYardClashIgnoredBlock(blk)) return;

            const c = (it.carrier || '').toUpperCase().trim();
            const s = (it.service || '').toUpperCase().trim();
            if (!c) return;

            const isC = matchingCarriers.has(c) || c === vCarrier || isVesselCodeMatch(vName, c);
            const isS = !vService || !s || s === vService;

            if (isC && isS) {
                const slotNum = parseInt(it.slot);
                if (slotNum > 0) {
                    if (!slotsByBlock[blk]) slotsByBlock[blk] = new Set();
                    slotsByBlock[blk].add(slotNum);
                    const is40 = String(it.length || '').startsWith('4');
                    if (is40) slotsByBlock[blk].add(slotNum + 1);
                }
            }
        });

        // 2. Planned reservations
        const myRes = ytReservations[vKey] || [];
        myRes.forEach(r => {
            const blk = (r.block || '').toUpperCase().trim();
            if (isYardClashIgnoredBlock(blk)) return;
            if (!slotsByBlock[blk]) slotsByBlock[blk] = new Set();
            for (let s = r.slotStart; s <= r.slotEnd; s++) {
                slotsByBlock[blk].add(s);
            }
        });

        return slotsByBlock;
    }

    // =========================================================================
    // CASE A: Specific Vessel Selected (Reservation Mode)
    // =========================================================================
    if (ytSelectedVessel) {
        const targetVessel = ytSelectedVessel;
        let targetETB = null;
        let targetETD = null;

        // Opsi A: Check uploaded Call List FIRST (live operational priority)
        if (callList && callList.length) {
            const foundCL = callList.find(s => {
                const cName = (s.carrier || '').toUpperCase().trim();
                const sName = (s.service || '').toUpperCase().trim();
                const tCarrier = (targetVessel.carrier || '').toUpperCase().trim();
                const tService = (targetVessel.service || '').toUpperCase().trim();
                const tName = (targetVessel.vesselName || '').toUpperCase().trim();
                return (cName === tCarrier || isVesselCodeMatch(tName, cName)) && (!tService || !sName || sName === tService);
            });
            if (foundCL && (foundCL.eta || foundCL.etb)) {
                targetETB = new Date(foundCL.eta || foundCL.etb);
                targetETD = foundCL.etd ? new Date(foundCL.etd) : null;
            }
        }

        // Fallback to matchedEntry from active table
        if (!targetETB || isNaN(targetETB)) {
            const matchedEntry = ytVesselScheduleMap.find(v => v.key === targetVessel.key);
            if (matchedEntry && matchedEntry.etb) {
                targetETB = new Date(matchedEntry.etb);
                targetETD = matchedEntry.etd ? new Date(matchedEntry.etd) : null;
            }
        }

        // Fallback to scheduleList (vessel_schedule.json)
        if (!targetETB || isNaN(targetETB)) {
            const foundS = scheduleList.find(s => s.vessel === targetVessel.vesselName || s.service === targetVessel.service);
            if (foundS && foundS.etb) {
                targetETB = new Date(foundS.etb);
                targetETD = foundS.etd ? new Date(foundS.etd) : null;
            }
        }

        if (!targetETB || isNaN(targetETB)) return { target: {}, other: {}, isGlobal: false };
        if (!targetETD || isNaN(targetETD)) targetETD = new Date(targetETB.getTime() + 24 * 3600 * 1000);

        // Find concurrently berthing vessels (Opsi A: Uploaded Call List prioritized)
        const overlappingVessels = [];
        const seenVessels = new Set();
        seenVessels.add(targetVessel.vesselName.toUpperCase().trim());
        if (targetVessel.carrier) seenVessels.add(targetVessel.carrier.toUpperCase().trim());

        // 1. Process uploaded Call List FIRST (live schedule priority)
        callList.forEach(cl => {
            const cName = (cl.carrier || '').toUpperCase().trim();
            if (!cName || seenVessels.has(cName)) return;
            if (cName === (targetVessel.carrier || '').toUpperCase().trim()) return;

            const oETB = cl.eta ? new Date(cl.eta) : (cl.etb ? new Date(cl.etb) : null);
            let oETD = cl.etd ? new Date(cl.etd) : null;
            if (!oETB || isNaN(oETB)) return;
            if (!oETD || isNaN(oETD)) oETD = new Date(oETB.getTime() + 24 * 3600 * 1000);

            if (targetETB < oETD && targetETD > oETB) {
                seenVessels.add(cName);
                const ovStart = new Date(Math.max(targetETB.getTime(), oETB.getTime()));
                const ovEnd = new Date(Math.min(targetETD.getTime(), oETD.getTime()));
                const overlapHrs = Math.max(0, Math.round((ovEnd - ovStart) / 3600000));

                overlappingVessels.push({
                    vesselName: cl.carrier,
                    service: (cl.service || '').toUpperCase().trim(),
                    line: cl.carrier,
                    invCarrier: cl.carrier,
                    key: `${cl.carrier}||${cl.service || ''}`,
                    etb: oETB,
                    etd: oETD,
                    overlapHrs,
                    color: getYardColor(cl.carrier)
                });
            }
        });

        // 2. Process vessel_schedule.json (fallback for any vessel not in callList)
        scheduleList.forEach(sv => {
            const vName = (sv.vessel || '').toUpperCase().trim();
            if (!vName || seenVessels.has(vName)) return;

            let oETB = sv.etb ? new Date(sv.etb) : null;
            let oETD = sv.etd ? new Date(sv.etd) : null;

            // Check if callList has an updated ETA for this vessel/service
            const matchedCL = callList.find(cl => {
                const clCarrier = (cl.carrier || '').toUpperCase().trim();
                const clService = (cl.service || '').toUpperCase().trim();
                return (isVesselCodeMatch(vName, clCarrier) || clCarrier === vName) && (!clService || clService === (sv.service || '').toUpperCase().trim());
            });
            if (matchedCL && (matchedCL.eta || matchedCL.etb)) {
                oETB = new Date(matchedCL.eta || matchedCL.etb);
                if (matchedCL.etd) oETD = new Date(matchedCL.etd);
            }

            if (!oETB || isNaN(oETB)) return;
            if (!oETD || isNaN(oETD)) oETD = new Date(oETB.getTime() + 24 * 3600 * 1000);

            if (targetETB < oETD && targetETD > oETB) {
                seenVessels.add(vName);
                const ovStart = new Date(Math.max(targetETB.getTime(), oETB.getTime()));
                const ovEnd = new Date(Math.min(targetETD.getTime(), oETD.getTime()));
                const overlapHrs = Math.max(0, Math.round((ovEnd - ovStart) / 3600000));
                const invCarrier = matchVesselToCarrierCode(sv.vessel, sv.service, oETB, sv.line);

                overlappingVessels.push({
                    vesselName: sv.vessel,
                    service: (sv.service || '').toUpperCase().trim(),
                    line: (sv.line || '').toUpperCase().trim(),
                    invCarrier: invCarrier,
                    key: `${sv.vessel}||${sv.service || ''}`,
                    etb: oETB,
                    etd: oETD,
                    overlapHrs,
                    color: getYardColor(invCarrier || sv.line || sv.vessel)
                });
            }
        });

        if (!overlappingVessels.length) return { target: {}, other: {}, isGlobal: false };

        const targetSlotsByBlock = getVesselExportSlots(
            targetVessel.key,
            targetVessel.carrier,
            targetVessel.service,
            targetVessel.vesselName,
            targetVessel.carrier
        );

        const otherSlotsByBlock = {};
        overlappingVessels.forEach(ov => {
            const slotsMap = getVesselExportSlots(ov.key, ov.invCarrier, ov.service, ov.vesselName, ov.line);
            Object.entries(slotsMap).forEach(([blk, slotSet]) => {
                if (!otherSlotsByBlock[blk]) otherSlotsByBlock[blk] = [];
                slotSet.forEach(s => {
                    otherSlotsByBlock[blk].push({
                        slot: s,
                        vesselName: ov.vesselName,
                        service: ov.service,
                        color: ov.color,
                        overlapHrs: ov.overlapHrs,
                        etb: ov.etb,
                        etd: ov.etd
                    });
                });
            });
        });

        const clashMapTarget = {};
        const rawClashMapOther = {};

        Object.entries(targetSlotsByBlock).forEach(([blk, targetSlotSet]) => {
            if (isYardClashIgnoredBlock(blk)) return;
            const otherSlotsInBlock = otherSlotsByBlock[blk] || [];
            if (!otherSlotsInBlock.length) return;

            targetSlotSet.forEach(tSlot => {
                otherSlotsInBlock.forEach(oSlot => {
                    const dist = Math.abs(tSlot - oSlot.slot);
                    if (dist <= SLOT_GAP_THRESHOLD) {
                        if (!clashMapTarget[blk]) clashMapTarget[blk] = {};
                        if (!clashMapTarget[blk][tSlot] || dist < clashMapTarget[blk][tSlot].distance) {
                            clashMapTarget[blk][tSlot] = {
                                block: blk,
                                slot: tSlot,
                                distance: dist,
                                otherVessel: oSlot.vesselName,
                                otherService: oSlot.service,
                                otherColor: oSlot.color,
                                otherSlot: oSlot.slot,
                                overlapHrs: oSlot.overlapHrs,
                                otherETB: oSlot.etb,
                                otherETD: oSlot.etd
                            };
                        }

                        if (!rawClashMapOther[blk]) rawClashMapOther[blk] = [];
                        rawClashMapOther[blk].push({
                            block: blk,
                            slot: oSlot.slot,
                            distance: dist,
                            targetVessel: targetVessel.vesselName,
                            targetSlot: tSlot,
                            otherVessel: oSlot.vesselName,
                            overlapHrs: oSlot.overlapHrs,
                            otherETB: oSlot.etb,
                            otherETD: oSlot.etd
                        });
                    }
                });
            });
        });

        // 1. Filter so that for each impacted vessel in that block, ONLY ONE single closest slot is displayed!
        const clashMapOther = {};
        Object.entries(rawClashMapOther).forEach(([blk, candidates]) => {
            const bestByVessel = {};
            candidates.forEach(c => {
                if (!bestByVessel[c.otherVessel] || c.distance < bestByVessel[c.otherVessel].distance) {
                    bestByVessel[c.otherVessel] = c;
                }
            });
            clashMapOther[blk] = {};
            Object.values(bestByVessel).forEach(best => {
                clashMapOther[blk][best.slot] = best;
            });
        });

        return {
            target: clashMapTarget,
            other: clashMapOther,
            isGlobal: false
        };
    }

    // =========================================================================
    // CASE B: Global Mode (!ytSelectedVessel — Not in Reservation Mode)
    // Display all clash indicators across the yard between concurrently berthing vessels
    // =========================================================================
    const globalClashMap = {};
    const allVessels = [];
    const seenGlobalVessels = new Set();

    // 1. Process uploaded Call List FIRST (live priority)
    callList.forEach(cl => {
        const cName = (cl.carrier || '').toUpperCase().trim();
        if (!cName || seenGlobalVessels.has(cName)) return;

        const etb = cl.eta ? new Date(cl.eta) : (cl.etb ? new Date(cl.etb) : null);
        let etd = cl.etd ? new Date(cl.etd) : null;
        if (!etb || isNaN(etb)) return;
        if (!etd || isNaN(etd)) etd = new Date(etb.getTime() + 24 * 3600 * 1000);

        seenGlobalVessels.add(cName);
        allVessels.push({
            vesselName: cl.carrier,
            service: (cl.service || '').toUpperCase().trim(),
            line: cl.carrier,
            invCarrier: cl.carrier,
            key: `${cl.carrier}||${cl.service || ''}`,
            etb: etb,
            etd: etd,
            color: getYardColor(cl.carrier)
        });
    });

    // 2. Process vessel_schedule.json (fallback for vessels not in Call List)
    scheduleList.forEach(sv => {
        const vName = (sv.vessel || '').toUpperCase().trim();
        if (!vName || seenGlobalVessels.has(vName)) return;

        let etb = sv.etb ? new Date(sv.etb) : null;
        let etd = sv.etd ? new Date(sv.etd) : null;

        // Check if Call List has an updated ETA for this vessel
        const matchedCL = callList.find(cl => {
            const clCarrier = (cl.carrier || '').toUpperCase().trim();
            const clService = (cl.service || '').toUpperCase().trim();
            return (isVesselCodeMatch(vName, clCarrier) || clCarrier === vName) && (!clService || clService === (sv.service || '').toUpperCase().trim());
        });
        if (matchedCL && (matchedCL.eta || matchedCL.etb)) {
            etb = new Date(matchedCL.eta || matchedCL.etb);
            if (matchedCL.etd) etd = new Date(matchedCL.etd);
        }

        if (!etb || isNaN(etb)) return;
        if (!etd || isNaN(etd)) etd = new Date(etb.getTime() + 24 * 3600 * 1000);

        seenGlobalVessels.add(vName);
        const invCarrier = matchVesselToCarrierCode(sv.vessel, sv.service, etb, sv.line);
        allVessels.push({
            vesselName: sv.vessel,
            service: (sv.service || '').toUpperCase().trim(),
            line: (sv.line || '').toUpperCase().trim(),
            invCarrier: invCarrier,
            key: `${sv.vessel}||${sv.service || ''}`,
            etb: etb,
            etd: etd,
            color: getYardColor(invCarrier || sv.line || sv.vessel)
        });
    });

    const vesselSlotsList = allVessels.map(v => ({
        vessel: v,
        slotsByBlock: getVesselExportSlots(v.key, v.invCarrier, v.service, v.vesselName, v.line)
    })).filter(item => Object.keys(item.slotsByBlock).length > 0);

    for (let i = 0; i < vesselSlotsList.length; i++) {
        for (let j = i + 1; j < vesselSlotsList.length; j++) {
            const v1 = vesselSlotsList[i].vessel;
            const v2 = vesselSlotsList[j].vessel;

            if (v1.etb < v2.etd && v1.etd > v2.etb) {
                const ovStart = new Date(Math.max(v1.etb.getTime(), v2.etb.getTime()));
                const ovEnd = new Date(Math.min(v1.etd.getTime(), v2.etd.getTime()));
                const overlapHrs = Math.max(0, Math.round((ovEnd - ovStart) / 3600000));

                const b1 = vesselSlotsList[i].slotsByBlock;
                const b2 = vesselSlotsList[j].slotsByBlock;

                Object.keys(b1).forEach(blk => {
                    if (isYardClashIgnoredBlock(blk) || !b2[blk]) return;

                    const slots1 = Array.from(b1[blk]);
                    const slots2 = Array.from(b2[blk]);

                    slots1.forEach(s1 => {
                        slots2.forEach(s2 => {
                            const dist = Math.abs(s1 - s2);
                            if (dist <= SLOT_GAP_THRESHOLD) {
                                if (!globalClashMap[blk]) globalClashMap[blk] = {};

                                if (!globalClashMap[blk][s1] || dist < globalClashMap[blk][s1].distance) {
                                    globalClashMap[blk][s1] = {
                                        block: blk,
                                        slot: s1,
                                        distance: dist,
                                        targetVessel: v1.vesselName,
                                        otherVessel: v2.vesselName,
                                        otherService: v2.service,
                                        otherSlot: s2,
                                        overlapHrs
                                    };
                                }

                                if (!globalClashMap[blk][s2] || dist < globalClashMap[blk][s2].distance) {
                                    globalClashMap[blk][s2] = {
                                        block: blk,
                                        slot: s2,
                                        distance: dist,
                                        targetVessel: v2.vesselName,
                                        otherVessel: v1.vesselName,
                                        otherService: v1.service,
                                        otherSlot: s1,
                                        overlapHrs
                                    };
                                }
                            }
                        });
                    });
                });
            }
        }
    }

    return {
        target: globalClashMap,
        other: {},
        isGlobal: true
    };
}

function renderYardTemplateClashes() {
    const container = document.getElementById('ytClashContent');
    if (!container) return;

    const clashData = getYardTemplateClashMap();
    const clashMap = clashData.target || {};
    let totalClashSlots = 0;
    const blockClashSummaries = {};

    Object.entries(clashMap).forEach(([blk, slotObj]) => {
        Object.values(slotObj).forEach(c => {
            totalClashSlots++;
            if (!blockClashSummaries[blk]) blockClashSummaries[blk] = [];
            blockClashSummaries[blk].push(c);
        });
    });

    const blockList = Object.keys(blockClashSummaries).sort();

    // If 0 clashes detected
    if (totalClashSlots === 0) {
        container.innerHTML = `
            <div class="flex items-center justify-between gap-3 text-xs py-0.5">
                <div class="flex items-center gap-2 text-emerald-800 font-semibold">
                    <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>${ytSelectedVessel ? `All slots for <strong>${ytSelectedVessel.vesselName}</strong> are safe` : 'Yard is clear'} · No concurrent berthing conflicts (gap > 5 slots)</span>
                </div>
                <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <span class="material-symbols-outlined text-[13px]">verified</span> 0 Clashes
                </span>
            </div>`;
        return;
    }

    // Build compact chips
    const chipsHtml = blockList.map(blk => {
        const list = blockClashSummaries[blk];
        const minDist = Math.min(...list.map(x => x.distance));
        
        // Group by otherVessel to show vessel name + its ETB
        const vesselInfos = [];
        const seenV = new Set();
        list.forEach(x => {
            if (!seenV.has(x.otherVessel)) {
                seenV.add(x.otherVessel);
                const etbStr = formatClashTime(x.otherETB);
                vesselInfos.push(etbStr ? `${x.otherVessel} (ETB: ${etbStr})` : x.otherVessel);
            }
        });
        const otherDesc = vesselInfos.join(', ');

        return `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-white border border-amber-300 shadow-sm text-slate-700 hover:border-red-400 transition-colors">
            <span class="text-red-600 font-black text-[11px]">▲</span>
            <strong class="font-bold text-slate-900">${blk}</strong>
            <span class="text-slate-300">|</span>
            <span class="text-slate-700">vs <strong>${otherDesc}</strong></span>
            <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold">gap: ${minDist}s</span>
        </span>`;
    }).join(' ');

    container.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div class="flex items-center gap-2 flex-wrap">
                <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-red-100 text-red-700 border border-red-200/80 shadow-sm shrink-0">
                    <span class="text-red-600 font-black">▲</span>
                    <span>${totalClashSlots} Potential Clash Point${totalClashSlots > 1 ? 's' : ''}</span>
                </span>
                <div class="flex items-center gap-1.5 flex-wrap">
                    ${chipsHtml}
                </div>
            </div>
            <div class="text-[11px] text-slate-400 font-mono shrink-0 ml-auto flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                <span>Rule: <strong>≤ 5 slots</strong></span>
            </div>
        </div>`;
}

// ── Operational Vessels (Berthed & Upcoming ≤ 4h) ────────────────────

function isVesselCodeMatch(vesselName, code) {
    if (!vesselName || !code) return false;
    const v = String(vesselName).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const c = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (v === c) return true;
    if (v.includes(c) || c.includes(v)) return true;
    if (c.length >= 3 && v.startsWith(c.substring(0, 3))) return true;

    // Word prefix matching: 'EVER BEFIT' -> 'EV' + 'BE' -> 'EVBE' matches 'EVBIT'
    const words = String(vesselName).toUpperCase().split(/\s+/).filter(w => w.length > 0);
    if (words.length >= 2) {
        const p1 = words[0].substring(0, 2) + words[1].substring(0, 2);
        const p2 = words[0].substring(0, 2) + words[1].substring(0, 3);
        if (c.startsWith(p1) || c.startsWith(p2) || p1.startsWith(c.substring(0, 3))) return true;
    }
    return false;
}

function matchVesselToCarrierCode(vesselName, service, etb, line) {
    const svService = String(service || '').toUpperCase().trim();
    const svVessel = String(vesselName || '').toUpperCase().trim();
    const svLine = String(line || '').toUpperCase().trim();
    const svEtb = etb ? new Date(etb) : null;

    const callListSchedule = window.scheduleData || [];
    const inv = window.invData || [];

    let matchedCarrier = null;

    // Step A: Check callListSchedule (window.scheduleData) for matching service and ETB proximity (±2.5 days)
    if (svEtb && !isNaN(svEtb) && callListSchedule.length && svService) {
        let bestDiff = Infinity;
        callListSchedule.forEach(cl => {
            const clSvc = String(cl.service || '').toUpperCase().trim();
            const clCarrier = String(cl.carrier || '').toUpperCase().trim();
            if (clSvc === svService && cl.eta) {
                const clEta = new Date(cl.eta);
                if (!isNaN(clEta)) {
                    const diffDays = Math.abs(clEta - svEtb) / (1000 * 60 * 60 * 24);
                    if (diffDays <= 2.5 && diffDays < bestDiff) {
                        bestDiff = diffDays;
                        matchedCarrier = clCarrier;
                    }
                }
            }
        });
    }

    // Step B: Check invData (Unit List) export carriers for this service
    if (!matchedCarrier && inv.length && svService) {
        const invCarriersForService = new Set();
        inv.forEach(it => {
            if (!it.move || !it.move.includes('export')) return;
            const c = (it.carrier || '').toUpperCase().trim();
            const s = (it.service || '').toUpperCase().trim();
            if (s === svService && c && c !== '0' && c !== 'NIL' && c !== 'UNKNOWN') {
                invCarriersForService.add(c);
            }
        });

        const possibleCarriers = Array.from(invCarriersForService);
        if (possibleCarriers.length === 1) {
            matchedCarrier = possibleCarriers[0];
        } else if (possibleCarriers.length > 1) {
            const normVessel = svVessel.replace(/[^A-Z0-9]/g, '');
            for (const cand of possibleCarriers) {
                const normCand = cand.replace(/[^A-Z0-9]/g, '');
                if (normVessel.includes(normCand) || normCand.includes(normVessel.substring(0, 4)) || isVesselCodeMatch(svVessel, cand)) {
                    matchedCarrier = cand;
                    break;
                }
            }
            if (!matchedCarrier) {
                matchedCarrier = possibleCarriers.find(c => svLine && (c === svLine || c.includes(svLine))) || possibleCarriers[0];
            }
        }
    }

    // Step C: If still not found, check all carriers in invData with fuzzy vessel match
    if (!matchedCarrier && inv.length) {
        const allCarriers = new Set(inv.map(it => (it.carrier || '').toUpperCase().trim()).filter(Boolean));
        for (const cand of allCarriers) {
            if (isVesselCodeMatch(svVessel, cand) || (svLine && (cand === svLine || cand.includes(svLine)))) {
                matchedCarrier = cand;
                break;
            }
        }
    }

    return matchedCarrier || svLine || svVessel;
}

function isCarrierMatchVessel(carrier, vObj) {
    if (!carrier || !vObj) return false;
    const c = String(carrier).toUpperCase().trim();
    if (vObj.matchingCarriers && vObj.matchingCarriers.has(c)) return true;

    const invC = String(vObj.invCarrier || '').toUpperCase().trim();
    const line = String(vObj.line || '').toUpperCase().trim();
    const vName = String(vObj.vessel || '').toUpperCase().trim();

    if (c === invC || c === line || c === vName) return true;
    if (invC && (c.includes(invC) || invC.includes(c))) return true;
    if (isVesselCodeMatch(vName, c)) return true;
    if (line && (c.includes(line) || line.includes(c))) return true;
    return false;
}

function getOperationalVessels() {
    const schedule = (window.npct1ScheduleData && window.npct1ScheduleData.length) 
                     ? window.npct1ScheduleData 
                     : (window.scheduleData || []);
    const inv = window.invData || [];
    const now = new Date();

    const berthed = [];
    const upcoming = [];
    const seenBerthed = new Set();
    const seenUpcoming = new Set();

    schedule.forEach(v => {
        const vName = (v.vessel || v.carrier || '').trim();
        if (!vName) return;

        const etb = v.etb ? new Date(v.etb) : (v.eta ? new Date(v.eta) : null);
        let etd = v.etd ? new Date(v.etd) : null;
        if (!etb || isNaN(etb)) return;
        if (!etd || isNaN(etd)) etd = new Date(etb.getTime() + 24 * 3600 * 1000);

        const svService = (v.service || '').toUpperCase().trim();
        const line = (v.line || v.carrier || vName).toUpperCase().trim();
        const invCarrier = matchVesselToCarrierCode(vName, svService, etb, line);

        const matchingCarriers = new Set([
            invCarrier.toUpperCase(),
            line.toUpperCase(),
            vName.toUpperCase()
        ]);

        // Calculate box count in yard for this vessel using mapped carrier code & service
        let boxCount = 0;
        inv.forEach(it => {
            if (!it.move || !it.move.includes('export')) return;
            const c = (it.carrier || '').toUpperCase().trim();
            const s = (it.service || '').toUpperCase().trim();
            if (!c) return;

            const isCarrierMatch = matchingCarriers.has(c) || c === invCarrier || c === line || isVesselCodeMatch(vName, c);
            const isServiceMatch = !svService || !s || s === svService;

            if (isCarrierMatch && isServiceMatch) {
                boxCount++;
            }
        });

        const color = getYardColor(invCarrier || line);
        const key = `${vName.toUpperCase()}||${svService}`;

        const item = {
            key,
            vessel: vName,
            service: svService || '—',
            line: line,
            invCarrier: invCarrier,
            matchingCarriers: matchingCarriers,
            etb: etb,
            etd: etd,
            color: color,
            boxCount: boxCount
        };

        // 1. Currently Berthed: ETB has passed, but ETD has not passed yet
        if (etb <= now && now < etd) {
            if (!seenBerthed.has(key)) {
                seenBerthed.add(key);
                berthed.push(item);
            }
        }
        // 2. Upcoming (within 4 hours): ETB is in future and <= 4 hours from now
        else if (etb > now && (etb.getTime() - now.getTime()) <= 4 * 3600 * 1000) {
            if (!seenUpcoming.has(key)) {
                seenUpcoming.add(key);
                upcoming.push(item);
            }
        }
    });

    // Sort berthed by ETD (soonest departing first)
    berthed.sort((a, b) => a.etd - b.etd);
    // Sort upcoming by ETB (soonest arriving first)
    upcoming.sort((a, b) => a.etb - b.etb);

    return { berthed, upcoming };
}

function ytToggleBerthedVessels() {
    ytShowBerthed = !ytShowBerthed;
    renderOperationalVessels();
    renderYardTemplate();
}

function ytToggleUpcomingVessels() {
    ytShowUpcoming = !ytShowUpcoming;
    renderOperationalVessels();
    renderYardTemplate();
}

function renderOperationalVessels() {
    const container = document.getElementById('ytOperationalContent');
    const berthedBtn = document.getElementById('ytToggleBerthedBtn');
    const upcomingBtn = document.getElementById('ytToggleUpcomingBtn');
    const berthedBadge = document.getElementById('ytBerthedCountBadge');
    const upcomingBadge = document.getElementById('ytUpcomingCountBadge');
    const berthedDot = document.getElementById('ytBerthedIndicatorDot');
    const upcomingDot = document.getElementById('ytUpcomingIndicatorDot');

    const { berthed, upcoming } = getOperationalVessels();

    if (berthedBadge) berthedBadge.textContent = berthed.length;
    if (upcomingBadge) upcomingBadge.textContent = upcoming.length;

    // Update button states
    if (berthedBtn) {
        if (ytShowBerthed) {
            berthedBtn.className = 'px-2.5 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 bg-sky-100 text-sky-800 border border-sky-300 shadow-sm';
            if (berthedDot) berthedDot.className = 'w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse';
        } else {
            berthedBtn.className = 'px-2.5 py-1 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 bg-white/80 text-slate-600 border border-slate-200 shadow-sm hover:border-sky-400 hover:text-sky-700';
            if (berthedDot) berthedDot.className = 'w-1.5 h-1.5 rounded-full bg-slate-300';
        }
    }

    if (upcomingBtn) {
        if (ytShowUpcoming) {
            upcomingBtn.className = 'px-2.5 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 bg-amber-100 text-amber-800 border border-amber-300 shadow-sm';
            if (upcomingDot) upcomingDot.className = 'w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse';
        } else {
            upcomingBtn.className = 'px-2.5 py-1 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 bg-white/80 text-slate-600 border border-slate-200 shadow-sm hover:border-amber-400 hover:text-amber-700';
            if (upcomingDot) upcomingDot.className = 'w-1.5 h-1.5 rounded-full bg-slate-300';
        }
    }

    if (!container) return;

    const now = new Date();

    const formatTime = (d) => {
        if (!d || isNaN(d)) return '—';
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        return `${dd}/${mm} ${hh}:${mi}`;
    };

    const formatRemaining = (targetDate, prefix) => {
        const diffMs = targetDate.getTime() - now.getTime();
        if (diffMs <= 0) return 'overdue';
        const hrs = Math.floor(diffMs / (3600 * 1000));
        const mins = Math.floor((diffMs % (3600 * 1000)) / (60 * 1000));
        return `${prefix} in ${hrs > 0 ? hrs + 'h ' : ''}${mins}m`;
    };

    const renderMiniTile = (v, isBerthed) => {
        const activeHighlight = isBerthed ? ytShowBerthed : ytShowUpcoming;
        const borderColor = activeHighlight 
            ? (isBerthed ? 'border-sky-300 bg-sky-50/90 shadow-sm' : 'border-amber-300 bg-amber-50/90 shadow-sm')
            : 'border-slate-200/80 bg-white/90 shadow-sm hover:border-slate-300';
        const timeLabel = isBerthed ? formatRemaining(v.etd, 'Departs') : formatRemaining(v.etb, 'Arrives');
        const dtLabel = isBerthed ? `ETD: ${formatTime(v.etd)}` : `ETB: ${formatTime(v.etb)}`;
        const timeColor = isBerthed ? 'text-sky-800' : 'text-amber-800';

        return `
            <div class="p-2 sm:px-2.5 rounded-xl border ${borderColor} flex items-center justify-between gap-2 text-xs transition-all">
                <div class="flex items-center gap-2 min-w-0">
                    <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${v.color}"></span>
                    <div class="min-w-0">
                        <div class="flex items-center gap-1.5">
                            <span class="font-bold text-slate-800 truncate text-[11px]" title="${v.vessel}">${v.vessel}</span>
                            <span class="px-1 py-0.2 rounded text-[9px] font-bold bg-slate-100 text-slate-600 font-mono">${v.service}</span>
                        </div>
                        <div class="text-[10px] text-slate-400 font-mono">
                            Code: <strong class="text-slate-600">${v.invCarrier}</strong>
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-2 shrink-0 text-right">
                    <div class="text-right leading-tight">
                        <div class="text-[10px] font-mono font-bold ${timeColor}">${timeLabel}</div>
                        <div class="text-[9px] text-slate-400 font-mono">${dtLabel}</div>
                    </div>
                    <div class="px-1.5 py-0.5 rounded-md ${v.boxCount > 0 ? (isBerthed ? 'bg-sky-100 text-sky-900 font-black' : 'bg-amber-100 text-amber-900 font-black') : 'bg-slate-100 text-slate-400 font-bold'} text-[10px] min-w-[45px] text-center font-mono">
                        ${v.boxCount} bx
                    </div>
                </div>
            </div>`;
    };

    const berthedTiles = berthed.map(v => renderMiniTile(v, true)).join('');
    const upcomingTiles = upcoming.map(v => renderMiniTile(v, false)).join('');

    if (berthed.length === 0 && upcoming.length === 0) {
        container.innerHTML = `<div class="text-center text-slate-400 text-xs italic py-1">No vessels currently berthed or upcoming within 4 hours.</div>`;
        return;
    }

    let innerHtml = '';
    if (berthed.length > 0) {
        innerHtml += `
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                ${berthedTiles}
            </div>`;
    }

    if (upcoming.length > 0) {
        innerHtml += `
            <div class="${berthed.length > 0 ? 'mt-2 pt-2 border-t border-slate-200/50' : ''}">
                <div class="text-[10px] font-bold text-amber-800 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    <span>Upcoming Vessels ≤ 4 Hours (${upcoming.length})</span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    ${upcomingTiles}
                </div>
            </div>`;
    }

    container.innerHTML = innerHtml;
}

// ── Master Render ────────────────────────────────────────────────────

function renderYardTemplateTab() {
    renderActiveVesselTable();
    renderYardTemplate();
    renderReservationSummary();
    renderAvailableCapacitySummary();
    renderOperationalVessels();
    renderYardTemplateClashes();
}
