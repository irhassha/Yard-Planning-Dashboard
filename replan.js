// replan.js
// Logic for Replan Analyzer (Smart Slot Finder) integrated into Yard Planning Dashboard

let selectedFullSlotsHistory = [];
let currentReplanMatches = [];
let currentReplanUnit = "";
let activeReplanBlockFilter = 'ALL';
let replanPriorityMode = 'NORMAL';
let isAnalysisModalOpen = false;

function openAnalysisModal() {
    const modal = document.getElementById('analysisModal');
    if (!modal || isAnalysisModalOpen) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    isAnalysisModalOpen = true;
}

function closeAnalysisModal() {
    const modal = document.getElementById('analysisModal');
    if (!modal || !isAnalysisModalOpen) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    isAnalysisModalOpen = false;
}

function normalizeReplan(str) {
    if (str === undefined || str === null) return "";
    return str.toString()
        .replace(/_x000D_/g, '')
        .replace(/[\r\n\t]/g, ' ')
        .replace(/,/g, '.')
        .replace(/\s*-\s*/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function cleanReplanKey(str) {
    return normalizeReplan(str).replace(/[^a-z0-9]/g, '');
}

function updatePriorityButtonsReplan() {
    const styles = {
        NORMAL: { active: 'bg-emerald-50 text-emerald-700 border-emerald-300', inactive: 'bg-white text-slate-500 border-slate-200' },
        MIX_WC: { active: 'bg-red-50 text-red-700 border-red-300', inactive: 'bg-white text-slate-500 border-slate-200' },
        MIX_SPOD_WC: { active: 'bg-red-100 text-red-800 border-red-400', inactive: 'bg-white text-slate-500 border-slate-200' }
    };

    const modes = ['NORMAL', 'MIX_WC', 'MIX_SPOD_WC'];
    modes.forEach(mode => {
        const btn = document.getElementById(`priority-${mode}`);
        if (!btn) return;
        const style = styles[mode] || styles.NORMAL;
        btn.className = `px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${replanPriorityMode === mode ? style.active : style.inactive}`;
    });

    const statusText = { 'NORMAL': 'Normal', 'MIX_WC': 'MIX WC', 'MIX_SPOD_WC': 'MIX SPOD & WC' };
    const statusEl = document.getElementById('replanPriorityStatus');
    if (statusEl) {
        statusEl.innerHTML = `Mode aktif: <span class="font-semibold text-emerald-600">${statusText[replanPriorityMode] || 'Normal'}</span>`;
    }
}

function setReplanPriority(mode) {
    if (replanPriorityMode === mode) return;
    replanPriorityMode = mode;
    updatePriorityButtonsReplan();
    if (document.getElementById('rawInput').value.trim() && (window.invData || []).length) {
        analyzeReplan();
    }
}

function analyzeReplan() {
    const text = document.getElementById('rawInput').value.trim();
    const db = window.invData || [];
    
    if (!text || db.length === 0) {
        renderEmptyStateReplan();
        if(db.length === 0 && text) alert("Please upload Unit List first.");
        return;
    }

    openAnalysisModal();

    const lines = text.split(/\r?\n/);
    const headers = lines[0].split('\t').map(h => h.trim());
    const values = lines[1] ? lines[1].split('\t').map(v => v.trim()) : [];

    const targetKeys = ['Unit', 'Service Out', 'Carrier Out', 'SPOD', 'Unit length', 'Wt. cl.', 'Cont. type', 'Unit height'];
    let gridContent = "";
    targetKeys.forEach(key => {
        const idx = headers.indexOf(key);
        const val = idx !== -1 ? values[idx] : "-";
        gridContent += `
            <div class="flex flex-col p-3 bg-white rounded-lg border border-slate-200 shadow-sm">
                <span class="text-[10px] uppercase font-bold text-slate-400 mb-1">${key}</span>
                <span class="text-sm font-mono font-bold text-slate-700 truncate" title="${val}">${val}</span>
            </div>`;
    });
    
    const previewContainer = document.getElementById('replanPreviewContainer');
    if(previewContainer) {
        previewContainer.innerHTML = `<div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 p-4">${gridContent}</div>`;
    }

    const findVal = (name) => {
        const cleanName = cleanReplanKey(name);
        const idx = headers.findIndex(h => cleanReplanKey(h) === cleanName);
        return idx !== -1 ? normalizeReplan(values[idx]) : "";
    };

    currentReplanUnit = findVal("Unit").toUpperCase();

    const target = {
        svc: findVal("Service Out"),
        carr: findVal("Carrier Out"),
        spod: findVal("SPOD"),
        len: findVal("Unit length"),
        wt: findVal("Wt. cl."),
        type: findVal("Cont. type"),
        height: findVal("Unit height")
    };
    window.currentReplanTarget = target;

    currentReplanMatches = db.filter(item => {
        const matchSvc = normalizeReplan(item.service) === target.svc;
        const matchCarr = normalizeReplan(item.carrier) === target.carr;
        const matchLen = normalizeReplan(item.length) === target.len;
        const matchType = normalizeReplan(item.conttype) === target.type;
        const matchHeight = normalizeReplan(item.unitheight) === target.height;

        const p1 = parseInt(item.wtcl);
        const p2 = parseInt(target.wt);
        const matchWt = (normalizeReplan(item.wtcl) === target.wt) || (!isNaN(p1) && !isNaN(p2) && p1 === p2);
        const matchSpod = normalizeReplan(item.spod) === target.spod;

        if (replanPriorityMode === 'MIX_SPOD_WC') {
            return matchSvc && matchCarr && matchLen && matchType && matchHeight;
        }
        if (replanPriorityMode === 'MIX_WC') {
            return matchSvc && matchCarr && matchSpod && matchLen && matchType && matchHeight;
        }
        return matchSvc && matchCarr && matchSpod && matchLen && matchType && matchHeight && matchWt;
    });

    calculateAvailableSlotsReplan();
}

function calculateAvailableSlotsReplan() {
    const out = document.getElementById('replanSlotDisplay');
    const filterContainer = document.getElementById('replanFilterContainer');
    const db = window.invData || [];

    const hideGreyOutForCluster = document.getElementById('toggleGreyOutBlocks')?.checked !== false;
    const tgt = window.currentReplanTarget || {};
    const cMapKey = tgt ? `${tgt.carr}||${tgt.svc.toUpperCase()}` : "";
    const tgtGreyOutBlocks = (window.activeGreyOutBlocksMap && window.activeGreyOutBlocksMap[cMapKey]) || [];

    let activeClusterBlocks = [];
    if (tgt && tgt.carr && window.invData) {
        let allVesselBlocks = new Set();
        (window.invData || []).forEach(it => {
            if (!it.move.includes('export')) return;
            if (normalizeReplan(it.carrier) === tgt.carr &&
                normalizeReplan(it.service) === tgt.svc) {
                allVesselBlocks.add((it.block || '').toUpperCase());
            }
        });
        activeClusterBlocks = Array.from(allVesselBlocks).filter(b => b && b !== 'C01' && b !== 'C02' && !tgtGreyOutBlocks.includes(b)).sort();
    }

    let clusterHtml = "";
    if (activeClusterBlocks.length > 0) {
        clusterHtml = `
            <div class="mb-4 p-3 bg-blue-50/50 border border-blue-100 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between shadow-sm gap-2">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-blue-500 text-[18px]">group_work</span>
                    <span class="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Active Cluster <span class="text-blue-600">(${(tgt.carr || 'N/A').toUpperCase()} - ${(tgt.svc || 'N/A').toUpperCase()})</span>:</span>
                </div>
                <div class="flex flex-wrap gap-1">
                    ${activeClusterBlocks.map(b => `<span class="px-2 py-0.5 bg-white border border-blue-200 text-blue-700 text-[10px] font-black rounded shadow-sm">${b}</span>`).join('')}
                </div>
            </div>
        `;
    } else if (tgt && tgt.carr) {
        clusterHtml = `
            <div class="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between shadow-sm">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-slate-400 text-[18px]">group_work</span>
                    <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Active Cluster:</span>
                </div>
                <div class="text-[10px] font-bold text-slate-400">No active cluster found</div>
            </div>
        `;
    }

    if (currentReplanMatches.length === 0) {
        out.innerHTML = `
            ${clusterHtml}
            <div class="p-6 bg-red-50 border border-red-200 rounded-xl text-center">
                <span class="material-symbols-outlined text-red-500 text-3xl mb-2">error</span>
                <p class="text-red-700 font-bold">No matching stacks found in Unit List.</p>
                <p class="text-xs text-red-500 mt-1">Check Service, Carrier, SPOD, Dimensions, and Weight Class.</p>
            </div>`;
        filterContainer.classList.add('hidden');
        return;
    }

    let stackInfo = {};
    currentReplanMatches.forEach(m => {
        let fullSlotRaw = (m._raw_slot || "").trim();
        if (fullSlotRaw.includes('-')) {
            let p = fullSlotRaw.split('-');
            let tier = parseInt(p.pop());
            let base = p.join('-');
            if (!isNaN(tier)) {
                if (!stackInfo[base]) stackInfo[base] = 0;
                if (tier > stackInfo[base]) stackInfo[base] = tier;
            }
        }
    });

    let allStackInfo = {};
    db.forEach(m => {
        let fullSlotRaw = (m._raw_slot || "").trim();
        if (fullSlotRaw.includes('-')) {
            let p = fullSlotRaw.split('-');
            let tier = parseInt(p.pop());
            let base = p.join('-');
            if (!isNaN(tier)) {
                if (!allStackInfo[base]) allStackInfo[base] = new Set();
                allStackInfo[base].add(tier);
            }
        }
    });

    let stacks = [];
    const usedFullSlots = new Set(selectedFullSlotsHistory.map(h => h.fullSlot.trim()));

    const hideGreyOut = document.getElementById('toggleGreyOutBlocks')?.checked !== false; // Default true (hidden) if element not found
    const mapKey = currentReplanMatches.length > 0 ? `${currentReplanMatches[0].carrier}||${(currentReplanMatches[0].service || "").toUpperCase()}` : "";
    const greyOutBlocks = (window.activeGreyOutBlocksMap && window.activeGreyOutBlocksMap[mapKey]) || [];

    Object.keys(stackInfo).forEach(base => {
        let parts = base.split('-');
        let blockId = parts.length > 0 ? parts[0] : "Other";

        // Filter out greyed blocks from Cluster Spreading if the toggle is ON
        if (hideGreyOut && greyOutBlocks.includes(blockId)) return;

        let matchingMaxOccupied = stackInfo[base];
        let occupiedTiers = allStackInfo[base] ? Array.from(allStackInfo[base]) : [];
        let maxOccupied = occupiedTiers.length > 0 ? Math.max(...occupiedTiers) : matchingMaxOccupied;

        // 1. RULE: Do not recommend slot if there is an unmatching container on top!
        if (maxOccupied > matchingMaxOccupied) return;

        // 2. RULE: Do not stack on top of an IMDG container!
        const topMostItem = currentReplanMatches.find(m => (m._raw_slot || "").trim() === `${base}-${matchingMaxOccupied}`);
        if (topMostItem) {
            const moveTxt = (topMostItem.move || "").toLowerCase();
            const contType = (topMostItem.conttype || "").toLowerCase();
            const blockName = (topMostItem.block || "").toUpperCase();
            
            if (moveTxt.includes("imdg") || moveTxt.includes("dg") || 
                contType.includes("imdg") || contType.includes("dg") || 
                ['C01', 'C02', 'D01'].includes(blockName)) {
                return; // SKIP: Cannot stack on top of IMDG
            }
        }

        let availableTiers = [];

        for (let t = maxOccupied + 1; t <= 5; t++) {
            let potentialSlot = `${base}-${t}`;
            if (!usedFullSlots.has(potentialSlot)) {
                availableTiers.push({ tier: t, raw: potentialSlot });
            }
        }

        if (availableTiers.length > 0) {
            stacks.push({ base: base, block: blockId, tiers: availableTiers, occupied: maxOccupied });
        }
    });

    if (stacks.length === 0) {
        out.innerHTML = `
            ${clusterHtml}
            <div class="p-6 bg-yellow-50 border border-yellow-200 rounded-xl text-center">
                <span class="material-symbols-outlined text-yellow-500 text-3xl mb-2">layers_clear</span>
                <p class="text-yellow-700 font-bold">All stackable tiers (up to 5) are full or selected based on current match criteria.</p>
            </div>`;
        filterContainer.classList.add('hidden');
        return;
    }

    const blocks = [...new Set(stacks.map(s => s.block))].sort();

    if (blocks.length > 0) {
        let filterHtml = `<button onclick="setFilterReplan('ALL')" class="px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${activeReplanBlockFilter === 'ALL' ? 'bg-blue-500 text-white border-blue-500 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}">ALL</button>`;
        blocks.forEach(b => {
            filterHtml += `<button onclick="setFilterReplan('${b}')" class="px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${activeReplanBlockFilter === b ? 'bg-blue-500 text-white border-blue-500 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}">${b}</button>`;
        });
        filterContainer.innerHTML = filterHtml;
        filterContainer.classList.remove('hidden');
    }

    const displayBlocks = activeReplanBlockFilter === 'ALL' ? blocks : blocks.filter(b => b === activeReplanBlockFilter);
    let html = "";

    displayBlocks.forEach(blockName => {
        const blockStacks = stacks.filter(s => s.block === blockName).sort((a,b) => a.base.localeCompare(b.base));
        if (blockStacks.length === 0) return;

        html += `
            <div class="animate-fade-in relative">
                <div class="flex items-center gap-2 mb-3 mt-4 border-b border-slate-100 pb-2">
                    <span class="h-2.5 w-2.5 rounded-full bg-blue-500"></span>
                    <h3 class="text-sm font-black text-slate-700 uppercase tracking-widest">Block ${blockName}</h3>
                    <span class="text-[10px] uppercase font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full border border-slate-200 ml-2">${blockStacks.length} Stacks</span>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    ${blockStacks.map(stack => `
                        <div class="bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-2 relative overflow-hidden group hover:shadow-md transition-shadow">
                            <div class="absolute top-0 right-0 p-1 opacity-5 group-hover:opacity-10 transition-opacity"><span class="material-symbols-outlined text-4xl">inventory_2</span></div>
                            <div class="flex justify-between items-start z-10">
                                <span class="text-xs font-black text-slate-700 tracking-tight font-mono">${stack.base}</span>
                                <span class="text-[10px] text-slate-500 font-bold bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">Top: <span class="text-slate-800">${stack.occupied}</span></span>
                            </div>
                            <div class="flex flex-wrap gap-1.5 z-10 mt-2">
                                ${stack.tiers.map(t => `<button onclick="selectSlotReplan('${t.raw}')" class="flex-1 min-w-[32px] py-1 flex items-center justify-center bg-blue-50 hover:bg-blue-500 text-blue-600 hover:text-white border border-blue-200 hover:border-blue-500 text-[10px] font-black rounded transition-all active:scale-95">T${t.tier}</button>`).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>`;
    });

    out.innerHTML = clusterHtml + html;
}

function setFilterReplan(filter) {
    activeReplanBlockFilter = filter;
    calculateAvailableSlotsReplan();
}

function selectSlotReplan(fullSlot) {
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0') + ":" + now.getSeconds().toString().padStart(2, '0');
    const matchInfo = currentReplanMatches[0];
    const info = matchInfo ? `<span class="font-bold text-slate-700">${(matchInfo.service || "").toUpperCase()}</span><br/><span class="text-[10px] text-slate-500">${(matchInfo.carrier || "").toUpperCase()}</span>` : "-";
    
    selectedFullSlotsHistory.unshift({ time: timeStr, unit: currentReplanUnit || "N/A", fullSlot: fullSlot.trim(), info: info });

    // Copy to clipboard
    try {
        navigator.clipboard.writeText(fullSlot.trim()).then(() => {
            showReplanToast(`Copied: ${fullSlot.trim()}`);
        });
    } catch(err) {
        const tempInput = document.createElement("input");
        tempInput.value = fullSlot.trim();
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand("copy");
        document.body.removeChild(tempInput);
        showReplanToast(`Copied: ${fullSlot.trim()}`);
    }

    calculateAvailableSlotsReplan();
    updateHistoryTableReplan();
}

function showReplanToast(msg) {
    const toast = document.getElementById("replanToast");
    const toastMsg = document.getElementById("replanToastMsg");
    if(!toast || !toastMsg) return;
    
    toastMsg.innerText = msg;
    
    toast.classList.remove('bottom-[-100px]', 'opacity-0');
    toast.classList.add('bottom-8', 'opacity-100');

    setTimeout(() => {
        toast.classList.remove('bottom-8', 'opacity-100');
        toast.classList.add('bottom-[-100px]', 'opacity-0');
    }, 2500);
}

function updateHistoryTableReplan() {
    const tbody = document.getElementById('replanHistoryBody');
    if (!tbody) return;
    if (selectedFullSlotsHistory.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="px-4 py-8 text-center text-slate-400 italic">No slots selected yet.</td></tr>';
        return;
    }
    tbody.innerHTML = selectedFullSlotsHistory.map((h, i) => `
        <tr class="hover:bg-slate-50 transition-colors ${i === 0 ? 'bg-blue-50/50' : ''}">
            <td class="px-4 py-3 font-mono text-[10px] text-slate-500 font-bold">${h.time}</td>
            <td class="px-4 py-3">
                <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 mb-1">${h.unit}</span>
                <div class="text-[11px] font-mono font-black text-slate-800">${h.fullSlot}</div>
            </td>
            <td class="px-4 py-3 text-[10px] leading-tight">${h.info}</td>
        </tr>`).join('');
}

function renderEmptyStateReplan() {
    const slotDisplay = document.getElementById('replanSlotDisplay');
    const pContainer = document.getElementById('replanPreviewContainer');
    const filterContainer = document.getElementById('replanFilterContainer');
    
    if(slotDisplay) slotDisplay.innerHTML = `<div class="flex flex-col items-center justify-center py-20 text-slate-400"><span class="material-symbols-outlined text-6xl mb-4 text-slate-300">dns</span><p class="text-sm font-medium">Waiting for data input...</p></div>`;
    if(pContainer) pContainer.innerHTML = `<table class="w-full text-left text-xs"><thead class="bg-slate-50"><tr><th class="px-4 py-3 font-semibold text-slate-500">Key</th><th class="px-4 py-3 font-semibold text-slate-500">Value</th></tr></thead><tbody><tr><td colspan="2" class="text-center italic p-6 text-slate-400">Waiting for data paste...</td></tr></tbody></table>`;
    
    closeAnalysisModal();
    if(filterContainer) filterContainer.classList.add('hidden');
}

function clearReplanInput() {
    const input = document.getElementById('rawInput');
    if(input) input.value = "";
    activeReplanBlockFilter = 'ALL';
    renderEmptyStateReplan();
}

function clearReplanHistory() {
    if(confirm("Clear all selection history?")) {
        selectedFullSlotsHistory = [];
        updateHistoryTableReplan();
        if (currentReplanMatches.length > 0) calculateAvailableSlotsReplan();
    }
}

// Event listeners for Modal close
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAnalysisModal();
});

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('analysisModal');
    if(modal) {
        modal.addEventListener('click', (e) => {
            if(e.target === modal) closeAnalysisModal();
        });
    }
});
