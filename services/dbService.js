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
            const cveId = cveData.CVE_data_meta?.ID;

            if (!cveId) {
                console.warn('CVE ID missing in data, skipping');
                return null;
            }

            try {
                // Extract data from raw JSON
                const processedData = CVE.fromRawData(cveData, sourceFile);

                try {
                    // Process vendor and product data
                    const affectedProducts = await productService.processVendorProducts(processedData);

                    // Assign affected products to the CVE data
                    processedData.affectedProducts = affectedProducts;

                    // Remove the temporary extracted data field
                    delete processedData._extractedVendorProducts;

                    // Update or insert the CVE record
                    try {
                        const result = await CVE.findOneAndUpdate(
                            { cveId },
                            processedData,
                            { upsert: true, new: true, setDefaultsOnInsert: true }
                        );
                        return result;
                    } catch (upsertError) {
                        console.error(`Error updating/inserting CVE ${cveId}: ${upsertError.message}`);

                        // If there's a duplicate key error during upsert, try update then insert separately
                        if (upsertError.code === 11000) {
                            console.log(`Trying separate find and update for ${cveId}`);
                            const existingCVE = await CVE.findOne({ cveId });
                            if (existingCVE) {
                                // Update existing record
                                Object.assign(existingCVE, processedData);
                                return await existingCVE.save();
                            } else {
                                // Create new record
                                return await CVE.create(processedData);
                            }
                        } else {
                            throw upsertError;
                        }
                    }
                } catch (productsError) {
                    console.error(`Error processing product data for CVE ${cveId}: ${productsError.message}`);
                    throw productsError;
                }
            } catch (extractError) {
                console.error(`Error extracting data for CVE ${cveId}: ${extractError.message}`);
                throw extractError;
            }
        } catch (error) {
            console.error(`Error upserting CVE: ${error.message}`);
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