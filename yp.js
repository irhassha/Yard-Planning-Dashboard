
    let invData = [];
    let isInvLoaded = false;
    let globalClashes = []; // Store clashes for sorting/filtering
    let activeFilterBlock = null;
    let projectionPreplanRows = [];
    const PROJECTION_TYPES = ['Fixed Import', 'IMDG', 'Reefer', 'OOG'];

    // Constants
    const EXPORT_DEFAULTS = ["A01", "A02", "A03", "A04", "A05", "B01", "B02", "B03", "B04", "B05", "C03", "C04"];
    const EXCLUDED_BLOCKS_YARD = ["C01", "C02", "OOG", "RC9", "BR9"];
    const EXCLUDED_BLOCKS_CLASH = ["C01", "C02", "OOG", "RC9", "BR9"];
    
    const DEFAULT_CAPACITY = {
        "A01": { slots: 37, tier: 5, cap: 1110 }, "A02": { slots: 37, tier: 5, cap: 1110 }, "A03": { slots: 37, tier: 5, cap: 1110 }, "A04": { slots: 37, tier: 5, cap: 1110 }, "A05": { slots: 37, tier: 5, cap: 1110 }, "A06": { slots: 37, tier: 5, cap: 1110 }, "A07": { slots: 37, tier: 5, cap: 1110 }, "A08": { slots: 37, tier: 5, cap: 1110 },
        "B01": { slots: 37, tier: 5, cap: 1110 }, "B02": { slots: 37, tier: 5, cap: 1110 }, "B03": { slots: 37, tier: 5, cap: 1110 }, "B04": { slots: 37, tier: 5, cap: 1110 }, "B05": { slots: 37, tier: 5, cap: 1110 }, "B06": { slots: 37, tier: 5, cap: 1110 }, "B07": { slots: 23, tier: 5, cap: 690 }, "B08": { slots: 23, tier: 5, cap: 690 },
        "C01": { slots: 45, tier: 3, cap: 810 }, "C02": { slots: 45, tier: 4, cap: 1080 }, "C03": { slots: 45, tier: 5, cap: 1350 }, "C04": { slots: 45, tier: 5, cap: 1350 }, "C05": { slots: 45, tier: 5, cap: 1350 }, "C06": { slots: 45, tier: 5, cap: 1350 }, "C07": { slots: 45, tier: 5, cap: 1350 }, "C08": { slots: 45, tier: 5, cap: 1350 },
        "BR9": { slots: 18, tier: 5, cap: 540 }, "RC9": { slots: 12, tier: 5, cap: 360 }, "OOG": { slots: 45, tier: 1, cap: 270 }
    };
    let activeCapacity = JSON.parse(localStorage.getItem("yardCapData")) || JSON.parse(JSON.stringify(DEFAULT_CAPACITY));

    // Helper Utils
    function cleanStr(str) { return String(str || "").toLowerCase().replace(/_x000d_|\n|\r/g, "").trim(); }
    function setProgress(pct, msg) {
        document.getElementById('progressCircle').style.strokeDashoffset = 314.159 - (pct/100)*314.159;
        document.getElementById('progressText').innerText = Math.round(pct)+"%";
        if(msg) document.getElementById('loadingStatus').innerText = msg;
    }
    function formatDayHour(dateObj) {
        if(!dateObj) return "?";
        const d = dateObj.getDate().toString().padStart(2, '0');
        const h = dateObj.getHours().toString().padStart(2, '0');
        const m = dateObj.getMinutes().toString().padStart(2, '0');
        return `${d}/${h}:${m}`;
    }

function updateCapacity(block, newSlots, newTier) {
  if (!activeCapacity[block]) return;

  if (newSlots !== null) {
    activeCapacity[block].slots = Number(newSlots);
  }
  if (newTier !== null) {
    activeCapacity[block].tier = Number(newTier);
  }

  activeCapacity[block].cap =
    Math.round(activeCapacity[block].slots * activeCapacity[block].tier * 6);

  localStorage.setItem("yardCapData", JSON.stringify(activeCapacity));

  renderOverview();
}


    // --- MAIN FILE UPLOAD (Overview) ---
    document.getElementById('fileInv').addEventListener('change', function(e) {
    if(!e.target.files[0]) return;
    const loader = document.getElementById('loadingOverlay');
    loader.classList.remove('hidden');
    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            setProgress(20, "Parsing Data...");
            const wb = XLSX.read(new Uint8Array(evt.target.result), {type: 'array'});
            const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1, defval: ""});
            
            let hIdx = -1;
            // UPDATE: Tambahkan loadStatus ke colMap
            let colMap = { block: -1, length: -1, carrier: -1, move: -1, slot: -1, loadStatus: -1, service: -1 };
            
            for(let i=0; i<Math.min(json.length, 30); i++) {
                let rStr = json[i].map(c => cleanStr(c)).join(" ");
                if((rStr.includes("area") || rStr.includes("block") || rStr.includes("slot")) && 
                   (rStr.includes("vessel") || rStr.includes("carrier") || rStr.includes("line"))) {
                    hIdx = i;
                    json[i].forEach((cell, idx) => {
                        let c = cleanStr(cell).replace(/[\s_]+/g, "");
                        if(c.includes("area") || c.includes("block")) colMap.block = idx;
                        if(c.includes("unitlength") || c.includes("size")) colMap.length = idx;
                        if(c === "carrier" || c === "vessel" || c === "line") colMap.carrier = idx;
                        if(c === "move" || c === "status" || c === "category") colMap.move = idx;
                        if(c.includes("slot") && c.includes("exe")) colMap.slot = idx;
                        // LOGIC BARU: Deteksi kolom Load Status
                        if(c.includes("load") && c.includes("status")) colMap.loadStatus = idx;
                        // Detect Service column (e.g., "service", "serviceout", "service out")
                        if(c.includes("service")) colMap.service = idx;
                    });
                    break;
                }
            }

            if(hIdx === -1 || colMap.carrier === -1) throw new Error("Format kolom tidak dikenali.");

            invData = [];
            for(let i=hIdx+1; i<json.length; i++) {
                let row = json[i];
                if(!row[colMap.block] && !row[colMap.slot]) continue;
                
                // Parsing Slot & Block (Logic Lama)
                let slotStr = colMap.slot !== -1 ? String(row[colMap.slot] || "") : "";
                let parsedBlock = "N", parsedSlotNum = 0;
                if(slotStr.includes('-')) {
                    let parts = slotStr.split('-');
                    parsedBlock = parts[0].trim();
                    if (parts.length >= 2) parsedSlotNum = parseInt(parts[1]) || 0;
                } else if(colMap.block !== -1 && row[colMap.block]) {
                    parsedBlock = String(row[colMap.block]).trim();
                    if (colMap.slot !== -1) parsedSlotNum = parseInt(row[colMap.slot]) || 0;
                } else if(slotStr !== "") {
                    parsedSlotNum = parseInt(slotStr) || 0;
                }

                invData.push({
                    block: parsedBlock.toUpperCase(),
                    slot: parsedSlotNum,
                    length: colMap.length !== -1 ? String(row[colMap.length] || "") : "20",
                    carrier: String(row[colMap.carrier] || "").toUpperCase().trim(),
                    move: colMap.move !== -1 ? String(row[colMap.move] || "").toLowerCase() : "import",
                    // UPDATE: Simpan Load Status
                    loadStatus: colMap.loadStatus !== -1 ? String(row[colMap.loadStatus] || "").toUpperCase() : "FULL",
                    service: colMap.service !== -1 ? String(row[colMap.service] || "").toUpperCase().trim() : ""
                });
            }

            isInvLoaded = true;
            document.getElementById('resetBtn').classList.remove('hidden');
            
            // Render All Tabs
            renderOverview();
            renderClusterSpreading();
            renderEmptySummary(); // FUNGSI BARU DIPANGGIL DISINI
            renderDischargeProjection();
            
            setProgress(100, "Selesai!");
            setTimeout(() => loader.classList.add('hidden'), 500);
        } catch(err) { alert("Error: " + err.message); loader.classList.add('hidden'); }
    };
    reader.readAsArrayBuffer(e.target.files[0]);
});

    // --- TAB 1: OVERVIEW RENDER ---
    function renderOverview() {
        const tbody = document.getElementById('tableBody');
        tbody.innerHTML = '';
        let yardMap = {};
        Object.keys(activeCapacity).forEach(b => yardMap[b] = { c20:0, c40:0, c45:0, impT:0, expT:0, impCount:0, expCount:0 });

        invData.forEach(it => {
            if(!yardMap[it.block]) return;
            let teus = it.length.startsWith('20') ? 1 : (it.length.startsWith('45') ? 2.25 : 2);
            if(it.length.startsWith('20')) yardMap[it.block].c20++;
            else if(it.length.startsWith('45')) yardMap[it.block].c45++;
            else yardMap[it.block].c40++;

            if(it.move.includes('import') || it.move.includes('disc') || it.move.includes('vessel')) {
                yardMap[it.block].impT += teus; yardMap[it.block].impCount++;
            } else {
                yardMap[it.block].expT += teus; yardMap[it.block].expCount++;
            }
        });

        let s = { impC:0, expC:0, impS:0, expS:0 };
        Object.keys(yardMap).sort().forEach(b => {
            let d = yardMap[b], cap = activeCapacity[b];
            let stacked = (d.c20 * 1) + (d.c40 * 2) + (d.c45 * 2.25);
            let occ = (cap.cap > 0) ? (stacked / cap.cap) * 100 : 0;
            
            if(!EXCLUDED_BLOCKS_YARD.includes(b)) {
                let totT = d.impT + d.expT;
                if(totT > 0) {
                    s.impC += cap.cap * (d.impT / totT); s.expC += cap.cap * (d.expT / totT);
                } else {
                    EXPORT_DEFAULTS.includes(b) ? s.expC += cap.cap : s.impC += cap.cap;
                }
                s.impS += d.impT; s.expS += d.expT;
            }

            // Updated thresholds: Normal <50, Moderate 50-65, High >65, Over >100
            let barColor = occ > 100 ? 'bg-blue-500' : (occ > 65 ? 'bg-red-500' : (occ >= 50 ? 'bg-yellow-400' : 'bg-emerald-500'));
            let totBox = d.c20 + d.c40 + d.c45;
let remark = "-";
let rCls = "";

// === SPECIAL BLOCKS (PRIORITY, JANGAN DITIMPA) ===
if (b === "OOG") {
  remark = "OOG Area";
  rCls = "row-oog";

} else if (b === "RC9" || b === "BR9") {
  remark = "Reefer Area";
  rCls = "row-reefer";

} else if (b === "C01" || b === "C02") {
  remark = "DG Area";
  rCls = "row-dg";

} else {

  // === ZERO BLOCK (VERY LOW OCCUPANCY) ===
  if (occ < 3) {
    remark = "Zero Block";
    rCls = "row-zero";

  } else if (totBox > 0) {
    // === NORMAL LOGIC ===
    let iPct = (d.impT / (d.impT + d.expT)) * 100;
    let ePct = 100 - iPct;

    if (iPct >= 95) {
      remark = "Import Only";
      rCls = "row-import";
    } else if (ePct >= 95) {
      remark = "Export Only";
      rCls = "row-export";
    } else {
      remark = `${Math.round(iPct)}% Import | ${Math.round(ePct)}% Export`;
      rCls = "row-mixed";
    }
  }
}

            tbody.innerHTML += `
                <tr class="${rCls} hover:bg-slate-50 transition-colors">
                    <td class="p-2 border-r border-slate-200/50 font-bold text-center relative">
  <div class="absolute inset-y-0 left-0 w-1 ${barColor} rounded-r"></div>
  ${b}
</td>

                    <td class="p-2 border-r border-slate-200/50 text-center">
                        <div class="flex items-center gap-2">
                            <div class="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden shadow-inner"><div class="${barColor} h-full" style="width:${Math.min(occ,100)}%"></div></div>
                            <span class="w-10 text-right font-mono occupancy-pct">${Math.round(occ)}%</span>

                        </div>
                    </td>
                    <td class="p-2 border-r border-slate-200/50 text-left font-bold">${remark}</td>
                    <td class="col-detail p-1 text-center border-r border-slate-200/50">${d.c20}</td>
                    <td class="col-detail p-1 text-center border-r border-slate-200/50">${d.c40}</td>
                    <td class="col-detail p-1 text-center border-r border-slate-200/50">${d.c45}</td>
                    <td class="p-1 text-center border-r border-slate-200/50 font-bold bg-white/30">${totBox}</td>
                    <td class="p-1 text-center border-r border-slate-200/50 font-black text-blue-600 bg-white/30">${stacked.toFixed(1)}</td>
                    <td class="col-detail p-1 text-center border-r border-slate-200/50">
  <input type="number" min="1"
    class="w-16 h-8 text-sm text-center appearance-none bg-white/70 border border-slate-300 rounded"
    value="${cap.slots}"
    onchange="updateCapacity('${b}', this.value, null)">
</td>

<td class="col-detail p-1 text-center border-r border-slate-200/50">
  <input type="number" min="1" step="0.5"
    class="w-16 h-8 text-sm text-center appearance-none bg-white/70 border border-slate-300 rounded"
    value="${cap.tier}"
    onchange="updateCapacity('${b}', null, this.value)">
</td>

<td class="p-1 text-center border-r border-slate-200/50 font-bold">
  ${cap.cap}
</td>

                    <td class="col-detail p-1 font-mono text-[9px] uppercase">${rCls.replace('row-','')}</td>
                </tr>`;
        });

        updateSummary(s);


//TIME STAMP//

const now = new Date();
const time =
  now.getHours().toString().padStart(2, '0') + ':' +
  now.getMinutes().toString().padStart(2, '0') + ':' +
  now.getSeconds().toString().padStart(2, '0');

const date =
  now.getDate().toString().padStart(2, '0') + '/' +
  (now.getMonth() + 1).toString().padStart(2, '0') + '/' +
  now.getFullYear();

document.getElementById('lastUpdated').innerText =
  `Generated: ${date}, ${time}`;

    }

    function updateSummary(s) {
        document.getElementById('sumImpStack').innerText = Math.round(s.impS).toLocaleString();
        document.getElementById('sumExpStack').innerText = Math.round(s.expS).toLocaleString();
        let totalS = s.impS + s.expS, totalC = s.impC + s.expC;
        document.getElementById('sumTotalStack').innerText = Math.round(totalS).toLocaleString();

// === CAP DISPLAY (INI YANG KURANG) ===
document.getElementById('sumImpCap').innerText =
    Math.round(s.impC).toLocaleString();

document.getElementById('sumExpCap').innerText =
    Math.round(s.expC).toLocaleString();

document.getElementById('sumTotalCap').innerText =
    Math.round(s.impC + s.expC).toLocaleString();
        
        let yImp = s.impC > 0 ? (s.impS / s.impC * 100) : 0;
        let yExp = s.expC > 0 ? (s.expS / s.expC * 100) : 0;
        let yTot = totalC > 0 ? (totalS / totalC * 100) : 0;

        document.getElementById('yorImp').innerText = Math.round(yImp) + "%";
        document.getElementById('yorExp').innerText = Math.round(yExp) + "%";
        document.getElementById('yorTotal').innerText = Math.round(yTot) + "%";
        
        const setR = (id, v) => {
  const pct = Math.min(v, 100);
  document.getElementById(id).style.strokeDashoffset = 100 - pct;
};
;
        setR('ringImp', yImp); setR('ringExp', yExp); setR('ringTotal', yTot);
    }

    // --- TAB 2: ANALYTICS (Enhanced) ---
    function renderClusterSpreading() {
        const body = document.getElementById('clusterBody');
        const showAll = document.getElementById('toggleSmallCarriers').checked;
        const chartDiv = document.getElementById('carrierChart');
        body.innerHTML = '';
        
        let stats = {};
        invData.forEach(it => {
            if(!it.move.includes('export')) return;
            let c = it.carrier;
            if(!c || c === '0' || c === 'NIL') return;
            if(!stats[c]) stats[c] = { blocks: {}, total: 0 };
            stats[c].blocks[it.block] = (stats[c].blocks[it.block] || 0) + 1;
            stats[c].total++;
        });

        let sorted = Object.entries(stats).sort((a,b) => b[1].total - a[1].total);
        if(!sorted.length) { body.innerHTML = '<tr><td colspan="3" class="p-8 text-center text-slate-400">No Export Data.</td></tr>'; return; }

        // 1. Render Chart (Top 5)
        chartDiv.innerHTML = '';
        let maxVal = sorted[0][1].total;
        sorted.slice(0, 5).forEach(([c, data]) => {
            let pct = (data.total / maxVal) * 100;
            chartDiv.innerHTML += `
                <div class="mb-2">
                    <div class="flex justify-between text-xs font-bold mb-1"><span>${c}</span><span>${data.total} units</span></div>
                    <div class="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                        <div class="bg-primary h-full rounded-full" style="width: ${pct}%"></div>
                    </div>
                </div>`;
        });

        // 2. Render Table
        let filtered = showAll ? sorted : sorted.filter(e => e[1].total >= 50);
        filtered.forEach(([c, data]) => {
            let badges = Object.entries(data.blocks).sort((a,b) => b[1]-a[1]).map(([b, cnt]) => {
                let cls = cnt > 200 ? 'bg-red-600 text-white shadow-sm' : (cnt > 100 ? 'bg-amber-400 text-slate-900' : 'bg-blue-50 text-blue-700 border border-blue-100');
                return `<span class="inline-flex items-center justify-between px-2 py-1 rounded text-[10px] font-bold ${cls} mr-1 mb-1 min-w-[3.5rem]"><span class="mr-1">${b}</span><span>${cnt}</span></span>`;
            }).join("");
            body.innerHTML += `<tr class="hover:bg-slate-50 transition"><td class="px-2 py-1 font-black text-slate-700">${c}</td><td class="px-2 py-1">${badges}</td><td class="px-2 py-1 text-center font-bold text-slate-800">${data.total}</td></tr>`;
        });
    }

    // --- TAB 3: CLASH ANALYSIS (Sandboxed Logic Integrated) ---
    function toggleCongestion() {
        const content = document.getElementById('congContent');
        const icon = document.getElementById('congIcon');
        if (content.style.maxHeight === '0px' || !content.style.maxHeight) {
            content.style.maxHeight = '2000px'; content.style.opacity = '1'; content.style.marginTop = '12px'; icon.style.transform = 'rotate(0deg)';
        } else {
            content.style.maxHeight = '0px'; content.style.opacity = '0'; content.style.marginTop = '0px'; icon.style.transform = 'rotate(180deg)';
        }
    }

    function getMaxSlotForBlock(b) {
        let p = (b || "").charAt(0).toUpperCase();
        if(p === 'A' || p === 'B') return 37;
        if(p === 'C') return 45;
        return 50;
    }

    function parseDate(v) {
        if(!v) return null;
        if(typeof v === 'number') return new Date(Math.round((v - 25569) * 86400000));
        let d = new Date(v); return isNaN(d.getTime()) ? null : d;
    }

    async function processClashAnalysis() {
        if(!isInvLoaded) { alert("Please upload Unit List in Header first."); return; }
        const file = document.getElementById('scheduleInput').files[0];
        if(!file) { alert("Please upload Vessel Schedule."); return; }

        const loader = document.getElementById('loadingOverlay');
        loader.classList.remove('hidden');
        setProgress(30, "Analyzing Clashes...");

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                // 1. Parse Schedule
const wb = XLSX.read(new Uint8Array(e.target.result), {type: 'array'});
const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1, defval:""});
let h = json[0].map(c => cleanStr(c));

let nIdx = h.findIndex(x => (x.includes('carrier') || x.includes('vessel')) && !x.includes('type'));
// -------------------------------------------

let etaIdx = h.findIndex(x => x.includes('eta') || x.includes('arrival'));
let etdIdx = h.findIndex(x => x.includes('etd') || x.includes('departure'));
                
                let schedule = [];
                for(let i=1; i<json.length; i++){
                    let r = json[i];
                    if(r[nIdx]) {
                        let dEta = parseDate(r[etaIdx]), dEtd = parseDate(r[etdIdx]);
                        if(dEta) {
                            if(!dEtd) dEtd = new Date(dEta.getTime() + 86400000);
                            schedule.push({ v: String(r[nIdx]).toUpperCase().trim(), eta: dEta, etd: dEtd });
                        }
                    }
                }

                // 2. Aggregating Inventory (Transform invData to fit Clash Logic)
                let grouped = {};
                invData.forEach(it => {
                    let key = `${it.block}|${it.carrier}`;
                    if(!grouped[key]) grouped[key] = { b: it.block, v: it.carrier, count:0, slots:[] };
                    grouped[key].count++;
                    if(it.slot > 0) grouped[key].slots.push(it.slot);
                });
                let aggregatedInventory = Object.values(grouped).map(g => ({
                    b: g.b, v: g.v, count: g.count, 
                    sS: g.slots.length ? Math.min(...g.slots) : 0, 
                    eS: g.slots.length ? Math.max(...g.slots) : 0
                }));

                // 3. Run Logic
                runClashLogic(schedule, aggregatedInventory);
                
                setProgress(100, "Done!");
                setTimeout(() => loader.classList.add('hidden'), 500);
            } catch(err) { alert(err.message); loader.classList.add('hidden'); }
        };
        reader.readAsArrayBuffer(file);
    }

    function runClashLogic(schedule, inventory) {
        const bufferHrs = parseFloat(document.getElementById('clashWindow').value) || 0;
        const minU = parseInt(document.getElementById('minUnitsClash').value) || 1;
        const gapS = parseInt(document.getElementById('slotGap').value) || 5;
        let clashes = [], blockStats = {};
        let bMap = _.groupBy(inventory, 'b');

        for(const [block, items] of Object.entries(bMap)) {
            if(EXCLUDED_BLOCKS_CLASH.includes(block)) continue;
            for(let i=0; i<items.length; i++) {
                for(let j=i+1; j<items.length; j++) {
                    let v1 = items[i], v2 = items[j];
                    let s1 = schedule.find(s => v1.v.includes(s.v) || s.v.includes(v1.v));
                    let s2 = schedule.find(s => v2.v.includes(s.v) || s.v.includes(v2.v));
                    
                    if(s1 && s2) {
                        let bufMs = bufferHrs * 3600000;
                        let overlap = (s1.eta.getTime()-bufMs < s2.etd.getTime()+bufMs) && (s1.etd.getTime()+bufMs > s2.eta.getTime()-bufMs);
                        if(overlap) {
                            let overlapHrs = (Math.min(s1.etd, s2.etd) - Math.max(s1.eta, s2.eta)) / 3600000;
                            let isZero = (v1.eS === 0 || v2.eS === 0);
                            let slotOverlap = (v1.sS <= v2.eS && v2.sS <= v1.eS);
                            let slotDist = slotOverlap ? 0 : (v1.eS < v2.sS ? v2.sS - v1.eS : v1.sS - v2.eS);
                            
                            if(isZero || slotOverlap || slotDist <= gapS) {
                                let total = v1.count + v2.count;
                                if(total >= minU) {
                                    clashes.push({ block, v1, v2, s1, s2, overlapHrs, slotDist, slotOverlap, total });
                                    if(!blockStats[block]) blockStats[block] = { c:0, v:0, vessels: new Set() };
                                    blockStats[block].c++; blockStats[block].v += total;
                                    // Modified: ONLY VESSEL NAME
                                    blockStats[block].vessels.add(v1.v);
                                    blockStats[block].vessels.add(v2.v);
                                }
                            }
                        }
                    }
                }
            }
        }
        globalClashes = clashes;
        renderCurrentClashes();
        renderBlockStats(blockStats);
        document.getElementById('totalClashes').innerText = clashes.length;
        document.getElementById('vesselsInvolved').innerText = new Set(clashes.flatMap(c => [c.v1.v, c.v2.v])).size;
        document.getElementById('criticalClashesText').innerText = clashes.filter(c => c.total > 200).length + " Critical";
    }

    function renderCurrentClashes() {
        const feed = document.getElementById('clashFeed');
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        const currentSort = document.getElementById('clashSort').value;
        feed.innerHTML = "";

        if(globalClashes.length === 0) {
            feed.innerHTML = `<div class="p-12 text-center text-slate-400 border-dashed border-2 border-slate-300 rounded-2xl"><span class="material-symbols-outlined text-4xl mb-2 opacity-50">check_circle</span><p>No clashes found.</p></div>`;
            return;
        }

        let filtered = globalClashes.filter(c => {
            const matchBlock = activeFilterBlock ? c.block === activeFilterBlock : true;
            const matchSearch = c.v1.v.toLowerCase().includes(searchTerm) || c.v2.v.toLowerCase().includes(searchTerm) || c.block.toLowerCase().includes(searchTerm);
            return matchBlock && matchSearch;
        });

        if(filtered.length === 0) { feed.innerHTML = `<div class="p-8 text-center text-slate-400">No matching clashes.</div>`; return; }

        if(currentSort === 'severity') filtered.sort((a,b) => b.total - a.total);
        else if(currentSort === 'block') filtered.sort((a,b) => a.block.localeCompare(b.block));
        else if(currentSort === 'eta') filtered.sort((a,b) => Math.min(a.s1.eta, a.s2.eta) - Math.min(b.s1.eta, b.s2.eta));

        filtered.forEach(c => {
            const max = getMaxSlotForBlock(c.block);
            const w1 = Math.max(((c.v1.eS-c.v1.sS)/max)*100, 4), l1 = ((max-c.v1.eS)/max)*100;
            const w2 = Math.max(((c.v2.eS-c.v2.sS)/max)*100, 4), l2 = ((max-c.v2.eS)/max)*100;
            
            let oHTML = "";
            let conflictText = "";
            
            // CONFLICT CALCULATION
            if(c.slotOverlap && c.v1.eS > 0) {
                const oS = Math.max(c.v1.sS, c.v2.sS), oE = Math.min(c.v1.eS, c.v2.eS);
                const oW = ((oE - oS) / max) * 100, oL = ((max - oE) / max) * 100;
                oHTML = `<div class="slot-bar bg-red-500 animate-pulse mix-blend-multiply z-10" style="left:${oL}%; width:${oW}%"></div>`;
                
                // Set conflict text for Overlap
                conflictText = `<span class="bg-red-600 text-white px-2 py-0.5 rounded shadow-sm">CRITICAL: Slot ${oS} - ${oE}</span>`;
            } else {
                 // Set conflict text for Gap Proximity
                 conflictText = `<span class="bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded">Proximity Gap: ${c.slotDist} Slots</span>`;
            }

            const t1 = `${formatDayHour(c.s1.eta)}-${formatDayHour(c.s1.etd)}`;
            const t2 = `${formatDayHour(c.s2.eta)}-${formatDayHour(c.s2.etd)}`;

            feed.innerHTML += `
                <div class="glass-panel p-4 rounded-xl clash-card ${c.total > 200 ? 'clash-high' : 'clash-medium'}">
                    <div class="flex justify-between items-start mb-2">
                        <div class="flex items-center gap-3">
                            <div class="w-14 h-14 bg-white rounded-lg flex items-center justify-center font-black text-xl text-slate-700 border border-slate-200 shadow-sm">${c.block}</div>
                            <div>
                                <div class="flex items-center gap-2 flex-wrap text-[10px] font-bold">
                                    ${conflictText}
                                    <span class="px-2 py-0.5 bg-red-50 text-red-600 border border-red-100 rounded flex items-center gap-1"><span class="material-symbols-outlined text-[10px]">timer</span> ${c.overlapHrs.toFixed(1)}h</span>
                                    <span class="px-2 py-0.5 bg-slate-100 text-slate-500 rounded border border-slate-200 font-mono tracking-tight">${t1} <span class="text-amber-600 font-extrabold px-1">vs</span> ${t2}</span>
                                </div>
                                <div class="text-sm font-bold mt-1 text-slate-800">${c.v1.v} <span class="text-slate-400 font-normal mx-1">vs</span> ${c.v2.v}</div>
                            </div>
                        </div>
                        <div class="text-right"><div class="text-3xl font-black text-slate-800 tracking-tighter">${c.total}</div><div class="text-[9px] text-slate-400 uppercase font-bold">Units</div></div>
                    </div>
                    <div class="mt-4 mb-2">
                        <div class="slot-track bg-white border border-slate-200 shadow-inner">
                            <div class="slot-bar bg-blue-500 shadow-md border-r border-blue-600" style="left:${l1}%; width:${w1}%"><span>${c.v1.v}</span></div>
                            <div class="slot-bar bg-amber-500 shadow-md border-l border-amber-600" style="left:${l2}%; width:${w2}%"><span>${c.v2.v}</span></div>
                            ${oHTML}
                        </div>
                        <div class="flex justify-between text-[9px] font-bold text-slate-400 px-1 mt-1 font-mono">
                            <span>Slot ${max}</span>
                            <span>Slot 01</span>
                        </div>
                    </div>
                </div>`;
        });
    }

    function renderBlockStats(stats) {
        const body = document.getElementById('blockStatsBody');
        body.innerHTML = "";
        const sorted = Object.entries(stats).sort((a,b) => b[1].v - a[1].v);
        if(sorted.length === 0) { body.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400">No data</td></tr>`; }
        sorted.forEach(([b, d]) => {
            const vesselStr = Array.from(d.vessels).join(' - ');
            body.innerHTML += `
                <tr class="stats-row border-b border-slate-50 last:border-0" onclick="filterByBlock('${b}')" data-block="${b}">
                    <td class="p-3 font-bold text-slate-700 whitespace-nowrap">${b}</td>
                    <td class="p-3 text-[10px] text-slate-500 leading-tight">${vesselStr}</td>
                    <td class="p-3 text-center"><span class="bg-red-50 text-red-600 px-2 py-0.5 rounded text-[10px] font-bold border border-red-100">${d.c}</span></td>
                    <td class="p-3 text-right font-mono font-medium text-slate-600">${d.v}</td>
                </tr>`;
        });
    }

    function filterByBlock(block) {
        activeFilterBlock = block;
        document.getElementById('activeFilterBadge').classList.remove('hidden');
        document.getElementById('filterName').innerText = block;
        document.querySelectorAll('.stats-row').forEach(row => {
            row.classList.remove('active-filter');
            if(row.dataset.block === block) row.classList.add('active-filter');
        });
        renderCurrentClashes();
    }

    function clearFilter() {
        activeFilterBlock = null;
        document.getElementById('activeFilterBadge').classList.add('hidden');
        document.querySelectorAll('.stats-row').forEach(row => row.classList.remove('active-filter'));
        renderCurrentClashes();
    }

    // --- NAVIGATION & UTILS ---
    // --- UPDATE NAVIGATION FUNCTIONS ---

function switchTab(t) {
    // Tambahkan 'empty' ke dalam array daftar tab
    ['overview', 'analytics', 'clash', 'empty', 'projection'].forEach(id => {
        const tabEl = document.getElementById('tab-' + id);
        const btnEl = document.getElementById('btn-' + id);
        
        if (tabEl && btnEl) {
            tabEl.classList.add('hidden');
            btnEl.classList.replace('active', 'inactive');
        }
    });

    // Aktifkan tab yang dipilih
    const targetTab = document.getElementById('tab-' + t);
    const targetBtn = document.getElementById('btn-' + t);
    
    if (targetTab && targetBtn) {
        targetTab.classList.remove('hidden');
        targetBtn.classList.replace('inactive', 'active');
        targetTab.classList.add('animate-fade-in');
    }
}

function toggleDetails() { 
    document.getElementById('mainTable').classList.toggle('show-details'); 
}

function clearCache() { 
    if(confirm("Clear data?")){ location.reload(); } 
}

function downloadImage() {
let activeId = "captureArea";
let fileName = "Overview";


if (!document.getElementById("tab-analytics")?.classList.contains("hidden")) {
activeId = "captureAreaAnalytics";
fileName = "Analytics";
} else if (!document.getElementById("tab-clash")?.classList.contains("hidden")) {
activeId = "captureAreaClash";
fileName = "Clash";
} else if (!document.getElementById("tab-empty")?.classList.contains("hidden")) {
activeId = "captureAreaEmpty";
fileName = "Empty_Summary";
} else if (!document.getElementById("tab-projection")?.classList.contains("hidden")) {
activeId = "captureAreaProjection";
fileName = "Discharge_Projection";
}


const el = document.getElementById(activeId);
if (!el) return alert("Capture area not found");


html2canvas(el, { scale: 2, backgroundColor: "#ffffff" }).then((canvas) => {
const a = document.createElement("a");
a.download = `NPCT1_Yard_${fileName}_${Date.now()}.jpg`;
a.href = canvas.toDataURL("image/jpeg", 0.9);
a.click();
});
    // Prepare capture that adjusts cloned DOM to preserve table layout
    const capture = () => {
            return html2canvas(el, {
                scale: 3,
                backgroundColor: "#ffffff",
                onclone: (clonedDoc) => {
                    // Expand scrollable areas
                    const scrollables = clonedDoc.querySelectorAll('.overflow-x-auto, .overflow-y-auto');
                    scrollables.forEach(div => {
                        div.style.overflow = 'visible';
                        div.style.height = 'auto';
                        div.style.width = 'auto';
                        div.style.display = 'block';
                    });

                    // Disable sticky headers in clone (sticky may break capture)
                    clonedDoc.querySelectorAll('.sticky, thead').forEach(node => {
                        node.style.position = 'static';
                        node.style.top = 'auto';
                    });

                    // Reduce vertical spacing and padding for capture
                    const clonedRoot = clonedDoc.getElementById(activeId);
                    if (clonedRoot) {
                        clonedRoot.style.padding = '6px';
                        clonedRoot.style.margin = '0 auto';
                        clonedRoot.style.maxWidth = 'min(1400px, 95vw)';

                        // Tighten vertical gaps created by Tailwind space-y-* utilities
                        clonedRoot.querySelectorAll('[class*="space-y-"]').forEach(el => { el.style.rowGap = '6px'; el.style.columnGap = '6px'; });

                        // Reduce padding/margins on panels and make tables more compact
                        clonedRoot.querySelectorAll('.glass-panel').forEach(g => { g.style.padding = '6px'; g.style.marginTop = '4px'; g.style.marginBottom = '4px'; });
                        clonedRoot.querySelectorAll('table').forEach(t => { t.style.marginTop = '0'; t.style.marginBottom = '0'; t.style.borderSpacing = '0'; });
                    }

                    // Fix table widths by setting computed widths to cells
                    const tables = clonedDoc.querySelectorAll('table');
                    tables.forEach(tbl => {
                        const rect = tbl.getBoundingClientRect();
                        tbl.style.width = rect.width + 'px';
                        tbl.style.tableLayout = 'fixed';

                        // Set header cell widths
                        const headerCells = tbl.querySelectorAll('thead th');
                        headerCells.forEach((cell) => {
                            const w = cell.getBoundingClientRect().width;
                            cell.style.width = w + 'px';
                        });

                        // Set body first-row cell widths and prevent wrapping where possible
                        const bodyRow = tbl.querySelector('tbody tr');
                        if (bodyRow) {
                            const bodyCells = bodyRow.querySelectorAll('td');
                            bodyCells.forEach((cell) => {
                                const w = cell.getBoundingClientRect().width;
                                cell.style.width = w + 'px';
                                cell.style.whiteSpace = 'nowrap';
                            });
                        }
                    });
// FINAL STABLE EXPORT FIX (NO FLEX, NO BREAK)
clonedDoc.querySelectorAll("th, td").forEach(cell => {
  cell.style.paddingTop = "6px";
  cell.style.paddingBottom = "6px";
  cell.style.lineHeight = "1.4";
  cell.style.verticalAlign = "middle";
});

// OCCUPANCY FIX (tanpa class)
clonedDoc.querySelectorAll("table tbody tr").forEach(tr => {
  tr.style.height = "42px";
});
                }
            });
        };

        const doCapture = () => {
  const fontReady = (document.fonts && document.fonts.ready)
    ? document.fonts.ready
    : Promise.resolve();

  return fontReady.then(() => capture()).then(c => {
    const now = new Date();
    const ts =
      now.getFullYear() +
      ("0"+(now.getMonth()+1)).slice(-2) +
      ("0"+now.getDate()).slice(-2) + "_" +
      ("0"+now.getHours()).slice(-2) +
      ("0"+now.getMinutes()).slice(-2);

    const nameMap = {
      captureArea: "Overview",
      captureAreaAnalytics: "Analytics",
      captureAreaClash: "Clash",
      captureAreaProjection: "Discharge_Projection"
    };

    let l = document.createElement('a');
    l.download = `NPCT1_Yard_${nameMap[activeId]}_${ts}.jpg`;
    l.href = c.toDataURL("image/jpeg", 0.92);
    l.click();
  });
};


        return doCapture();
    }

    function exportToExcel() {
        if(!isInvLoaded) { alert("No data loaded."); return; }
        const wb = XLSX.utils.book_new();

        // Sheet 1: Overview
        const ws1 = XLSX.utils.table_to_sheet(document.getElementById("mainTable"));
        XLSX.utils.book_append_sheet(wb, ws1, "Overview");

        // Sheet 2: Carrier Stats
        const ws2 = XLSX.utils.table_to_sheet(document.getElementById("clusterTable"));
        XLSX.utils.book_append_sheet(wb, ws2, "Carrier Stats");

        // Sheet 3: Clash Report (Filtered)
        if(globalClashes.length > 0) {
            let clashData = globalClashes.map(c => ({
                Block: c.block,
                Vessel_1: c.v1.v,
                Vessel_2: c.v2.v,
                Total_Vol: c.total,
                Gap_Slots: c.slotOverlap ? "OVERLAP" : c.slotDist,
                Time_Overlap_Hrs: c.overlapHrs.toFixed(2),
                Slot_Range_1: `${c.v1.sS}-${c.v1.eS}`,
                Slot_Range_2: `${c.v2.sS}-${c.v2.eS}`
            }));
            const ws3 = XLSX.utils.json_to_sheet(clashData);
            XLSX.utils.book_append_sheet(wb, ws3, "Clash Report");
        }

        XLSX.writeFile(wb, "Yard_Planning_Report_Integrated.xlsx");
    }

// --- TAB 4: EMPTY SUMMARY RENDER ---
function renderEmptySummary() {
    const impDiv = document.getElementById('emptyImportSummary');
    const expBody = document.getElementById('emptyExportBody');
    
    // 1. Filter Data: Hanya yang statusnya Empty/MT
    // EXCLUDE entries where block or slot starts with '8'
    let emptyData = invData.filter(d => (d.loadStatus.includes('EMPTY') || d.loadStatus === 'MT') && !(String(d.block || '').startsWith('8') || String(d.slot || '').startsWith('8')));

    // Normalize service values
    emptyData.forEach(d => { if(!d.service) d.service = ""; });

    // 2. IMPORT LOGIC (Summarize by Length Only)
    let impStats = { c20: 0, c40: 0, c45: 0, total: 0 };
    emptyData.filter(d => d.move.includes('import')).forEach(d => {
        if(d.length.startsWith('20')) impStats.c20++;
        else if(d.length.startsWith('45')) impStats.c45++;
        else impStats.c40++;
        impStats.total++;
    });

    // Compute TEUs for empty imports
    const impTeus = (impStats.c20 * 1) + (impStats.c40 * 2) + (impStats.c45 * 2.25);

    impDiv.innerHTML = `
        <div class="bg-white p-4 rounded-2xl text-center border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <div class="text-[11px] text-slate-500 font-bold uppercase tracking-wide mb-1">20' Empty</div>
            <div class="text-3xl font-extrabold text-[#0064D2]">${impStats.c20}</div>
        </div>
        <div class="bg-white p-4 rounded-2xl text-center border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <div class="text-[11px] text-slate-500 font-bold uppercase tracking-wide mb-1">40' Empty</div>
            <div class="text-3xl font-extrabold text-[#0064D2]">${impStats.c40}</div>
        </div>
        <div class="bg-white p-4 rounded-2xl text-center border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <div class="text-[11px] text-slate-500 font-bold uppercase tracking-wide mb-1">45' Empty</div>
            <div class="text-3xl font-extrabold text-[#0064D2]">${impStats.c45}</div>
        </div>
        <div id="cardTotalImport" class="bg-gradient-to-br from-amber-50 to-yellow-50 p-4 rounded-2xl text-center border border-amber-200 shadow-sm">
            <div class="text-[11px] text-amber-700 font-bold uppercase tracking-wide mb-1">Total Import (Boxes)</div>
            <div class="text-3xl font-extrabold text-amber-600">${impStats.total}</div>
        </div>
        <div id="cardTotalTeus" class="bg-gradient-to-br from-emerald-50 to-teal-50 p-4 rounded-2xl text-center border border-emerald-200 shadow-sm">
            <div class="text-[11px] text-emerald-700 font-bold uppercase tracking-wide mb-1">Total TEUs</div>
            <div class="text-3xl font-extrabold text-emerald-600">${Number(impTeus.toFixed(2))}</div>
        </div>
    `;

    // 3. EXPORT LOGIC (Summarize by Carrier & Service & Length)
    let expStats = {};
    emptyData.filter(d => d.move.includes('export')).forEach(d => {
        let key = `${d.carrier}||${d.service || ''}`;
        if(!expStats[key]) expStats[key] = { carrier: d.carrier, service: d.service || '', c20: 0, c40: 0, c45: 0, total: 0 };
        
        if(d.length.startsWith('20')) expStats[key].c20++;
        else if(d.length.startsWith('45')) expStats[key].c45++;
        else expStats[key].c40++;
        expStats[key].total++;
    });

    // Sort by Total Descending
    let sortedExp = Object.values(expStats).sort((a,b) => b.total - a.total);
    
    expBody.innerHTML = '';
    if(sortedExp.length === 0) {
        expBody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-400 italic">No Export Empty found.</td></tr>';
    } else {
        sortedExp.forEach(s => {
            const carrier = s.carrier || '-';
            const service = s.service || '-';
            const totalTeus = (s.c20 * 1) + (s.c40 * 2) + (s.c45 * 2.25);
            expBody.innerHTML += `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-6 py-3 font-bold text-slate-700">${carrier}</td>
                    <td class="px-6 py-3 text-center font-medium text-slate-600">${service}</td>
                    <td class="px-6 py-3 text-center">${s.c20 || '-'}</td>
                    <td class="px-6 py-3 text-center">${s.c40 || '-'}</td>
                    <td class="px-6 py-3 text-center">${s.c45 || '-'}</td>
                    <td class="px-6 py-3 text-center font-bold bg-slate-50 text-slate-800">${s.total}</td>
                    <td class="px-6 py-3 text-center font-bold text-emerald-600">${Number(totalTeus.toFixed(2))}</td>
                </tr>
            `;
        });
        // Add Grand Total Row
        // Recompute grand totals including TEUs
        let grand = sortedExp.reduce((acc, curr) => ({
            c20: acc.c20 + curr.c20,
            c40: acc.c40 + curr.c40,
            c45: acc.c45 + curr.c45,
            total: acc.total + curr.total,
            teus: acc.teus + ((curr.c20 * 1) + (curr.c40 * 2) + (curr.c45 * 2.25))
        }), {c20:0, c40:0, c45:0, total:0, teus:0});
        
        expBody.innerHTML += `
            <tr class="bg-slate-100 border-t-2 border-slate-200 font-bold">
                <td class="px-6 py-3 text-slate-800">GRAND TOTAL</td>
                <td class="px-6 py-3 text-center text-slate-700">-</td>
                <td class="px-6 py-3 text-center text-blue-600">${grand.c20}</td>
                <td class="px-6 py-3 text-center text-blue-600">${grand.c40}</td>
                <td class="px-6 py-3 text-center text-blue-600">${grand.c45}</td>
                <td class="px-6 py-3 text-center text-emerald-600 text-lg">${grand.total}</td>
                <td class="px-6 py-3 text-center text-emerald-700 text-lg">${Number(grand.teus.toFixed(2))}</td>
            </tr>
        `;
    }
}


function normalizeProjectionType(rawType, blockHint = '') {
    const txt = cleanStr(rawType);
    const block = String(blockHint || '').toUpperCase();

    if (txt.includes('reef') || txt.includes('rc9') || txt.includes('br9') || block.includes('RC') || block.includes('BR')) return 'Reefer';
    if (txt.includes('oog') || block === 'OOG') return 'OOG';
    if (txt.includes('imdg') || txt.includes('dg') || block === 'C01' || block === 'C02') return 'IMDG';
    return 'Fixed Import';
}

function getProjectionGroundSlots() {
    return {
        'Fixed Import': Number(document.getElementById('ground-fixed-import')?.value || 0),
        'IMDG': Number(document.getElementById('ground-imdg')?.value || 0),
        'Reefer': Number(document.getElementById('ground-reefer')?.value || 0),
        'OOG': Number(document.getElementById('ground-oog')?.value || 0)
    };
}

function calculateCurrentImportSpaceByType() {
    const slotMap = {};

    invData.forEach(item => {
        const move = cleanStr(item.move);
        if (!move.includes('import')) return;

        const block = String(item.block || '').toUpperCase();
        const slot = Number(item.slot) || 0;
        if (!block || slot <= 0) return;

        const slotKey = `${block}-${slot}`;
        if (!slotMap[slotKey]) slotMap[slotKey] = { block, slot, occ: 0 };

        const len = String(item.length || '').trim();
        if (len.startsWith('20')) {
            slotMap[slotKey].occ += 1;
        } else if (len.startsWith('40') || len.startsWith('45')) {
            slotMap[slotKey].occ += 1;
            const nextKey = `${block}-${slot + 1}`;
            if (!slotMap[nextKey]) slotMap[nextKey] = { block, slot: slot + 1, occ: 0 };
            slotMap[nextKey].occ += 1;
        }
    });

    const summary = PROJECTION_TYPES.reduce((acc, type) => {
        acc[type] = { capacity: 0, occupancy: 0, available: 0 };
        return acc;
    }, {});

    Object.values(slotMap).forEach(slotData => {
        const type = normalizeProjectionType('', slotData.block);
        summary[type].capacity += 27;
        summary[type].occupancy += slotData.occ;
    });

    PROJECTION_TYPES.forEach(type => {
        summary[type].available = summary[type].capacity - summary[type].occupancy;
    });

    return summary;
}

function parsePreplanProjection(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = evt => {
            try {
                const wb = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
                const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
                if (!rows.length) return resolve([]);

                const headers = Object.keys(rows[0]);
                const findHeader = (keywords) => headers.find(h => {
                    const normalized = cleanStr(h);
                    return keywords.every(k => normalized.includes(k));
                });

                const carrierKey = findHeader(['carrier', 'in']);
                const voyageKey = findHeader(['voyage', 'in']);
                const typeKey = findHeader(['type']);
                const dis20Key = findHeader(['dis', 'to', 'go', "20'"]) || findHeader(['dis', 'to', 'go', '20']);
                const dis40Key = findHeader(['dis', 'to', 'go', "40'"]) || findHeader(['dis', 'to', 'go', '40']);

                if (!carrierKey || !voyageKey || !typeKey || !dis20Key || !dis40Key) {
                    throw new Error("Preplan columns not recognized. Required: Carrier In, Voyage In, Type, Dis. to go 20', Dis. to go 40'.");
                }

                const grouped = {};
                rows.forEach(row => {
                    const vessel = `${String(row[carrierKey] || '').trim()} ${String(row[voyageKey] || '').trim()}`.trim();
                    if (!vessel) return;

                    const type = normalizeProjectionType(row[typeKey]);
                    const incoming = Number(row[dis20Key] || 0) + Number(row[dis40Key] || 0);
                    const key = `${vessel}||${type}`;

                    if (!grouped[key]) grouped[key] = { vessel, type, incoming: 0 };
                    grouped[key].incoming += incoming;
                });

                resolve(Object.values(grouped).filter(row => row.incoming > 0));
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('Failed to read Preplan file.'));
        reader.readAsArrayBuffer(file);
    });
}

function renderDischargeProjection() {
    const body = document.getElementById('projectionBody');
    if (!body) return;

    if (!projectionPreplanRows.length) {
        body.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-slate-400 italic">Upload Preplan to generate projection.</td></tr>';
        return;
    }

    const currentSpace = calculateCurrentImportSpaceByType();
    const groundSlots = getProjectionGroundSlots();

    body.innerHTML = '';
    projectionPreplanRows.forEach(row => {
        const current = currentSpace[row.type] || { capacity: 0, occupancy: 0, available: 0 };
        const actualAvailable = current.available + (groundSlots[row.type] || 0);
        const totalCapacity = current.occupancy + actualAvailable;
        const balance = actualAvailable - row.incoming;

        const bluePct = totalCapacity > 0 ? (current.occupancy / totalCapacity) * 100 : 0;
        const incomingPct = totalCapacity > 0 ? (row.incoming / totalCapacity) * 100 : 0;
        const incomingClass = (current.occupancy + row.incoming) > totalCapacity ? 'bg-red-500' : 'bg-amber-400';

        body.innerHTML += `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-4 py-3 font-bold text-slate-700">${row.vessel}</td>
                <td class="px-4 py-3 text-slate-600">${row.type}</td>
                <td class="px-4 py-3 text-right font-semibold text-slate-700">${Math.round(row.incoming).toLocaleString()}</td>
                <td class="px-4 py-3 text-right font-bold ${balance < 0 ? 'text-red-600' : 'text-emerald-600'}">${Math.round(balance).toLocaleString()}</td>
                <td class="px-4 py-3">
                    <div class="w-full h-3 bg-slate-200 rounded-full overflow-hidden flex">
                        <div class="h-full bg-blue-500" style="width:${Math.min(bluePct, 100)}%"></div>
                        <div class="h-full ${incomingClass}" style="width:${Math.min(incomingPct, 100)}%"></div>
                    </div>
                    <div class="text-[10px] text-slate-500 font-mono mt-1">Occ ${Math.round(current.occupancy)} | In ${Math.round(row.incoming)} | Cap ${Math.round(totalCapacity)}</div>
                </td>
            </tr>
        `;
    });
}

const preplanInputEl = document.getElementById('preplanInput');
if (preplanInputEl) {
    preplanInputEl.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            projectionPreplanRows = await parsePreplanProjection(file);
            renderDischargeProjection();
        } catch (err) {
            alert(`Preplan error: ${err.message}`);
        }
    });
}

document.querySelectorAll('.projection-ground-input').forEach(input => {
    input.addEventListener('input', renderDischargeProjection);
});
