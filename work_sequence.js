// ===================================================================
// WORK SEQUENCE MODULE — PDF Parser & Visualization
// Dependencies: pdf.js, stowage.js
// ===================================================================

window.sequenceData = null; // { vesselName, cranes: { "805": [ {seq, bayStr, baseBay, deck, action, total} ] } }

const CRANE_COLORS = {
    '801': { bg: 'bg-rose-400', border: 'border-rose-500', text: 'text-white' },
    '802': { bg: 'bg-fuchsia-400', border: 'border-fuchsia-500', text: 'text-white' },
    '803': { bg: 'bg-indigo-400', border: 'border-indigo-500', text: 'text-white' },
    '804': { bg: 'bg-cyan-400', border: 'border-cyan-500', text: 'text-white' },
    '805': { bg: 'bg-orange-400', border: 'border-orange-500', text: 'text-white' },
    '806': { bg: 'bg-emerald-400', border: 'border-emerald-500', text: 'text-white' },
    'DEFAULT': { bg: 'bg-slate-400', border: 'border-slate-500', text: 'text-white' }
};

window.getCraneColors = function(craneId) {
    return CRANE_COLORS[craneId] || CRANE_COLORS['DEFAULT'];
};

// ── File Upload Handler ─────────────────────────────────────────────

async function handleSequencePdfUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!window.pdfjsLib) {
        alert("PDF.js library is not loaded. Please check your internet connection.");
        return;
    }

    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            
            // Sort items by Y descending, then X ascending to reconstruct reading order
            const items = textContent.items;
            items.sort((a, b) => {
                const yDiff = Math.abs(a.transform[5] - b.transform[5]);
                if (yDiff > 5) {
                    return b.transform[5] - a.transform[5]; // Top to bottom
                }
                return a.transform[4] - b.transform[4]; // Left to right
            });

            let pageText = "";
            let lastY = -1;
            
            items.forEach(item => {
                const y = item.transform[5];
                if (lastY !== -1 && Math.abs(y - lastY) > 5) {
                    pageText += "\n";
                } else if (lastY !== -1) {
                    pageText += "  "; // add spacing between items on same line
                }
                pageText += item.str;
                lastY = y;
            });
            fullText += pageText + "\n";
        }

        const parsedData = parseSequenceText(fullText);
        window.sequenceData = parsedData;
        
        // Re-render stowage view to include the sequence graph
        if (typeof window.renderStowageView === 'function') {
            window.renderStowageView(typeof stowageData !== 'undefined' ? stowageData : null);
        }

    } catch (err) {
        console.error("Error parsing PDF:", err);
        alert("Failed to parse PDF: " + err.message);
    }
}
window.handleSequencePdfUpload = handleSequencePdfUpload;

// ── Parsing Logic ───────────────────────────────────────────────────

function parseSequenceText(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const data = {
        vesselName: "UNKNOWN VESSEL",
        cranes: {}
    };

    let currentCrane = null;

    // Regex to match the sequence line:
    // e.g. "15  09..11      WD   LOD      6    7    0    0    0    0    13"
    // Sequence (1-3 digits), Bay (e.g. 09 or 09..11), Deck (WD/UD), Action (LOD/DIS), then numbers.
    const seqRegex = /^(\d+)\s+([\d\.]+)\s+(WD|UD)\s+(LOD|DIS)\s+.*?\s+(\d+)$/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Match Vessel Name (Vessel: EVER BIRTH)
        if (line.includes('Vessel:')) {
            const vMatch = line.match(/Vessel:\s*(.+?)\s+Voyage/);
            if (vMatch) data.vesselName = vMatch[1].trim();
        }

        // Match Crane (Crane: 805)
        if (line.startsWith('Crane:')) {
            const cMatch = line.match(/Crane:\s*(\d+)/);
            if (cMatch) {
                currentCrane = cMatch[1];
                if (!data.cranes[currentCrane]) {
                    data.cranes[currentCrane] = [];
                }
            }
            continue;
        }

        // Match Sequence Row
        if (currentCrane) {
            // e.g. "15  09..11      WD   LOD      6    7    0    0    0    0    13"
            const tokens = line.split(/\s+/);
            if (tokens.length >= 6) {
                const seqStr = tokens[0];
                const bayStr = tokens[1];
                const deckStr = tokens[2];
                const actStr = tokens[3];

                if (!isNaN(seqStr) && bayStr.match(/^[\d\.]+$/) && (deckStr === 'WD' || deckStr === 'UD') && (actStr === 'LOD' || actStr === 'DIS')) {
                    
                    const baseBayMatch = bayStr.match(/^(\d+)/);
                    const baseBay = baseBayMatch ? parseInt(baseBayMatch[1], 10) : 0;

                    // Find the total (TOT column is the 7th number after LOD/DIS)
                    const actIdx = line.indexOf(actStr);
                    const afterAct = line.substring(actIdx + actStr.length).trim();
                    const nums = afterAct.split(/\s+/);
                    let totalVal = 0;
                    if (nums.length >= 7) {
                        totalVal = parseInt(nums[6], 10) || 0;
                    } else {
                        // Fallback if formatting is weird
                        totalVal = parseInt(tokens[tokens.length - 1], 10) || 0;
                    }

                    data.cranes[currentCrane].push({
                        seq: parseInt(seqStr, 10),
                        bayStr: bayStr,
                        baseBay: baseBay,
                        deck: deckStr,
                        action: actStr,
                        total: totalVal
                    });
                }
            }
        }
    }

    // Sort sequences per crane
    Object.keys(data.cranes).forEach(crane => {
        data.cranes[crane].sort((a, b) => a.seq - b.seq);
    });

    return data;
}

// Rendering is now handled within stowage.js to align exactly with the bays.
