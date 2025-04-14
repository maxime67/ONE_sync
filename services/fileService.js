const fs = require('fs-extra');
const path = require('path');
const config = require('../config/config');

class FileService {
    /**
     * Reads a JSON file and returns the parsed content
     * @param {string} filePath - Path to the JSON file
     * @returns {Object} Parsed JSON content
     */
    async readJsonFile(filePath) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error(`Error reading JSON file ${filePath}:`, error.message);
            throw error;
        }
    }

    /**
     * Process a single file with retry mechanism
     * @param {string} filePath - Path to the file
     * @param {Function} processFunction - Function to process the file content
     * @param {number} maxRetries - Maximum number of retries (default: 3)
     * @returns {Object} - Result of the processing
     */
    async processFileWithRetry(filePath, processFunction, maxRetries = 3) {
        let retries = 0;

        while (retries <= maxRetries) {
            try {
                const relativePath = path.relative(config.github.localPath, filePath);

                if (retries > 0) {
                    console.log(`Retry attempt ${retries}/${maxRetries} for ${relativePath}...`);
                } else {
                    console.log(`Processing ${relativePath}...`);
                }

                const data = await this.readJsonFile(filePath);
                await processFunction(data, relativePath);

                return {success: true, filePath};
            } catch (error) {
                // Identify error types that can benefit from retries
                const isRetryable =
                    error.message.includes('duplicate key') ||
                    error.message.includes('No matching document found') ||
                    error.message.includes('version');

                retries++;

                if (retries > maxRetries || !isRetryable) {
                    console.error(`Failed to process ${filePath} after ${retries} ${retries === 1 ? 'try' : 'tries'}: ${error.message}`);
                    return {success: false, filePath, error: error.message};
                }

                // Add a small delay before retrying
                const delay = retries * 100; // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    /**
     * Process JSON files in batches
     * @param {Array<string>} files - Array of file paths
     * @param {Function} processFunction - Function to process each file's content
     */
    async processBatch(files, processFunction) {
        const batchSize = config.batch.size;
        const totalFiles = files.length;
        let processedCount = 0;
        let successCount = 0;
        let failedCount = 0;
        let failedFiles = [];

        console.log(`Starting to process ${totalFiles} files in batches of ${batchSize}`);

        for (let i = 0; i < totalFiles; i += batchSize) {
            const batch = files.slice(i, i + batchSize);
            console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(totalFiles / batchSize)}`);

            const batchPromises = batch.map(filePath =>
                this.processFileWithRetry(filePath, processFunction)
            );

            const batchResults = await Promise.all(batchPromises);

            // Track results
            const batchSuccesses = batchResults.filter(r => r.success).length;
            const batchFailures = batchResults.filter(r => !r.success);

            successCount += batchSuccesses;
            failedCount += batchFailures.length;

            // Collect failed files for potential retry later
            failedFiles = [...failedFiles, ...batchFailures.map(f => f.filePath)];

            processedCount += batch.length;

            // Log batch summary
            console.log(`Batch complete. Success: ${batchSuccesses}, Failed: ${batchFailures.length}`);
            console.log(`Overall progress: ${processedCount}/${totalFiles} (${Math.round(processedCount / totalFiles * 100)}%)`);
        }

        // Report on failed files
        if (failedFiles.length > 0) {
            console.log(`${failedFiles.length} files failed processing:`);
            failedFiles.slice(0, 10).forEach(file => console.log(`- ${file}`));
            if (failedFiles.length > 10) {
                console.log(`  ... and ${failedFiles.length - 10} more`);
            }
        }

        console.log(`Processing complete! Total: ${totalFiles}, Success: ${successCount}, Failed: ${failedCount}`);
        return {total: totalFiles, success: successCount, failed: failedCount, failedFiles};
    }
}

module.exports = new FileService();