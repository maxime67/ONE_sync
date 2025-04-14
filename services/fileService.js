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

        console.log(`Starting to process ${totalFiles} files in batches of ${batchSize}`);

        for (let i = 0; i < totalFiles; i += batchSize) {
            const batch = files.slice(i, i + batchSize);
            console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(totalFiles / batchSize)}`);

            const batchPromises = batch.map(async (filePath) => {
                try {
                    const relativePath = path.relative(config.github.localPath, filePath);
                    console.log(`Processing ${relativePath}...`);

                    const data = await this.readJsonFile(filePath);
                    await processFunction(data, relativePath);

                    successCount++;
                    return { success: true, filePath };
                } catch (error) {
                    console.error(`Failed to process ${filePath}:`, error.message);
                    failedCount++;
                    return { success: false, filePath, error: error.message };
                } finally {
                    processedCount++;
                }
            });

            const batchResults = await Promise.all(batchPromises);

            // Log batch summary
            console.log(`Batch complete. Success: ${batchResults.filter(r => r.success).length}, Failed: ${batchResults.filter(r => !r.success).length}`);
            console.log(`Overall progress: ${processedCount}/${totalFiles} (${Math.round(processedCount / totalFiles * 100)}%)`);
        }

        console.log(`Processing complete! Total: ${totalFiles}, Success: ${successCount}, Failed: ${failedCount}`);
        return { total: totalFiles, success: successCount, failed: failedCount };
    }
}

module.exports = new FileService();