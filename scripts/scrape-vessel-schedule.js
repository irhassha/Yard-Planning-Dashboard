/**
 * NPCT1 Vessel Schedule Scraper
 * 
 * Uses Puppeteer to load the NPCT1 vessel schedule page,
 * waits for the DataTable to render, then extracts vessel data.
 * 
 * Output: ../data/vessel_schedule.json
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const URL = 'https://www.npct1.co.id/vessel-schedule';
const OUTPUT_PATH = path.resolve(__dirname, '..', 'data', 'vessel_schedule.json');

async function scrape() {
    console.log('🚀 Launching browser...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    });

    try {
        const page = await browser.newPage();
        
        // Set a realistic user agent
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
        );

        console.log('📡 Navigating to NPCT1 vessel schedule...');
        await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });

        // Wait for the DataTable to be initialized and populated
        console.log('⏳ Waiting for table to load...');
        await page.waitForSelector('table tbody tr td', { timeout: 30000 });

        // Give DataTables a moment to finish rendering all rows
        await new Promise(resolve => setTimeout(resolve, 3000));

        // If DataTable has pagination, we need to show ALL entries first
        const hasShowAll = await page.evaluate(() => {
            // Try to find a "Show All" or length selector and set it to show all
            const lengthSelect = document.querySelector('select[name$="_length"]');
            if (lengthSelect) {
                // Find the option with the largest value or -1 (all)
                const options = Array.from(lengthSelect.options);
                const allOption = options.find(o => o.value === '-1');
                if (allOption) {
                    lengthSelect.value = '-1';
                    lengthSelect.dispatchEvent(new Event('change'));
                    return true;
                }
                // Otherwise select the largest available option
                const maxOpt = options.reduce((max, o) => 
                    parseInt(o.value) > parseInt(max.value) ? o : max, options[0]);
                lengthSelect.value = maxOpt.value;
                lengthSelect.dispatchEvent(new Event('change'));
                return true;
            }
            return false;
        });

        if (hasShowAll) {
            console.log('📊 Expanding table to show all entries...');
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        // Extract table data
        console.log('🔍 Extracting vessel data...');
        const vessels = await page.evaluate(() => {
            const tables = document.querySelectorAll('table');
            let targetTable = null;

            // Find the vessel schedule table
            for (const table of tables) {
                const headers = Array.from(table.querySelectorAll('thead th, thead td'))
                    .map(th => th.textContent.trim().toUpperCase());
                if (headers.some(h => h.includes('VESSEL')) && 
                    headers.some(h => h.includes('SERVICE') || h.includes('ETB'))) {
                    targetTable = table;
                    break;
                }
            }

            if (!targetTable) return [];

            // Get header indices
            const headerCells = Array.from(targetTable.querySelectorAll('thead th, thead td'));
            const headers = headerCells.map(th => th.textContent.trim().toUpperCase());
            
            const getIdx = (keywords) => {
                return headers.findIndex(h => {
                    const hNorm = h.replace(/[^A-Z0-9]/g, '');
                    return keywords.some(kw => hNorm.includes(kw.replace(/[^A-Z0-9]/g, '')));
                });
            };

            const vesselIdx = getIdx(['VESSEL']);
            const lineIdx = getIdx(['LINE']);
            const voyInIdx = getIdx(['VOY_IN', 'VOYIN', 'VOY IN']);
            const voyOutIdx = getIdx(['VOY_OUT', 'VOYOUT', 'VOY OUT']);
            const serviceIdx = getIdx(['SERVICE']);
            const statusIdx = getIdx(['STATUS']);
            const etbIdx = getIdx(['ETB']);
            const ataIdx = getIdx(['ATA']);
            const etdIdx = getIdx(['ETD']);
            const atdIdx = getIdx(['ATD']);
            const openStackIdx = getIdx(['OPENSTACKING', 'OPEN STACKING']);
            const closingDocIdx = getIdx(['CLOSINGDOCUMENT', 'CLOSING DOCUMENT']);
            const closingPhysicIdx = getIdx(['CLOSINGPHYSIC', 'CLOSING PHYSIC']);

            const rows = targetTable.querySelectorAll('tbody tr');
            const result = [];

            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 5) return; // Skip empty/malformed rows

                const getCellText = (idx) => idx >= 0 && idx < cells.length 
                    ? cells[idx].textContent.trim() : '';

                result.push({
                    vessel: getCellText(vesselIdx),
                    line: getCellText(lineIdx),
                    voyIn: getCellText(voyInIdx),
                    voyOut: getCellText(voyOutIdx),
                    service: getCellText(serviceIdx),
                    status: getCellText(statusIdx),
                    etb: getCellText(etbIdx),
                    ata: getCellText(ataIdx),
                    etd: getCellText(etdIdx),
                    atd: getCellText(atdIdx),
                    openStacking: getCellText(openStackIdx),
                    closingDocument: getCellText(closingDocIdx),
                    closingPhysic: getCellText(closingPhysicIdx)
                });
            });

            return result;
        });

        console.log(`✅ Extracted ${vessels.length} vessel records`);

        // Filter: only ACTIVE and REGISTER status
        const filtered = vessels.filter(v => {
            const s = v.status.toUpperCase();
            return s === 'ACTIVE' || s === 'REGISTER' || s === 'REGISTERED';
        });

        console.log(`🔽 Filtered to ${filtered.length} active/registered vessels`);

        // Build output
        const output = {
            lastUpdated: new Date().toISOString(),
            totalScraped: vessels.length,
            totalFiltered: filtered.length,
            vessels: filtered
        };

        // Ensure output directory exists
        const dataDir = path.dirname(OUTPUT_PATH);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
        console.log(`💾 Saved to ${OUTPUT_PATH}`);

    } catch (error) {
        console.error('❌ Scraping failed:', error.message);
        
        // Create a fallback file so the workflow doesn't fail completely
        const fallback = {
            lastUpdated: new Date().toISOString(),
            totalScraped: 0,
            totalFiltered: 0,
            vessels: [],
            error: error.message
        };

        const dataDir = path.dirname(OUTPUT_PATH);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // Only write fallback if no existing data
        if (!fs.existsSync(OUTPUT_PATH)) {
            fs.writeFileSync(OUTPUT_PATH, JSON.stringify(fallback, null, 2), 'utf-8');
        }

        process.exit(1);
    } finally {
        await browser.close();
    }
}

scrape();
