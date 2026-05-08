/**
 * NPCT1 Vessel Schedule Scraper
 * 
 * Uses Puppeteer to load the NPCT1 vessel schedule page,
 * waits for the DataTable to render, then extracts vessel data
 * from ALL pagination pages.
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

        // Give DataTables a moment to finish rendering
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Get header column indices first (these stay the same across pages)
        console.log('🔍 Mapping table columns...');
        const colIndices = await page.evaluate(() => {
            const tables = document.querySelectorAll('table');
            for (const table of tables) {
                const headerCells = Array.from(table.querySelectorAll('thead th, thead td'));
                const headers = headerCells.map(th => th.textContent.trim().toUpperCase());
                if (headers.some(h => h.includes('VESSEL')) && 
                    headers.some(h => h.includes('SERVICE') || h.includes('ETB'))) {
                    
                    const getIdx = (keywords) => headers.findIndex(h => {
                        const hNorm = h.replace(/[^A-Z0-9]/g, '');
                        return keywords.some(kw => hNorm.includes(kw.replace(/[^A-Z0-9]/g, '')));
                    });

                    return {
                        vessel: getIdx(['VESSEL']),
                        line: getIdx(['LINE']),
                        voyIn: getIdx(['VOYIN']),
                        voyOut: getIdx(['VOYAGE', 'VOYOUT']),
                        service: getIdx(['SERVICE']),
                        status: getIdx(['STATUS']),
                        etb: getIdx(['ETB']),
                        ata: getIdx(['ATA']),
                        etd: getIdx(['ETD']),
                        atd: getIdx(['ATD']),
                        openStacking: getIdx(['OPENSTACKING']),
                        closingDocument: getIdx(['CLOSINGDOCUMENT']),
                        closingPhysic: getIdx(['CLOSINGPHYSIC'])
                    };
                }
            }
            return null;
        });

        if (!colIndices) {
            throw new Error('Could not find vessel schedule table or headers');
        }
        console.log('📋 Column mapping:', JSON.stringify(colIndices));

        // Helper: extract rows from the current visible page
        async function extractCurrentPageRows() {
            return page.evaluate((indices) => {
                const tables = document.querySelectorAll('table');
                let targetTable = null;
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

                const rows = targetTable.querySelectorAll('tbody tr');
                const result = [];
                rows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length < 5) return;
                    const get = (idx) => idx >= 0 && idx < cells.length ? cells[idx].textContent.trim() : '';
                    result.push({
                        vessel: get(indices.vessel),
                        line: get(indices.line),
                        voyIn: get(indices.voyIn),
                        voyOut: get(indices.voyOut),
                        service: get(indices.service),
                        status: get(indices.status),
                        etb: get(indices.etb),
                        ata: get(indices.ata),
                        etd: get(indices.etd),
                        atd: get(indices.atd),
                        openStacking: get(indices.openStacking),
                        closingDocument: get(indices.closingDocument),
                        closingPhysic: get(indices.closingPhysic)
                    });
                });
                return result;
            }, colIndices);
        }

        // Paginate through ALL DataTable pages
        console.log('📄 Extracting data from all pages...');
        const vessels = [];
        let pageNum = 1;

        while (true) {
            const pageRows = await extractCurrentPageRows();
            console.log(`  Page ${pageNum}: ${pageRows.length} rows`);
            vessels.push(...pageRows);

            // Check if "Next" button exists and is not disabled, then click it
            const hasNextPage = await page.evaluate(() => {
                const nextBtn = document.querySelector('.paginate_button.next:not(.disabled)') 
                    || document.querySelector('[class*="next"]:not(.disabled):not([disabled])');
                if (nextBtn && !nextBtn.classList.contains('disabled')) {
                    nextBtn.click();
                    return true;
                }
                return false;
            });

            if (!hasNextPage) break;

            // Wait for DataTable to re-render after page change
            await new Promise(resolve => setTimeout(resolve, 1500));
            pageNum++;

            // Safety: max 50 pages to prevent infinite loops
            if (pageNum > 50) {
                console.warn('⚠️ Reached max page limit (50), stopping pagination');
                break;
            }
        }

        console.log(`📊 Total pages scraped: ${pageNum}`);
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
