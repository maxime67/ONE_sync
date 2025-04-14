const gitService = require('./services/gitService');
const fileService = require('./services/fileService');
const dbService = require('./services/dbService');
const productService = require('./services/productService');

/**
 * Main function to run the CVE import process
 * @param {boolean} fullSync - Whether to process all files or just changed files
 */
async function main(fullSync = false) {
    try {
        console.log(`Starting CVE import process (mode: ${fullSync ? 'full sync' : 'incremental'})`);

        // Step 1: Connect to the database
        await dbService.connect();

        let jsonFiles = [];

        if (fullSync) {
            // Clone or pull the repository
            await gitService.cloneTargetFolder();
            // Get all JSON files for a full sync
            jsonFiles = await gitService.getJsonFiles();
            console.log(`Found ${jsonFiles.length} JSON files for full sync`);
        } else {
            // Sync repository and get only changed files
            jsonFiles = await gitService.syncRepository();
            console.log(`Found ${jsonFiles.length} changed JSON files for incremental sync`);

            // If no files changed, we can exit early
            if (jsonFiles.length === 0) {
                console.log('No files changed. Nothing to process.');
                await dbService.disconnect();
                return;
            }
        }

        // Process JSON files and insert into MongoDB
        const processFunction = async (data, sourceFile) => {
            await dbService.upsertCVE(data, sourceFile);
        };

        await fileService.processBatch(jsonFiles, processFunction);

        // Disconnect from the database
        await dbService.disconnect();

        console.log('CVE import process completed successfully');
    } catch (error) {
        console.error('Error in CVE import process:', error.message);
        // Ensure we disconnect from the database in case of error
        await dbService.disconnect();
        process.exit(1);
    }
}

// Run the main function if called directly
if (require.main === module) {
    // Check command line arguments for full sync mode
    const args = process.argv.slice(2);
    const fullSync = args.includes('--full-sync');
    main(fullSync);
}

module.exports = { main };