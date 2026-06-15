// --- OPS TRAFFIC LOGIC ---
const CIC_API_URL = "https://script.google.com/macros/s/AKfycbwPvTYdVht9t6jRZ7_tg8NG58Y6hrBNyqxxemNfdLyvwstnBdWPFGPhp7tQZmqaG-h-/exec";
window.cicHandledUnits = new Set();
window.currentCicUnits = [];

function maskContainer(unit) {
    if (!unit || unit.length < 8) return unit;
    return unit.substring(0, 3) + 'xxxx' + unit.substring(unit.length - 3);
}

function getOperationalDetails() {
    const d = new Date();
    const hour = d.getHours();
    const min = d.getMinutes();
    const timeStr = hour + min / 60;
    
    let shift = "";
    let opDate = new Date(d);
    
    if (timeStr >= 7 && timeStr < 15.5) {
        shift = "Shift 1";
    } else if (timeStr >= 15.5 && timeStr < 23) {
        shift = "Shift 2";
    } else {
        shift = "Shift 3";
        if (timeStr < 7) {
            opDate.setDate(opDate.getDate() - 1);
        }
    }
    const m = opDate.getMonth() + 1;
    const day = opDate.getDate();
    const dateString = opDate.getFullYear() + '-' + (m < 10 ? '0'+m : m) + '-' + (day < 10 ? '0'+day : day);
    
    return { shift, date: dateString };
}

async function fetchHandledCICs() {
    try {
        const { date } = getOperationalDetails();
        const res = await fetch(`${CIC_API_URL}?action=get&date=${date}`);
        const data = await res.json();
        if (data && data.success) {
            window.cicHandledUnits = new Set(data.units);
            analyzeTraffic(); // re-analyze if data is already parsed
        }
    } catch (e) {
        console.error("Failed to fetch handled CICs", e);
    }
}
fetchHandledCICs();


function analyzeTraffic() {
    const rawData = document.getElementById('trafficInput').value.trim();
    if (!rawData) {
        clearTrafficInput();
        return;
    }

    const lines = rawData.split('\n').filter(l => l.trim() !== '');
    if (lines.length < 2) return;

    const headers = lines[0].split('\t').map(h => h.trim().toLowerCase());
    
    // Find required column indices with fallback check
    let unitIdx = headers.indexOf('unit');
    if (unitIdx === -1) unitIdx = headers.indexOf('container');
    if (unitIdx === -1) unitIdx = headers.findIndex(h => h.includes('unit no') || h.includes('container no'));
    if (unitIdx === -1) unitIdx = headers.findIndex(h => h.includes('unit') || h.includes('cntr'));

    let carrierTypeIdx = headers.indexOf('carrier type');
    if (carrierTypeIdx === -1) carrierTypeIdx = headers.findIndex(h => h.includes('carrier') && h.includes('type'));

    let typeIdx = headers.indexOf('type');
    if (typeIdx === -1) typeIdx = headers.indexOf('move type');
    if (typeIdx === -1) typeIdx = headers.findIndex(h => h === 'type' || h === 'move type');

    let durationIdx = headers.indexOf('duration');
    if (durationIdx === -1) durationIdx = headers.indexOf('trt');
    if (durationIdx === -1) durationIdx = headers.findIndex(h => h.includes('duration') || h.includes('trt') || h.includes('time'));

    let izIdx = headers.indexOf('iz');
    if (izIdx === -1) izIdx = headers.indexOf('slot');
    if (izIdx === -1) izIdx = headers.findIndex(h => h.includes('iz slot') || h === 'iz');

    let tr1Idx = headers.indexOf('tr. 1');
    if (tr1Idx === -1) tr1Idx = headers.indexOf('tr1');
    if (tr1Idx === -1) tr1Idx = headers.findIndex(h => h.includes('tr. 1') || h.includes('tr 1'));

    let gcIdx = headers.indexOf('gantry crane');
    if (gcIdx === -1) gcIdx = headers.findIndex(h => h.includes('gantry') && h.includes('crane'));
    if (gcIdx === -1) gcIdx = headers.findIndex(h => h.includes('gantry'));
    if (gcIdx === -1) gcIdx = headers.indexOf('gc');
    if (gcIdx === -1) gcIdx = headers.indexOf('crane');

    let statusIdx = headers.indexOf('status');
    if (statusIdx === -1) statusIdx = headers.indexOf('state');
    if (statusIdx === -1) statusIdx = headers.findIndex(h => h.includes('status') || h.includes('state'));

    let currOpsIdx = headers.indexOf('current operation');
    if (currOpsIdx === -1) currOpsIdx = headers.findIndex(h => h.includes('current') && h.includes('operation'));
    if (currOpsIdx === -1) currOpsIdx = headers.findIndex(h => h.includes('curr') && h.includes('operation'));
    if (currOpsIdx === -1) currOpsIdx = headers.findIndex(h => h.includes('operation') && !h.includes('restow'));

    let carrierColIdx = headers.indexOf('carrier');
    if (carrierColIdx === -1) carrierColIdx = headers.indexOf('vessel');
    if (carrierColIdx === -1) carrierColIdx = headers.findIndex(h => h.includes('carrier') || h.includes('vessel'));

    if (unitIdx === -1 || carrierTypeIdx === -1 || typeIdx === -1) {
        console.warn("Traffic Data: Missing required columns (Unit, Carrier type, Type)");
        return;
    }

    let exportCount = 0; let exportTrt = 0;
    let importCount = 0; let importTrt = 0;
    let cicCount = 0; let cicTrt = 0;

    let exportItems = [];
    let importItems = [];
    let cicItems = [];
    window.currentCicUnits = [];
    
    let rtgSet = new Set();
    let pmSet = new Set();
    let vesselOpsMap = {};

    for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split('\t');
        if (row.length < 3) continue; // Skip empty or invalid rows

        const unit = (row[unitIdx] || '').trim().toUpperCase();
        const carrierType = (row[carrierTypeIdx] || '').trim().toUpperCase();
        const type = (row[typeIdx] || '').trim();
        const durationStr = durationIdx !== -1 ? (row[durationIdx] || '').trim() : '0';
        const izStr = izIdx !== -1 ? (row[izIdx] || '').trim() : '-';
        let durationMin = 0;
        
        // RTG and PM logic
        if (tr1Idx !== -1) {
            const tr1 = (row[tr1Idx] || '').trim();
            const tr1Upper = tr1.toUpperCase();
            if (tr1Upper.startsWith('6')) {
                rtgSet.add(tr1);
            } else if (tr1Upper.startsWith('PM')) {
                pmSet.add(tr1);
            }
        }
        
        // Vessel Ops logic
        const gc = gcIdx !== -1 ? (row[gcIdx] || '').trim() : '';
        const status = statusIdx !== -1 ? (row[statusIdx] || '').trim() : '';
        const currOps = currOpsIdx !== -1 ? (row[currOpsIdx] || '').trim() : '';
        const carrier = carrierColIdx !== -1 ? (row[carrierColIdx] || '').trim() : '';

        // If it's a VS (Vessel) carrier type and status is active (or if status column is missing but gc is present)
        if (carrierType === 'VS' && gc !== '') {
            if (statusIdx === -1 || status.toLowerCase() === 'active') {
                if (!vesselOpsMap[carrier]) vesselOpsMap[carrier] = new Map();
                const existingOps = vesselOpsMap[carrier].get(gc);
                if (!existingOps || existingOps.trim() === '') {
                    vesselOpsMap[carrier].set(gc, currOps);
                }
            }
        }
        
        if (durationStr) {
            if (durationStr.includes(':')) {
                const parts = durationStr.split(':').map(Number);
                if (parts.length >= 2) durationMin = (parts[0] * 60) + parts[1];
            } else {
                durationMin = parseFloat(durationStr) || 0;
            }
        }

        // 1. Only process Carrier type "TR"
        if (carrierType !== 'TR') continue;

        // 2. Check if CIC
        let isCic = false;
        if (window.invData && window.invData.length > 0) {
            const found = window.invData.find(item => item.unit === unit);
            if (found) {
                let svc = (found.service || "").toUpperCase();
                let gds = (found.goods || "").toUpperCase();
                if (svc.includes('CIC') || (svc.includes('TAMS') && gds.includes('CIC'))) {
                    isCic = true;
                }
            }
        }

        if (isCic) {
            // Track all incoming CIC units
            window.currentCicUnits.push(unit);
            
            // Only add to active CIC list if not handled yet
            if (!window.cicHandledUnits.has(maskContainer(unit))) {
                cicCount++;
                cicTrt += durationMin;
                cicItems.push({ unit, durationMin, iz: izStr });
            }
        } else {
            // 3. Import or Export
            if (type.toLowerCase() === 'in') {
                exportCount++;
                exportTrt += durationMin;
                exportItems.push({ unit, durationMin, iz: izStr });
            } else if (type.toLowerCase() === 'out') {
                importCount++;
                importTrt += durationMin;
                importItems.push({ unit, durationMin, iz: izStr });
            }
        }
    }

    const formatTrt = (minutes) => {
        if (isNaN(minutes) || minutes === 0) return '0m';
        const totalMin = Math.round(minutes);
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    };

    const avgExportTrt = exportCount > 0 ? exportTrt / exportCount : 0;
    const avgImportTrt = importCount > 0 ? importTrt / importCount : 0;
    const avgCicTrt = cicCount > 0 ? cicTrt / cicCount : 0;
    
    // Overall TRT should include all active trucks + handled CIC from this batch if desired.
    // For simplicity, overall TRT is based on active Export + Import + Active CIC
    const totalTrucks = exportCount + importCount + cicCount;
    const totalTrtMins = exportTrt + importTrt + cicTrt;
    const avgTotalTrt = totalTrucks > 0 ? totalTrtMins / totalTrucks : 0;

    // Update UI Cards
    const safeSetText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    safeSetText('trafficExportCount', exportCount);
    safeSetText('trafficImportCount', importCount);
    safeSetText('trafficCicCount', cicCount);
    
    safeSetText('trafficExportTrt', formatTrt(avgExportTrt));
    safeSetText('trafficImportTrt', formatTrt(avgImportTrt));
    safeSetText('trafficCicTrt', formatTrt(avgCicTrt));

    safeSetText('trafficTotalCount', totalTrucks);
    safeSetText('trafficTotalTrt', formatTrt(avgTotalTrt));
    safeSetText('trafficActiveRtg', rtgSet.size);
    safeSetText('trafficActivePm', pmSet.size);
    
    // Render Vessel Ops
    const vesselOpsEl = document.getElementById('trafficVesselOpsList');
    if (vesselOpsEl) {
        if (Object.keys(vesselOpsMap).length === 0) {
            vesselOpsEl.innerHTML = `<div class="text-center text-sky-600/40 text-xs italic py-2 w-full">No active vessel ops</div>`;
        } else {
            let html = '';
            for (const [carrier, ops] of Object.entries(vesselOpsMap)) {
                if (!carrier) continue;
                html += `
                    <div class="border border-sky-100 rounded-lg overflow-hidden bg-white/50 min-w-[180px] shrink-0">
                        <div class="bg-sky-100/50 px-2 py-1.5 border-b border-sky-100 font-bold text-sky-800 text-[11px] uppercase tracking-wider flex items-center gap-1">
                            <span class="material-symbols-outlined text-[14px]">directions_boat</span>
                            <span class="truncate">${carrier}</span>
                        </div>
                        <div class="p-1.5 space-y-1">
                `;
                
                const sortedOps = Array.from(ops.entries()).sort((a, b) => a[0].localeCompare(b[0]));
                sortedOps.forEach(([gc, rawOps]) => {
                    let displayOps = 'Active';
                    let opColor = 'bg-slate-100 text-slate-600';
                    
                    if (rawOps) {
                        const lower = rawOps.toLowerCase();
                        if (lower.includes('disch')) {
                            displayOps = 'Discharge';
                            opColor = 'bg-emerald-100 text-emerald-700';
                        } else if (lower.includes('load')) {
                            displayOps = 'Loading';
                            opColor = 'bg-blue-100 text-blue-700';
                        } else {
                            displayOps = rawOps.charAt(0).toUpperCase() + rawOps.slice(1).toLowerCase();
                        }
                    }
                    
                    html += `
                        <div class="flex items-center justify-between text-xs px-1">
                            <span class="font-mono font-bold text-slate-700">${gc}</span>
                            <span class="text-[10px] px-1.5 py-0.5 rounded font-semibold ${opColor}">${displayOps}</span>
                        </div>
                    `;
                });
                
                html += `
                        </div>
                    </div>
                `;
            }
            vesselOpsEl.innerHTML = html;
        }
    }
    
    // Sort and render Top 10 lists
    exportItems.sort((a, b) => b.durationMin - a.durationMin);
    importItems.sort((a, b) => b.durationMin - a.durationMin);
    cicItems.sort((a, b) => b.durationMin - a.durationMin);

    const renderList = (items, elementId, colorClass, isCic = false) => {
        const el = document.getElementById(elementId);
        if (!el) return;
        
        if (items.length === 0) {
            el.innerHTML = `<div class="text-center text-${colorClass}-600/40 text-xs italic py-2">No data</div>`;
            return;
        }

        const top10 = items.slice(0, 10);
        el.innerHTML = top10.map((item, idx) => {
            const slotHtml = item.iz && item.iz !== '-' 
                ? `<span class="text-[10px] bg-slate-100 text-slate-500 px-1 py-0.5 rounded ml-1 border border-slate-200">${item.iz}</span>` 
                : '';
                
            if (isCic) {
                return `
                    <label class="flex items-center gap-2 cursor-pointer group py-1 border-b border-${colorClass}-100/30 last:border-0 hover:bg-purple-100/30 rounded px-1 -mx-1 transition-colors">
                        <span class="w-4 font-bold text-${colorClass}-700/50 text-xs">${idx + 1}.</span>
                        <input type="checkbox" class="rounded text-${colorClass}-600 focus:ring-${colorClass}-500 w-4 h-4 cursor-pointer" onchange="toggleCicHandled('${item.unit}', this.checked)">
                        <span id="cic-label-${item.unit}" class="flex-1 font-mono font-medium text-slate-700 group-hover:text-${colorClass}-700 transition-colors">
                            ${item.unit}${slotHtml}
                        </span>
                        <span id="cic-time-${item.unit}" class="font-bold text-red-500 transition-colors">${formatTrt(item.durationMin)}</span>
                    </label>
                `;
            } else {
                return `
                    <div class="flex items-center gap-2 py-1 border-b border-${colorClass}-100/30 last:border-0">
                        <span class="w-4 font-bold text-${colorClass}-700/50 text-xs">${idx + 1}.</span>
                        <span class="flex-1 font-mono font-medium text-slate-700">
                            ${item.unit}${slotHtml}
                        </span>
                        <span class="font-bold text-red-500">${formatTrt(item.durationMin)}</span>
                    </div>
                `;
            }
        }).join('');
    };

    renderList(exportItems, 'trafficExportList', 'emerald');
    renderList(importItems, 'trafficImportList', 'blue');
    renderList(cicItems, 'trafficCicList', 'purple', true);

    // Set Timestamp
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    safeSetText('trafficLastUpdated', `${dateStr} ${timeStr}`);
}

function clearTrafficInput() {
    const input = document.getElementById('trafficInput');
    if (input) input.value = '';
    
    const ids = ['trafficExportCount', 'trafficImportCount', 'trafficCicCount', 'trafficTotalCount'];
    const trtIds = ['trafficExportTrt', 'trafficImportTrt', 'trafficCicTrt', 'trafficTotalTrt'];
    
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '0';
    });
    
    trtIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '0m';
    });
    
    const lastUpdated = document.getElementById('trafficLastUpdated');
    if (lastUpdated) lastUpdated.textContent = '-';
    
    document.getElementById('trafficExportList').innerHTML = '<div class="text-center text-emerald-600/40 text-xs italic py-2">No data</div>';
    document.getElementById('trafficImportList').innerHTML = '<div class="text-center text-blue-600/40 text-xs italic py-2">No data</div>';
    document.getElementById('trafficCicList').innerHTML = '<div class="text-center text-purple-600/40 text-xs italic py-2">No data</div>';
    
    const vesselOpsEl = document.getElementById('trafficVesselOpsList');
    if (vesselOpsEl) vesselOpsEl.innerHTML = '<div class="text-center text-sky-600/40 text-xs italic py-2">No active vessel ops</div>';
    
    document.getElementById('trafficActiveRtg').textContent = '0';
    const activePmEl = document.getElementById('trafficActivePm');
    if (activePmEl) activePmEl.textContent = '0';
    window.currentCicUnits = [];
}

function toggleCicHandled(unit, checked) {
    const maskedUnit = maskContainer(unit);
    if (checked) {
        window.cicHandledUnits.add(maskedUnit);
    } else {
        window.cicHandledUnits.delete(maskedUnit);
    }
    
    // Re-render the UI smoothly by re-analyzing the currently pasted text
    // Because checking it should completely remove it from the list and update averages
    analyzeTraffic();
    
    // Sync with Google Sheets
    const { date, shift } = getOperationalDetails();
    fetch(`${CIC_API_URL}?action=toggle&date=${date}&shift=${encodeURIComponent(shift)}&unit=${encodeURIComponent(maskedUnit)}&checked=${checked}`)
        .catch(e => console.error("Failed to sync CIC handled", e));
}

async function showCicRecapModal() {
    const modal = document.getElementById('cicRecapModal');
    const content = document.getElementById('cicRecapContent');
    const dateEl = document.getElementById('cicRecapDate');
    const totalEl = document.getElementById('cicRecapTotal');
    
    if (!modal || !content) return;
    
    modal.classList.remove('hidden');
    // small delay for transition
    setTimeout(() => {
        modal.classList.remove('opacity-0', 'pointer-events-none');
        document.getElementById('cicRecapModalInner').classList.remove('scale-95');
    }, 10);
    
    const { date } = getOperationalDetails();
    
    const parsedDate = new Date(date);
    const dateStr = parsedDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    
    dateEl.innerHTML = `Last updated: <span class="text-purple-600">${dateStr} ${timeStr}</span>`;
    
    content.innerHTML = `
        <div class="flex justify-center py-6 text-purple-400">
            <span class="material-symbols-outlined animate-spin text-3xl">refresh</span>
        </div>
    `;
    totalEl.textContent = '-';
    
    try {
        const res = await fetch(`${CIC_API_URL}?action=get&date=${date}`);
        const data = await res.json();
        if (data && data.success) {
            const shifts = data.shifts || {};
            const s1 = shifts['Shift 1'] || 0;
            const s2 = shifts['Shift 2'] || 0;
            const s3 = shifts['Shift 3'] || 0;
            const total = s1 + s2 + s3;
            
            content.innerHTML = `
                <div class="flex justify-between items-center py-2 px-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span class="text-sm font-bold text-slate-600">Shift 1 <span class="text-[10px] font-normal text-slate-400 ml-1">(07:00-15:30)</span></span>
                    <span class="text-lg font-black text-slate-700">${s1}</span>
                </div>
                <div class="flex justify-between items-center py-2 px-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span class="text-sm font-bold text-slate-600">Shift 2 <span class="text-[10px] font-normal text-slate-400 ml-1">(15:30-23:00)</span></span>
                    <span class="text-lg font-black text-slate-700">${s2}</span>
                </div>
                <div class="flex justify-between items-center py-2 px-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span class="text-sm font-bold text-slate-600">Shift 3 <span class="text-[10px] font-normal text-slate-400 ml-1">(23:00-07:00)</span></span>
                    <span class="text-lg font-black text-slate-700">${s3}</span>
                </div>
            `;
            totalEl.textContent = total;
            
            // Sync local state as well
            window.cicHandledUnits = new Set(data.units);
            analyzeTraffic(); // Update UI if needed
        } else {
            content.innerHTML = `<div class="text-center text-red-500 py-4 text-sm font-bold">Failed to load data</div>`;
        }
    } catch (e) {
        console.error(e);
        content.innerHTML = `<div class="text-center text-red-500 py-4 text-sm font-bold">Connection error</div>`;
    }
}

function closeCicRecapModal() {
    const modal = document.getElementById('cicRecapModal');
    if (!modal) return;
    
    modal.classList.add('opacity-0', 'pointer-events-none');
    document.getElementById('cicRecapModalInner').classList.add('scale-95');
    
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 200);
}
