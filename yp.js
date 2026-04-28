
    let invData = [];
    let scheduleData = [];
    let isInvLoaded = false;
    let reservationData = []; // Cache for reservation file data
    let isReservationLoaded = false; // Flag for reservation file status
    let globalClashes = []; // Store clashes for sorting/filtering
    let activeFilterBlock = null;
    let activeVesselFilter = null;
    let projectionPreplanRows = [];
    const PROJECTION_TYPES = ['Fixed Import', 'IMDG', 'Reefer', 'OOG'];
    let projectionTypeFilter = 'ALL';
    let projectionOrderByType = {};
    let projectionDragState = { type: null, vessel: null };
    let chatHistory = [];
    const MAX_CHAT_MESSAGES = 24;

    // Constants
    const EXPORT_DEFAULTS = ["A01", "A02", "A03", "A04", "A05", "B01", "B02", "B03", "B04", "B05", "C03", "C04"];
    const EXCLUDED_BLOCKS_YARD = ["C01", "C02", "OOG", "RC9", "BR9"];
    const EXCLUDED_BLOCKS_CLASH = ["C01", "C02", "OOG", "RC9", "BR9"];
    const RECOMMENDED_SPREAD_BLOCKS = [
      "A01","A02","A03","A04","A05","A06","A07","A08",
      "B01","B02","B03","B04","B05","B06","B07","B08",
      "C01","C02","C03","C04","C05","C06","C07","C08"
    ];
    const PURE_IMPORT_BLOCKS = ["A06", "A07", "A08", "B06", "B07", "B08", "C05", "C06", "C07", "C08"];
    let selectedBlocks = [...PURE_IMPORT_BLOCKS]; // Default to pure import blocks
    
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

    // ─── BOLLARD TABLE ─────────────────────────────────────────────────────────
    // Maps bollard number (1-29) to its physical position (meters along quay)
    const BOLLARD_TABLE = [
        { num: 1,  pos: 7   }, { num: 2,  pos: 28  }, { num: 3,  pos: 55  },
        { num: 4,  pos: 86  }, { num: 5,  pos: 118 }, { num: 6,  pos: 150 },
        { num: 7,  pos: 181 }, { num: 8,  pos: 212 }, { num: 9,  pos: 244 },
        { num: 10, pos: 270 }, { num: 11, pos: 302 }, { num: 12, pos: 334 },
        { num: 13, pos: 365 }, { num: 14, pos: 397 }, { num: 15, pos: 428 },
        { num: 16, pos: 455 }, { num: 17, pos: 486 }, { num: 18, pos: 518 },
        { num: 19, pos: 550 }, { num: 20, pos: 581 }, { num: 21, pos: 612 },
        { num: 22, pos: 644 }, { num: 23, pos: 671 }, { num: 24, pos: 702 },
        { num: 25, pos: 734 }, { num: 26, pos: 765 }, { num: 27, pos: 797 },
        { num: 28, pos: 828 }, { num: 29, pos: 849 }
    ];
    const BOLLARD_MIN_POS = 7;
    const BOLLARD_MAX_POS = 849;

    // Parse a bollard field value (e.g. "BL13", "(560)", "(3)") to a meter position
    function parseBollardToPos(raw) {
        if (!raw || raw === '') return null;
        const s = String(raw).trim();
        // Format "BLxx" => bollard number
        const blMatch = s.match(/^BL(\d+)$/i);
        if (blMatch) {
            const num = parseInt(blMatch[1]);
            const entry = BOLLARD_TABLE.find(b => b.num === num);
            return entry ? entry.pos : null;
        }
        // Format "(xxx)" => position in meters
        const posMatch = s.match(/^\((\d+)\)$/);
        if (posMatch) {
            return parseInt(posMatch[1]);
        }
        // Plain number
        const plain = parseInt(s);
        if (!isNaN(plain)) return plain;
        return null;
    }

    // Convert position (meters) to closest bollard number
    function posToNearestBollard(pos) {
        if (pos === null) return null;
        let best = null, bestDist = Infinity;
        BOLLARD_TABLE.forEach(b => {
            const d = Math.abs(b.pos - pos);
            if (d < bestDist) { bestDist = d; best = b; }
        });
        return best;
    }

    function parseVesselScheduleFile(file, onComplete) {
        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const wb = XLSX.read(new Uint8Array(evt.target.result), {type: 'array'});
                const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1, defval: ''});
                if (!json.length) throw new Error('Empty vessel schedule file.');

                const rawHeaders = json[0];
                const headers = rawHeaders.map(c => cleanStr(c));
                const vesselIdx  = headers.findIndex(x => (x.includes('carrier') || x.includes('vessel') || x.includes('ship')) && !x.includes('type'));
                const serviceIdx = headers.findIndex(x => x.includes('service') && x.includes('out')) !== -1
                    ? headers.findIndex(x => x.includes('service') && x.includes('out'))
                    : headers.findIndex(x => x.includes('service'));
                const etaIdx     = headers.findIndex(x => x.includes('eta') || x.includes('arrival'));
                const etdIdx     = headers.findIndex(x => x.includes('etd') || x.includes('departure'));
                const ataIdx     = headers.findIndex(x => x === 'ata');
                const atdIdx     = headers.findIndex(x => x === 'atd');
                // Bollard columns
                const startBolIdx = headers.findIndex(x => x.includes('start') && x.includes('bol'));
                const endBolIdx   = headers.findIndex(x => (x.includes('end') || x.includes('finish')) && x.includes('bol'));
                const moorageIdx  = headers.findIndex(x => x === 'moorage' || x === 'berth');

                if (vesselIdx === -1) throw new Error('Schedule file harus memiliki kolom Carrier atau Vessel.');
                if (etaIdx   === -1) throw new Error('Schedule file harus memiliki kolom ETA atau Arrival.');

                const rows = [];
                for (let i = 1; i < json.length; i++) {
                    const row = json[i];
                    if (!row[vesselIdx]) continue;
                    const carrier  = String(row[vesselIdx] || '').toUpperCase().trim();
                    const service  = serviceIdx !== -1 ? String(row[serviceIdx] || '').toUpperCase().trim() : '';
                    const moorage  = moorageIdx !== -1 ? String(row[moorageIdx] || '').trim() : '';
                    const eta      = parseDate(row[etaIdx]);
                    let   etd      = etdIdx !== -1 ? parseDate(row[etdIdx]) : null;
                    const ata      = ataIdx  !== -1 ? parseDate(row[ataIdx])  : null;
                    const atd      = atdIdx  !== -1 ? parseDate(row[atdIdx])  : null;
                    if (!eta) continue;
                    if (!etd) etd = new Date(eta.getTime() + 86400000);

                    // Bollard data
                    const startBolRaw = startBolIdx !== -1 ? String(row[startBolIdx] || '').trim() : '';
                    const endBolRaw   = endBolIdx   !== -1 ? String(row[endBolIdx]   || '').trim() : '';
                    const startPos    = parseBollardToPos(startBolRaw);
                    const endPos      = parseBollardToPos(endBolRaw);
                    const hasBerth    = startPos !== null && endPos !== null;

                    rows.push({
                        carrier, service, moorage,
                        eta, etd, ata, atd,
                        startBolRaw, endBolRaw,
                        startPos, endPos, hasBerth,
                        v: carrier
                    });
                }

                scheduleData = rows;
                if (typeof onComplete === 'function') onComplete();
            } catch (err) {
                alert(err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    document.getElementById('scheduleInput').addEventListener('change', function(e) {
        if (!e.target.files[0]) return;
        parseVesselScheduleFile(e.target.files[0], function() {
            renderBerthGantt();
            if (isInvLoaded) {
                renderClusterSpreading();
                renderEmptySummary();
                if (typeof processClashAnalysis === 'function') processClashAnalysis();
            }
        });
    });

    function getDashboardContext() {
        const blockAgg = {};
        const invRows = invData || [];

        invRows.forEach(item => {
            const block = String(item?.block || 'UNKNOWN');
            const length = String(item?.length || '40');
            const teus = length.startsWith('20') ? 1 : (length.startsWith('45') ? 2.25 : 2);

            if (!blockAgg[block]) {
                blockAgg[block] = { boxCount: 0, teus: 0, c20: 0, c40: 0, c45: 0 };
            }

            blockAgg[block].boxCount += 1;
            blockAgg[block].teus += teus;
            if (length.startsWith('20')) blockAgg[block].c20 += 1;
            else if (length.startsWith('45')) blockAgg[block].c45 += 1;
            else blockAgg[block].c40 += 1;
        });

        const totalCapacityTeus = Object.values(activeCapacity || {}).reduce((sum, c) => sum + Number(c?.cap || 0), 0);
        const totalTeus = Object.values(blockAgg).reduce((sum, b) => sum + b.teus, 0);
        const yorPct = totalCapacityTeus > 0 ? Number(((totalTeus / totalCapacityTeus) * 100).toFixed(2)) : 0;

        const blockSummary = Object.entries(blockAgg)
            .map(([block, v]) => ({
                block,
                boxCount: v.boxCount,
                teus: Number(v.teus.toFixed(2)),
                c20: v.c20,
                c40: v.c40,
                c45: v.c45,
                capTeus: Number(activeCapacity?.[block]?.cap || 0),
                occPct: Number(((v.teus / Number(activeCapacity?.[block]?.cap || 1)) * 100).toFixed(2))
            }))
            .sort((a, b) => b.occPct - a.occPct)
            .slice(0, 20);

        const clashByBlock = {};
        (globalClashes || []).forEach(clash => {
            const block = String(clash?.block || 'UNKNOWN');
            clashByBlock[block] = (clashByBlock[block] || 0) + 1;
        });
        const topClashBlocks = Object.entries(clashByBlock)
            .map(([block, count]) => ({ block, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const moveDistribution = {};
        const lineDistribution = {};
        const serviceDistribution = {};
        invRows.forEach(item => {
            const move = String(item?.move || 'UNKNOWN').toUpperCase();
            const line = String(item?.line || 'UNKNOWN').toUpperCase();
            const service = String(item?.service || 'UNKNOWN').toUpperCase();
            moveDistribution[move] = (moveDistribution[move] || 0) + 1;
            lineDistribution[line] = (lineDistribution[line] || 0) + 1;
            serviceDistribution[service] = (serviceDistribution[service] || 0) + 1;
        });

        const compactContext = {
            generatedAt: new Date().toISOString(),
            status: {
                inventoryLoaded: Boolean(isInvLoaded),
                inventoryRows: invRows.length,
                clashRows: (globalClashes || []).length,
                projectionRows: (projectionPreplanRows || []).length
            },
            kpi: {
                totalBoxes: Object.values(blockAgg).reduce((s, b) => s + b.boxCount, 0),
                totalTeus: Number(totalTeus.toFixed(2)),
                totalCapacityTeus,
                yorPct
            },
            distributions: {
                move: moveDistribution,
                line: lineDistribution,
                service: serviceDistribution
            },
            topDensityBlocks: blockSummary,
            topClashBlocks
        };

        return JSON.stringify(compactContext);
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
            let colMap = { block: -1, length: -1, carrier: -1, move: -1, slot: -1, row: -1, loadStatus: -1, service: -1, line: -1, arrivalDate: -1, oog: -1, spod: -1, wtcl: -1, conttype: -1, unitheight: -1, unit: -1 };
            
            for(let i=0; i<Math.min(json.length, 30); i++) {
                let rStr = json[i].map(c => cleanStr(c)).join(" ");
                if((rStr.includes("area") || rStr.includes("block") || rStr.includes("slot")) && 
                   (rStr.includes("vessel") || rStr.includes("carrier") || rStr.includes("line"))) {
                    hIdx = i;
                    json[i].forEach((cell, idx) => {
                        let cRaw = String(cell || "").toLowerCase().trim();
                        let c = cleanStr(cell).replace(/[\s_]+/g, "");
                        let cReplanKey = String(cell || "").toLowerCase().replace(/[^a-z0-9]/g, "");

                        if(c.includes("area") || c.includes("block")) colMap.block = idx;
                        if(cReplanKey === "unitlength" || c.includes("size")) colMap.length = idx;
                        if(cReplanKey === "carrierout" || c === "carrier" || c === "vessel") colMap.carrier = idx;
                        if(c === "move" || c === "status" || c === "category") colMap.move = idx;
                        if(c.includes("slot") && c.includes("exe")) colMap.slot = idx;
                        if(c.includes("row") && c.includes("exe")) colMap.row = idx;
                        // LOGIC BARU: Deteksi kolom Load Status
                        if(c.includes("load") && c.includes("status")) colMap.loadStatus = idx;
                        // Detect Service column (e.g., "service", "serviceout", "service out")
                        if(cReplanKey === "serviceout" || c.includes("service")) colMap.service = idx;
                        // Deteksi kolom Line
                        if(c === "line" || c.includes("Line")) colMap.line = idx;
                        // Deteksi date
                        if(c === "arrivalDate" || (c.includes("arrival") && c.includes("date"))) {
                            colMap.arrivalDate = idx;
                        }
                        // Deteksi OOG
                        if(cReplanKey === "oog" || c === "o/g") colMap.oog = idx;

                        // Replan fields
                        if(cReplanKey === "spod") colMap.spod = idx;
                        if(cReplanKey === "wtcl") colMap.wtcl = idx;
                        if(cReplanKey === "conttype") colMap.conttype = idx;
                        if(cReplanKey === "unitheight" || c === "height") colMap.unitheight = idx;
                        if(cReplanKey === "unit") colMap.unit = idx;
                    });
                    break;
                }
            }

            if(hIdx === -1 || colMap.carrier === -1) throw new Error("Format kolom tidak dikenali.");

            invData = [];
            function formatExcelDate(excelSerial) {
    if (!excelSerial) return "UNKNOWN";
    
    // Cek apakah nilainya adalah angka ribuan (seperti 46070)
    if (!isNaN(excelSerial) && Number(excelSerial) > 30000) {
        // Rumus sakti mengubah serial Excel menjadi Tanggal Javascript
        const utc_days  = Math.floor(excelSerial - 25569);
        const date_info = new Date(utc_days * 86400 * 1000);
        
        // Ambil Tanggal, Bulan, Tahun
        const day = String(date_info.getDate()).padStart(2, '0');
        const month = String(date_info.getMonth() + 1).padStart(2, '0'); // Bulan dimulai dari 0
        const year = date_info.getFullYear();
        
        return `${day}/${month}/${year}`; // Hasilnya: "26/02/2026"
    }
    
    // Kalau dari Excel sudah berbentuk teks normal, biarkan saja
    return String(excelSerial).trim();
}
            for(let i=hIdx+1; i<json.length; i++) {
                let row = json[i];
                if(!row[colMap.block] && !row[colMap.slot]) continue;
                
                // Parsing Slot, Block, & Row
                let slotStr = colMap.slot !== -1 ? String(row[colMap.slot] || "") : "";
                let parsedBlock = "N", parsedSlotNum = 0, parsedRow = 0;
                
                if(slotStr.includes('-')) {
                    let parts = slotStr.split('-');
                    parsedBlock = parts[0].trim();
                    if (parts.length >= 2) parsedSlotNum = parseInt(parts[1]) || 0;
                    if (parts.length >= 3) parsedRow = parseInt(parts[2]) || 0;
                } else if(colMap.block !== -1 && row[colMap.block]) {
                    parsedBlock = String(row[colMap.block]).trim();
                    if (colMap.slot !== -1) parsedSlotNum = parseInt(row[colMap.slot]) || 0;
                } else if(slotStr !== "") {
                    parsedSlotNum = parseInt(slotStr) || 0;
                }

                // Fallback: Parsing Row EX if available and not found in slot string
                if (parsedRow === 0 && colMap.row !== -1 && row[colMap.row]) {
                    parsedRow = parseInt(row[colMap.row]) || 0;
                }

                invData.push({
                    block: parsedBlock.toUpperCase(),
                    slot: parsedSlotNum,
                    row: parsedRow,
                    length: colMap.length !== -1 ? String(row[colMap.length] || "") : "20",
                    carrier: String(row[colMap.carrier] || "").toUpperCase().trim(),
                    move: colMap.move !== -1 ? String(row[colMap.move] || "").toLowerCase() : "import",
                    // UPDATE: Simpan Load Status
                    loadStatus: colMap.loadStatus !== -1 ? String(row[colMap.loadStatus] || "").toUpperCase() : "FULL",
                    service: colMap.service !== -1 ? String(row[colMap.service] || "").toUpperCase().trim() : "",
                    line: colMap.line !== -1 ? String(row[colMap.line] || "").toUpperCase().trim() : "UNKNOWN",
                    // KODE BARU (Memakai fungsi formatExcelDate):
                    arrivalDate: colMap.arrivalDate !== -1 ? formatExcelDate(row[colMap.arrivalDate]) : "UNKNOWN",
                    oog: colMap.oog !== -1 ? String(row[colMap.oog] || "").toUpperCase().trim() : "N",

                    // Replan Analyzer added fields
                    _raw_slot: slotStr,
                    unit: colMap.unit !== -1 ? String(row[colMap.unit] || "").toUpperCase().trim() : "",
                    spod: colMap.spod !== -1 ? String(row[colMap.spod] || "").toUpperCase().trim() : "",
                    wtcl: colMap.wtcl !== -1 ? String(row[colMap.wtcl] || "").toUpperCase().trim() : "",
                    conttype: colMap.conttype !== -1 ? String(row[colMap.conttype] || "").toUpperCase().trim() : "",
                    unitheight: colMap.unitheight !== -1 ? String(row[colMap.unitheight] || "").toUpperCase().trim() : ""
                });
            }

            isInvLoaded = true;
            window.invData = invData; // Expose globally for Replan Analyzer
            // AI chat button is always visible in control card.
            
            // Render All Tabs
            renderOverview();
            renderClusterSpreading();
            renderEmptySummary(); // FUNGSI BARU DIPANGGIL DISINI
            if (typeof renderYardMap === 'function') renderYardMap();
            const projectionBody = document.getElementById('projectionBody');
            if (projectionBody) projectionBody.innerHTML = '<tr><td colspan="10" class="px-4 py-6 text-center text-slate-400 italic">Upload Preplan to generate projection.</td></tr>';
            
            setProgress(100, "Selesai!");
            setTimeout(() => {
                loader.classList.add('hidden');
                if (scheduleData && scheduleData.length > 0 && typeof processClashAnalysis === 'function') {
                    processClashAnalysis();
                }
            }, 500);
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
        const _overviewRows = [];
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
if (b === "") {
  remark = " Area";
  rCls = "row-";

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

            _overviewRows.push(`
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
                </tr>`);
        });
        tbody.innerHTML = _overviewRows.join('');

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
        
        const card = document.getElementById('yorOverallCard');
        const note = document.getElementById('yorWarningNote');
        if (card) {
            if (yTot > 65) {
                card.classList.add('yor-overall-alert');
            } else {
                card.classList.remove('yor-overall-alert');
            }
        }
        if (note) {
            if (yTot > 65) {
                note.classList.remove('hidden');
            } else {
                note.classList.add('hidden');
            }
        }
        
        const setR = (id, v) => {
  const pct = Math.min(v, 100);
  document.getElementById(id).style.strokeDashoffset = 100 - pct;
};
;
        setR('ringImp', yImp); setR('ringExp', yExp); setR('ringTotal', yTot);
    }

    // --- TAB 2: ANALYTICS (Enhanced) ---
    function renderRecommendedSpreading() {
        const body = document.getElementById('recommendedSpreadingBody');
        body.innerHTML = '';

        const allowedBlocks = new Set(RECOMMENDED_SPREAD_BLOCKS);
        const vesselBlocks = {};

        invData.forEach(it => {
            if (!it.move.includes('export')) return;
            const block = String(it.block || '').toUpperCase();
            if (!allowedBlocks.has(block)) return;
            let c = it.carrier;
            if (!c || c === '0' || c === 'NIL') return;
            const service = String(it.service || '').toUpperCase();
            const key = `${c}||${service}`;
            if (!vesselBlocks[key]) vesselBlocks[key] = { carrier: c, service, blocks: {} };
            vesselBlocks[key].blocks[block] = (vesselBlocks[key].blocks[block] || 0) + 1;
        });

        // Calculate total expected cluster and total vessels
        let totalExpected = 0;
        const vesselSet = new Set();
        Object.values(vesselBlocks).forEach(v => {
            const expected = typeof getExpectedClusterForService === 'function' ? getExpectedClusterForService(v.service) : null;
            if (expected !== null) totalExpected += expected;
            vesselSet.add(v.carrier);
        });
        const totalVessels = vesselSet.size;
        const maxPerBlock = totalVessels > 0 ? Math.ceil(totalExpected / totalVessels) : 5; // default 5 if no data

        const blockSummary = {};
        Object.values(vesselBlocks).forEach(v => {
            const expected = typeof getExpectedClusterForService === 'function' ? getExpectedClusterForService(v.service) : null;
            const blockEntries = Object.entries(v.blocks).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
            const selected = expected !== null && blockEntries.length > expected ? blockEntries.slice(0, expected) : blockEntries;
            selected.forEach(([block, count]) => {
                if (!blockSummary[block]) blockSummary[block] = [];
                blockSummary[block].push({ carrier: v.carrier, count });
            });
        });

        const results = RECOMMENDED_SPREAD_BLOCKS.map(block => {
            const vessels = (blockSummary[block] || []).sort((a, b) => b.count - a.count || a.carrier.localeCompare(b.carrier));
            return { block, vessels };
        }).filter(row => row.vessels.length && !['C01', 'C02'].includes(row.block));

        if (!results.length) {
            body.innerHTML = '<tr><td colspan="2" class="p-8 text-center text-slate-400">No recommended spreading data available.</td></tr>';
            renderVesselFilterChips(results);
            return;
        }

        const _recRows = [];
        results.forEach(row => {
            const isMatch = activeVesselFilter && row.vessels.some(v => v.carrier === activeVesselFilter);
            const rowClass = `transition ${isMatch ? 'bg-blue-50/40' : 'hover:bg-slate-50'}`;
            const blockCellClass = `px-4 py-3 font-bold text-slate-700 ${isMatch ? 'border-l-4 border-blue-500 pl-3' : ''}`;
            const primaryVessels = row.vessels.slice(0, maxPerBlock);
            const secondaryVessels = row.vessels.slice(maxPerBlock);
            const badges = [
                ...primaryVessels.map(v => {
                    let cls = v.count > 200 ? 'bg-red-600 text-white shadow-sm' : (v.count > 100 ? 'bg-amber-400 text-slate-900' : 'bg-blue-50 text-blue-700 border border-blue-100');
                    if (activeVesselFilter && v.carrier === activeVesselFilter) {
                        cls = 'bg-blue-600 text-white border border-blue-700 shadow-lg';
                    }
                    return `<span class="inline-flex items-center justify-between px-2 py-1 rounded text-[10px] font-bold ${cls} mr-1 mb-1 min-w-[3.5rem]"><span class="mr-1">${v.carrier}</span><span>${v.count}</span></span>`;
                }),
                ...secondaryVessels.map(v => {
                    let cls = 'bg-gray-200 text-gray-500 border border-gray-300 opacity-60';
                    if (activeVesselFilter && v.carrier === activeVesselFilter) {
                        cls = 'bg-blue-100 text-blue-800 border border-blue-300 shadow-sm';
                    }
                    return `<span class="inline-flex items-center justify-between px-2 py-1 rounded text-[10px] font-bold ${cls} mr-1 mb-1 min-w-[3.5rem]"><span class="mr-1">${v.carrier}</span><span>${v.count}</span></span>`;
                })
            ].join('');
            _recRows.push(`<tr class="${rowClass}"><td class="${blockCellClass}">${row.block}</td><td class="px-4 py-3">${badges}</td></tr>`);
        });
        body.innerHTML = _recRows.join('');
        renderVesselFilterChips(results);
    }

    function renderVesselFilterChips(results) {
        const container = document.getElementById('vesselFilterList');
        const totalLabel = document.getElementById('totalVesselsOnYard');
        const activeInfo = document.getElementById('activeVesselFilterInfo');
        const activeName = document.getElementById('activeVesselFilterName');
        if (!container || !totalLabel) return;

        const vessels = Array.from(new Set(
            (results === undefined ? invData
                .filter(it => String(it.move || '').toLowerCase().includes('export'))
                .map(it => String(it.carrier || '').trim().toUpperCase())
                .filter(v => v && v !== '0' && v !== 'NIL') : results.flatMap(row => row.vessels.map(v => v.carrier)))
        )).sort((a, b) => a.localeCompare(b));

        if (activeVesselFilter && !vessels.includes(activeVesselFilter)) {
            activeVesselFilter = null;
        }

        totalLabel.innerText = vessels.length;
        container.innerHTML = vessels.length ? vessels.map(v => `<button type="button" class="vessel-filter-chip ${activeVesselFilter === v ? 'active' : ''}" data-vessel="${v}">${v}</button>`).join('') : '<span class="text-slate-500 text-xs">No recommended vessels available.</span>';

        if (activeInfo && activeName) {
            if (activeVesselFilter) {
                activeInfo.classList.remove('hidden');
                activeName.innerText = activeVesselFilter;
            } else {
                activeInfo.classList.add('hidden');
                activeName.innerText = '';
            }
        }
    }

    function toggleVesselFilter(vessel) {
        activeVesselFilter = activeVesselFilter === vessel ? null : vessel;
        renderRecommendedSpreading();
    }

    function clearVesselFilter() {
        activeVesselFilter = null;
        renderRecommendedSpreading();
    }

    document.addEventListener('click', function(event) {
        const el = event.target.closest('.vessel-filter-chip');
        if (!el) return;
        const vessel = el.dataset.vessel;
        if (vessel) toggleVesselFilter(vessel);
    });

    // ── Scroll Gantt chart to a specific carrier
    function scrollGanttToVessel(carrier) {
        const wrapper = document.getElementById('berthGanttWrapper');
        if (!wrapper) return;

        // Phase 1: Scroll the PAGE so Gantt panel is visible
        const panel = wrapper.closest('[class*="glass-panel"]') || wrapper;
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        // Phase 2: After page scroll settles, do internal wrapper scroll
        setTimeout(() => {
            if (!window._ganttCarrierY) return;
            const yData = window._ganttCarrierY[carrier];
            if (!yData) return;

            // Scroll wrapper so vessel's ETA appears ~30% from top
            const wH = wrapper.clientHeight || 420;
            const scrollTarget = Math.max(0, yData.scrollY - wH * 0.3);
            wrapper.scrollTo({ top: scrollTarget, behavior: 'smooth' });

            // Flash-highlight the vessel rects after scroll settles
            setTimeout(() => {
                const rects = wrapper.querySelectorAll(`[data-gantt-carrier="${CSS.escape(carrier)}"]`);
                rects.forEach(rect => {
                    rect.style.transition = 'filter 0.15s';
                    let n = 0;
                    const iv = setInterval(() => {
                        rect.style.filter = n % 2 === 0
                            ? 'brightness(1.8) drop-shadow(0 0 8px rgba(255,255,255,0.9))'
                            : 'brightness(1)';
                        if (++n > 6) { clearInterval(iv); rect.style.filter = ''; rect.style.transition = ''; }
                    }, 160);
                });
            }, 350);
        }, 500);
    }
    window.scrollGanttToVessel = scrollGanttToVessel;

    window.toggleFullScreenCluster = function() {
        const el = document.getElementById('clusterSpreadingContainer');
        if (!el) return;
        
        if (!el.classList.contains('is-modal-fullscreen')) {
            // Create placeholder to maintain flow
            const placeholder = document.createElement('div');
            placeholder.id = 'clusterSpreadingPlaceholder';
            placeholder.style.height = el.offsetHeight + 'px';
            el.parentNode.insertBefore(placeholder, el);
            
            // Move block to body
            document.body.appendChild(el);
            
            // Apply modal popup styles
            el.classList.add('is-modal-fullscreen', 'fixed', 'inset-0', 'z-[120]', 'm-auto', 'w-[98vw]', 'h-[95vh]', 'overflow-y-auto', 'rounded-3xl', 'shadow-2xl', 'border', 'border-slate-200', 'bg-white');
            el.classList.remove('rounded-2xl', 'shadow-glass', 'border-white/40', 'bg-slate-50');
            
            // Add backdrop overlay
            const backdrop = document.createElement('div');
            backdrop.id = 'clusterSpreadingBackdrop';
            backdrop.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] transition-opacity animate-fade-in';
            document.body.insertBefore(backdrop, el);
            
            document.body.classList.add('overflow-hidden');
            
            // Update icon
            const btnIcon = el.querySelector('button[title="Toggle Full Screen"] span');
            if (btnIcon) btnIcon.textContent = 'fullscreen_exit';
            
            // Auto-fit Logic
            setTimeout(() => {
                const tableContainer = el.querySelector('.overflow-x-auto');
                const table = document.getElementById('clusterTable');
                if (tableContainer && table) {
                    tableContainer.style.overflowX = 'hidden';
                    table.style.zoom = '1';
                    const availW = tableContainer.clientWidth;
                    const reqW = table.offsetWidth;
                    if (reqW > availW && availW > 0) {
                        table.style.zoom = (availW / reqW).toString();
                    }
                }
            }, 50);
        } else {
            // Restore to placeholder
            const placeholder = document.getElementById('clusterSpreadingPlaceholder');
            if (placeholder) {
                placeholder.parentNode.insertBefore(el, placeholder);
                placeholder.remove();
            }
            
            // Remove backdrop
            const backdrop = document.getElementById('clusterSpreadingBackdrop');
            if (backdrop) backdrop.remove();
            
            // Revert styles
            el.classList.remove('is-modal-fullscreen', 'fixed', 'inset-0', 'z-[120]', 'm-auto', 'w-[98vw]', 'h-[95vh]', 'overflow-y-auto', 'rounded-3xl', 'shadow-2xl', 'border', 'border-slate-200', 'bg-white');
            el.classList.add('rounded-2xl', 'shadow-glass', 'border-white/40', 'bg-slate-50');
            document.body.classList.remove('overflow-hidden');
            
            // Update icon
            const btnIcon = el.querySelector('button[title="Toggle Full Screen"] span');
            if (btnIcon) btnIcon.textContent = 'fullscreen';
            
            // Revert Auto-fit Logic
            const tableContainer = el.querySelector('.overflow-x-auto');
            const table = document.getElementById('clusterTable');
            if (tableContainer && table) {
                tableContainer.style.overflowX = 'auto';
                table.style.zoom = '';
            }
        }
    };

    // ─── BERTH GANTT CHART ─────────────────────────────────────────────────────
    let _ganttPph = 5; // default 5px/h; null = fit to screen

    function zoomGantt(factor) {
        const el = document.getElementById('berthGanttContent');
        const cur = parseFloat(el?.dataset?.pph || '30');
        _ganttPph = (factor === 0) ? null : Math.max(2, Math.min(300, cur * factor));
        renderBerthGantt();
        const lbl = document.getElementById('ganttZoomLabel');
        if (lbl) lbl.textContent = _ganttPph ? Math.round(_ganttPph) + 'px/h' : 'FIT';
    }
    window.zoomGantt = zoomGantt;

    function renderBerthGantt() {
        const container = document.getElementById('berthGanttContent');
        if (!container) return;
        const now = new Date();
        const BOLLARD_RANGE = BOLLARD_MAX_POS - BOLLARD_MIN_POS;

        const vessels = (scheduleData || []).filter(v => v.hasBerth && v.etd >= now);
        const totalAll = (scheduleData || []).length;
        const totalWithBerth = (scheduleData || []).filter(v => v.hasBerth).length;
        const totalPast = (scheduleData || []).filter(v => v.hasBerth && v.etd < now).length;

        const statsEl = document.getElementById('berthGanttStats');
        if (statsEl) statsEl.innerHTML = vessels.length
            ? `<span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-indigo-500 inline-block"></span>
               Showing: <strong class="text-slate-800 ml-1">${vessels.length}</strong>&nbsp;vessels</span>
               <span class="text-slate-300">|</span><span class="text-slate-400">Skipped (past): <strong>${totalPast}</strong></span>
               <span class="text-slate-300">|</span><span class="text-slate-400">No berth data: <strong>${totalAll - totalWithBerth}</strong></span>`
            : `<span class="text-slate-400 italic">Upload Call List to view berth schedule.</span>`;

        if (!vessels.length) {
            container.innerHTML = `<div class="flex flex-col items-center justify-center py-16 text-slate-400">
                <span class="material-symbols-outlined text-5xl mb-3 opacity-30">anchor</span>
                <p class="text-sm font-semibold text-slate-500">No upcoming vessels with berth data.</p>
                <p class="text-xs text-slate-400 mt-1">Upload Call List dengan kolom <code class="bg-slate-100 px-1 rounded">Start bol.</code> dan <code class="bg-slate-100 px-1 rounded">End bol.</code></p>
            </div>`;
            const le = document.getElementById('berthGanttLegend'); if (le) le.innerHTML = '';
            return;
        }

        // Use yardmap colors where available (same as yard map legend), fallback to own palette
        const PALETTE = ['#4f46e5','#0891b2','#059669','#d97706','#db2777','#7c3aed','#0284c7','#16a34a','#ca8a04','#e11d48','#6366f1','#0e7490','#15803d','#b45309','#be185d'];
        const colorMap = {}; let ci = 0;
        vessels.forEach(v => {
            if (!colorMap[v.carrier]) {
                // Prefer yard map color (from yardmap.js) for visual consistency
                const yardColor = (typeof yardCarrierColorMap !== 'undefined' && yardCarrierColorMap[v.carrier])
                    ? yardCarrierColorMap[v.carrier]
                    : PALETTE[ci++ % PALETTE.length];
                colorMap[v.carrier] = yardColor;
            }
        });

        // Time range
        const rawMin = Math.min(...vessels.map(v => v.eta.getTime()), now.getTime());
        const rawMax = Math.max(...vessels.map(v => v.etd.getTime()));
        const minTime = new Date(rawMin - 4 * 3600000);
        const maxTime = new Date(rawMax + 4 * 3600000);
        const totalMs = maxTime - minTime;
        const totalHours = totalMs / 3600000;

        // Layout
        const LABEL_W  = 72;
        const HEADER_H = 80;
        const CONTENT_W = Math.max(860, (container.parentElement?.clientWidth || 940) - LABEL_W - 12);

        // PX_PER_HOUR: fit to screen or user-set
        const FIT_AVAIL_H = 420;
        const PX_PER_HOUR = _ganttPph !== null
            ? _ganttPph
            : Math.max(2, Math.min(100, (FIT_AVAIL_H - HEADER_H) / totalHours));
        container.dataset.pph = PX_PER_HOUR;

        const CHART_H = Math.ceil(totalHours * PX_PER_HOUR);
        const svgW = LABEL_W + CONTENT_W;
        const svgH = HEADER_H + CHART_H + 28;

        // Coordinate helpers — X: BL29→left, BL1→right (Block A on right)
        function bX(pos) {
            return LABEL_W + (BOLLARD_MAX_POS - Math.max(BOLLARD_MIN_POS, Math.min(BOLLARD_MAX_POS, pos))) / BOLLARD_RANGE * CONTENT_W;
        }
        function tY(t) { return HEADER_H + (t - minTime) / totalMs * CHART_H; }
        function fmt(d) {
            if (!d) return '';
            return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        }

        // Time ticks
        const rangeDays = totalMs / 86400000;
        const tickH = rangeDays > 7 ? 24 : rangeDays > 3 ? 12 : 6;
        const ticks = [];
        { let t = new Date(Math.ceil(minTime.getTime() / (tickH*3600000)) * (tickH*3600000));
          while (t <= maxTime) { ticks.push(new Date(t)); t = new Date(t.getTime() + tickH*3600000); } }

        const nowY = tY(now);
        let chart = '', overlay = '', leftLbls = '';

        // 1. Day bands
        { let d = new Date(minTime); d.setHours(0,0,0,0);
          while (d <= maxTime) {
            const y1 = Math.max(tY(d), HEADER_H);
            const y2 = Math.min(tY(new Date(d.getTime()+86400000)), HEADER_H+CHART_H);
            if (y2 > y1) {
                const we = d.getDay()===0||d.getDay()===6;
                chart += `<rect x="${LABEL_W}" y="${y1}" width="${CONTENT_W}" height="${y2-y1}" fill="${we?'#ede9fe':d.getDate()%2===0?'#f8fafc':'#fff'}" opacity="0.75"/>`;
            }
            d.setDate(d.getDate()+1);
          }
        }

        // 2. Bollard vertical grid
        BOLLARD_TABLE.forEach(b => {
            const x = bX(b.pos), maj = b.num%4===1||b.num===29;
            chart += `<line x1="${x}" y1="${HEADER_H}" x2="${x}" y2="${HEADER_H+CHART_H}" stroke="${maj?'#dde1ea':'#f1f5f9'}" stroke-width="${maj?1:0.5}"/>`;
        });

        // 3. Horizontal time grid
        ticks.forEach(t => {
            const y = tY(t); if (y<HEADER_H||y>HEADER_H+CHART_H) return;
            const mid = t.getHours()===0;
            chart += `<line x1="${LABEL_W}" y1="${y}" x2="${LABEL_W+CONTENT_W}" y2="${y}" stroke="${mid?'#c7d2fe':'#e2e8f0'}" stroke-width="${mid?1.5:0.75}" stroke-dasharray="${mid?'':'5,4'}"/>`;
        });

        // Build per-carrier export container count (same as cluster spreading 'totalAll')
        const carrierTeuMap = {};
        if (Array.isArray(invData) && invData.length) {
            invData.forEach(it => {
                const c = String(it.carrier || '').toUpperCase().trim();
                if (!c || c === '0' || c === 'NIL') return;
                if (!String(it.move || '').toLowerCase().includes('export')) return;
                carrierTeuMap[c] = (carrierTeuMap[c] || 0) + 1;
            });
        }

        // 4. Vessel rectangles
        vessels.forEach(v => {
            const color = colorMap[v.carrier];
            const xL = bX(Math.max(v.startPos,v.endPos)), xR = bX(Math.min(v.startPos,v.endPos));
            const bW = Math.max(xR-xL, 14);
            const y1 = tY(v.eta), y2 = tY(v.etd);
            const bH = Math.max(y2-y1, 14);
            const active = v.eta<=now&&v.etd>=now;

            chart += `<rect x="${xL+2}" y="${y1+2}" width="${bW}" height="${bH}" rx="5" fill="#0f172a" opacity="0.1"/>`;
            chart += `<rect data-gantt-carrier="${v.carrier}" x="${xL}" y="${y1}" width="${bW}" height="${bH}" rx="5" fill="${color}" opacity="${active?'0.95':'0.82'}" style="cursor:pointer"/>`;
            if (active) chart += `<rect x="${xL-2}" y="${y1-2}" width="${bW+4}" height="${bH+4}" rx="6" fill="none" stroke="${color}" stroke-width="2.5" opacity="0.4"/>`;
            chart += `<rect x="${xL}" y="${y1}" width="${bW}" height="${Math.min(bH*0.35,14)}" rx="5" fill="white" opacity="0.18"/>`;

            if (v.ata&&v.ata>=minTime&&v.ata<=maxTime) {
                const ay = tY(v.ata);
                chart += `<line x1="${xL}" y1="${ay}" x2="${xL+bW}" y2="${ay}" stroke="white" stroke-width="1.5" stroke-dasharray="3,2" opacity="0.9"/>`;
            }

            // Labels — bigger fonts
            const lx = xL+bW/2, ly = y1+bH/2;
            const teuData = carrierTeuMap[v.carrier] || null;
            const teuLabel = teuData ? `${teuData} UNITS` : null;
            // How many label rows to show (drives vertical offsets)
            const hasService = bH>34 && v.service && bW>60;
            const hasTeu    = bH>28 && teuLabel && bW>50;
            const hasEtaEtd = bH>52 && bW>80;
            const rowCount  = 1 + (hasService?1:0) + (hasTeu?1:0) + (hasEtaEtd?1:0);
            const startY    = ly - ((rowCount - 1) * 6); // center the block
            let rowY = startY;
            if (bW>20 && bH>16) {
                const fs = Math.min(14, bW/4, bH/2.5);
                chart += `<text x="${lx}" y="${rowY}" text-anchor="middle" dominant-baseline="middle" font-size="${fs}" font-weight="800" fill="white" font-family="'Plus Jakarta Sans',sans-serif">${v.carrier}</text>`;
                rowY += 13;
                if (hasService) {
                    chart += `<text x="${lx}" y="${rowY}" text-anchor="middle" dominant-baseline="middle" font-size="9.5" fill="white" opacity="0.85" font-family="monospace">${v.service}</text>`;
                    rowY += 11;
                }
                if (hasTeu) {
                    // Pill background behind TEU count
                    const tw = Math.min(bW - 12, teuLabel.length * 5.8 + 10);
                    chart += `<rect x="${lx - tw/2}" y="${rowY - 7}" width="${tw}" height="13" rx="6" fill="rgba(0,0,0,0.25)"/>`;
                    chart += `<text x="${lx}" y="${rowY}" text-anchor="middle" dominant-baseline="middle" font-size="8.5" fill="white" font-weight="700" font-family="monospace" opacity="0.95">${teuLabel}</text>`;
                    rowY += 11;
                }
                if (hasEtaEtd) {
                    chart += `<text x="${lx}" y="${rowY}" text-anchor="middle" dominant-baseline="middle" font-size="8.5" fill="white" opacity="0.75" font-family="monospace">${fmt(v.eta)} → ${fmt(v.etd)}</text>`;
                }
            }
            if (bW>50&&bH>22) {
                const bS=posToNearestBollard(v.startPos), bE=posToNearestBollard(v.endPos);
                chart += `<text x="${xR-4}" y="${y1+bH-4}" text-anchor="end" font-size="8.5" fill="white" opacity="0.75" font-family="monospace">BL${Math.min(bS?.num||0,bE?.num||0)}-${Math.max(bS?.num||0,bE?.num||0)}</text>`;
            }

            if (active) {
                chart += `<circle cx="${xL+7}" cy="${y1+7}" r="4.5" fill="#22c55e" opacity="0.95"/>`;
                chart += `<circle cx="${xL+7}" cy="${y1+7}" r="8" fill="none" stroke="#22c55e" stroke-width="1.2" opacity="0.4"/>`;
            }
        });

        // Build carrier→scrollY map for scrollGanttToVessel()
        window._ganttCarrierY = {};
        vessels.forEach(v => {
            const y = tY(v.eta);
            // scrollY = y offset inside the SVG (which is inside the wrapper)
            if (!window._ganttCarrierY[v.carrier] || y < window._ganttCarrierY[v.carrier].scrollY) {
                window._ganttCarrierY[v.carrier] = { scrollY: y };
            }
        });

        overlay += `<line x1="${LABEL_W}" y1="${HEADER_H}" x2="${LABEL_W}" y2="${HEADER_H+CHART_H}" stroke="#94a3b8" stroke-width="1.5"/>`;
        overlay += `<line x1="${LABEL_W+CONTENT_W}" y1="${HEADER_H}" x2="${LABEL_W+CONTENT_W}" y2="${HEADER_H+CHART_H}" stroke="#e2e8f0" stroke-width="1"/>`;
        overlay += `<line x1="${LABEL_W}" y1="${HEADER_H+CHART_H}" x2="${LABEL_W+CONTENT_W}" y2="${HEADER_H+CHART_H}" stroke="#e2e8f0" stroke-width="1"/>`;

        // 6. NOW line
        if (nowY>=HEADER_H&&nowY<=HEADER_H+CHART_H) {
            overlay += `<line x1="${LABEL_W}" y1="${nowY}" x2="${LABEL_W+CONTENT_W}" y2="${nowY}" stroke="#ef4444" stroke-width="2.5" opacity="0.92"/>`;
            overlay += `<polygon points="${LABEL_W},${nowY} ${LABEL_W-10},${nowY-5} ${LABEL_W-10},${nowY+5}" fill="#ef4444" opacity="0.9"/>`;
        }

        // 7. Left time labels
        ticks.forEach(t => {
            const y = tY(t); if (y<HEADER_H||y>HEADER_H+CHART_H) return;
            const mid = t.getHours()===0;
            const dd = String(t.getDate()).padStart(2,'0'), mo = String(t.getMonth()+1).padStart(2,'0'), hh = String(t.getHours()).padStart(2,'0');
            if (mid) {
                const we = t.getDay()===0||t.getDay()===6;
                leftLbls += `<rect x="0" y="${y-12}" width="${LABEL_W-3}" height="16" rx="3" fill="${we?'#ede9fe':'#e2e8f0'}"/>`;
                leftLbls += `<text x="${LABEL_W-7}" y="${y+3}" text-anchor="end" font-size="11" fill="${we?'#7c3aed':'#1e293b'}" font-weight="800" font-family="monospace">${dd}/${mo}</text>`;
            } else {
                leftLbls += `<text x="${LABEL_W-7}" y="${y+4}" text-anchor="end" font-size="9.5" fill="#64748b" font-family="monospace">${hh}:00</text>`;
            }
        });
        // NOW left label
        if (nowY>=HEADER_H&&nowY<=HEADER_H+CHART_H) {
            leftLbls += `<rect x="0" y="${nowY-10}" width="${LABEL_W-3}" height="20" rx="4" fill="#ef4444" opacity="0.92"/>`;
            leftLbls += `<text x="${LABEL_W/2-2}" y="${nowY+1}" text-anchor="middle" dominant-baseline="middle" font-size="9.5" fill="white" font-weight="bold" font-family="monospace">NOW</text>`;
        }

        // 8. HEADER: quay strip + bollard labels
        const QH = 18, QY = 4;
        let hdr = '';
        hdr += `<rect x="0" y="0" width="${svgW}" height="${HEADER_H}" fill="rgba(248,250,252,0.98)"/>`;
        hdr += `<rect x="${LABEL_W}" y="${QY}" width="${CONTENT_W}" height="${QH}" fill="#1e293b" rx="3"/>`;
        BOLLARD_TABLE.forEach(b => {
            const x = bX(b.pos), maj = b.num%4===1||b.num===1||b.num===29;
            hdr += `<line x1="${x}" y1="${QY+(maj?2:7)}" x2="${x}" y2="${QY+QH-1}" stroke="${maj?'#94a3b8':'#334155'}" stroke-width="${maj?1:0.5}"/>`;
        });
        hdr += `<text x="${LABEL_W+8}" y="${QY+12}" font-size="9" fill="#64748b" font-weight="bold" font-family="monospace">QUAY WALL</text>`;
        hdr += `<text x="${svgW-6}" y="${QY+12}" text-anchor="end" font-size="9" fill="#94a3b8" font-family="monospace">BL1 ► Block A</text>`;
        // Bollard number row
        BOLLARD_TABLE.forEach(b => {
            const x = bX(b.pos), labeled = b.num%2===1;
            if (!labeled) return;
            const end = b.num===1||b.num===29;
            hdr += `<line x1="${x}" y1="${QY+QH}" x2="${x}" y2="${HEADER_H}" stroke="${end?'#94a3b8':'#d1d5db'}" stroke-width="${end?1.2:0.75}"/>`;
            hdr += `<text x="${x}" y="${QY+QH+16}" text-anchor="middle" font-size="${end?10:9}" fill="${b.num===1?'#4f46e5':b.num===29?'#7c3aed':'#475569'}" font-weight="${end?'800':'500'}" font-family="monospace">BL${b.num}</text>`;
        });
        // Direction labels
        hdr += `<text x="${LABEL_W+8}" y="${HEADER_H-6}" font-size="9" fill="#7c3aed" font-weight="bold" font-family="monospace">BL29 ←</text>`;
        hdr += `<text x="${svgW-6}" y="${HEADER_H-6}" text-anchor="end" font-size="9" fill="#4f46e5" font-weight="bold" font-family="monospace">→ BL1</text>`;
        hdr += `<line x1="${LABEL_W}" y1="${HEADER_H-1}" x2="${svgW}" y2="${HEADER_H-1}" stroke="#e2e8f0" stroke-width="1"/>`;
        // Corner
        hdr += `<rect x="0" y="0" width="${LABEL_W}" height="${HEADER_H}" fill="rgba(248,250,252,0.98)"/>`;
        hdr += `<text x="${LABEL_W/2}" y="${HEADER_H-22}" text-anchor="middle" font-size="9" fill="#94a3b8" font-weight="bold" font-family="monospace">DATE</text>`;
        hdr += `<text x="${LABEL_W/2}" y="${HEADER_H-9}" text-anchor="middle" font-size="8.5" fill="#94a3b8" font-family="monospace">↕ scroll</text>`;

        container.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}"
             viewBox="0 0 ${svgW} ${svgH}" style="display:block;min-width:${svgW}px;font-smoothing:antialiased;">
            <defs><clipPath id="ganttClip"><rect x="${LABEL_W}" y="${HEADER_H}" width="${CONTENT_W}" height="${CHART_H}"/></clipPath></defs>
            <rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#f8fafc"/>
            <g clip-path="url(#ganttClip)">${chart}</g>
            ${nowY>=HEADER_H&&nowY<=HEADER_H+CHART_H
                ? `<line x1="${LABEL_W}" y1="${nowY}" x2="${LABEL_W+CONTENT_W}" y2="${nowY}" stroke="#ef4444" stroke-width="2.5" opacity="0.92"/>
                   <polygon points="${LABEL_W},${nowY} ${LABEL_W-10},${nowY-5} ${LABEL_W-10},${nowY+5}" fill="#ef4444" opacity="0.9"/>`
                : ''}
            ${overlay}
            <g>${leftLbls}</g>
            ${hdr}
        </svg>`;

        // Legend removed — colors already shown in Yard Map's Export Vessels legend
        const le = document.getElementById('berthGanttLegend');
        if (le) le.innerHTML = '';

        // Update zoom label
        const lbl = document.getElementById('ganttZoomLabel');
        if (lbl) lbl.textContent = _ganttPph ? Math.round(_ganttPph)+'px/h' : 'FIT';

        // ── Click handler: clicking a vessel rect filters the Yard Map (registered once)
        const wrapper = document.getElementById('berthGanttWrapper');
        if (wrapper && !wrapper.dataset.ganttClickBound) {
            wrapper.dataset.ganttClickBound = '1';
            wrapper.addEventListener('click', function(e) {
                const el = e.target.closest('[data-gantt-carrier]');
                if (!el) return;
                const carrier = el.getAttribute('data-gantt-carrier');
                if (!carrier) return;
                // Filter the YARD MAP visual (yardmap.js) — this is the actual yard highlight
                if (typeof highlightYardCarrier === 'function') {
                    highlightYardCarrier(carrier);
                }
                // Also filter cluster spreading table (yp.js)
                toggleVesselFilter(carrier);
                // Scroll to yard map so user sees the highlight
                const scrollTarget = document.getElementById('yardMapLegend')
                    || document.getElementById('yardMapContent')
                    || document.getElementById('vesselFilterList');
                if (scrollTarget) scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        }
    }
    window.renderBerthGantt = renderBerthGantt;
    function renderClusterSpreading() {
        const body = document.getElementById('clusterBody');
        const showAll = document.getElementById('toggleSmallCarriers').checked;
        const showXYZ = document.getElementById('toggleDetailedCluster')?.checked || false;

        // Toggle legend visibility
        const legend = document.getElementById('clusterLegend');
        if (legend) legend.classList.toggle('hidden', !showXYZ);

        body.innerHTML = '';

        const IGNORED_CLUSTER_BLOCKS = new Set(['C01','C02','D01','BR9','RC9','OOG','N']);
        const scheduleMap = {};
        (scheduleData || []).forEach(s => {
            const key = `${s.carrier}||${s.service || ''}`;
            if(!scheduleMap[key]) scheduleMap[key] = [];
            scheduleMap[key].push(s);
        });

        let stats = {};
        invData.forEach(it => {
            if(!it.move.includes('export')) return;
            let c = it.carrier;
            if(!c || c === '0' || c === 'NIL') return;
            const service = String(it.service || '').toUpperCase();
            const key = `${c}||${service}`;
            if(!stats[key]) stats[key] = { carrier: c, service, blocks: {}, total: 0, totalAll: 0, allUnits: [], clusters: new Set(), eta: null };
            
            stats[key].totalAll++;
            stats[key].allUnits.push(it);

            if(IGNORED_CLUSTER_BLOCKS.has(it.block)) return;
            
            // Logic for sub-block categorization (X/Y/Z)
            const slot = parseInt(it.slot) || 0;
            const blockChar = it.block.charAt(0).toUpperCase();
            let part = 'X';
            if (blockChar === 'A' || blockChar === 'B') {
                if (slot >= 26) part = 'Z';
                else if (slot >= 13) part = 'Y';
            } else if (blockChar === 'C') {
                if (slot >= 31) part = 'Z';
                else if (slot >= 16) part = 'Y';
            }
            
            if(!stats[key].blocks[it.block]) stats[key].blocks[it.block] = { X: 0, Y: 0, Z: 0 };
            stats[key].blocks[it.block][part]++;
            stats[key].total++;
            if (service) {
                const expected = typeof getExpectedClusterForService === 'function' ? getExpectedClusterForService(service) : null;
                if (expected !== null) stats[key].clusters.add(expected);
            }
            const scheduleRows = scheduleMap[key] || [];
            if (scheduleRows.length && !stats[key].eta) {
                const earliest = scheduleRows.reduce((min, row) => {
                    return !min || row.eta.getTime() < min.getTime() ? row.eta : min;
                }, null);
                if (earliest) stats[key].eta = earliest;
            }
        });

        let sorted = Object.entries(stats).sort(([kA, a], [kB, b]) => {
            if (a.eta && b.eta) return a.eta - b.eta;
            if (a.eta) return -1;
            if (b.eta) return 1;
            return b.totalAll - a.totalAll;
        });
        if(!sorted.length) { body.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-slate-400">No Export Data.</td></tr>'; renderRecommendedSpreading(); renderVesselFilterChips(); return; }

        let filtered = showAll ? sorted : sorted.filter(e => e[1].totalAll >= 50);

        let uniqueBlocks = new Set();
        filtered.forEach(([key, data]) => {
            Object.keys(data.blocks).forEach(b => {
                if (b.toUpperCase() !== 'CG1') uniqueBlocks.add(b);
            });
        });
        let sortedBlocks = Array.from(uniqueBlocks).sort();

        // Calculate block occupancy for header display
        const blockOccupancy = {};
        const blockTeus = {};
        invData.forEach(it => {
            if (!it.block) return;
            const b = it.block.toUpperCase();
            if (!blockTeus[b]) blockTeus[b] = 0;
            const teus = String(it.length || '').startsWith('20') ? 1 : (String(it.length || '').startsWith('45') ? 2.25 : 2);
            blockTeus[b] += teus;
        });
        sortedBlocks.forEach(b => {
            const cap = activeCapacity[b]?.cap || 0;
            const teus = blockTeus[b] || 0;
            blockOccupancy[b] = cap > 0 ? Math.round((teus / cap) * 100) : 0;
        });

        const head = document.getElementById('clusterHead');
        if (head) {
            // Helper: block header class based on E-prefix
            const blockBg = (b) => b.charAt(0).toUpperCase() === 'E' ? 'bg-slate-200/80 text-slate-400' : 'bg-slate-50';
            const occColor = (pct) => pct > 80 ? 'text-red-500' : (pct > 60 ? 'text-amber-500' : 'text-emerald-600');

            if (showXYZ) {
                let colspan = (sortedBlocks.length || 1) * 3;
                let blockHeaders = sortedBlocks.map(b => {
                    const bg = b.charAt(0).toUpperCase() === 'E' ? 'bg-slate-200/80 text-slate-400' : 'bg-slate-100/50';
                    return `<th colspan="3" class="px-1 py-1 text-center font-bold text-[12px] border-l border-slate-300 ${bg}">${b}</th>`;
                }).join('');
                let occRow = sortedBlocks.map(b => {
                    const isEBlock = b.charAt(0).toUpperCase() === 'E';
                    if (isEBlock) return `<th colspan="3" class="px-0 py-0 text-center text-[9px] font-bold border-l border-slate-200 bg-white"></th>`;
                    const pct = blockOccupancy[b] || 0;
                    return `<th colspan="3" class="px-0 py-0 text-center text-[9px] font-bold ${occColor(pct)} border-l border-slate-200 bg-white">${pct}%</th>`;
                }).join('');
                let subHeaders = sortedBlocks.map((b, idx) => {
                    return `
                    <th class="px-0 py-1 text-center font-bold text-[10px] bg-white border-l border-slate-200 text-blue-600">X</th>
                    <th class="px-0 py-1 text-center font-bold text-[10px] bg-white border-l border-slate-100 text-amber-600">Y</th>
                    <th class="px-0 py-1 text-center font-bold text-[10px] bg-white border-l border-slate-100 text-emerald-600 block-group-end">Z</th>`;
                }).join('');

                head.innerHTML = `
                    <tr class="bg-slate-50 text-[10px]">
                        <th rowspan="4" class="px-2 py-2 border-r border-slate-300 text-center align-middle col-eta w-[1%] whitespace-nowrap">ETB</th>
                        <th rowspan="4" class="px-2 py-2 border-r border-slate-300 text-center align-middle col-shift w-[1%] whitespace-nowrap">S</th>
                        <th rowspan="4" class="px-2 py-2 border-r border-slate-300 text-center align-middle col-hour w-[1%] whitespace-nowrap">HOUR</th>
                        <th rowspan="4" class="px-2 py-2 border-r border-slate-300 text-center align-middle col-carrier w-[1%] whitespace-nowrap">Carrier</th>
                        <th rowspan="4" class="px-2 py-2 border-r border-slate-300 text-center align-middle col-service w-[1%] whitespace-nowrap">Svc</th>
                        <th colspan="${colspan}" class="px-6 py-1 border-b border-slate-300 text-center font-black tracking-widest bg-slate-200/50">BLOCK UTILIZATION (X/Y/Z)</th>
                        <th colspan="2" class="px-2 py-1 border-b border-l border-slate-300 text-center align-middle bg-slate-50 font-black text-[9px] tracking-wider cursor-pointer hover:bg-slate-200 transition-colors" onclick="openReservationCheckerModal()" title="Reservation Checker">CLUSTER</th>
                        <th rowspan="4" class="px-2 py-2 text-center border-l border-slate-300 align-middle col-units font-black">TOTAL<br>UNITS</th>
                    </tr>
                    <tr class="text-[10px]">
                        ${blockHeaders}
                        <th rowspan="3" class="px-2 py-1 border-l border-slate-300 text-center align-middle col-cluster text-[9px]">Exp.</th>
                        <th rowspan="3" class="px-2 py-1 border-l border-slate-200 text-center align-middle col-cluster text-[9px]">Act.</th>
                    </tr>
                    <tr>${occRow}</tr>
                    <tr class="border-t border-slate-200">${subHeaders}</tr>
                `;
            } else {
                let occRow = sortedBlocks.map(b => {
                    const isEBlock = b.charAt(0).toUpperCase() === 'E';
                    if (isEBlock) return `<th class="px-1 py-0 text-center text-[10px] font-bold border-l border-slate-200 bg-white col-block"></th>`;
                    const pct = blockOccupancy[b] || 0;
                    return `<th class="px-1 py-0 text-center text-[10px] font-bold ${occColor(pct)} border-l border-slate-200 bg-white col-block">${pct}%</th>`;
                }).join('');
                let blockHeaders = sortedBlocks.map(b => {
                    const bg = blockBg(b);
                    return `<th class="px-2 py-2 text-center font-bold text-[12px] border-l border-slate-200 ${bg} col-block">${b}</th>`;
                }).join('');
                head.innerHTML = `
                    <tr class="text-[12px]">
                        <th rowspan="3" class="px-4 py-2 border-r border-slate-200 text-center align-middle bg-slate-50 w-[1%] whitespace-nowrap">ETB</th>
                        <th rowspan="3" class="px-4 py-2 border-r border-slate-200 text-center align-middle bg-slate-50 w-[1%] whitespace-nowrap">SHIFT</th>
                        <th rowspan="3" class="px-2 py-2 border-r border-slate-200 text-center align-middle bg-slate-50 w-[1%] whitespace-nowrap">HOUR</th>
                        <th rowspan="3" class="px-4 py-2 border-r border-slate-200 text-center align-middle bg-slate-50 w-[1%] whitespace-nowrap">Carrier</th>
                        <th rowspan="3" class="px-4 py-2 border-r border-slate-200 text-center align-middle bg-slate-50 w-[1%] whitespace-nowrap">Service</th>
                        <th colspan="${sortedBlocks.length}" class="px-6 py-2 border-b border-slate-200 text-center bg-slate-100/30 uppercase font-black tracking-widest text-slate-700">BLOCKS (Total Units)</th>
                        <th colspan="2" class="px-4 py-2 border-b border-l border-slate-200 text-center align-middle bg-slate-50 font-black text-[10px] tracking-wider cursor-pointer hover:bg-slate-200 transition-colors" onclick="openReservationCheckerModal()" title="Reservation Checker">CLUSTER</th>
                        <th rowspan="3" class="px-4 py-2 text-center border-l border-slate-200 align-middle bg-slate-50 font-black">TOTAL<br>UNITS</th>
                    </tr>
                    <tr class="border-t border-slate-200">
                        ${blockHeaders}
                        <th rowspan="2" class="px-3 py-1 border-l border-slate-200 text-center align-middle bg-slate-50 text-[10px]">Expected</th>
                        <th rowspan="2" class="px-3 py-1 border-l border-slate-200 text-center align-middle bg-slate-50 text-[10px]">Actual</th>
                    </tr>
                    <tr>${occRow}</tr>
                `;
            }
        }

        let renderedData = filtered.map(([key, data]) => {
            const serviceLabel = data.service ? data.service : '-';
            const etaObj = data.eta;
            let etaLabel = '-';
            let shiftLabel = '-';
            let hourLabel = '-';
            
            if (etaObj) {
                etaLabel = `${etaObj.getDate().toString().padStart(2,'0')}/${(etaObj.getMonth()+1).toString().padStart(2,'0')}`;
                let h = etaObj.getHours();
                let m = etaObj.getMinutes();
                hourLabel = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
                let timeMin = h * 60 + m;
                if (timeMin >= 420 && timeMin < 930) {
                    shiftLabel = '1';
                } else if (timeMin >= 930 && timeMin < 1380) {
                    shiftLabel = '2';
                } else {
                    shiftLabel = '3';
                }
            }
            return { key, data, serviceLabel, etaLabel, shiftLabel, hourLabel };
        });

        for (let i = 0; i < renderedData.length; i++) {
            if (renderedData[i].etaRowspan === undefined) {
                let span = 1;
                for (let j = i + 1; j < renderedData.length; j++) {
                    if (renderedData[j].etaLabel === renderedData[i].etaLabel) span++;
                    else break;
                }
                renderedData[i].etaRowspan = span;
                for (let j = i + 1; j < i + span; j++) {
                    renderedData[j].etaRowspan = 0;
                }
            }
            if (renderedData[i].shiftRowspan === undefined) {
                let span = 1;
                for (let j = i + 1; j < renderedData.length; j++) {
                    if (renderedData[j].etaLabel === renderedData[i].etaLabel && renderedData[j].shiftLabel === renderedData[i].shiftLabel) span++;
                    else break;
                }
                renderedData[i].shiftRowspan = span;
                for (let j = i + 1; j < i + span; j++) {
                    renderedData[j].shiftRowspan = 0;
                }
            }
            if (renderedData[i].hourRowspan === undefined) {
                let span = 1;
                for (let j = i + 1; j < renderedData.length; j++) {
                    if (renderedData[j].etaLabel === renderedData[i].etaLabel && renderedData[j].shiftLabel === renderedData[i].shiftLabel && renderedData[j].hourLabel === renderedData[i].hourLabel) span++;
                    else break;
                }
                renderedData[i].hourRowspan = span;
                for (let j = i + 1; j < i + span; j++) {
                    renderedData[j].hourRowspan = 0;
                }
            }
        }

        // Reset and populate global map for Replan Analyzer and Reservation Checker
        window.activeGreyOutBlocksMap = {};

        const _clusterRows = [];
        renderedData.forEach((row, index) => {
            const { key, data, serviceLabel, etaLabel, shiftLabel, hourLabel, etaRowspan, shiftRowspan, hourRowspan } = row;
            
            const clusterValues = Array.from(data.clusters).sort((a,b) => a - b);
            const expectedClusterLabel = clusterValues.length ? clusterValues.join(", ") : '-';
            const expectedClusterNumber = clusterValues.length ? clusterValues[clusterValues.length - 1] : null;
            const totalClusterCount = Object.keys(data.blocks).length;
            const exceedsExpected = expectedClusterNumber !== null && totalClusterCount > expectedClusterNumber;
            const actualColorClass = exceedsExpected ? ' text-red-600 bg-red-50 border border-red-200' : ' text-slate-800';

            let greyOutSet = new Set();
            if (exceedsExpected && expectedClusterNumber !== null) {
                let excessCount = totalClusterCount - expectedClusterNumber;
                let candidateBlocks = [];
                Object.keys(data.blocks).forEach(b => {
                    if (b.charAt(0).toUpperCase() === 'E') return; // do not gray out E blocks
                    let t = data.blocks[b].X + data.blocks[b].Y + data.blocks[b].Z;
                    if (t > 0) candidateBlocks.push({ block: b, total: t });
                });
                candidateBlocks.sort((a, b) => a.total - b.total);
                candidateBlocks.slice(0, excessCount).forEach(x => greyOutSet.add(x.block));
            }
            window.activeGreyOutBlocksMap[key] = Array.from(greyOutSet);

            let blockCells = sortedBlocks.map(b => {
                let res = data.blocks[b] || { X: 0, Y: 0, Z: 0 };
                const total = res.X + res.Y + res.Z;
                const isMinAndExceeds = greyOutSet.has(b);
                const grayOutClass = isMinAndExceeds ? ' opacity-40 grayscale-[0.8]' : '';

                const safeCarrier = data.carrier.replace(/'/g, "\\'");
                const safeService = (data.service || '').replace(/'/g, "\\'");
                
                if (!showXYZ) {
                    const isEmptyBlock = b.charAt(0).toUpperCase() === 'E';
                    const emptyBg = isEmptyBlock ? ' bg-slate-100/60' : '';
                    if (total === 0) return `<td class="px-1 py-2 text-center text-slate-300 border-l border-slate-200 col-block${emptyBg}">-</td>`;
                    let cls = total > 200 ? 'bg-red-600 text-white' : (total > 100 ? 'bg-amber-400 text-slate-900' : (isEmptyBlock ? 'bg-slate-200 text-slate-500' : 'bg-blue-50 text-blue-700 border border-blue-100'));
                    return `<td tabindex="0" class="px-1 py-1 text-center border-l border-slate-200 col-block${emptyBg} cursor-pointer transition-colors" onclick="showClusterDetail('${safeCarrier}', '${safeService}', '${b}', 'null')"><span class="inline-block px-1.5 py-1 rounded text-[11px] font-bold ${cls} w-full text-center${grayOutClass} hover:opacity-80">${total}</span></td>`;
                }
                
                const renderCell = (val, colorClass, isEnd, part) => {
                    if (val === 0) return `<td class="px-0 py-1 text-center text-slate-300 border-l border-slate-100 col-sub-block ${isEnd ? 'block-group-end' : ''}">-</td>`;
                    let cls = val > 100 ? 'bg-red-600 text-white' : (val > 50 ? 'bg-amber-400 text-slate-900' : 'bg-slate-100 text-slate-700');
                    return `<td tabindex="0" class="px-0 py-0.5 text-center border-l border-slate-100 col-sub-block ${isEnd ? 'block-group-end' : ''} cursor-pointer transition-colors" onclick="showClusterDetail('${safeCarrier}', '${safeService}', '${b}', '${part}')"><span class="inline-block w-full py-0.5 text-[9.5px] font-bold ${cls}${grayOutClass} hover:opacity-80">${val}</span></td>`;
                };

                return renderCell(res.X, 'text-blue-600', false, 'X') + 
                       renderCell(res.Y, 'text-amber-600', false, 'Y') + 
                       renderCell(res.Z, 'text-emerald-600', true, 'Z');
            }).join("");
            
            let trClass = "hover:bg-slate-50 transition border-b border-slate-100";
            let trStyle = "";
            if (index > 0 && renderedData[index-1].etaLabel !== etaLabel) {
                 trClass += " border-t-[3px] border-t-slate-300"; // THIN SEPARATOR
                 trStyle = "border-top: 2px solid #cbd5e1;";
            }

            let etaHtml = "";
            if (etaRowspan > 0) {
                etaHtml = `<td rowspan="${etaRowspan}" class="px-1 py-2 text-[10px] font-semibold text-slate-700 text-center border-r border-slate-200 align-middle col-eta w-[1%] whitespace-nowrap">${etaLabel}</td>`;
            }

            let shiftHtml = "";
            if (shiftRowspan > 0) {
                shiftHtml = `<td rowspan="${shiftRowspan}" class="px-1 py-2 text-[10px] font-extrabold text-slate-800 text-center border-r border-slate-200 align-middle bg-slate-50/50 col-shift w-[1%] whitespace-nowrap">${shiftLabel}</td>`;
            }

            let hourHtml = "";
            if (hourRowspan > 0) {
                hourHtml = `<td rowspan="${hourRowspan}" class="px-1 py-2 text-[10px] font-bold text-slate-600 text-center border-r border-slate-200 align-middle col-hour w-[1%] whitespace-nowrap">${hourLabel}</td>`;
            }

            _clusterRows.push(`<tr class="${trClass}" style="${trStyle}">
                ${etaHtml}
                ${shiftHtml}
                ${hourHtml}
                <td class="px-2 py-2 text-[10px] font-black text-slate-700 border-r border-slate-200 align-middle text-center col-carrier w-[1%] whitespace-nowrap">${data.carrier}</td>
                <td class="px-1 py-2 text-[10px] text-slate-500 uppercase font-semibold text-center border-r border-slate-200 align-middle col-service w-[1%] whitespace-nowrap">${serviceLabel}</td>
                ${blockCells}
                <td class="px-1 py-1 text-center align-middle font-bold text-slate-800 border-l border-slate-200 col-cluster">${expectedClusterLabel}</td>
                <td class="px-1 py-1 text-center align-middle font-bold ${actualColorClass} border-l border-slate-200 col-cluster">${totalClusterCount}</td>
                <td class="px-1 py-1 text-center align-middle font-bold text-slate-800 border-l border-slate-200 col-units cursor-pointer hover:bg-slate-100 transition-colors" onclick="showVesselSummary('${key}')"><span class="text-blue-600 underline">${data.totalAll}</span></td>
            </tr>`);
        });
        window.clusterStatsData = stats;
        body.innerHTML = _clusterRows.join('');
        renderRecommendedSpreading();
    }

    window.showVesselSummary = function(key) {
        if (!window.clusterStatsData || !window.clusterStatsData[key]) return;
        const vesselData = window.clusterStatsData[key];
        
        const modal = document.getElementById('vesselSummaryModal');
        const title = document.getElementById('vesselSummaryModalTitle');
        const subtitle = document.getElementById('vesselSummaryModalSubtitle');
        const body = document.getElementById('vesselSummaryModalBody');
        
        title.innerHTML = `<span class="material-symbols-outlined text-blue-600">directions_boat</span> Vessel Summary: ${vesselData.carrier}`;
        subtitle.textContent = `Service: ${vesselData.service || '-'} | Total Units: ${vesselData.totalAll}`;
        
        const spodStats = { 'FULL': {}, 'EMPTY': {} };
        
        vesselData.allUnits.forEach(it => {
            const isMT = (it.loadStatus.includes('EMPTY') || it.loadStatus === 'MT');
            const type = isMT ? 'EMPTY' : 'FULL';
            const spod = String(it.spod || 'UNKNOWN').trim().toUpperCase();
            
            if (!spodStats[type][spod]) {
                spodStats[type][spod] = { c20: 0, c40: 0, c45: 0, total: 0 };
            }
            
            if (it.length.startsWith('20')) spodStats[type][spod].c20++;
            else if (it.length.startsWith('45')) spodStats[type][spod].c45++;
            else spodStats[type][spod].c40++;
            
            spodStats[type][spod].total++;
        });

        let html = '';
        
        ['FULL', 'EMPTY'].forEach(type => {
            const spods = Object.keys(spodStats[type]).sort();
            if (spods.length === 0) return;
            
            let typeColor = type === 'FULL' ? 'text-blue-700 bg-blue-50 border-blue-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200';
            
            html += `
                <div class="px-5 py-4 border-b border-slate-200 ${type === 'FULL' ? 'bg-white' : 'bg-slate-50/50'}">
                    <h5 class="font-bold text-xs mb-3 inline-block px-3 py-1 rounded-lg border shadow-sm ${typeColor}">${type} CONTAINERS</h5>
                    <div class="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
                        <table class="w-full text-left bg-white">
                            <thead class="bg-slate-100 text-[11px] uppercase text-slate-500 font-bold border-b border-slate-200">
                                <tr>
                                    <th class="px-4 py-2 border-r border-slate-200">SPOD</th>
                                    <th class="px-4 py-2 border-r border-slate-200 text-center">20'</th>
                                    <th class="px-4 py-2 border-r border-slate-200 text-center">40'</th>
                                    <th class="px-4 py-2 border-r border-slate-200 text-center">45'</th>
                                    <th class="px-4 py-2 text-center bg-slate-200/50">TOTAL</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100 text-xs">
            `;
            
            let g20 = 0, g40 = 0, g45 = 0, gTotal = 0;
            spods.forEach(spod => {
                const s = spodStats[type][spod];
                g20 += s.c20; g40 += s.c40; g45 += s.c45; gTotal += s.total;
                
                html += `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="px-4 py-2 font-semibold text-slate-700 border-r border-slate-100">${spod}</td>
                        <td class="px-4 py-2 text-center border-r border-slate-100">${s.c20 || '-'}</td>
                        <td class="px-4 py-2 text-center border-r border-slate-100">${s.c40 || '-'}</td>
                        <td class="px-4 py-2 text-center border-r border-slate-100">${s.c45 || '-'}</td>
                        <td class="px-4 py-2 text-center font-bold text-slate-800 bg-slate-50/50">${s.total}</td>
                    </tr>
                `;
            });
            
            html += `
                            </tbody>
                            <tfoot class="bg-slate-50 border-t border-slate-200 font-bold text-xs">
                                <tr>
                                    <td class="px-4 py-2 text-slate-800 border-r border-slate-200 uppercase tracking-wide">Subtotal ${type}</td>
                                    <td class="px-4 py-2 text-center text-blue-600 border-r border-slate-200">${g20}</td>
                                    <td class="px-4 py-2 text-center text-blue-600 border-r border-slate-200">${g40}</td>
                                    <td class="px-4 py-2 text-center text-blue-600 border-r border-slate-200">${g45}</td>
                                    <td class="px-4 py-2 text-center text-emerald-600 bg-slate-100/80">${gTotal}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            `;
        });
        
        if (!html) {
            html = '<div class="p-8 text-center text-slate-400 italic">No units found for this vessel.</div>';
        }
        
        body.innerHTML = html;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    };

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
        if(!scheduleData.length) { alert("Please upload Vessel Schedule."); return; }

        const loader = document.getElementById('loadingOverlay');
        loader.classList.remove('hidden');
        setProgress(30, "Analyzing Clashes...");

        try {
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

            runClashLogic(scheduleData, aggregatedInventory);
            setProgress(100, "Done!");
        } catch (err) {
            alert(err.message);
        } finally {
            setTimeout(() => loader.classList.add('hidden'), 500);
        }
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

        const _clashCards = [];
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

            _clashCards.push(`
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
                </div>`);
        });
        feed.innerHTML = _clashCards.join('');
    }

    function renderBlockStats(stats) {
        const body = document.getElementById('blockStatsBody');
        body.innerHTML = "";
        const sorted = Object.entries(stats).sort((a,b) => b[1].v - a[1].v);
        if(sorted.length === 0) { body.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400">No data</td></tr>`; return; }
        const _statsRows = [];
        sorted.forEach(([b, d]) => {
            const vesselStr = Array.from(d.vessels).join(' - ');
            _statsRows.push(`
                <tr class="stats-row border-b border-slate-50 last:border-0" onclick="filterByBlock('${b}')" data-block="${b}">
                    <td class="p-3 font-bold text-slate-700 whitespace-nowrap">${b}</td>
                    <td class="p-3 text-[10px] text-slate-500 leading-tight">${vesselStr}</td>
                    <td class="p-3 text-center"><span class="bg-red-50 text-red-600 px-2 py-0.5 rounded text-[10px] font-bold border border-red-100">${d.c}</span></td>
                    <td class="p-3 text-right font-mono font-medium text-slate-600">${d.v}</td>
                </tr>`);
        });
        body.innerHTML = _statsRows.join('');
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

    function toggleAiChatbox() {
        const chatWindow = document.getElementById('aiChatWindow');
        const toggleButton = document.getElementById('aiChatToggle');
        if (!chatWindow || !toggleButton) return;

        const willOpen = chatWindow.classList.contains('hidden');
        chatWindow.classList.toggle('hidden');
        toggleButton.setAttribute('aria-expanded', String(willOpen));

        if (willOpen) {
            document.body.classList.add('ai-chat-sidebar-open');
        } else {
            document.body.classList.remove('ai-chat-sidebar-open');
        }
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // API key dipecah jadi 2 bagian sesuai permintaan deployment static (GitHub Pages).
    // Catatan: ini hanya obfuscation ringan, bukan pengamanan penuh.
    const keyPart1 = 'AIzaSyB7F0FyfzndxInb';
    const keyPart2 = 'N1b_G4xJXzQuIDPcgT8';
    const apiKey = [keyPart1, keyPart2].join('');

    function getGeminiApiKey() {
        const runtimeKey = String(window.GEMINI_API_KEY || '').trim();
        if (runtimeKey) return runtimeKey;

        const localKey = String((typeof keyPart1 !== 'undefined' ? keyPart1 : '') + (typeof keyPart2 !== 'undefined' ? keyPart2 : '')).trim();
        if (localKey) return localKey;

        if (typeof apiKey !== 'undefined' && String(apiKey || '').trim()) {
            return String(apiKey).trim();
        }

        throw new Error('apiKey is not defined. Set window.GEMINI_API_KEY or restore keyPart1/keyPart2 in yp.js');
    }

    function getOperationalSnapshot() {
        const contextRaw = getDashboardContext();
        let context = {};
        try {
            context = JSON.parse(contextRaw || '{}');
        } catch (_) {
            context = {};
        }

        const blocks = {};
        const safeInvData = Array.isArray(invData) ? invData : [];
        safeInvData.forEach(item => {
            const block = String(item?.block || 'UNKNOWN').toUpperCase();
            const len = String(item?.length || '40');
            const teus = len.startsWith('20') ? 1 : (len.startsWith('45') ? 2.25 : 2);
            if (!blocks[block]) blocks[block] = { boxCount: 0, teus: 0, c20: 0, c40: 0, c45: 0 };
            blocks[block].boxCount += 1;
            blocks[block].teus += teus;
            if (len.startsWith('20')) blocks[block].c20 += 1;
            else if (len.startsWith('45')) blocks[block].c45 += 1;
            else blocks[block].c40 += 1;
        });

        const blockDensity = Object.entries(blocks).map(([block, d]) => {
            const cap = Number(activeCapacity?.[block]?.cap || 0);
            const density = cap > 0 ? Number(((d.teus / cap) * 100).toFixed(2)) : 0;
            return { block, density, capTeus: cap, ...d };
        });

        return {
            context,
            safeInvData,
            blockDensity,
            totalCapacityTeus: Number(context?.kpi?.totalCapacityTeus || 0),
            totalTeus: Number(context?.kpi?.totalTeus || 0),
            yorPct: Number(context?.kpi?.yorPct || 0)
        };
    }

    function parseArrivalDate(arrivalDateRaw) {
        const raw = String(arrivalDateRaw || '').trim();
        if (!raw) return null;
        const datePart = raw.split(' ')[0];
        const parts = datePart.split('/');
        if (parts.length !== 3) return null;
        const day = Number(parts[0]);
        const month = Number(parts[1]);
        const year = Number(parts[2]);
        if (!day || !month || !year) return null;
        const parsed = new Date(year, month - 1, day);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function normalizeDateToDmy(rawDate) {
        const parsed = parseArrivalDate(rawDate);
        if (!parsed) return '';
        const day = String(parsed.getDate()).padStart(2, '0');
        const month = String(parsed.getMonth() + 1).padStart(2, '0');
        const year = String(parsed.getFullYear());
        return `${day}/${month}/${year}`;
    }

    function detectIntent(userMessage) {
        const text = String(userMessage || '').toLowerCase();
        const blockMatch = text.match(/\b([abc][0-9]{2})\b/i);
        const dateMatch = text.match(/\b\d{2}\/\d{2}\/\d{4}\b/);

        if (text.includes('dwell')) return { intent: 'dwell_time', args: {} };
        if ((text.includes('arrival') || text.includes('kedatangan')) && dateMatch) return { intent: 'arrival', args: { date: dateMatch[0] } };
        if (text.includes('empty') || text.includes('kosong') || text.includes('mt')) return { intent: 'empty_summary', args: {} };
        if ((text.includes('congestion') || text.includes('kepadatan') || text.includes('risk')) && blockMatch) return { intent: 'block_congestion', args: { block_name: blockMatch[1].toUpperCase() } };
        if ((text.includes('relocation') || text.includes('relokasi')) && blockMatch) return { intent: 'relocation', args: { block_name: blockMatch[1].toUpperCase() } };
        if ((text.includes('blok') || text.includes('block')) && blockMatch) return { intent: 'block_detail', args: { blockName: blockMatch[1].toUpperCase() } };
        if (text.includes('yor') && (text.includes('predict') || text.includes('prediksi'))) {
            const countMatch = text.match(/\b(\d+)\b/);
            return { intent: 'yor_prediction', args: { vessel_container_count: Number(countMatch?.[1] || 0) } };
        }
        if (text.includes('recommend') || text.includes('rekomendasi')) {
            const type = text.includes('export') ? 'EXPORT' : (text.includes('reefer') ? 'REEFER' : 'IMPORT');
            return { intent: 'recommend_block', args: { container_type: type } };
        }
        if (text.includes('yard state') || text.includes('kondisi yard') || text.includes('overview')) return { intent: 'yard_state', args: {} };

        return { intent: 'general', args: {} };
    }

    function routeIntentToTool(intentPayload) {
        const intent = intentPayload?.intent;
        const args = intentPayload?.args || {};
        const map = {
            block_detail: { name: 'get_block_details', args },
            dwell_time: { name: 'get_dwell_time_summary', args: {} },
            arrival: { name: 'get_arrival_summary_by_date', args },
            empty_summary: { name: 'get_empty_container_summary', args: {} },
            block_congestion: { name: 'get_block_congestion_risk', args },
            yor_prediction: { name: 'predict_yor_after_discharge', args },
            relocation: { name: 'suggest_relocation_plan', args },
            recommend_block: { name: 'recommend_yard_block', args },
            yard_state: { name: 'analyze_yard_state', args: {} }
        };
        return map[intent] || null;
    }

    function compactRowsForEvidence(rows, limit = 20) {
        return rows.slice(0, limit).map(item => ({
            block: String(item?.block || '').toUpperCase(),
            slot: Number(item?.slot || 0),
            length: String(item?.length || ''),
            move: String(item?.move || '').toUpperCase(),
            line: String(item?.line || '').toUpperCase(),
            service: String(item?.service || '').toUpperCase(),
            carrier: String(item?.carrier || '').toUpperCase(),
            arrivalDate: normalizeDateToDmy(item?.arrivalDate) || String(item?.arrivalDate || '')
        }));
    }

    function applyStructuredFilters(rows, rawFilters = {}) {
        let filtered = [...rows];
        const filter = {
            block: String(rawFilters?.block || '').trim().toUpperCase(),
            line: String(rawFilters?.line || '').trim().toUpperCase(),
            service: String(rawFilters?.service || '').trim().toUpperCase(),
            move: String(rawFilters?.move || '').trim().toUpperCase(),
            carrier: String(rawFilters?.carrier || '').trim().toUpperCase(),
            date: normalizeDateToDmy(rawFilters?.date || '')
        };

        if (filter.block) filtered = filtered.filter(r => String(r?.block || '').trim().toUpperCase() === filter.block);
        if (filter.line) filtered = filtered.filter(r => String(r?.line || '').trim().toUpperCase().includes(filter.line));
        if (filter.service) filtered = filtered.filter(r => String(r?.service || '').trim().toUpperCase().includes(filter.service));
        if (filter.move) filtered = filtered.filter(r => String(r?.move || '').trim().toUpperCase().includes(filter.move));
        if (filter.carrier) filtered = filtered.filter(r => String(r?.carrier || '').trim().toUpperCase().includes(filter.carrier));
        if (filter.date) filtered = filtered.filter(r => normalizeDateToDmy(r?.arrivalDate) === filter.date);

        return { filtered, filter };
    }

    function buildEvidenceSummary(rows) {
        const summary = {
            totalRows: rows.length,
            byBlock: {},
            byMove: {},
            byLine: {},
            byService: {}
        };
        rows.forEach(item => {
            const block = String(item?.block || 'UNKNOWN').toUpperCase();
            const move = String(item?.move || 'UNKNOWN').toUpperCase();
            const line = String(item?.line || 'UNKNOWN').toUpperCase();
            const service = String(item?.service || 'UNKNOWN').toUpperCase();
            summary.byBlock[block] = (summary.byBlock[block] || 0) + 1;
            summary.byMove[move] = (summary.byMove[move] || 0) + 1;
            summary.byLine[line] = (summary.byLine[line] || 0) + 1;
            summary.byService[service] = (summary.byService[service] || 0) + 1;
        });
        return summary;
    }

    function executeTool(functionName, functionArgs = {}) {
        const { safeInvData, blockDensity, totalCapacityTeus, totalTeus, yorPct } = getOperationalSnapshot();

        if (functionName === 'get_block_details') {
            const blockName = String(functionArgs.blockName || '').trim().toUpperCase();
            if (!blockName) return { error: 'Parameter blockName wajib diisi.' };
            const rows = safeInvData.filter(item => String(item?.block || '').trim().toUpperCase() === blockName);
            const summary = { total_box: rows.length, box_20ft: 0, box_40ft: 0, box_45ft: 0 };
            rows.forEach(item => {
                const size = String(item?.length || '').trim();
                if (size.startsWith('20')) summary.box_20ft += 1;
                else if (size.startsWith('45')) summary.box_45ft += 1;
                else summary.box_40ft += 1;
            });
            return { block: blockName, ...summary };
        }

        if (functionName === 'get_dwell_time_summary') {
            const result = { "0-3_Hari": 0, "3-30_Hari": 0, "Lebih_30_Hari": 0 };
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            safeInvData.forEach(item => {
                const moveType = String(item?.move || '').toUpperCase();
                if (!(moveType.includes('IMPORT') || moveType.includes('DISC'))) return;
                const arrivalDate = parseArrivalDate(item?.arrivalDate);
                if (!arrivalDate) return;
                arrivalDate.setHours(0, 0, 0, 0);
                const diffDays = Math.floor((today.getTime() - arrivalDate.getTime()) / 86400000);
                if (diffDays <= 3) result["0-3_Hari"] += 1;
                else if (diffDays <= 30) result["3-30_Hari"] += 1;
                else result["Lebih_30_Hari"] += 1;
            });
            return result;
        }

        if (functionName === 'get_arrival_summary_by_date') {
            const date = normalizeDateToDmy(functionArgs.date) || String(functionArgs.date || '').trim();
            if (!date) return { error: 'Parameter date wajib diisi.' };
            const total_box = safeInvData.filter(item => normalizeDateToDmy(item?.arrivalDate) === date).length;
            return { date, total_box, method: 'exact_date_match' };
        }

        if (functionName === 'get_empty_container_summary') {
            const emptyRows = safeInvData.filter(item => {
                const ls = String(item?.loadStatus || '').toUpperCase();
                return ls.includes('EMPTY') || ls === 'MT' || ls.includes('MT ');
            });
            const byBlock = {};
            emptyRows.forEach(item => {
                const block = String(item?.block || 'UNKNOWN').toUpperCase();
                byBlock[block] = (byBlock[block] || 0) + 1;
            });
            const topBlocks = Object.entries(byBlock)
                .map(([block, count]) => ({ block, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 10);
            return {
                total_empty_box: emptyRows.length,
                definition: 'loadStatus contains EMPTY or MT',
                top_empty_blocks: topBlocks
            };
        }

        if (functionName === 'get_block_congestion_risk') {
            const blockName = String(functionArgs.block_name || functionArgs.blockName || '').trim().toUpperCase();
            if (!blockName) return { error: 'Parameter block_name wajib diisi.' };
            const found = blockDensity.find(b => b.block === blockName);
            if (!found) return { error: `Block ${blockName} tidak ditemukan.` };
            const risk_level = found.density >= 85 ? 'HIGH' : (found.density >= 70 ? 'MEDIUM' : 'LOW');
            const recommendation = risk_level === 'HIGH' ? 'Avoid assigning additional containers to this block' : (risk_level === 'MEDIUM' ? 'Monitor inflow and prepare relocation option' : 'Block remains safe for additional allocation');
            return { block: blockName, density: found.density, risk_level, recommendation };
        }

        if (functionName === 'predict_yor_after_discharge') {
            const vesselCount = Number(functionArgs.vessel_container_count || functionArgs.vesselContainerCount || 0);
            if (!Number.isFinite(vesselCount) || vesselCount < 0) return { error: 'Parameter vessel_container_count tidak valid.' };
            const addedTeus = vesselCount * 2;
            const predicted = totalCapacityTeus > 0 ? Number((((totalTeus + addedTeus) / totalCapacityTeus) * 100).toFixed(2)) : 0;
            const risk_level = predicted >= 85 ? 'HIGH' : (predicted >= 75 ? 'MEDIUM' : 'LOW');
            return {
                current_yor: Number(yorPct.toFixed ? yorPct.toFixed(2) : yorPct),
                predicted_yor: predicted,
                risk_level,
                note: risk_level === 'HIGH' ? 'YOR melewati batas operasional aman' : (risk_level === 'MEDIUM' ? 'YOR approaching operational limit' : 'YOR masih dalam rentang aman')
            };
        }

        if (functionName === 'suggest_relocation_plan') {
            const blockName = String(functionArgs.block_name || functionArgs.blockName || '').trim().toUpperCase();
            if (!blockName) return { error: 'Parameter block_name wajib diisi.' };
            const source = blockDensity.find(b => b.block === blockName);
            if (!source) return { error: `Block ${blockName} tidak ditemukan.` };
            const targets = blockDensity
                .filter(b => b.block !== blockName && b.capTeus > 0)
                .sort((a, b) => a.density - b.density)
                .slice(0, 3)
                .map(b => b.block);
            return {
                source_block: blockName,
                recommended_target_blocks: targets,
                reason: source.density >= 80 ? 'Lower density and available slots' : 'Source block is not yet critical; relocation optional'
            };
        }

        if (functionName === 'recommend_yard_block') {
            const ctype = String(functionArgs.container_type || functionArgs.containerType || 'IMPORT').toUpperCase();
            const candidate = blockDensity
                .filter(b => b.capTeus > 0 && !EXCLUDED_BLOCKS_YARD.includes(b.block))
                .filter(b => ctype !== 'EXPORT' || EXPORT_DEFAULTS.includes(b.block))
                .sort((a, b) => a.density - b.density)[0];
            if (!candidate) return { error: 'Tidak ada block kandidat yang tersedia.' };
            return {
                container_type: ctype,
                recommended_block: candidate.block,
                reason: 'Low density and balanced yard distribution'
            };
        }

        if (functionName === 'query_yard_data') {
            const params = functionArgs.parameters || functionArgs || {};
            const metric = String(params.metric || '').toLowerCase();
            const filterBlock = String(params?.filters?.block || params.block || '').trim().toUpperCase();
            const filterMove = String(params?.filters?.move || params.move || '').trim().toUpperCase();
            let rows = [...safeInvData];
            if (filterBlock) rows = rows.filter(item => String(item?.block || '').trim().toUpperCase() === filterBlock);
            if (filterMove) rows = rows.filter(item => String(item?.move || '').trim().toUpperCase().includes(filterMove));

            if (metric === 'density') {
                const scopedDensity = filterBlock ? blockDensity.filter(b => b.block === filterBlock) : [...blockDensity];
                const highest = [...scopedDensity].sort((a, b) => b.density - a.density)[0] || null;
                return highest ? { metric: 'density', filters: { block: filterBlock || null }, highest_density_block: highest.block, value: highest.density } : { metric: 'density', value: 0 };
            }
            if (metric === 'inventory') {
                return { metric: 'inventory', filters: { block: filterBlock || null, move: filterMove || null }, total_box: rows.length };
            }
            if (metric === 'dwell_time') {
                return executeTool('get_dwell_time_summary', {});
            }
            if (metric === 'arrival') {
                const date = String(params.date || '').trim();
                return executeTool('get_arrival_summary_by_date', { date });
            }
            if (metric === 'empty') {
                return executeTool('get_empty_container_summary', {});
            }
            if (metric === 'group_count') {
                const groupBy = String(params.group_by || 'block').toLowerCase();
                const keyMap = { block: 'block', move: 'move', line: 'line', service: 'service', length: 'length' };
                const keyName = keyMap[groupBy];
                if (!keyName) return { error: `group_by ${groupBy} tidak didukung.` };
                const counts = {};
                rows.forEach(item => {
                    const key = String(item?.[keyName] || 'UNKNOWN').toUpperCase().trim() || 'UNKNOWN';
                    counts[key] = (counts[key] || 0) + 1;
                });
                const topN = Number(params.top_n || 10);
                const data = Object.entries(counts)
                    .map(([key, count]) => ({ key, count }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, Math.max(1, Math.min(50, Number.isFinite(topN) ? topN : 10)));
                return { metric: 'group_count', group_by: groupBy, filters: { block: filterBlock || null, move: filterMove || null }, data };
            }
            return { error: `Metric ${metric} tidak didukung.` };
        }

        if (functionName === 'retrieve_yard_evidence') {
            const params = functionArgs.parameters || functionArgs || {};
            const limit = Math.max(5, Math.min(50, Number(params.limit || 20)));
            const { filtered, filter } = applyStructuredFilters(safeInvData, params.filters || {});
            const summary = buildEvidenceSummary(filtered);
            return {
                filters: filter,
                totalMatchedRows: filtered.length,
                summary,
                sampleRows: compactRowsForEvidence(filtered, limit)
            };
        }

        if (functionName === 'analyze_yard_state') {
            const sorted = [...blockDensity].filter(b => b.capTeus > 0).sort((a, b) => b.density - a.density);
            const congestion = sorted.filter(b => b.density >= 80).slice(0, 5).map(b => b.block);
            const lowDensity = [...sorted].reverse().slice(0, 5).map(b => b.block);
            const yor_status = yorPct >= 85 ? 'HIGH' : (yorPct >= 75 ? 'MEDIUM' : 'LOW');
            return {
                yor_status,
                congestion_blocks: congestion,
                low_density_blocks: lowDensity,
                recommendation: lowDensity.length ? `Redirect new containers to ${lowDensity.slice(0,2).join(' or ')}` : 'Maintain current distribution and monitor congestion trend'
            };
        }

        return { error: `Function tidak dikenali: ${functionName}` };
    }

    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function callGeminiDirectWithRetry(payload) {
        const resolvedApiKey = getGeminiApiKey();
        const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash'];
        const retryableStatus = new Set([429, 500, 502, 503, 504]);
        let lastError = null;

        for (const modelName of modelsToTry) {
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${resolvedApiKey}`;
            for (let attempt = 1; attempt <= 3; attempt++) {
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) return res.json();

                const errorText = await res.text();
                lastError = new Error(`Gemini API Error: ${res.status} - ${errorText}`);

                if (!retryableStatus.has(res.status)) break;
                if (attempt < 3) await wait(400 * Math.pow(2, attempt - 1));
            }
        }

        throw lastError || new Error('Gemini API Error: unknown failure');
    }

    async function callAiProxy(payload) {
        // Prioritas: proxy server lokal agar API key aman.
        try {
            const proxyRes = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (proxyRes.ok) return proxyRes.json();
        } catch (_) {
            // Ignore and continue with direct fallback.
        }

        // Fallback: direct Gemini call dengan retry untuk beban tinggi (429/503).
        return callGeminiDirectWithRetry(payload);
    }

    async function sendMessageToGemini(userMessage) {
        const dashboardContext = getDashboardContext();
        const systemInstruction = {
            role: 'system',
            parts: [{
                text: `Anda adalah AI Operations Analyst untuk New Priok Container Terminal 1 (NPCT1). Gunakan konteks dashboard berikut untuk analisa: ${dashboardContext}. Gaya jawaban wajib: (1) Jelaskan situasi, (2) Dampak operasional, (3) Rekomendasi aksi. Jika pertanyaan membutuhkan data spesifik, gunakan tools. Prioritaskan tool retrieve_yard_evidence untuk pertanyaan ad-hoc agar jawaban berbasis bukti data tanpa mengirim semua row ke prompt. Untuk pertanyaan container kosong/empty, gunakan get_empty_container_summary (definisi empty: loadStatus berisi EMPTY atau MT). Tolak pertanyaan di luar domain logistik pelabuhan.`
            }]
        };

        const tools = [{
            functionDeclarations: [
                { name: 'get_block_details', description: 'Get inventory composition by block.', parameters: { type: 'OBJECT', properties: { blockName: { type: 'STRING' } }, required: ['blockName'] } },
                { name: 'get_dwell_time_summary', description: 'Get dwell time distribution.', parameters: { type: 'OBJECT', properties: {} } },
                { name: 'get_arrival_summary_by_date', description: 'Get total inventory by arrival date string.', parameters: { type: 'OBJECT', properties: { date: { type: 'STRING' } }, required: ['date'] } },
                { name: 'get_empty_container_summary', description: 'Count empty containers based on loadStatus (EMPTY/MT) and return top blocks.', parameters: { type: 'OBJECT', properties: {} } },
                { name: 'get_block_congestion_risk', description: 'Analyze congestion risk based on block density.', parameters: { type: 'OBJECT', properties: { block_name: { type: 'STRING' } }, required: ['block_name'] } },
                { name: 'predict_yor_after_discharge', description: 'Predict yard occupancy after vessel discharge.', parameters: { type: 'OBJECT', properties: { vessel_container_count: { type: 'NUMBER' } }, required: ['vessel_container_count'] } },
                { name: 'suggest_relocation_plan', description: 'Suggest relocation targets for congested block.', parameters: { type: 'OBJECT', properties: { block_name: { type: 'STRING' } }, required: ['block_name'] } },
                { name: 'recommend_yard_block', description: 'Recommend block for incoming container type.', parameters: { type: 'OBJECT', properties: { container_type: { type: 'STRING' } }, required: ['container_type'] } },
                { name: 'query_yard_data', description: 'Flexible analytics query for density/inventory/dwell_time/arrival/empty/group_count. Supports filters.block, filters.move, group_by, top_n.', parameters: { type: 'OBJECT', properties: { parameters: { type: 'OBJECT' } } } },
                { name: 'retrieve_yard_evidence', description: 'Retrieve grounded evidence rows + grouped summary from uploaded yard data. Supports filters: block, line, service, move, carrier, date and limit.', parameters: { type: 'OBJECT', properties: { parameters: { type: 'OBJECT' } } } },
                { name: 'analyze_yard_state', description: 'Summarize overall yard condition and recommendation.', parameters: { type: 'OBJECT', properties: {} } }
            ]
        }];

        try {
            chatHistory.push({ role: 'user', parts: [{ text: userMessage }] });
            if (chatHistory.length > MAX_CHAT_MESSAGES) {
                chatHistory = chatHistory.slice(-MAX_CHAT_MESSAGES);
            }

            // Explicit architecture: Intent Detection -> Tool Routing -> Tool Execution
            const intentPayload = detectIntent(userMessage);
            const routedTool = routeIntentToTool(intentPayload);
            if (routedTool) {
                const preResult = executeTool(routedTool.name, routedTool.args || {});
                chatHistory.push({ role: 'model', parts: [{ functionCall: { name: routedTool.name, args: routedTool.args || {} } }] });
                chatHistory.push({
                    role: 'function',
                    parts: [{ functionResponse: { name: routedTool.name, response: { result: preResult } } }]
                });
            }

            const data = await callAiProxy({ systemInstruction, contents: chatHistory, tools });
            const responsePart = data?.candidates?.[0]?.content?.parts?.[0] || {};

            if (responsePart.functionCall) {
                const functionName = responsePart.functionCall.name;
                const functionResult = executeTool(functionName, responsePart.functionCall.args || {});

                chatHistory.push({ role: 'model', parts: [{ functionCall: responsePart.functionCall }] });
                chatHistory.push({
                    role: 'function',
                    parts: [{ functionResponse: { name: functionName, response: { result: functionResult } } }]
                });

                const data2 = await callAiProxy({ systemInstruction, contents: chatHistory, tools });
                const finalPart = data2?.candidates?.[0]?.content?.parts?.[0] || {};
                const finalText = finalPart.text || 'Maaf, AI tidak memberikan balasan.';
                chatHistory.push({ role: 'model', parts: [{ text: finalText }] });
                return finalText;
            }

            chatHistory.push({ role: 'model', parts: [responsePart] });
            return responsePart.text || 'Maaf, AI tidak memberikan balasan.';
        } catch (error) {
            chatHistory.pop();
            console.error('Yard Agent Error:', error);
            return String(error.message || error);
        }
    }

    async function sendAiChatMessage(event) {
        event.preventDefault();

        const input = document.getElementById('aiChatInput');
        const history = document.getElementById('aiChatHistory');
        if (!input || !history) return;

        const message = input.value.trim();
        if (!message) return;

        history.insertAdjacentHTML('beforeend', `<div class="ai-chat-bubble user">${escapeHtml(message)}</div>`);
        input.value = '';

        const loadingId = `aiTyping_${Date.now()}`;
        history.insertAdjacentHTML('beforeend', `<div id="${loadingId}" class="ai-chat-bubble bot">Sedang menganalisa...</div>`);
        history.scrollTop = history.scrollHeight;
        input.disabled = true;

        try {
            const aiReply = await sendMessageToGemini(message);
            const loadingEl = document.getElementById(loadingId);
            if (loadingEl) {
                loadingEl.textContent = aiReply;
            } else {
                history.insertAdjacentHTML('beforeend', `<div class="ai-chat-bubble bot">${escapeHtml(aiReply)}</div>`);
            }
        } catch (error) {
            const loadingEl = document.getElementById(loadingId);
            const errMessage = `Maaf, terjadi kendala saat menghubungi AI (${error.message}).`;
            if (loadingEl) {
                loadingEl.textContent = errMessage;
            } else {
                history.insertAdjacentHTML('beforeend', `<div class="ai-chat-bubble bot">${escapeHtml(errMessage)}</div>`);
            }
        }

        input.disabled = false;
        input.focus();
        history.scrollTop = history.scrollHeight;
    }

    // --- NAVIGATION & UTILS ---
    // --- UPDATE NAVIGATION FUNCTIONS ---

function switchTab(t) {
    // Tambahkan 'empty' dan 'replan' ke dalam array daftar tab
    ['overview', 'analytics', 'clash', 'empty', 'projection', 'yardmap', 'replan'].forEach(id => {
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
        
        // Initialize block selection for projection tab
        if (t === 'projection') {
            setTimeout(initializeBlockSelection, 100);
        }
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
    } else if (!document.getElementById("tab-yardmap")?.classList.contains("hidden")) {
        activeId = "captureAreaYardMap";
        fileName = "Yard_Map";
    }

    const el = document.getElementById(activeId);
    if (!el) return alert("Capture area not found");

    // TEMPORARY MODE SWITCH FOR CLUSTER SPREADING
    const detailedToggle = document.getElementById('toggleDetailedCluster');
    let wasDetailed = false;
    if (activeId === "captureArea" && detailedToggle && detailedToggle.checked) {
        wasDetailed = true;
        detailedToggle.checked = false;
        renderClusterSpreading(); 
    }

    // Prepare capture that adjusts cloned DOM to preserve table layout
    const capture = () => {
            const scrollW = el.scrollWidth;
            return html2canvas(el, {
                scale: 1.2, 
                windowWidth: scrollW + 100,
                backgroundColor: "#ffffff",
                onclone: (clonedDoc) => {
                    const clonedRoot = clonedDoc.getElementById(activeId);
                    if (clonedRoot) {
                        clonedRoot.style.width = scrollW + 'px';
                        clonedRoot.style.maxWidth = 'none';
                        clonedRoot.style.padding = '10px';
                        clonedRoot.style.margin = '0';
                        clonedRoot.style.fontSize = '10px';
                        
                        clonedRoot.querySelectorAll('table').forEach(tbl => {
                            tbl.style.width = '100%';
                            tbl.style.tableLayout = 'auto';
                        });

                        clonedRoot.querySelectorAll('.overflow-x-auto, .overflow-y-auto').forEach(div => {
                            div.style.overflow = 'visible';
                            div.style.width = 'auto';
                            div.style.maxWidth = 'none';
                        });

                        clonedRoot.querySelectorAll('.sticky, thead').forEach(node => {
                            node.style.position = 'static';
                        });

                        // Hide the vessel spreading panel during capture for Analytics tab
                        if (activeId === "captureAreaAnalytics") {
                            const recPanel = clonedRoot.querySelector('.recommended-panel');
                            if (recPanel) recPanel.style.display = 'none';
                        }
                        
                        clonedRoot.querySelectorAll('th, td').forEach(cell => {
                            cell.style.padding = '2px 4px';
                        });
                    }
                }
            });
        };

    const doCapture = () => {
        const fontReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();

        return fontReady.then(() => capture()).then(c => {
            const now = new Date();
            const ts = now.getFullYear() + ("0"+(now.getMonth()+1)).slice(-2) + ("0"+now.getDate()).slice(-2) + "_" + ("0"+now.getHours()).slice(-2) + ("0"+now.getMinutes()).slice(-2);

            let l = document.createElement('a');
            l.download = `NPCT1_Yard_${fileName}_${ts}.jpg`;
            l.href = c.toDataURL("image/jpeg", 0.9);
            l.click();

            // RESTORE MODE
            if (wasDetailed) {
                detailedToggle.checked = true;
                renderClusterSpreading();
            }
        }).catch(err => {
            console.error("Capture failed:", err);
            if (wasDetailed) {
                detailedToggle.checked = true;
                renderClusterSpreading();
            }
            alert("Gagal menyimpan gambar. Silakan coba kembali.");
        });
    };

    return doCapture();
}

    // ===== PDF REVIEW DRAWER FUNCTIONS =====
    function openPdfReviewDrawer() {
        if (!isInvLoaded) { alert("No data loaded. Please upload Unit List first."); return; }
        document.getElementById('pdfReviewDrawer').classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
    function closePdfReviewDrawer() {
        document.getElementById('pdfReviewDrawer').classList.add('hidden');
        document.body.style.overflow = '';
    }
    function clearAllPdfNotes() {
        for (let i = 1; i <= 7; i++) {
            const el = document.getElementById('pdfNote' + i);
            if (el) el.value = '';
        }
    }
    function confirmGeneratePdf() {
        const notes = {};
        for (let i = 1; i <= 7; i++) {
            const el = document.getElementById('pdfNote' + i);
            if (el && el.value.trim()) notes[i] = el.value.trim();
        }
        closePdfReviewDrawer();
        generatePDFReport(notes);
    }

    async function generatePDFReport(sectionNotes = {}) {
        if (!isInvLoaded) { alert("No data loaded. Please upload Unit List first."); return; }

        const loader = document.getElementById('loadingOverlay');
        loader.classList.remove('hidden');
        setProgress(5, 'Preparing PDF Report...');

        // Small delay for UI to render loading overlay
        await new Promise(r => setTimeout(r, 80));

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();
            const margin = 10;
            const contentW = pageW - margin * 2;
            let curY = margin;
            const now = new Date();
            const dateStr = `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getFullYear()}`;
            const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

            // --- COLOR PALETTE ---
            const C = {
                primary: [0, 100, 210], primaryDark: [0, 70, 160],
                dark: [15, 23, 42], darkSlate: [30, 41, 59],
                text: [51, 65, 85], lightText: [100, 116, 139],
                white: [255, 255, 255], lightBg: [248, 250, 252],
                border: [226, 232, 240], borderLight: [241, 245, 249],
                amber: [217, 119, 6], emerald: [5, 150, 105],
                red: [220, 38, 38], blue: [37, 99, 235],
                purple: [124, 58, 237], orange: [234, 88, 12],
                indigo: [79, 70, 229], teal: [13, 148, 136],
                accentBg: [239, 246, 255], amberBg: [255, 251, 235],
                emeraldBg: [236, 253, 245], redBg: [254, 242, 242],
                indigoBg: [238, 242, 255], purpleBg: [245, 243, 255],
                orangeBg: [255, 247, 237],
            };

            // --- UTILITY FUNCTIONS ---
            const setFont = (style = 'normal', size = 9) => {
                doc.setFontSize(size);
                if (style === 'bold') doc.setFont('helvetica', 'bold');
                else if (style === 'italic') doc.setFont('helvetica', 'italic');
                else doc.setFont('helvetica', 'normal');
            };
            const drawRoundedRect = (x, y, w, h, r, fillColor, borderColor) => {
                if (fillColor) { doc.setFillColor(...fillColor); doc.roundedRect(x, y, w, h, r, r, 'F'); }
                if (borderColor) { doc.setDrawColor(...borderColor); doc.setLineWidth(0.2); doc.roundedRect(x, y, w, h, r, r, 'S'); }
            };
            // Modern section header with accent bar
            const drawSectionHeader = (title, sectionNum, accentColor = C.primary) => {
                // Accent bar
                doc.setFillColor(...accentColor);
                doc.rect(margin, curY, 3, 8, 'F');
                // Title
                setFont('bold', 13);
                doc.setTextColor(...C.dark);
                doc.text(`${sectionNum}. ${title}`, margin + 6, curY + 6);
                // Thin underline
                doc.setDrawColor(...accentColor);
                doc.setLineWidth(0.4);
                doc.line(margin, curY + 10, pageW - margin, curY + 10);
                curY += 14;
            };
            // Draw a note box for a given section
            const drawNote = (sectionNum) => {
                const noteText = sectionNotes[sectionNum];
                if (!noteText) return;
                // Check if we need a new page for the note
                const lines = doc.splitTextToSize(noteText, contentW - 20);
                const noteH = 10 + (lines.length * 4);
                if (curY + noteH + 6 > pageH - 15) { doc.addPage(); curY = margin; }
                curY += 3;
                // Note container
                drawRoundedRect(margin, curY, contentW, noteH, 2, [255, 251, 235], [251, 191, 36]);
                // Icon bar
                doc.setFillColor(251, 191, 36);
                doc.roundedRect(margin, curY, 2.5, noteH, 2, 0, 'F');
                // Label
                setFont('bold', 6.5);
                doc.setTextColor(161, 98, 7);
                doc.text('\u270E  NOTE', margin + 7, curY + 5);
                // Content
                setFont('normal', 7);
                doc.setTextColor(120, 53, 15);
                doc.text(lines, margin + 7, curY + 10);
                curY += noteH + 3;
            };
            // Page footer helper (applied at the end)
            const applyFooters = () => {
                const totalPages = doc.internal.getNumberOfPages();
                for (let p = 1; p <= totalPages; p++) {
                    doc.setPage(p);
                    doc.setDrawColor(...C.border);
                    doc.setLineWidth(0.3);
                    doc.line(margin, pageH - 9, pageW - margin, pageH - 9);
                    setFont('normal', 6);
                    doc.setTextColor(...C.lightText);
                    doc.text('NPCT1 Yard Planning Dashboard \u2014 Internal Use Only', margin, pageH - 5);
                    doc.text(`Page ${p} / ${totalPages}`, pageW - margin, pageH - 5, { align: 'right' });
                    doc.text(`${dateStr}  ${timeStr}`, pageW / 2, pageH - 5, { align: 'center' });
                }
            };

            // ==================================================================
            // PAGE 1: COVER / DASHBOARD SUMMARY
            // ==================================================================
            setProgress(10, 'Drawing cover page...');

            // Full-width dark header band with gradient effect
            doc.setFillColor(...C.dark);
            doc.rect(0, 0, pageW, 32, 'F');
            doc.setFillColor(...C.primary);
            doc.rect(0, 30, pageW, 2, 'F');

            setFont('bold', 22);
            doc.setTextColor(...C.white);
            doc.text('NPCT1 Yard Planning Report', margin + 2, 14);
            setFont('normal', 9);
            doc.setTextColor(180, 200, 240);
            doc.text(`All-in-One Summary  |  Generated: ${dateStr}, ${timeStr}`, margin + 2, 22);
            // Accent pip
            doc.setFillColor(249, 168, 37);
            doc.rect(margin + 2, 26, 35, 1.5, 'F');

            curY = 40;

            // --- 1. YOR SECTION ---
            setProgress(20, 'Calculating YOR...');
            let yardMapCalc = {};
            Object.keys(activeCapacity).forEach(b => yardMapCalc[b] = { impT: 0, expT: 0 });
            invData.forEach(it => {
                if (!yardMapCalc[it.block]) return;
                let teus = it.length.startsWith('20') ? 1 : (it.length.startsWith('45') ? 2.25 : 2);
                if (it.move.includes('import') || it.move.includes('disc') || it.move.includes('vessel')) {
                    yardMapCalc[it.block].impT += teus;
                } else { yardMapCalc[it.block].expT += teus; }
            });
            let sm = { impC: 0, expC: 0, impS: 0, expS: 0 };
            Object.keys(yardMapCalc).sort().forEach(b => {
                let d = yardMapCalc[b], cap = activeCapacity[b];
                if (!EXCLUDED_BLOCKS_YARD.includes(b)) {
                    let totT = d.impT + d.expT;
                    if (totT > 0) { sm.impC += cap.cap * (d.impT / totT); sm.expC += cap.cap * (d.expT / totT); }
                    else { EXPORT_DEFAULTS.includes(b) ? sm.expC += cap.cap : sm.impC += cap.cap; }
                    sm.impS += d.impT; sm.expS += d.expT;
                }
            });
            let totalS = sm.impS + sm.expS, totalC = sm.impC + sm.expC;
            let yorImp = sm.impC > 0 ? (sm.impS / sm.impC * 100) : 0;
            let yorExp = sm.expC > 0 ? (sm.expS / sm.expC * 100) : 0;
            let yorTotal = totalC > 0 ? (totalS / totalC * 100) : 0;

            drawSectionHeader('Yard Occupancy Ratio (YOR)', 1, C.primary);

            // YOR Cards — 3 cols
            const cardW = (contentW - 8) / 3;
            const cardH = 24;
            const yorCards = [
                { label: 'YOR IMPORT', value: `${Math.round(yorImp)}%`, sub: `Stack ${Math.round(sm.impS).toLocaleString()} / Cap ${Math.round(sm.impC).toLocaleString()} TEUs`, color: C.amber, bg: C.amberBg },
                { label: 'YOR EXPORT', value: `${Math.round(yorExp)}%`, sub: `Stack ${Math.round(sm.expS).toLocaleString()} / Cap ${Math.round(sm.expC).toLocaleString()} TEUs`, color: C.emerald, bg: C.emeraldBg },
                { label: 'YOR OVERALL', value: `${Math.round(yorTotal)}%`, sub: `Stack ${Math.round(totalS).toLocaleString()} / Cap ${Math.round(totalC).toLocaleString()} TEUs`, color: yorTotal > 65 ? C.red : C.primary, bg: yorTotal > 65 ? C.redBg : C.accentBg },
            ];
            yorCards.forEach((card, i) => {
                const x = margin + i * (cardW + 4);
                drawRoundedRect(x, curY, cardW, cardH, 2, card.bg, C.border);
                // Accent left bar
                doc.setFillColor(...card.color);
                doc.roundedRect(x, curY, 2.5, cardH, 2, 0, 'F');
                setFont('bold', 7.5);
                doc.setTextColor(...card.color);
                doc.text(card.label, x + 7, curY + 6.5);
                setFont('bold', 20);
                doc.text(card.value, x + 7, curY + 17);
                setFont('normal', 6);
                doc.setTextColor(...C.lightText);
                doc.text(card.sub, x + 7, curY + 21.5);
            });
            curY += cardH + 8;
            drawNote(1);

            // --- 2. KEY METRICS ---
            setProgress(30, 'Computing metrics...');
            drawSectionHeader('Key Metrics Summary', 2, C.indigo);

            const exportVessels = new Set();
            invData.forEach(it => { if (it.move.includes('export') && it.carrier && it.carrier !== '0' && it.carrier !== 'NIL') exportVessels.add(it.carrier); });
            const totalExportVessels = exportVessels.size;

            let emptyInsideBlock = 0, emptyOutsideBlock = 0;
            invData.forEach(d => {
                const isEmpty = (d.loadStatus.includes('EMPTY') || d.loadStatus === 'MT');
                if (!isEmpty) return;
                const block = String(d.block || '').toUpperCase();
                if (block.startsWith('80') || String(d.slot || '').startsWith('80')) emptyOutsideBlock++; else emptyInsideBlock++;
            });
            const totalEmpty = emptyInsideBlock + emptyOutsideBlock;

            const today = new Date(); today.setHours(0, 0, 0, 0);
            let longstayImport = 0, longstayExport = 0;
            invData.forEach(item => {
                const ad = parseArrivalDate(item?.arrivalDate); if (!ad) return;
                ad.setHours(0, 0, 0, 0);
                const diff = Math.floor((today.getTime() - ad.getTime()) / 86400000);
                if (diff > 7) {
                    if (item.move.includes('import') || item.move.includes('disc') || item.move.includes('vessel')) longstayImport++; else longstayExport++;
                }
            });

            let totalOOG = 0;
            invData.forEach(d => {
                const oogVal = String(d.oog || '').toUpperCase();
                const block = String(d.block || '').toUpperCase();
                if (oogVal === 'Y' || oogVal === 'YES' || oogVal === 'OOG' || block === 'OOG') totalOOG++;
            });

            const metricW = (contentW - 12) / 4;
            const metricH = 28;
            const metricCards = [
                { title: 'EXPORT VESSELS', sub: 'ON YARD', value: String(totalExportVessels), color: C.blue, bg: C.accentBg },
                { title: 'TOTAL EMPTY', sub: `In: ${emptyInsideBlock}  |  Out: ${emptyOutsideBlock}`, value: String(totalEmpty), color: C.purple, bg: C.purpleBg },
                { title: 'LONGSTAY > 7D', sub: `Imp: ${longstayImport}  |  Exp: ${longstayExport}`, value: String(longstayImport + longstayExport), color: C.orange, bg: C.orangeBg },
                { title: 'TOTAL OOG', sub: 'IN YARD', value: String(totalOOG), color: C.red, bg: C.redBg },
            ];
            metricCards.forEach((m, i) => {
                const x = margin + i * (metricW + 4);
                drawRoundedRect(x, curY, metricW, metricH, 2, m.bg, C.border);
                doc.setFillColor(...m.color);
                doc.roundedRect(x, curY, 2.5, metricH, 2, 0, 'F');
                setFont('bold', 6.5);
                doc.setTextColor(...m.color);
                doc.text(m.title, x + 7, curY + 7);
                setFont('bold', 22);
                doc.text(m.value, x + 7, curY + 19);
                setFont('normal', 6);
                doc.setTextColor(...C.lightText);
                doc.text(m.sub, x + 7, curY + 24);
            });
            curY += metricH + 8;
            drawNote(2);

            // --- 3. DOUBLE CALL PER SERVICE ---
            setProgress(35, 'Analyzing double calls...');
            drawSectionHeader('Double Call per Service', 3, C.purple);

            // Group by SERVICE with multiple carriers
            const serviceCarrierMap = {};
            invData.forEach(it => {
                if (!it.move.includes('export')) return;
                
                // IGNORE IF NO ETA/ARRIVAL DATE
                const arrivalDateStr = String(it.arrivalDate || '').toUpperCase().trim();
                if (!arrivalDateStr || arrivalDateStr === 'UNKNOWN' || arrivalDateStr === 'NIL' || arrivalDateStr === '0' || arrivalDateStr === '') return;

                const carrier = String(it.carrier || '').toUpperCase().trim();
                const service = String(it.service || '').toUpperCase().trim();
                if (!carrier || carrier === '0' || carrier === 'NIL' || !service) return;
                
                if (!serviceCarrierMap[service]) serviceCarrierMap[service] = {};
                if (!serviceCarrierMap[service][carrier]) serviceCarrierMap[service][carrier] = 0;
                serviceCarrierMap[service][carrier]++;
            });
            const doubleCallServices = [];
            Object.entries(serviceCarrierMap).forEach(([service, carriers]) => {
                const carrierKeys = Object.keys(carriers);
                if (carrierKeys.length >= 2) {
                    doubleCallServices.push({
                        service,
                        carriers: carrierKeys.join(', '),
                        carrierCount: carrierKeys.length,
                        details: carrierKeys.map(c => `${c} (${carriers[c]})`).join(', ')
                    });
                }
            });
            doubleCallServices.sort((a, b) => b.carrierCount - a.carrierCount);

            if (doubleCallServices.length > 0) {
                doc.autoTable({
                    startY: curY,
                    margin: { left: margin, right: margin },
                    head: [['#', 'Service', 'Carriers', 'Detail (Units per Carrier)']],
                    body: doubleCallServices.map((v, i) => [i + 1, v.service, v.carriers, v.details]),
                    theme: 'grid',
                    headStyles: { fillColor: C.purple, textColor: C.white, fontSize: 7, fontStyle: 'bold', halign: 'center', cellPadding: 2.5 },
                    bodyStyles: { fontSize: 7, textColor: C.text, cellPadding: 2.2 },
                    columnStyles: { 0: { halign: 'center', cellWidth: 8 }, 1: { fontStyle: 'bold', cellWidth: 25 }, 2: { cellWidth: 55 }, 3: { cellWidth: 'auto' } },
                    alternateRowStyles: { fillColor: C.lightBg },
                    tableLineColor: C.border, tableLineWidth: 0.15,
                });
                curY = doc.lastAutoTable.finalY + 4;
            } else {
                setFont('italic', 8); doc.setTextColor(...C.lightText);
                doc.text('No double call per service found.', margin + 6, curY + 2);
                curY += 8;
            }
            drawNote(3);

            // ==================================================================
            // PAGE 2: CLUSTER SPREADING BY BLOCK
            // ==================================================================
            setProgress(45, 'Building cluster table...');
            doc.addPage(); curY = margin;

            // Dark header band for this page
            doc.setFillColor(...C.dark);
            doc.rect(0, 0, pageW, 14, 'F');
            doc.setFillColor(...C.emerald);
            doc.rect(0, 13, pageW, 1.5, 'F');
            setFont('bold', 11);
            doc.setTextColor(...C.white);
            doc.text('4. Cluster Spreading by Block', margin + 2, 9);
            setFont('normal', 7);
            doc.setTextColor(180, 220, 200);
            doc.text(`${dateStr} ${timeStr}`, pageW - margin - 2, 9, { align: 'right' });
            curY = 20;

            // Compute block occupancy for header row
            const blockTeus = {};
            invData.forEach(it => {
                if (!it.block) return;
                const b = it.block.toUpperCase();
                if (!blockTeus[b]) blockTeus[b] = 0;
                const teus = String(it.length || '').startsWith('20') ? 1 : (String(it.length || '').startsWith('45') ? 2.25 : 2);
                blockTeus[b] += teus;
            });

            const IGNORED_CLUSTER_BLOCKS = new Set(['C01', 'C02', 'D01', 'BR9', 'RC9', 'OOG', 'N']);
            const scheduleMap = {};
            (scheduleData || []).forEach(sc => {
                const key = `${sc.carrier}||${sc.service || ''}`;
                if (!scheduleMap[key]) scheduleMap[key] = [];
                scheduleMap[key].push(sc);
            });

            let clusterStats = {};
            invData.forEach(it => {
                if (!it.move.includes('export')) return;
                let c = it.carrier;
                if (!c || c === '0' || c === 'NIL') return;
                if (IGNORED_CLUSTER_BLOCKS.has(it.block)) return;
                const service = String(it.service || '').toUpperCase();
                const key = `${c}||${service}`;
                if (!clusterStats[key]) clusterStats[key] = { carrier: c, service, blocks: {}, total: 0, clusters: new Set(), eta: null };
                if (!clusterStats[key].blocks[it.block]) clusterStats[key].blocks[it.block] = 0;
                clusterStats[key].blocks[it.block]++;
                clusterStats[key].total++;
                if (service) {
                    const expected = typeof getExpectedClusterForService === 'function' ? getExpectedClusterForService(service) : null;
                    if (expected !== null) clusterStats[key].clusters.add(expected);
                }
                const sRows = scheduleMap[key] || [];
                if (sRows.length) {
                    const earliest = sRows.reduce((min, row) => !min || row.eta.getTime() < min.getTime() ? row.eta : min, null);
                    if (earliest) clusterStats[key].eta = earliest;
                }
            });

            let clusterSorted = Object.entries(clusterStats).sort(([, a], [, b]) => {
                if (a.eta && b.eta) return a.eta - b.eta;
                if (a.eta) return -1; if (b.eta) return 1;
                return b.total - a.total;
            }).filter(e => e[1].total >= 50);

            let allBlocks = new Set();
            clusterSorted.forEach(([, data]) => Object.keys(data.blocks).forEach(b => allBlocks.add(b)));
            let sortedBlocks = Array.from(allBlocks).sort();

            if (clusterSorted.length > 0 && sortedBlocks.length > 0) {
                // Build occupancy % row for header
                const blockOccRow = sortedBlocks.map(b => {
                    const cap = activeCapacity[b]?.cap || 0;
                    const teus = blockTeus[b] || 0;
                    return cap > 0 ? `${Math.round((teus / cap) * 100)}%` : '-';
                });

                const headerRow1 = ['ETB', 'S', 'Carrier', 'Svc', ...sortedBlocks, 'Exp', 'Act', 'Total'];
                const occHeaderRow = ['', '', '', 'YOR', ...blockOccRow, '', '', ''];

                const bodyRows = clusterSorted.map(([, data]) => {
                    let etaLabel = '-', shiftLabel = '-';
                    if (data.eta) {
                        etaLabel = `${data.eta.getDate().toString().padStart(2,'0')}/${(data.eta.getMonth()+1).toString().padStart(2,'0')}`;
                        let h = data.eta.getHours(), m = data.eta.getMinutes(), tm = h * 60 + m;
                        if (tm >= 420 && tm < 930) shiftLabel = '1';
                        else if (tm >= 930 && tm < 1380) shiftLabel = '2';
                        else shiftLabel = '3';
                    }
                    const cv = Array.from(data.clusters).sort((a, b) => a - b);
                    const expLabel = cv.length ? cv.join(',') : '-';
                    const actCluster = Object.keys(data.blocks).length;
                    const blockCells = sortedBlocks.map(b => data.blocks[b] ? String(data.blocks[b]) : '-');
                    return [etaLabel, shiftLabel, data.carrier, data.service || '-', ...blockCells, expLabel, String(actCluster), String(data.total)];
                });

                const colStyles = { 0: { cellWidth: 13, halign: 'center' }, 1: { cellWidth: 6, halign: 'center' }, 2: { cellWidth: 16, fontStyle: 'bold' }, 3: { cellWidth: 12, halign: 'center' } };
                sortedBlocks.forEach((_, idx) => { colStyles[4 + idx] = { cellWidth: 'auto', halign: 'center', fontSize: 5 }; });
                const lastIdx = 4 + sortedBlocks.length;
                colStyles[lastIdx] = { cellWidth: 9, halign: 'center' };
                colStyles[lastIdx + 1] = { cellWidth: 9, halign: 'center' };
                colStyles[lastIdx + 2] = { cellWidth: 11, halign: 'center', fontStyle: 'bold' };

                doc.autoTable({
                    startY: curY,
                    margin: { left: margin, right: margin },
                    head: [headerRow1, occHeaderRow],
                    body: bodyRows,
                    theme: 'grid',
                    headStyles: { fillColor: C.darkSlate, textColor: C.white, fontSize: 5, fontStyle: 'bold', halign: 'center', cellPadding: 1.3 },
                    bodyStyles: { fontSize: 5, textColor: C.text, cellPadding: 1, halign: 'center' },
                    columnStyles: colStyles,
                    alternateRowStyles: { fillColor: C.lightBg },
                    tableLineColor: C.border, tableLineWidth: 0.1,
                    didParseCell: function(data) {
                        // Style the occupancy header row
                        if (data.section === 'head' && data.row.index === 1) {
                            data.cell.styles.fillColor = [241, 245, 249];
                            data.cell.styles.textColor = C.darkSlate;
                            data.cell.styles.fontSize = 4.5;
                            // Color the % value
                            const pctVal = parseInt(data.cell.raw);
                            if (!isNaN(pctVal)) {
                                if (pctVal > 80) { data.cell.styles.textColor = [220, 38, 38]; data.cell.styles.fontStyle = 'bold'; }
                                else if (pctVal > 60) { data.cell.styles.textColor = [217, 119, 6]; }
                                else { data.cell.styles.textColor = [5, 150, 105]; }
                            }
                        }
                        // Exceeding clusters
                        if (data.section === 'body' && data.column.index === lastIdx + 1) {
                            const row = bodyRows[data.row.index];
                            if (row) {
                                const exp = parseInt(row[lastIdx]), act = parseInt(row[lastIdx + 1]);
                                if (!isNaN(exp) && !isNaN(act) && act > exp) {
                                    data.cell.styles.textColor = [220, 38, 38]; data.cell.styles.fontStyle = 'bold'; data.cell.styles.fillColor = [254, 242, 242];
                                }
                            }
                        }
                        // Color block cells
                        if (data.section === 'body' && data.column.index >= 4 && data.column.index < lastIdx) {
                            const val = parseInt(data.cell.raw);
                            if (!isNaN(val) && val > 0) {
                                if (val > 200) { data.cell.styles.fillColor = [220, 38, 38]; data.cell.styles.textColor = C.white; data.cell.styles.fontStyle = 'bold'; }
                                else if (val > 100) { data.cell.styles.fillColor = [251, 191, 36]; data.cell.styles.textColor = C.dark; data.cell.styles.fontStyle = 'bold'; }
                                else { data.cell.styles.fillColor = C.accentBg; data.cell.styles.textColor = [37, 99, 235]; }
                            }
                        }
                    }
                });
                curY = doc.lastAutoTable.finalY + 4;
            } else {
                setFont('italic', 8); doc.setTextColor(...C.lightText);
                doc.text('No cluster spreading data available.', margin + 6, curY + 4);
                curY += 10;
            }
            drawNote(4);

            // ==================================================================
            // PAGE 3: YARD MAP VISUALIZATION
            // ==================================================================
            setProgress(55, 'Capturing yard map...');
            doc.addPage(); curY = margin;

            doc.setFillColor(...C.dark);
            doc.rect(0, 0, pageW, 14, 'F');
            doc.setFillColor(...C.teal);
            doc.rect(0, 13, pageW, 1.5, 'F');
            setFont('bold', 11);
            doc.setTextColor(...C.white);
            doc.text('5. Yard Map Visualization', margin + 2, 9);
            setFont('normal', 7);
            doc.setTextColor(180, 220, 210);
            doc.text(`${dateStr} ${timeStr}`, pageW - margin - 2, 9, { align: 'right' });
            curY = 20;

            // Capture the yardMapContent via html2canvas
            const yardMapEl = document.getElementById('captureAreaYardMap');
            if (yardMapEl && isInvLoaded) {
                try {
                    // Ensure yard map is rendered
                    if (typeof renderYardMap === 'function') renderYardMap();
                    await new Promise(r => setTimeout(r, 300));

                    const yardEl = yardMapEl;
                    const scrollW = yardEl.scrollWidth;
                    const canvas = await html2canvas(yardEl, {
                        scale: 1.5,
                        windowWidth: Math.max(scrollW + 100, 1600),
                        backgroundColor: '#ffffff',
                        onclone: (clonedDoc) => {
                            const clonedRoot = clonedDoc.getElementById('captureAreaYardMap');
                            if (clonedRoot) {
                                clonedRoot.style.width = scrollW + 'px';
                                clonedRoot.style.maxWidth = 'none';
                                clonedRoot.style.padding = '8px';
                                clonedRoot.querySelectorAll('.overflow-x-auto, .overflow-y-auto').forEach(div => {
                                    div.style.overflow = 'visible'; div.style.width = 'auto'; div.style.maxWidth = 'none';
                                });
                            }
                        }
                    });
                    const imgData = canvas.toDataURL('image/jpeg', 0.92);
                    const imgAspect = canvas.width / canvas.height;
                    const maxImgW = contentW;
                    const maxImgH = pageH - curY - 15;
                    let imgW = maxImgW;
                    let imgH = imgW / imgAspect;
                    if (imgH > maxImgH) { imgH = maxImgH; imgW = imgH * imgAspect; }
                    const imgX = margin + (contentW - imgW) / 2;
                    doc.addImage(imgData, 'JPEG', imgX, curY, imgW, imgH);
                    curY += imgH + 4;
                } catch (e) {
                    console.warn('Yard map capture failed:', e);
                    setFont('italic', 8); doc.setTextColor(...C.lightText);
                    doc.text('Yard map capture failed. Please ensure Yard Map tab has been rendered.', margin + 6, curY + 4);
                    curY += 10;
                }
            } else {
                setFont('italic', 8); doc.setTextColor(...C.lightText);
                doc.text('No yard map data available. Upload unit list and visit Yard Map tab first.', margin + 6, curY + 4);
                curY += 10;
            }
            drawNote(5);

            // ==================================================================
            // PAGE 4: EMPTY CONTAINER SUMMARY
            // ==================================================================
            setProgress(70, 'Building empty container summary...');
            doc.addPage(); curY = margin;

            doc.setFillColor(...C.dark);
            doc.rect(0, 0, pageW, 14, 'F');
            doc.setFillColor(...C.emerald);
            doc.rect(0, 13, pageW, 1.5, 'F');
            setFont('bold', 11);
            doc.setTextColor(...C.white);
            doc.text('6. Empty Container Summary', margin + 2, 9);
            setFont('normal', 7);
            doc.setTextColor(180, 220, 200);
            doc.text(`${dateStr} ${timeStr}`, pageW - margin - 2, 9, { align: 'right' });
            curY = 20;

            // Import empty cards
            let emptyImpData = invData.filter(d => (d.loadStatus.includes('EMPTY') || d.loadStatus === 'MT') && d.move.includes('import') && !(String(d.block || '').startsWith('80') || String(d.slot || '').startsWith('80')));
            let emptyImpStats = { c20: 0, c40: 0, c45: 0, total: 0 };
            emptyImpData.forEach(d => {
                if (d.length.startsWith('20')) emptyImpStats.c20++; else if (d.length.startsWith('45')) emptyImpStats.c45++; else emptyImpStats.c40++;
                emptyImpStats.total++;
            });
            const impEmptyTeus = (emptyImpStats.c20 * 1) + (emptyImpStats.c40 * 2) + (emptyImpStats.c45 * 2.25);

            // Import summary mini-cards
            setFont('bold', 9); doc.setTextColor(...C.amber);
            doc.text('Import Empty', margin + 6, curY + 4);
            const impCardData = [
                { label: "20'", value: emptyImpStats.c20 },
                { label: "40'", value: emptyImpStats.c40 },
                { label: "45'", value: emptyImpStats.c45 },
                { label: 'Total', value: emptyImpStats.total },
                { label: 'TEUs', value: Number(impEmptyTeus.toFixed(1)) },
            ];
            const icW = 28, icH = 14;
            impCardData.forEach((ic, i) => {
                const x = margin + 50 + i * (icW + 3);
                drawRoundedRect(x, curY - 1, icW, icH, 1.5, C.amberBg, C.border);
                setFont('bold', 5.5); doc.setTextColor(...C.lightText);
                doc.text(ic.label, x + icW / 2, curY + 3.5, { align: 'center' });
                setFont('bold', 9); doc.setTextColor(...C.amber);
                doc.text(String(ic.value), x + icW / 2, curY + 10.5, { align: 'center' });
            });
            curY += icH + 6;

            // Export empty table
            setFont('bold', 9); doc.setTextColor(...C.emerald);
            doc.text('Export Empty by Carrier', margin + 6, curY + 2);
            curY += 5;

            let emptyExportStats = {};
            invData.filter(d => (d.loadStatus.includes('EMPTY') || d.loadStatus === 'MT') && d.move.includes('export') && !(String(d.block || '').startsWith('80') || String(d.slot || '').startsWith('80'))).forEach(d => {
                let key = `${d.carrier}||${d.service || ''}`;
                if (!emptyExportStats[key]) emptyExportStats[key] = { carrier: d.carrier, service: d.service || '', c20: 0, c40: 0, c45: 0, total: 0 };
                if (d.length.startsWith('20')) emptyExportStats[key].c20++; else if (d.length.startsWith('45')) emptyExportStats[key].c45++; else emptyExportStats[key].c40++;
                emptyExportStats[key].total++;
            });
            let sortedEmptyExp = Object.values(emptyExportStats).sort((a, b) => b.total - a.total);

            if (sortedEmptyExp.length > 0) {
                const grandEmpty = sortedEmptyExp.reduce((acc, curr) => ({ c20: acc.c20 + curr.c20, c40: acc.c40 + curr.c40, c45: acc.c45 + curr.c45, total: acc.total + curr.total, teus: acc.teus + ((curr.c20 * 1) + (curr.c40 * 2) + (curr.c45 * 2.25)) }), { c20: 0, c40: 0, c45: 0, total: 0, teus: 0 });
                const emptyBody = sortedEmptyExp.map(e => [e.carrier || '-', e.service || '-', e.c20 || '-', e.c40 || '-', e.c45 || '-', e.total, Number(((e.c20*1)+(e.c40*2)+(e.c45*2.25)).toFixed(2))]);
                emptyBody.push(['GRAND TOTAL', '-', grandEmpty.c20, grandEmpty.c40, grandEmpty.c45, grandEmpty.total, Number(grandEmpty.teus.toFixed(2))]);

                doc.autoTable({
                    startY: curY, margin: { left: margin, right: margin },
                    head: [['Carrier', 'Service', "20'", "40'", "45'", 'Total', 'TEUs']],
                    body: emptyBody, theme: 'grid',
                    headStyles: { fillColor: C.emerald, textColor: C.white, fontSize: 7, fontStyle: 'bold', halign: 'center', cellPadding: 2.5 },
                    bodyStyles: { fontSize: 7, textColor: C.text, cellPadding: 2, halign: 'center' },
                    columnStyles: { 0: { halign: 'left', fontStyle: 'bold', cellWidth: 30 }, 1: { cellWidth: 25 } },
                    alternateRowStyles: { fillColor: C.lightBg }, tableLineColor: C.border, tableLineWidth: 0.15,
                    didParseCell: function(data) {
                        if (data.section === 'body' && data.row.index === emptyBody.length - 1) {
                            data.cell.styles.fillColor = C.borderLight; data.cell.styles.fontStyle = 'bold'; data.cell.styles.textColor = C.dark;
                        }
                    }
                });
            } else {
                setFont('italic', 8); doc.setTextColor(...C.lightText);
                doc.text('No export empty data found.', margin + 6, curY + 2);
            }
            drawNote(6);

            // ==================================================================
            // PAGE 5: LONGSTAY > 7 DAYS
            // ==================================================================
            setProgress(85, 'Building longstay table...');
            doc.addPage(); curY = margin;

            doc.setFillColor(...C.dark);
            doc.rect(0, 0, pageW, 14, 'F');
            doc.setFillColor(...C.orange);
            doc.rect(0, 13, pageW, 1.5, 'F');
            setFont('bold', 11);
            doc.setTextColor(...C.white);
            doc.text('7. Longstay > 7 Days Detail by Block', margin + 2, 9);
            setFont('normal', 7);
            doc.setTextColor(255, 220, 180);
            doc.text(`${dateStr} ${timeStr}`, pageW - margin - 2, 9, { align: 'right' });
            curY = 20;

            // Summary cards
            const lsW = 40, lsH = 18;
            const lsCards = [
                { label: 'IMPORT LONGSTAY', value: String(longstayImport), color: C.amber, bg: C.amberBg },
                { label: 'EXPORT LONGSTAY', value: String(longstayExport), color: C.emerald, bg: C.emeraldBg },
                { label: 'TOTAL LONGSTAY', value: String(longstayImport + longstayExport), color: C.orange, bg: C.orangeBg },
            ];
            lsCards.forEach((lc, i) => {
                const x = margin + i * (lsW + 4);
                drawRoundedRect(x, curY, lsW, lsH, 2, lc.bg, C.border);
                doc.setFillColor(...lc.color); doc.roundedRect(x, curY, 2.5, lsH, 2, 0, 'F');
                setFont('bold', 5.5); doc.setTextColor(...lc.color); doc.text(lc.label, x + 7, curY + 5.5);
                setFont('bold', 14); doc.text(lc.value, x + 7, curY + 14);
            });
            curY += lsH + 8;

            const longstayByBlock = {};
            invData.forEach(item => {
                const ad = parseArrivalDate(item?.arrivalDate); if (!ad) return;
                ad.setHours(0, 0, 0, 0);
                const diff = Math.floor((today.getTime() - ad.getTime()) / 86400000);
                if (diff > 7) {
                    const block = String(item.block || 'UNKNOWN').toUpperCase();
                    const mt = (item.move.includes('import') || item.move.includes('disc') || item.move.includes('vessel')) ? 'import' : 'export';
                    if (!longstayByBlock[block]) longstayByBlock[block] = { import: 0, export: 0, total: 0 };
                    longstayByBlock[block][mt] += 1; longstayByBlock[block].total += 1;
                }
            });
            const longstayRows = Object.entries(longstayByBlock).sort((a, b) => b[1].total - a[1].total);

            if (longstayRows.length > 0) {
                doc.autoTable({
                    startY: curY, margin: { left: margin, right: margin },
                    head: [['Block', 'Import', 'Export', 'Total']],
                    body: longstayRows.map(([block, d]) => [block, d.import, d.export, d.total]),
                    foot: [['TOTAL', longstayImport, longstayExport, longstayImport + longstayExport]],
                    theme: 'grid',
                    headStyles: { fillColor: C.orange, textColor: C.white, fontSize: 7, fontStyle: 'bold', halign: 'center', cellPadding: 2.5 },
                    bodyStyles: { fontSize: 7, textColor: C.text, cellPadding: 2, halign: 'center' },
                    footStyles: { fillColor: C.borderLight, textColor: C.dark, fontStyle: 'bold', halign: 'center', fontSize: 7, cellPadding: 2.5 },
                    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 25 } },
                    alternateRowStyles: { fillColor: C.lightBg }, tableLineColor: C.border, tableLineWidth: 0.15,
                });
            } else {
                setFont('italic', 8); doc.setTextColor(...C.lightText);
                doc.text('No longstay containers found.', margin + 6, curY + 2);
            }
            drawNote(7);

            // ==================================================================
            // APPLY FOOTERS & SAVE
            // ==================================================================
            setProgress(95, 'Finalizing...');
            applyFooters();

            setProgress(100, 'Saving PDF...');
            const ts = now.getFullYear() + (('0' + (now.getMonth() + 1)).slice(-2)) + (('0' + now.getDate()).slice(-2)) + '_' + (('0' + now.getHours()).slice(-2)) + (('0' + now.getMinutes()).slice(-2));
            doc.save(`NPCT1_Yard_Report_${ts}.pdf`);
        } catch (err) {
            console.error('PDF Generation Error:', err);
            alert('Gagal membuat PDF: ' + err.message);
        } finally {
            setTimeout(() => loader.classList.add('hidden'), 500);
        }
    }

// --- TAB 4: EMPTY SUMMARY RENDER ---
function renderEmptySummary() {
    const impDiv = document.getElementById('emptyImportSummary');
    const expBody = document.getElementById('emptyExportBody');
    
    // 1. Filter Data: Hanya yang statusnya Empty/MT
    // EXCLUDE entries where block or slot starts with '8'
    let emptyData = invData.filter(d => (d.loadStatus.includes('EMPTY') || d.loadStatus === 'MT') && !(String(d.block || '').startsWith('80') || String(d.slot || '').startsWith('80')));

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
    const scheduleMap = {};
    (scheduleData || []).forEach(s => {
        const key = `${s.carrier}||${String(s.service || '').toUpperCase()}`;
        if(!scheduleMap[key]) scheduleMap[key] = [];
        scheduleMap[key].push(s);
    });

    let expStats = {};
    emptyData.filter(d => d.move.includes('export')).forEach(d => {
        let key = `${d.carrier}||${String(d.service || '').toUpperCase()}`;
        if(!expStats[key]) expStats[key] = { carrier: d.carrier, service: d.service || '', c20: 0, c40: 0, c45: 0, total: 0, eta: null };
        
        if(d.length.startsWith('20')) expStats[key].c20++;
        else if(d.length.startsWith('45')) expStats[key].c45++;
        else expStats[key].c40++;
        expStats[key].total++;
        
        const scheduleRows = scheduleMap[key] || [];
        if (scheduleRows.length && !expStats[key].eta) {
            const earliest = scheduleRows.reduce((min, row) => {
                return !min || row.eta.getTime() < min.getTime() ? row.eta : min;
            }, null);
            if (earliest) expStats[key].eta = earliest;
        }
    });

    // Sort by ETA then Total Descending
    let sortedExp = Object.values(expStats).sort((a,b) => {
        if (a.eta && b.eta) return a.eta - b.eta;
        if (a.eta) return -1;
        if (b.eta) return 1;
        return b.total - a.total;
    });
    
    expBody.innerHTML = '';
    if(sortedExp.length === 0) {
        expBody.innerHTML = '<tr><td colspan="9" class="p-4 text-center text-slate-400 italic">No Export Empty found.</td></tr>';
    } else {
        const _expRows = [];
        sortedExp.forEach(s => {
            let etbText = '-', hourText = '-';
            if(s.eta) {
                const et = s.eta;
                etbText = `${et.getDate().toString().padStart(2,'0')}/${(et.getMonth()+1).toString().padStart(2,'0')}`;
                hourText = `${et.getHours().toString().padStart(2,'0')}:${et.getMinutes().toString().padStart(2,'0')}`;
            }

            const carrier = s.carrier || '-';
            const service = s.service || '-';
            const totalTeus = (s.c20 * 1) + (s.c40 * 2) + (s.c45 * 2.25);
            _expRows.push(`
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-6 py-3 font-bold text-slate-700">${carrier}</td>
                    <td class="px-6 py-3 text-center font-semibold text-slate-700 border-r border-slate-100">${etbText}</td>
                    <td class="px-6 py-3 text-center font-bold text-slate-600 border-r border-slate-100">${hourText}</td>
                    <td class="px-6 py-3 text-center font-medium text-slate-600">${service}</td>
                    <td class="px-6 py-3 text-center">${s.c20 || '-'}</td>
                    <td class="px-6 py-3 text-center">${s.c40 || '-'}</td>
                    <td class="px-6 py-3 text-center">${s.c45 || '-'}</td>
                    <td class="px-6 py-3 text-center font-bold bg-slate-50 text-slate-800">${s.total}</td>
                    <td class="px-6 py-3 text-center font-bold text-emerald-600">${Number(totalTeus.toFixed(2))}</td>
                </tr>
            `);
        });
        // Add Grand Total Row
        let grand = sortedExp.reduce((acc, curr) => ({
            c20: acc.c20 + curr.c20,
            c40: acc.c40 + curr.c40,
            c45: acc.c45 + curr.c45,
            total: acc.total + curr.total,
            teus: acc.teus + ((curr.c20 * 1) + (curr.c40 * 2) + (curr.c45 * 2.25))
        }), {c20:0, c40:0, c45:0, total:0, teus:0});
        
        _expRows.push(`
            <tr class="bg-slate-100 border-t-2 border-slate-200 font-bold">
                <td class="px-6 py-3 text-slate-800">GRAND TOTAL</td>
                <td colspan="2" class="px-6 py-3 text-center text-slate-700 border-r border-slate-200">-</td>
                <td class="px-6 py-3 text-center text-slate-700">-</td>
                <td class="px-6 py-3 text-center text-blue-600">${grand.c20}</td>
                <td class="px-6 py-3 text-center text-blue-600">${grand.c40}</td>
                <td class="px-6 py-3 text-center text-blue-600">${grand.c45}</td>
                <td class="px-6 py-3 text-center text-emerald-600 text-lg">${grand.total}</td>
                <td class="px-6 py-3 text-center text-emerald-700 text-lg">${Number(grand.teus.toFixed(2))}</td>
            </tr>
        `);
        expBody.innerHTML = _expRows.join('');
    }
}


function normalizeProjectionType(rawType = '', blockHint = '') {
    const txt = cleanStr(rawType);
    const block = String(blockHint || '').toUpperCase();

    if (txt.includes('reefer') || txt.includes('refer') || txt.includes('rf') || txt.includes('rc') || txt.includes('br') || block.includes('RC') || block.includes('BR')) return 'Reefer';
    if (txt.includes('oog') || txt.includes('special') || block.includes('OOG')) return 'OOG';
    if (txt.includes('imdg') || txt.includes('dg') || block.includes('C01') || block.includes('C02') || block.includes('D01')) return 'IMDG';
    return 'Fixed Import';
}

function isExcludedUsedSlotBlock(blockName) {
    const block = String(blockName || '').toUpperCase();
    const excluded = new Set(['CG1']);
    return excluded.has(block) || block.startsWith('8');
}

function getSlotBoxCapacity() {
    const val = Number(document.getElementById('slotBoxCapacity')?.value || 27);
    return Number.isFinite(val) && val > 0 ? val : 27;
}

function updateSlotCapacityLabel(val) {
    const el = document.getElementById('slotBoxCapacityVal');
    if (el) el.textContent = String(val || getSlotBoxCapacity());
}

function toggleProjectionBreakdown() {
    const cols = document.querySelectorAll('.projection-breakdown');
    const btn = document.getElementById('btnProjectionBreakdown');
    if (!cols.length) return;
    const isHidden = cols[0].classList.contains('hidden');
    cols.forEach(c => c.classList.toggle('hidden', !isHidden));
    if (btn) btn.textContent = isHidden ? 'Hide Breakdown' : 'Show Breakdown';
}

function startProjectionDrag(event, type, vessel) {
    projectionDragState = { type, vessel };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `${type}||${vessel}`);
}

function allowProjectionDrop(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
}

function dropProjectionRow(event, targetType, targetVessel) {
    event.preventDefault();
    const src = projectionDragState;
    if (!src.type || !src.vessel || src.type !== targetType || src.vessel === targetVessel) return;

    const currentOrder = projectionOrderByType[targetType] || [];
    const normalized = currentOrder.length ? [...currentOrder] : projectionPreplanRows.filter(r => r.type === targetType).map(r => r.vessel);

    const fromIdx = normalized.indexOf(src.vessel);
    const toIdx = normalized.indexOf(targetVessel);
    if (fromIdx === -1 || toIdx === -1) return;

    const [moved] = normalized.splice(fromIdx, 1);
    normalized.splice(toIdx, 0, moved);
    projectionOrderByType[targetType] = normalized;

    refreshProjectionTable();
}

function setProjectionTypeFilter(type) {
    projectionTypeFilter = type;
    document.querySelectorAll('.projection-filter-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`filter-${type}`);
    if (activeBtn) activeBtn.classList.add('active');
    refreshProjectionTable();
}

function calculateCurrentSpace() {
    const slotCap = getSlotBoxCapacity();
    const byType = PROJECTION_TYPES.reduce((acc, type) => {
        acc[type] = {
            maxCapacityTEU: 0,
            currentOccupancyTEU: 0,
            actualAvailableTEU: 0,
            balance20Current: 0,
            balance40Current: 0,
            freeSlotsEXE: 0,
            usedSlot20: 0,
            usedSlot40: 0,
            unitCount20: 0,
            unitCount40: 0,
            freeSlotList: []
        };
        return acc;
    }, {});

    const slotOccupancyByBlock = {};
    const usedSlot20ByType = PROJECTION_TYPES.reduce((acc, type) => { acc[type] = new Set(); return acc; }, {});
    const usedSlot40ByType = PROJECTION_TYPES.reduce((acc, type) => { acc[type] = new Set(); return acc; }, {});

    // A) Build slot occupancy from Unit List (import only)
    invData.forEach(item => {
        const move = cleanStr(item.move);
        const isImportMove = move.includes('import');

        const block = String(item.block || '').toUpperCase();
        if (isExcludedUsedSlotBlock(block)) return;

        const type = normalizeProjectionType('', block);
        if (type === 'Fixed Import' && !selectedBlocks.includes(block)) return;

        const slot = parseInt(item.slot, 10);
        if (!Number.isFinite(slot) || slot <= 0) return;

        const len = String(item.length || '').trim();
        const slotKey = `${block}-${String(slot).padStart(2, '0')}`;

        if (len.startsWith('40') || len.startsWith('45')) {
            // Used Slot 40': unique by Row/Bay (EXE) value only (import move only)
            if (isImportMove) {
                usedSlot40ByType[type].add(slotKey);
                byType[type].unitCount40 += 1;
            }

            // Physical occupancy for free-slot tracking (all move types)
            if (activeCapacity[block]) {
                if (!slotOccupancyByBlock[block]) slotOccupancyByBlock[block] = {};
                slotOccupancyByBlock[block][slot] = (slotOccupancyByBlock[block][slot] || 0) + 1;
                slotOccupancyByBlock[block][slot + 1] = (slotOccupancyByBlock[block][slot + 1] || 0) + 1;
            }
        } else {
            if (isImportMove) {
                usedSlot20ByType[type].add(slotKey);
                byType[type].unitCount20 += 1;
            }
            if (activeCapacity[block]) {
                if (!slotOccupancyByBlock[block]) slotOccupancyByBlock[block] = {};
                slotOccupancyByBlock[block][slot] = (slotOccupancyByBlock[block][slot] || 0) + 1;
            }
        }
    });

    // B) Aggregate capacities and free EXE slots by type
    Object.keys(activeCapacity).forEach(blockName => {
        const block = String(blockName || '').toUpperCase();
        if (isExcludedUsedSlotBlock(block)) return;
        const type = normalizeProjectionType('', block);
        if (type === 'Fixed Import' && !selectedBlocks.includes(block)) return;

        const maxSlots = Number(activeCapacity[blockName]?.slots || 0);
        byType[type].maxCapacityTEU += (maxSlots * slotCap);

        for (let slotNo = 1; slotNo <= maxSlots; slotNo++) {
            const occ = Number(slotOccupancyByBlock[block]?.[slotNo] || 0);
            byType[type].currentOccupancyTEU += occ;
            if (occ === 0) {
                byType[type].freeSlotsEXE += 1;
                byType[type].freeSlotList.push(`${block}-${String(slotNo).padStart(2, '0')}`);
            }
        }
    });

    PROJECTION_TYPES.forEach(type => {
        byType[type].usedSlot20 = usedSlot20ByType[type].size;
        byType[type].usedSlot40 = usedSlot40ByType[type].size;
        const balanceSlotFactor = type === 'OOG' ? 1 : slotCap;
        byType[type].balance20Current = (byType[type].usedSlot20 * balanceSlotFactor) - byType[type].unitCount20;
        byType[type].balance40Current = (byType[type].usedSlot40 * balanceSlotFactor) - byType[type].unitCount40;
        byType[type].actualAvailableTEU = byType[type].maxCapacityTEU - byType[type].currentOccupancyTEU;
    });

    return byType;
}

function showFreeSlotModal(type, freeSlotList) {
    const modal = document.getElementById('freeSlotModal');
    const title = document.getElementById('freeSlotModalTitle');
    const body = document.getElementById('freeSlotModalBody');
    if (!modal || !title || !body) return;

    title.textContent = `Free Slot List - ${type}`;
    if (!freeSlotList.length) {
        body.innerHTML = '<p class="text-slate-500 italic">No free EXE slots.</p>';
    } else {
        body.innerHTML = `<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">${freeSlotList.map(s => `<span class="px-2 py-1 rounded bg-slate-100 border text-center font-mono text-xs">${s}</span>`).join('')}</div>`;
    }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeFreeSlotModal() {
    const modal = document.getElementById('freeSlotModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function renderProjectionTable(rows, spaceByType) {
    const body = document.getElementById('projectionBody');
    if (!body) return;

    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="10" class="px-4 py-6 text-center text-slate-400 italic">No incoming discharge rows found in Preplan.</td></tr>';
        return;
    }

    body.innerHTML = '';

    const renderTypes = projectionTypeFilter === 'ALL' ? PROJECTION_TYPES : [projectionTypeFilter];

    let renderedAny = false;
    const _projRows = [];
    renderTypes.forEach((type, typeIdx) => {
        const typeRows = rows.filter(r => r.type === type);
        if (!typeRows.length) return;
        renderedAny = true;

        const existingOrder = projectionOrderByType[type] || [];
        if (!existingOrder.length) {
            projectionOrderByType[type] = typeRows.map(r => r.vessel);
        }

        const order = projectionOrderByType[type] || [];
        typeRows.sort((a, b) => order.indexOf(a.vessel) - order.indexOf(b.vessel));

        const space = spaceByType[type] || {
            maxCapacityTEU: 0,
            currentOccupancyTEU: 0,
            actualAvailableTEU: 0,
            freeSlotsEXE: 0,
            usedSlot20: 0,
            usedSlot40: 0,
            unitCount20: 0,
            unitCount40: 0,
            freeSlotList: []
        };

        // Running balance must decrease row by row
        let runningBalance20 = space.balance20Current;
        let runningBalance40 = space.balance40Current;

        typeRows.forEach((row, idx) => {
            const incomingBox20 = Number(row.box20 || 0);
            const incomingBox40 = Number(row.box40 || 0);
            const incomingTEU = incomingBox20 + incomingBox40;

            runningBalance20 -= incomingBox20;
            runningBalance40 -= incomingBox40;

            const balance20 = runningBalance20;
            const balance40 = runningBalance40;

            const maxCapacity = space.maxCapacityTEU;
            const occPct = maxCapacity > 0 ? (space.currentOccupancyTEU / maxCapacity) * 100 : 0;
            const incomingPct = maxCapacity > 0 ? (incomingTEU / maxCapacity) * 100 : 0;
            const overCap = (space.currentOccupancyTEU + incomingTEU) > maxCapacity;

            const topBorder = idx === 0 ? ' border-t-4 border-slate-400' : '';
            const bottomBorder = idx === typeRows.length - 1 ? ' border-b-4 border-slate-400' : '';
            const firstTypePad = typeIdx > 0 && idx === 0 ? ' border-t-8 border-slate-300' : '';

            _projRows.push(`
                <tr class="hover:bg-slate-50 transition-colors${topBorder}${bottomBorder}${firstTypePad}" draggable="true" ondragstart='startProjectionDrag(event, ${JSON.stringify(type)}, ${JSON.stringify(row.vessel)})' ondragover="allowProjectionDrop(event)" ondrop='dropProjectionRow(event, ${JSON.stringify(type)}, ${JSON.stringify(row.vessel)})'>
                    <td class="px-4 py-3 text-center font-bold text-slate-700">${row.vessel}</td>
                    <td class="px-4 py-3 text-center text-slate-600">${row.type}</td>
                    <td class="px-4 py-3 text-center font-semibold text-slate-700 projection-breakdown hidden">${Math.round(space.usedSlot20).toLocaleString()}</td>
                    <td class="px-4 py-3 text-center font-semibold text-slate-700 projection-breakdown hidden">${Math.round(space.usedSlot40).toLocaleString()}</td>
                    <td class="px-4 py-3 text-center font-semibold text-slate-700">${Math.round(incomingBox20).toLocaleString()}</td>
                    <td class="px-4 py-3 text-center font-semibold text-slate-700">${Math.round(incomingBox40).toLocaleString()}</td>
                    <td class="px-4 py-3 text-center font-semibold ${balance20 < 0 ? 'text-red-600' : 'text-slate-700'}">${Math.round(balance20).toLocaleString()}</td>
                    <td class="px-4 py-3 text-center font-semibold ${balance40 < 0 ? 'text-red-600' : 'text-slate-700'}">${Math.round(balance40).toLocaleString()}</td>
                    <td class="px-4 py-3 text-center font-bold">
                        <button onclick='showFreeSlotModal(${JSON.stringify(type)}, ${JSON.stringify(space.freeSlotList)})' class="text-blue-700 underline hover:text-blue-900">${Math.round(space.freeSlotsEXE).toLocaleString()}</button>
                    </td>
                    <td class="px-4 py-3 text-center">
                        <div class="w-full h-3 bg-slate-300 rounded-full overflow-hidden flex">
                            <div class="h-full bg-blue-500" style="width:${Math.min(occPct, 100)}%"></div>
                            <div class="h-full ${overCap ? 'bg-red-500' : 'bg-amber-400'}" style="width:${Math.min(incomingPct, 100)}%"></div>
                        </div>
                        <div class="text-[10px] text-slate-500 font-mono mt-1 text-center">Occ ${Math.round(space.currentOccupancyTEU)} | In ${Math.round(incomingTEU)} | Cap ${Math.round(maxCapacity)}</div>
                    </td>
                </tr>
            `);
        });
    });
    body.innerHTML = _projRows.join('');


    if (!renderedAny) {
        body.innerHTML = '<tr><td colspan="10" class="px-4 py-6 text-center text-slate-400 italic">No rows for selected type filter.</td></tr>';
    }
}


function refreshProjectionTable() {
    if (!projectionPreplanRows.length) return;
    const spaceByType = calculateCurrentSpace();
    renderProjectionTable(projectionPreplanRows, spaceByType);
}

async function parsePreplanProjection(event) {
    const file = event?.target?.files?.[0] || document.getElementById('preplanInput')?.files?.[0];
    const body = document.getElementById('projectionBody');

    if (!body) return;
    if (!file) {
        body.innerHTML = '<tr><td colspan="10" class="px-4 py-6 text-center text-slate-400 italic">Upload Preplan to generate projection.</td></tr>';
        return;
    }

    try {
        const reader = new FileReader();
        const rows = await new Promise((resolve, reject) => {
            reader.onload = evt => {
                try {
                    const wb = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
                    const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
                    resolve(json);
                } catch (e) {
                    reject(e);
                }
            };
            reader.onerror = () => reject(new Error('Failed to read Preplan file.'));
            reader.readAsArrayBuffer(file);
        });

        const grouped = {};
        rows.forEach(row => {
            const keyMap = {};
            Object.keys(row || {}).forEach(k => { keyMap[cleanStr(k)] = row[k]; });

            // strict target columns by normalized exact name
            const carrierIn = String(keyMap['carrier in'] || '').trim();
            const voyageIn = String(keyMap['voyage in'] || '').trim();
            const vessel = `${carrierIn} ${voyageIn}`.trim();
            if (!vessel) return;

            const rawType = String(keyMap['type'] || '').toLowerCase();
            let type = 'Fixed Import';
            if (rawType.includes('reefer')) type = 'Reefer';
            else if (rawType.includes('imdg') || rawType.includes('dg')) type = 'IMDG';
            else if (rawType.includes('oog') || rawType.includes('special')) type = 'OOG';

            const box20 = Number(keyMap["dis. to go 20'"] || keyMap['1 teu'] || 0) || 0;
            const box40 = Number(keyMap["dis. to go 40'"] || keyMap['2 teu'] || 0) || 0;

            const key = `${vessel}||${type}`;
            if (!grouped[key]) grouped[key] = { vessel, type, box20: 0, box40: 0 };
            grouped[key].box20 += box20;
            grouped[key].box40 += box40;
        });

        projectionPreplanRows = Object.values(grouped);
        projectionOrderByType = {};
        PROJECTION_TYPES.forEach(t => {
            projectionOrderByType[t] = projectionPreplanRows.filter(r => r.type === t).map(r => r.vessel);
        });
        const spaceByType = calculateCurrentSpace();
        renderProjectionTable(projectionPreplanRows, spaceByType);
    } catch (err) {
        alert(`Preplan error: ${err.message}`);
    }
}

window.parsePreplanProjection = parsePreplanProjection;
window.processPreplan = parsePreplanProjection;

updateSlotCapacityLabel(getSlotBoxCapacity());

// Block selection functions
function initializeBlockSelection() {
    const grid = document.getElementById('blockSelectionGrid');
    if (!grid) return;

    const allBlocks = Object.keys(DEFAULT_CAPACITY).filter(block => 
        !isExcludedUsedSlotBlock(block) && !['BR9', 'RC9', 'OOG'].includes(block)
    ).sort();

    grid.innerHTML = allBlocks.map(block => `
        <label class="flex items-center gap-1 p-2 rounded-lg border border-slate-200 bg-white/50 hover:bg-white/70 cursor-pointer transition-colors">
            <input type="checkbox" 
                   value="${block}" 
                   ${selectedBlocks.includes(block) ? 'checked' : ''} 
                   onchange="toggleBlockSelection('${block}')" 
                   class="accent-blue-600">
            <span class="text-xs font-mono font-bold text-slate-700">${block}</span>
        </label>
    `).join('');
}

function toggleBlockSelection(block) {
    const checkbox = event.target;
    if (checkbox.checked) {
        if (!selectedBlocks.includes(block)) {
            selectedBlocks.push(block);
        }
    } else {
        selectedBlocks = selectedBlocks.filter(b => b !== block);
    }
    refreshProjectionTable();
}

function selectAllBlocks() {
    const allBlocks = Object.keys(DEFAULT_CAPACITY).filter(block => 
        !isExcludedUsedSlotBlock(block) && !['BR9', 'RC9', 'OOG'].includes(block)
    );
    selectedBlocks = [...allBlocks];
    initializeBlockSelection();
    refreshProjectionTable();
}

function deselectAllBlocks() {
    selectedBlocks = [];
    initializeBlockSelection();
    refreshProjectionTable();
}

function selectPureImportBlocks() {
    selectedBlocks = [...PURE_IMPORT_BLOCKS];
    initializeBlockSelection();
    refreshProjectionTable();
}

function analyzeBlockImportExportMix() {
    // Analyze which blocks have import, export, or mixed cargo
    const blockMix = {};
    const safeInvData = Array.isArray(invData) ? invData : [];
    
    safeInvData.forEach(item => {
        const block = String(item?.block || '').toUpperCase();
        const move = cleanStr(item.move);
        const isImport = move.includes('import');
        
        if (!blockMix[block]) {
            blockMix[block] = { importCount: 0, exportCount: 0, totalCount: 0 };
        }
        
        blockMix[block].totalCount += 1;
        if (isImport) {
            blockMix[block].importCount += 1;
        } else {
            blockMix[block].exportCount += 1;
        }
    });
    
    // Calculate import percentage and categorize blocks
    const blockStats = Object.entries(blockMix).map(([block, stats]) => {
        const importPercentage = stats.totalCount > 0 ? (stats.importCount / stats.totalCount) * 100 : 0;
        let blockType = 'export-only';
        if (importPercentage === 100) blockType = 'import-only';
        else if (importPercentage > 0) blockType = 'mixed';
        
        return {
            block,
            importCount: stats.importCount,
            exportCount: stats.exportCount,
            totalCount: stats.totalCount,
            importPercentage: Number(importPercentage.toFixed(2)),
            blockType
        };
    });
    
    return blockStats;
}

function selectBlocksBasedOnDensity() {
    const { blockDensity } = getOperationalSnapshot();
    const blockImportMix = analyzeBlockImportExportMix();
    
    // Create a map for quick lookup of import mix
    const blockMixMap = {};
    blockImportMix.forEach(stat => {
        blockMixMap[stat.block] = stat;
    });
    
    // Filter to only blocks that have import cargo (not export-only)
    const blocksWithImport = blockDensity
        .filter(b => {
            const mixStat = blockMixMap[b.block];
            // Only include blocks with import data (import-only or mixed)
            return mixStat && mixStat.importPercentage > 0;
        });
    
    if (blocksWithImport.length === 0) {
        // If no blocks have import data, fallback to pure import blocks
        selectedBlocks = [...PURE_IMPORT_BLOCKS];
        initializeBlockSelection();
        refreshProjectionTable();
        return;
    }
    
    // Calculate effective density considering import percentage for mixed blocks
    const blocksWithEffectiveDensity = blocksWithImport.map(b => {
        const mixStat = blockMixMap[b.block];
        // For mixed blocks, adjust capacity to account for import percentage
        const adjustedCapacity = b.capTeus * (mixStat.importPercentage / 100);
        const effectiveDensity = adjustedCapacity > 0 ? Number(((b.teus / adjustedCapacity) * 100).toFixed(2)) : 0;
        return {
            ...b,
            importPercentage: mixStat.importPercentage,
            blockType: mixStat.blockType,
            adjustedCapacity,
            effectiveDensity
        };
    });
    
    // Select blocks with effective density < 80% (have capacity for discharge)
    const availableBlocks = blocksWithEffectiveDensity
        .filter(b => b.effectiveDensity < 80 && !isExcludedUsedSlotBlock(b.block) && !['BR9', 'RC9', 'OOG'].includes(b.block))
        .map(b => b.block);
    
    // If no blocks have effective density < 80%, select the lowest density blocks (top 50%)
    if (availableBlocks.length === 0) {
        const sortedBlocks = blocksWithEffectiveDensity
            .filter(b => !isExcludedUsedSlotBlock(b.block) && !['BR9', 'RC9', 'OOG'].includes(b.block))
            .sort((a, b) => a.effectiveDensity - b.effectiveDensity);
        const topHalf = Math.ceil(sortedBlocks.length / 2);
        selectedBlocks = sortedBlocks.slice(0, topHalf).map(b => b.block);
    } else {
        selectedBlocks = availableBlocks;
    }
    
    initializeBlockSelection();
    refreshProjectionTable();
}

// Make functions globally available
window.selectAllBlocks = selectAllBlocks;
window.deselectAllBlocks = deselectAllBlocks;
window.selectPureImportBlocks = selectPureImportBlocks;
window.selectBlocksBasedOnDensity = selectBlocksBasedOnDensity;
window.analyzeBlockImportExportMix = analyzeBlockImportExportMix;

// --- CLUSTER DETAIL DRAWER LOGIC ---
window.closeClusterDetailDrawer = function() {
    const drawer = document.getElementById('clusterDetailDrawer');
    const overlay = document.getElementById('clusterDetailOverlay');
    if(drawer) drawer.classList.add('translate-x-full');
    if(overlay) overlay.classList.add('hidden');
};

window.showClusterDetail = function(carrier, service, block, part) {
    if (!invData || !carrier || !block) return;
    
    // Filter data
    const filteredRows = invData.filter(it => {
        if (!String(it.move || '').toLowerCase().includes('export')) return false;
        if (it.carrier !== carrier) return false;
        if (service && it.service !== service && it.service !== '') return false;
        if (it.block !== block) return false;
        
        if (part && part !== 'null') {
            const slot = parseInt(it.slot) || 0;
            const blockChar = it.block.charAt(0).toUpperCase();
            let rowPart = 'X';
            if (blockChar === 'A' || blockChar === 'B') {
                if (slot >= 26) rowPart = 'Z';
                else if (slot >= 13) rowPart = 'Y';
            } else if (blockChar === 'C') {
                if (slot >= 31) rowPart = 'Z';
                else if (slot >= 16) rowPart = 'Y';
            }
            if (rowPart !== part) return false;
        }
        
        return true;
    });

    // Pivot data by Size -> SPOD -> WC
    const pivotData = {
        '20': { spods: new Set(), wcs: new Set(), matrix: {} },
        '40': { spods: new Set(), wcs: new Set(), matrix: {} },
        '45': { spods: new Set(), wcs: new Set(), matrix: {} }
    };
    
    filteredRows.forEach(it => {
        let sizeGroup = '40';
        const len = String(it.length || '40');
        if (len.startsWith('20')) sizeGroup = '20';
        else if (len.startsWith('45')) sizeGroup = '45';
        
        const spod = String(it.spod || 'UNKNOWN').toUpperCase();
        const wc = String(it.wtcl || 'UNKNOWN').toUpperCase();
        
        const g = pivotData[sizeGroup];
        g.spods.add(spod);
        g.wcs.add(wc);
        
        if (!g.matrix[spod]) g.matrix[spod] = {};
        g.matrix[spod][wc] = (g.matrix[spod][wc] || 0) + 1;
    });

    const contentDiv = document.getElementById('clusterDetailContent');
    if(!contentDiv) return;
    
    let matrixTablesHtml = '';
    ['20', '40', '45'].forEach(size => {
        const g = pivotData[size];
        if (g.spods.size === 0) return; // No data for this size
        
        const sortedWCs = Array.from(g.wcs).sort();
        const sortedSPODs = Array.from(g.spods).sort();
        
        let thWc = sortedWCs.map(wc => `<th class="py-2 px-2 text-center border-r border-slate-200/50">${wc}</th>`).join('');
        let headerRow = `<thead class="bg-slate-100 uppercase text-[10px] text-slate-500 font-bold border-b border-slate-200">
            <tr>
                <th class="py-2 px-3 text-left border-r border-slate-200 bg-white">SPOD / WC</th>
                ${thWc}
                <th class="py-2 px-3 text-center border-l bg-slate-200/50 border-slate-200">Total</th>
            </tr>
        </thead>`;
        
        let trSpods = sortedSPODs.map(spod => {
            let rowTotal = 0;
            let tdWc = sortedWCs.map(wc => {
                let count = g.matrix[spod][wc] || 0;
                rowTotal += count;
                return `<td class="py-1.5 px-2 text-center text-xs font-semibold border-r border-slate-100">${count > 0 ? count : '<span class="text-slate-300">-</span>'}</td>`;
            }).join('');
            
            return `<tr class="border-b border-slate-100 last:border-0 hover:bg-blue-50/30 transition-colors">
                <td class="py-1.5 px-3 text-[11px] font-bold text-slate-700 border-r border-slate-200 bg-slate-50/50">${spod}</td>
                ${tdWc}
                <td class="py-1.5 px-3 text-xs font-black text-slate-800 text-center border-l border-slate-200 bg-slate-50/50">${rowTotal}</td>
            </tr>`;
        }).join('');
        
        // Grand totals row
        let grandTotal = 0;
        let tfWc = sortedWCs.map(wc => {
            let colTotal = 0;
            sortedSPODs.forEach(spod => colTotal += (g.matrix[spod][wc] || 0));
            grandTotal += colTotal;
            return `<td class="py-2 px-2 text-center text-xs font-black text-slate-800 border-r border-slate-200/50">${colTotal > 0 ? colTotal : '-'}</td>`;
        }).join('');
        
        let footerRow = `<tfoot class="bg-blue-50/60 border-t border-slate-200">
            <tr>
                <td class="py-2 px-3 text-[11px] font-bold text-slate-600 border-r border-slate-200 text-right uppercase tracking-wider bg-white">Total</td>
                ${tfWc}
                <td class="py-2 px-3 text-sm font-black text-blue-700 text-center border-l border-slate-200 bg-blue-100/50 block-group-end" style="border-right-width: 0px !important;">${grandTotal}</td>
            </tr>
        </tfoot>`;
        
        let headerColor = size === '20' ? 'bg-amber-500' : (size === '40' ? 'bg-blue-600' : 'bg-emerald-600');
        
        matrixTablesHtml += `
            <div class="glass-panel bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-5">
                <div class="${headerColor} px-4 py-2 flex justify-between items-center shadow-inner text-white">
                    <h4 class="font-extrabold text-xs tracking-widest flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-[16px] opacity-80">grid_on</span>
                        SIZE ${size}'
                    </h4>
                    <span class="text-[10px] font-bold bg-black/20 px-2 py-0.5 rounded-md backdrop-blur-sm">${grandTotal} UNITS</span>
                </div>
                <div class="overflow-x-auto custom-scrollbar">
                    <table class="w-full text-left">
                        ${headerRow}
                        <tbody class="divide-y divide-slate-100">
                            ${trSpods}
                        </tbody>
                        ${footerRow}
                    </table>
                </div>
            </div>
        `;
    });

    let infoCardHtml = `
        <div class="mb-5 text-sm bg-blue-50 p-4 rounded-2xl border border-blue-200 shadow-sm flex flex-col gap-2 relative overflow-hidden">
            <div class="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl transform translate-x-10 -translate-y-10"></div>
            <div class="flex justify-between items-center z-10 relative">
                <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Carrier & Service</span>
                <span class="font-black text-slate-800 tracking-tight text-right">${carrier} <br> <span class="text-xs text-blue-600">${service || '-'}</span></span>
            </div>
            <div class="w-full border-t border-blue-200/50 z-10 relative"></div>
            <div class="flex justify-between items-center z-10 relative">
                <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Block Detail</span>
                <span class="font-bold text-white bg-slate-800 px-3 py-1 rounded-md text-xs shadow-sm">${block} ${part !== 'null' && part ? ' - ' + part : ''}</span>
            </div>
            <div class="w-full border-t border-blue-200/50 z-10 relative"></div>
            <div class="flex justify-between items-center z-10 relative">
                <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Units Scanned</span>
                <span class="font-black text-blue-600 text-xl">${filteredRows.length}</span>
            </div>
        </div>
    `;

    // --- BUILD VISUAL SLOT GRID ---
    // SPOD color palette generator
    const SPOD_COLORS = {};
    const SPOD_BASE_PALETTE = [
        { bg: '#ef4444', text: '#fff' },   // Red
        { bg: '#3b82f6', text: '#fff' },   // Blue
        { bg: '#10b981', text: '#fff' },   // Emerald
        { bg: '#f59e0b', text: '#000' },   // Amber
        { bg: '#8b5cf6', text: '#fff' },   // Violet
        { bg: '#ec4899', text: '#fff' },   // Pink
        { bg: '#06b6d4', text: '#000' },   // Cyan
        { bg: '#84cc16', text: '#000' },   // Lime
        { bg: '#f97316', text: '#fff' },   // Orange
        { bg: '#6366f1', text: '#fff' },   // Indigo
        { bg: '#14b8a6', text: '#fff' },   // Teal
        { bg: '#e11d48', text: '#fff' },   // Rose
        { bg: '#a855f7', text: '#fff' },   // Purple
        { bg: '#0ea5e9', text: '#fff' },   // Sky
        { bg: '#d946ef', text: '#fff' },   // Fuchsia
        { bg: '#78716c', text: '#fff' },   // Stone
    ];
    let spodIdx = 0;
    const allSpods = new Set();
    filteredRows.forEach(it => allSpods.add(String(it.spod || 'UNKNOWN').toUpperCase()));
    Array.from(allSpods).sort().forEach(spod => {
        SPOD_COLORS[spod] = SPOD_BASE_PALETTE[spodIdx % SPOD_BASE_PALETTE.length];
        spodIdx++;
    });

    // Parse tier from _raw_slot
    const parseTier = (rawSlot) => {
        if (!rawSlot || !rawSlot.includes('-')) return 1;
        const parts = rawSlot.split('-');
        if (parts.length >= 3) return parseInt(parts[parts.length - 1]) || 1;
        return 1;
    };

    // Group FILTERED (this vessel) data by slot
    const slotMap = {};
    filteredRows.forEach(it => {
        const slotNum = it.slot || 0;
        if (!slotMap[slotNum]) slotMap[slotNum] = [];
        slotMap[slotNum].push({
            row: it.row || 1,
            tier: parseTier(it._raw_slot),
            size: String(it.length || '40'),
            spod: String(it.spod || 'UNKNOWN').toUpperCase(),
            wc: String(it.wtcl || '-').toUpperCase(),
            unit: it.unit || '',
            isOther: false
        });
    });

    // Group ALL OTHER vessels' export containers in the SAME block for hatched display
    // AND all import containers in the same block for import display
    const otherMap = {};
    invData.forEach(it => {
        if (it.block !== block) return;
        const moveType = String(it.move || '').toLowerCase();
        const isImport = moveType.includes('import');
        const isExport = moveType.includes('export');
        if (!isImport && !isExport) return;
        // Skip if this is the same carrier/service (only for export)
        if (isExport && it.carrier === carrier && (!service || it.service === service)) return;
        const slotNum = it.slot || 0;
        if (!slotMap[slotNum]) return;
        if (!otherMap[slotNum]) otherMap[slotNum] = [];
        otherMap[slotNum].push({
            row: it.row || 1,
            tier: parseTier(it._raw_slot),
            size: String(it.length || '40'),
            spod: String(it.spod || 'UNKNOWN').toUpperCase(),
            wc: String(it.wtcl || '-').toUpperCase(),
            unit: it.unit || '',
            carrier: it.carrier || '',
            isOther: isExport,
            isImport: isImport
        });
    });

    // Get max tier for the block from activeCapacity
    const blockTierMax = (activeCapacity[block] && activeCapacity[block].tier) || 5;

    // Build SPOD legend
    let spodLegendHtml = '';
    Object.entries(SPOD_COLORS).forEach(([spod, c]) => {
        spodLegendHtml += `<span class="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded" style="background:${c.bg};color:${c.text}">${spod}</span>`;
    });

    // Build Slot Grids
    const sortedSlots = Object.keys(slotMap).map(Number).sort((a, b) => a - b);
    let slotGridsHtml = '';

    if (sortedSlots.length === 0) {
        slotGridsHtml = '<div class="text-center text-slate-400 py-8 text-sm">No slot data available.</div>';
    } else {
        sortedSlots.forEach(slotNum => {
            const containers = slotMap[slotNum];
            const otherContainers = otherMap[slotNum] || [];
            const allContainers = [...containers, ...otherContainers];
            const maxRow = Math.max(6, ...allContainers.map(c => c.row));
            const maxTier = Math.max(blockTierMax, ...allContainers.map(c => c.tier));

            // Build lookup: rowTierMap[row][tier] = container
            const rowTierMap = {};
            otherContainers.forEach(c => {
                if (!rowTierMap[c.row]) rowTierMap[c.row] = {};
                rowTierMap[c.row][c.tier] = c;
            });
            containers.forEach(c => {
                if (!rowTierMap[c.row]) rowTierMap[c.row] = {};
                rowTierMap[c.row][c.tier] = c;
            });

            let headerCells = '';
            for (let r = 1; r <= maxRow; r++) {
                headerCells += `<th class="text-center text-[9px] font-bold text-slate-500 py-1 px-0.5 border border-slate-200 bg-slate-100" style="min-width:62px">${String(r).padStart(2, '0')}</th>`;
            }

            let gridRows = '';
            for (let t = maxTier; t >= 1; t--) {
                let cells = '';
                for (let r = 1; r <= maxRow; r++) {
                    const cont = rowTierMap[r] && rowTierMap[r][t];
                    if (cont) {
                        const sizeLabel = cont.size.startsWith('20') ? '20' : (cont.size.startsWith('45') ? '45' : '40');
                        if (cont.isImport) {
                            cells += `<td class="border border-slate-300 p-0 align-top" style="min-width:62px" title="Import Container">
                                <div class="px-1 py-0.5 text-center slot-cell-import" style="min-height:38px;display:flex;flex-direction:column;justify-content:center;align-items:center">
                                    <span class="text-[9px] font-extrabold leading-none text-amber-700">${sizeLabel}'</span>
                                    <span class="text-[8px] font-black leading-tight text-amber-800">IMPORT</span>
                                </div>
                            </td>`;
                        } else if (cont.isOther) {
                            cells += `<td class="border border-slate-300 p-0 align-top" style="min-width:62px" title="${cont.carrier}">
                                <div class="px-1 py-0.5 text-center slot-cell-other" style="min-height:38px;display:flex;flex-direction:column;justify-content:center;align-items:center">
                                    <span class="text-[9px] font-extrabold leading-none text-slate-500">${sizeLabel}'</span>
                                    <span class="text-[8px] font-bold leading-tight text-slate-400">${cont.spod}</span>
                                    <span class="text-[7px] font-semibold leading-none text-slate-400">${cont.wc}</span>
                                </div>
                            </td>`;
                        } else {
                            const color = SPOD_COLORS[cont.spod] || { bg: '#94a3b8', text: '#fff' };
                            cells += `<td class="border border-slate-300 p-0 align-top" style="min-width:62px">
                                <div class="px-1 py-0.5 text-center" style="background:${color.bg};color:${color.text};min-height:38px;display:flex;flex-direction:column;justify-content:center;align-items:center">
                                    <span class="text-[9px] font-extrabold leading-none">${sizeLabel}'</span>
                                    <span class="text-[8px] font-bold leading-tight">${cont.spod}</span>
                                    <span class="text-[7px] font-semibold opacity-80 leading-none">${cont.wc}</span>
                                </div>
                            </td>`;
                        }
                    } else {
                        cells += `<td class="border border-slate-200 p-0" style="min-width:62px;min-height:38px"><div style="min-height:38px" class="bg-slate-50/50"></div></td>`;
                    }
                }
                gridRows += `<tr>${cells}</tr>`;
            }

            slotGridsHtml += `
                <div class="mb-3">
                    <div class="text-[10px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                        <span class="bg-slate-700 text-white px-1.5 py-0.5 rounded text-[9px] font-extrabold">SLOT ${String(slotNum).padStart(2, '0')}</span>
                        <span class="text-slate-400">${containers.length} unit${containers.length > 1 ? 's' : ''}</span>
                        ${otherContainers.length > 0 ? `<span class="text-[9px] text-slate-400 ml-1">(+${otherContainers.length} other)</span>` : ''}
                    </div>
                    <table class="border-collapse" style="border-spacing:0">
                        <thead><tr>${headerCells}</tr></thead>
                        <tbody>${gridRows}</tbody>
                    </table>
                </div>
            `;
        });
    }

    // Combine into two-column layout
    let html = `
        <div class="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
            <!-- LEFT: Visual Slot Grid -->
            <div class="min-w-0">
                <div class="mb-3 flex flex-wrap items-center gap-1.5">
                    <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">view_module</span> Slot View</span>
                    <span class="text-slate-300 mx-1">|</span>
                    ${spodLegendHtml}
                    <span class="text-slate-300 mx-1">|</span>
                    <span class="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded slot-cell-other text-slate-500" style="min-width:48px;text-align:center">Other</span>
                    <span class="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded slot-cell-import text-amber-800" style="min-width:48px;text-align:center">Import</span>
                </div>
                <div class="overflow-x-auto overflow-y-auto custom-scrollbar pr-2" style="max-height:calc(100vh - 160px)">
                    ${slotGridsHtml}
                </div>
            </div>
            <!-- RIGHT: Summary Tables -->
            <div class="min-w-0 border-l border-slate-200 pl-4">
                ${infoCardHtml}
                <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5 pl-1"><span class="material-symbols-outlined text-[14px]">table_chart</span> Matrix Breakdown by Size</div>
                ${matrixTablesHtml}
            </div>
        </div>
    `;

    contentDiv.innerHTML = html;
    
    // Show drawer
    const drawer = document.getElementById('clusterDetailDrawer');
    const overlay = document.getElementById('clusterDetailOverlay');
    if(overlay) overlay.classList.remove('hidden');
    if(drawer) drawer.classList.remove('translate-x-full');
};

// --- DRAG TO SCROLL FOR WIDE TABLES ---
document.addEventListener('DOMContentLoaded', () => {
    const sliders = document.querySelectorAll('.custom-scrollbar');
    
    sliders.forEach(slider => {
        let isDown = false;
        let startX;
        let scrollLeft;
        let dragged = false;

        slider.addEventListener('mousedown', (e) => {
            isDown = true;
            dragged = false;
            slider.classList.add('active-drag');
            startX = e.pageX - slider.offsetLeft;
            scrollLeft = slider.scrollLeft;
        });
        
        slider.addEventListener('mouseleave', () => {
            isDown = false;
            slider.classList.remove('active-drag');
        });
        
        slider.addEventListener('mouseup', (e) => {
            isDown = false;
            slider.classList.remove('active-drag');
        });
        
        slider.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            dragged = true;
            // Prevent text selection while dragging
            if (e.cancelable) e.preventDefault();
            const x = e.pageX - slider.offsetLeft;
            const walk = (x - startX) * 1.5; // Scroll speed multiplier
            slider.scrollLeft = scrollLeft - walk;
        });
        
        // Prevent click events (like opening the drawer) if the user was just dragging to scroll
        slider.addEventListener('click', (e) => {
            if (dragged) {
                e.preventDefault();
                e.stopPropagation();
                // Reset dragged state after handling
                setTimeout(() => { dragged = false; }, 50);
            }
        }, { capture: true });
    });
});

// Reservation Checker Logic
function handleReservationFile(e) {
    const file = e.target.files[0];
    if(!file) return;
    
    const reader = new FileReader();
    reader.onload = function(evt) {
        const data = evt.target.result;
        const workbook = typeof XLSX !== 'undefined' ? XLSX.read(data, {type: 'binary'}) : null;
        if (!workbook) {
            alert('XLSX library not found.');
            return;
        }
        const firstSheet = workbook.SheetNames[0];
        const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet]);
        
        const groupedRef = {};
        jsonData.forEach(row => {
            let vessel = row['Vessel (comb.char.)'] || '';
            vessel = vessel.replace(/^\//, '').trim().toUpperCase(); // Remove leading slash
            const block = String(row['Area'] || '').toUpperCase();
            const slot = String(row['Row/bay'] || '');
            
            if (vessel && block) {
                if (!groupedRef[vessel]) groupedRef[vessel] = {};
                if (!groupedRef[vessel][block]) groupedRef[vessel][block] = new Set();
                if (slot) groupedRef[vessel][block].add(slot);
            }
        });

        const results = [];
        
        for (const vessel in groupedRef) {
            // Check if this vessel has any greyed out blocks globally
            let vesselGreyOuts = new Set();
            for (const key in (window.activeGreyOutBlocksMap || {})) {
                const c = key.split('||')[0].toUpperCase();
                if (c === vessel) {
                    (window.activeGreyOutBlocksMap[key] || []).forEach(b => vesselGreyOuts.add(b));
                }
            }
            
            for (const block in groupedRef[vessel]) {
                if (vesselGreyOuts.has(block)) {
                    results.push({
                        vessel,
                        block,
                        slots: Array.from(groupedRef[vessel][block]).sort()
                    });
                }
            }
        }
        
        // Cache the results
        reservationData = results;
        isReservationLoaded = true;
        
        showReservationResults(results, true);
        e.target.value = ''; // reset
    };
    reader.readAsBinaryString(file);
}

function openReservationCheckerModal() {
    // If reservation data is already cached, show it immediately
    if (isReservationLoaded && reservationData.length > 0) {
        showReservationResults(reservationData, false);
    } else if (isReservationLoaded && reservationData.length === 0) {
        // Show empty state if already loaded but no results
        const modal = document.getElementById('reservationModal');
        const body = document.getElementById('reservationModalBody');
        if (!modal || !body) return;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        body.innerHTML = `
            <div class="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
                <span class="material-symbols-outlined text-4xl mb-2 opacity-50">check_circle</span>
                <p>No reservations found on greyed out blocks.</p>
                <button onclick="document.getElementById('reservationFileInput').click()" class="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors inline-flex items-center gap-2">
                    <span class="material-symbols-outlined text-[16px]">upload_file</span> Upload New File
                </button>
            </div>
        `;
    } else {
        // First time - show upload prompt
        document.getElementById('reservationFileInput').click();
    }
}

function showReservationResults(results, isNewUpload = false) {
    const modal = document.getElementById('reservationModal');
    const body = document.getElementById('reservationModalBody');
    if (!modal || !body) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    if (results.length === 0) {
        body.innerHTML = `
            <div class="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
                <span class="material-symbols-outlined text-4xl mb-2 opacity-50">check_circle</span>
                <p>No reservations found on greyed out blocks.</p>
                <div class="flex items-center justify-center gap-3 mt-4 flex-wrap">
                    <button onclick="document.getElementById('reservationFileInput').click()" class="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors inline-flex items-center gap-2">
                        <span class="material-symbols-outlined text-[16px]">upload_file</span> Upload New File
                    </button>
                    ${isReservationLoaded ? `<button onclick="clearReservationCache()" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-300 transition-colors inline-flex items-center gap-2">
                        <span class="material-symbols-outlined text-[16px]">refresh</span> Clear Cache
                    </button>` : ''}
                </div>
            </div>
        `;
        return;
    }
    
    let html = `${isReservationLoaded && !isNewUpload ? `
        <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2 mb-2">
            <span class="material-symbols-outlined text-blue-600 text-sm flex-shrink-0 mt-0.5">check_circle</span>
            <div class="text-xs text-blue-700">
                <p class="font-semibold">Data Tersimpan dalam Cache</p>
                <p class="text-blue-600">Refresh page untuk menghapus cache. Atau klik tombol di bawah.</p>
            </div>
        </div>
    ` : ''}<div class="space-y-4">`;
    
    results.forEach(res => {
        html += `
            <div class="glass-panel p-5 rounded-2xl border border-red-200 bg-red-50/40 shadow-sm relative overflow-hidden">
                <div class="absolute top-0 right-0 w-16 h-16 bg-red-500/10 rounded-bl-full"></div>
                <div class="flex justify-between items-start mb-4 border-b border-red-100 pb-3">
                    <div class="font-black text-slate-800 flex items-center gap-3">
                       <span class="px-3 py-1.5 bg-slate-800 tracking-wider text-white rounded-lg text-sm shadow-sm">${res.vessel}</span>
                       <span class="text-xl text-red-600 tracking-tighter">${res.block}</span>
                    </div>
                    <span class="px-3 py-1.5 bg-red-100/80 text-red-700 text-[10px] font-bold rounded-lg uppercase tracking-wider border border-red-200 shadow-sm flex items-center gap-1 backdrop-blur-sm">
                        <span class="material-symbols-outlined text-[14px]">warning</span> Greyed Out Block
                    </span>
                </div>
                <div>
                    <h5 class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                        <span class="material-symbols-outlined text-[14px] text-slate-400">dns</span> Reserved Slots:
                    </h5>
                    <div class="flex flex-wrap gap-1.5">
                        ${res.slots.map(s => `<span class="px-2.5 py-1 bg-white border border-slate-200 shadow-sm rounded-md text-[11px] font-mono font-bold text-slate-700 transition hover:border-red-300 hover:text-red-600 cursor-default">${s}</span>`).join('')}
                    </div>
                </div>
            </div>
        `;
    });
    
    html += `</div>
    <div class="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-200 flex-wrap">
        <button onclick="document.getElementById('reservationFileInput').click()" class="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors inline-flex items-center gap-2">
            <span class="material-symbols-outlined text-[16px]">upload_file</span> Upload New File
        </button>
        <button onclick="clearReservationCache()" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-300 transition-colors inline-flex items-center gap-2">
            <span class="material-symbols-outlined text-[16px]">delete_outline</span> Clear Cache
        </button>
    </div>`;
    
    body.innerHTML = html;
}

function clearReservationCache() {
    reservationData = [];
    isReservationLoaded = false;
    document.getElementById('reservationFileInput').value = '';
    
    const modal = document.getElementById('reservationModal');
    const body = document.getElementById('reservationModalBody');
    if (!modal || !body) return;
    
    body.innerHTML = `
        <div class="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
            <span class="material-symbols-outlined text-4xl mb-2 opacity-50">delete_outline</span>
            <p class="font-semibold text-slate-600 mb-2">Cache Dihapus</p>
            <p class="text-sm mb-4">Data reservation telah dihapus dari memory. Upload file baru untuk melanjutkan.</p>
            <button onclick="document.getElementById('reservationFileInput').click()" class="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors inline-flex items-center gap-2">
                <span class="material-symbols-outlined text-[16px]">upload_file</span> Upload File
            </button>
        </div>
    `;
}
