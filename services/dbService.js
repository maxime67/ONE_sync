const mongoose = require('mongoose');
const config = require('../config/config');
const CVE = require('../models/cveModel');
const productService = require('./productService');

class DBService {
    constructor() {
        this.uri = config.mongodb.uri;
        this.connected = false;
    }

    /**
     * Connect to MongoDB
     */
    async connect() {
        if (this.connected) return;

        try {
            console.log(`Connecting to MongoDB at ${this.uri}`);
            await mongoose.connect(this.uri, {
                // Mongoose 7+ doesn't need these options anymore
            });

            this.connected = true;
            console.log('Connected to MongoDB successfully!');
        } catch (error) {
            console.error('Error connecting to MongoDB:', error.message);
            throw error;
        }
    }

    /**
     * Disconnect from MongoDB
     */
    async disconnect() {
        if (!this.connected) return;

        try {
            await mongoose.disconnect();
            this.connected = false;
            console.log('Disconnected from MongoDB');
        } catch (error) {
            console.error('Error disconnecting from MongoDB:', error.message);
        }
    }

    /**
     * Upsert a CVE record (insert if not exists, update if exists)
     * @param {Object} cveData - Raw CVE data from JSON file
     * @param {string} sourceFile - Source file path
     */
    async upsertCVE(cveData, sourceFile) {
        try {
            console.log(cveData);
            // process.exit(1)
            const cveId = cveData.CVE_data_meta?.ID;

            if (!cveId) {
                console.warn('CVE ID missing in data, skipping');
                return null;
            }

            // Extract data from raw JSON
            const processedData = CVE.fromRawData(cveData, sourceFile);

            // Process vendor and product data
            const affectedProducts = await productService.processVendorProducts(processedData);

            // Assign affected products to the CVE data
            processedData.affectedProducts = affectedProducts;

            // Remove the temporary extracted data field
            delete processedData._extractedVendorProducts;

            // Update or insert the CVE record
            const result = await CVE.findOneAndUpdate(
                { cveId },
                processedData,
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            return result;
        } catch (error) {
            console.error(`Error upserting CVE: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get statistics about the CVE collection
     */
    async getStats() {
        try {
            // Get CVE statistics
            const totalCVEs = await CVE.countDocuments();

            const byState = await CVE.aggregate([
                { $group: { _id: '$state', count: { $sum: 1 } } }
            ]);

            const bySeverity = await CVE.aggregate([
                { $match: { severity: { $exists: true } } },
                { $group: { _id: '$severity', count: { $sum: 1 } } }
            ]);

            // Get vendor statistics
            const vendorStats = await productService.getVendorStats();

            // Get product statistics
            const productStats = await productService.getProductStats();

            return {
                cve: {
                    total: totalCVEs,
                    byState: byState.reduce((acc, curr) => {
                        acc[curr._id] = curr.count;
                        return acc;
                    }, {}),
                    bySeverity: bySeverity.reduce((acc, curr) => {
                        acc[curr._id] = curr.count;
                        return acc;
                    }, {})
                },
                vendors: vendorStats,
                products: productStats
            };
        } catch (error) {
            console.error(`Error getting stats: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get all CVEs for a specific vendor
     * @param {string} vendorName - Name of the vendor
     */
    async getCVEsByVendor(vendorName) {
        try {
            return await CVE.find({ 'affectedProducts.vendorName': vendorName });
        } catch (error) {
            console.error(`Error getting CVEs for vendor ${vendorName}:`, error.message);
            throw error;
        }
    }

    /**
     * Get all CVEs for a specific product
     * @param {string} productName - Name of the product
     * @param {string} vendorName - Name of the vendor
     */
    async getCVEsByProduct(productName, vendorName) {
        try {
            const query = { 'affectedProducts.productName': productName };

            if (vendorName) {
                query['affectedProducts.vendorName'] = vendorName;
            }

            return await CVE.find(query);
        } catch (error) {
            console.error(`Error getting CVEs for product ${productName}:`, error.message);
            throw error;
        }
    }
}

module.exports = new DBService();