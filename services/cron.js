const cron = require('node-cron');
const { main } = require('../server');
const config = require('../config/config');

// Setup the cron job
cron.schedule(config.cron.schedule, async () => {
    console.log(`Running scheduled CVE import job at ${new Date().toISOString()}`);
    try {
        await main();
        console.log(`Completed scheduled CVE import job at ${new Date().toISOString()}`);
    } catch (error) {
        console.error('Error in scheduled CVE import job:', error.message);
    }
});

console.log(`CVE importer cron job started with schedule: ${config.cron.schedule}`);
console.log('Press Ctrl+C to stop');