import { scrapeEpisodeStreaming } from '../src/scrapers/streaming.js';

const TEST_CASES = [
    'bleach-1x1',
    'black-clover-1x28'
];

async function checkHealth() {
    console.log('Starting Health Check...');
    let failed = false;

    for (const id of TEST_CASES) {
        try {
            console.log(`Checking ${id}...`);
            const data = await scrapeEpisodeStreaming(id);

            const sourceCount = data.sources ? data.sources.length : 0;
            const serverCount = data.servers ? data.servers.length : 0;

            if (sourceCount > 0) {
                console.log(`✅ [PASS] ${id} - Found ${sourceCount} sources`);
            } else {
                console.error(`❌ [FAIL] ${id} - No sources found`);
                failed = true;
            }
        } catch (error) {
            console.error(`❌ [FAIL] ${id} - Error: ${error.message}`);
            failed = true;
        }
    }

    if (failed) {
        console.error('\nHealth check FAILED. Investigate immediately.');
        process.exit(1);
    } else {
        console.log('\nHealth check PASSED. All systems operational.');
        process.exit(0);
    }
}

checkHealth();
