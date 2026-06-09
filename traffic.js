// --- OPS TRAFFIC LOGIC ---
window.cicHandledUnits = window.cicHandledUnits || new Set();
window.currentCicUnits = [];

function analyzeTraffic() {
    const rawData = document.getElementById('trafficInput').value.trim();
    if (!rawData) {
        clearTrafficInput();
        return;
    }

    const lines = rawData.split('\n').filter(l => l.trim() !== '');
    if (lines.length < 2) return;

    const headers = lines[0].split('\t').map(h => h.trim().toLowerCase());
    
    // Find required column indices
    const unitIdx = headers.indexOf('unit');
    const carrierTypeIdx = headers.indexOf('carrier type');
    const typeIdx = headers.indexOf('type');
    const durationIdx = headers.indexOf('duration');

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

    for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split('\t');
        if (row.length <= Math.max(unitIdx, carrierTypeIdx, typeIdx)) continue;

        const unit = (row[unitIdx] || '').trim().toUpperCase();
        const carrierType = (row[carrierTypeIdx] || '').trim().toUpperCase();
        const type = (row[typeIdx] || '').trim();
        const durationStr = durationIdx !== -1 ? (row[durationIdx] || '').trim() : '0';
        let durationMin = 0;
        
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
            if (found && found.service && found.service.toUpperCase().includes('CIC')) {
                isCic = true;
            }
        }

        if (isCic) {
            // Track all incoming CIC units
            window.currentCicUnits.push(unit);
            
            // Only add to active CIC list if not handled yet
            if (!window.cicHandledUnits.has(unit)) {
                cicCount++;
                cicTrt += durationMin;
                cicItems.push({ unit, durationMin });
            }
        } else {
            // 3. Import or Export
            if (type.toLowerCase() === 'in') {
                exportCount++;
                exportTrt += durationMin;
                exportItems.push({ unit, durationMin });
            } else if (type.toLowerCase() === 'out') {
                importCount++;
                importTrt += durationMin;
                importItems.push({ unit, durationMin });
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
            if (isCic) {
                return `
                    <label class="flex items-center gap-2 cursor-pointer group py-1 border-b border-${colorClass}-100/30 last:border-0 hover:bg-purple-100/30 rounded px-1 -mx-1 transition-colors">
                        <span class="w-4 font-bold text-${colorClass}-700/50 text-xs">${idx + 1}.</span>
                        <input type="checkbox" class="rounded text-${colorClass}-600 focus:ring-${colorClass}-500 w-4 h-4 cursor-pointer" onchange="toggleCicHandled('${item.unit}', this.checked)">
                        <span id="cic-label-${item.unit}" class="flex-1 font-mono font-medium text-slate-700 group-hover:text-${colorClass}-700 transition-colors">${item.unit}</span>
                        <span id="cic-time-${item.unit}" class="font-bold text-red-500 transition-colors">${formatTrt(item.durationMin)}</span>
                    </label>
                `;
            } else {
                return `
                    <div class="flex items-center gap-2 py-1 border-b border-${colorClass}-100/30 last:border-0">
                        <span class="w-4 font-bold text-${colorClass}-700/50 text-xs">${idx + 1}.</span>
                        <span class="flex-1 font-mono font-medium text-slate-700">${item.unit}</span>
                        <span class="font-bold text-red-500">${formatTrt(item.durationMin)}</span>
                    </div>
                `;
            }
        }).join('');
    };

    renderList(exportItems, 'trafficExportList', 'emerald');
    renderList(importItems, 'trafficImportList', 'blue');
    renderList(cicItems, 'trafficCicList', 'purple', true);

    updateCicHandledCount();
    
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
    
    document.getElementById('trafficCicHandled').textContent = '0';
    window.currentCicUnits = [];
}

function toggleCicHandled(unit, checked) {
    if (checked) {
        window.cicHandledUnits.add(unit);
    } else {
        window.cicHandledUnits.delete(unit);
    }
    updateCicHandledCount();
    
    // Re-render the UI smoothly by re-analyzing the currently pasted text
    // Because checking it should completely remove it from the list and update averages
    analyzeTraffic();
}

function updateCicHandledCount() {
    const el = document.getElementById('trafficCicHandled');
    if (el) el.textContent = window.cicHandledUnits.size;
}
