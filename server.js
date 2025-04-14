const gitService = require('./services/gitService');
const fileService = require('./services/fileService');
const dbService = require('./services/dbService');
const productService = require('./services/productService');

/**
 * Main function to run the CVE import process
 */
async function main() {
    try {
        console.log('Starting CVE import process');

        // Step 1: Connect to the database
        await dbService.connect();

        // Step 2: Clone target folder from the repository
        await gitService.cloneTargetFolder();

        // Step 3: Get all JSON files
        const jsonFiles = await gitService.getJsonFiles();
        console.log(`Found ${jsonFiles.length} JSON files in target folder`);

        // Step 4: Process JSON files and insert into MongoDB
        const processFunction = async (data, sourceFile) => {
            await dbService.upsertCVE(data, sourceFile);
        };

        await fileService.processBatch(jsonFiles, processFunction);

        // Step 5: Get statistics from the database
        const stats = await dbService.getStats();
        console.log('Database Statistics:');
        console.log(`Total CVEs: ${stats.cve.total}`);
        console.log('By State:', stats.cve.byState);
        console.log('By Severity:', stats.cve.bySeverity);

        console.log('\nVendor Statistics:');
        console.log(`Total Vendors: ${stats.vendors.totalVendors}`);
        console.log('Top Vendors by CVE Count:');
        stats.vendors.topVendors.forEach((vendor, index) => {
            console.log(`${index + 1}. ${vendor.name}: ${vendor.cveCount} CVEs, ${vendor.productCount} products`);
        });

        console.log('\nProduct Statistics:');
        console.log(`Total Products: ${stats.products.totalProducts}`);
        console.log('Top Products by CVE Count:');
        stats.products.topProducts.forEach((product, index) => {
            console.log(`${index + 1}. ${product.name} (${product.vendor}): ${product.cveCount} CVEs`);
        });

        // Optional: Demo how to get CVEs for a specific vendor or product
        if (stats.vendors.topVendors.length > 0) {
            const topVendor = stats.vendors.topVendors[0].name;
            console.log(`\nDemo: Getting products for vendor "${topVendor}"...`);
            const products = await productService.getProductsByVendor(topVendor);
            console.log(`Found ${products.length} products for ${topVendor}`);

            if (products.length > 0) {
                const productName = products[0].name;
                console.log(`\nDemo: Getting CVEs for product "${productName}" from vendor "${topVendor}"...`);
                const cves = await dbService.getCVEsByProduct(productName, topVendor);
                console.log(`Found ${cves.length} CVEs for ${productName}`);

                if (cves.length > 0) {
                    console.log('First CVE ID:', cves[0].cveId);
                }
            }
        }

        // Step 6: Disconnect from the database
        await dbService.disconnect();

        console.log('CVE import process completed successfully');
    } catch (error) {
        console.error('Error in CVE import process:', error.message);
        // Ensure we disconnect from the database in case of error
        await dbService.disconnect();
        process.exit(1);
    }
}


// Run the main function
if (require.main === module) {
    main();

}

module.exports = {main};