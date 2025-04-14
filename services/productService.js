// services/productService.js
const Vendor = require('../models/vendorModel');
const Product = require('../models/productModel');

class ProductService {
    /**
     * Find or create a vendor by name
     * @param {string} vendorName - Name of the vendor
     * @returns {Object} - Vendor document
     */
    async findOrCreateVendor(vendorName) {
        try {
            // Skip "n/a" vendors
            if (vendorName === "n/a") {
                console.log(`Skipping vendor with name "n/a"`);
                return null;
            }

            // First attempt to find the vendor
            let vendor = await Vendor.findOne({ name: vendorName });

            if (!vendor) {
                try {
                    // Try to create the vendor
                    vendor = await Vendor.create({
                        name: vendorName,
                        firstSeen: new Date(),
                        lastSeen: new Date()
                    });
                    console.log(`Created new vendor: ${vendorName}`);
                } catch (createError) {
                    // If error is duplicate key, try to find the vendor again
                    if (createError.code === 11000) {
                        console.log(`Vendor ${vendorName} was created concurrently, fetching it now`);
                        vendor = await Vendor.findOne({ name: vendorName });
                        if (!vendor) {
                            throw new Error(`Failed to find vendor ${vendorName} after duplicate key error`);
                        }
                    } else {
                        throw createError; // Re-throw if it's not a duplicate key error
                    }
                }
            }

            // Update the last seen date
            if (vendor) {
                vendor.lastSeen = new Date();
                await vendor.save();
            }

            return vendor;
        } catch (error) {
            console.error(`Error finding/creating vendor ${vendorName}:`, error.message);
            throw error;
        }
    }

    /**
     * Find or create a product by name and vendor
     * @param {string} productName - Name of the product
     * @param {string} vendorId - ID of the vendor
     * @param {string} vendorName - Name of the vendor (for denormalization)
     * @param {Array} versions - Optional array of version objects
     * @returns {Object} - Product document
     */
    async findOrCreateProduct(productName, vendorId, vendorName, versions = []) {
        try {
            // Skip "n/a" products
            if (productName === "n/a") {
                console.log(`Skipping product with name "n/a"`);
                return null;
            }

            const productData = {
                name: productName,
                vendorId,
                vendorName,
                versions
            };

            const product = await Product.findOrCreate(productData);

            return product;
        } catch (error) {
            console.error(`Error finding/creating product ${productName}:`, error.message);
            throw error;
        }
    }

    /**
     * Process extracted vendor/product data from a CVE
     * and create/update the corresponding records
     * @param {Object} cveData - Extracted CVE data
     * @returns {Array} - Array of affected product references
     */
    async processVendorProducts(cveData) {
        try {
            if (!cveData._extractedVendorProducts || cveData._extractedVendorProducts.length === 0) {
                return [];
            }

            const affectedProducts = [];

            // Process each vendor and its products
            for (const vendorData of cveData._extractedVendorProducts) {
                const vendorName = vendorData.vendorName;

                if (!vendorName) {
                    console.warn(`Skipping vendor with no name in CVE ${cveData.cveId}`);
                    continue;
                }

                // Skip "n/a" vendors
                if (vendorName.toLowerCase() === "n/a") {
                    console.log(`Skipping "n/a" vendor in CVE ${cveData.cveId}`);
                    continue;
                }

                try {
                    // Find or create the vendor
                    const vendor = await this.findOrCreateVendor(vendorName);

                    // Skip if vendor is null (e.g., "n/a" case)
                    if (!vendor) {
                        continue;
                    }

                    // Process each product for this vendor
                    for (const productData of vendorData.products || []) {
                        const productName = productData.productName;

                        if (!productName) {
                            console.warn(`Skipping product with no name for vendor ${vendorName} in CVE ${cveData.cveId}`);
                            continue;
                        }

                        // Skip "n/a" products
                        if (productName.toLowerCase() === "n/a") {
                            console.log(`Skipping "n/a" product for vendor ${vendorName} in CVE ${cveData.cveId}`);
                            continue;
                        }

                        try {
                            // Find or create the product
                            const product = await this.findOrCreateProduct(
                                productName,
                                vendor._id,
                                vendorName,
                                productData.versions || []
                            );

                            // Skip if product is null (e.g., "n/a" case)
                            if (!product) {
                                continue;
                            }

                            // Add to the affected products list
                            affectedProducts.push({
                                product: product._id,
                                vendor: vendor._id,
                                productName,
                                vendorName,
                                versions: productData.versions || []
                            });

                            // Increment CVE counter for the product
                            try {
                                await Product.findByIdAndUpdate(
                                    product._id,
                                    { $inc: { cveCount: 1 } }
                                );
                            } catch (counterError) {
                                console.warn(`Failed to update CVE counter for product ${productName}: ${counterError.message}`);
                            }
                        } catch (productError) {
                            console.error(`Error processing product ${productName} for vendor ${vendorName}: ${productError.message}`);
                            // Continue with other products
                        }
                    }

                    // Increment CVE counter for the vendor
                    try {
                        await Vendor.findByIdAndUpdate(
                            vendor._id,
                            {
                                $inc: { cveCount: 1 },
                                $set: {
                                    productCount: vendorData.products ? vendorData.products.length : 0
                                }
                            }
                        );
                    } catch (vendorCountError) {
                        console.warn(`Failed to update counter for vendor ${vendorName}: ${vendorCountError.message}`);
                    }
                } catch (vendorError) {
                    console.error(`Error processing vendor ${vendorName}: ${vendorError.message}`);
                    // Continue with other vendors
                }
            }

            return affectedProducts;
        } catch (error) {
            console.error(`Error processing vendor products for CVE ${cveData.cveId}: ${error.message}`);
            return []; // Return empty array to allow the rest of the process to continue
        }
    }

    // Rest of the methods remain unchanged
    async getProductsByVendor(vendorName) {
        try {
            return await Product.find({ vendorName });
        } catch (error) {
            console.error(`Error getting products for vendor ${vendorName}:`, error.message);
            throw error;
        }
    }

    async getCVEsByProduct(productId) {
        try {
            const CVE = require('../models/cveModel');
            return await CVE.find({ 'affectedProducts.product': productId });
        } catch (error) {
            console.error(`Error getting CVEs for product ${productId}:`, error.message);
            throw error;
        }
    }

    async getCVEsByVendor(vendorId) {
        try {
            const CVE = require('../models/cveModel');
            return await CVE.find({ 'affectedProducts.vendor': vendorId });
        } catch (error) {
            console.error(`Error getting CVEs for vendor ${vendorId}:`, error.message);
            throw error;
        }
    }

    async getVendorStats() {
        try {
            const totalVendors = await Vendor.countDocuments();
            const topVendors = await Vendor.find()
                .sort({ cveCount: -1 })
                .limit(10);

            return {
                totalVendors,
                topVendors: topVendors.map(v => ({
                    name: v.name,
                    cveCount: v.cveCount,
                    productCount: v.productCount
                }))
            };
        } catch (error) {
            console.error('Error getting vendor statistics:', error.message);
            throw error;
        }
    }

    async getProductStats() {
        try {
            const totalProducts = await Product.countDocuments();
            const topProducts = await Product.find()
                .sort({ cveCount: -1 })
                .limit(10);

            return {
                totalProducts,
                topProducts: topProducts.map(p => ({
                    name: p.name,
                    vendor: p.vendorName,
                    cveCount: p.cveCount
                }))
            };
        } catch (error) {
            console.error('Error getting product statistics:', error.message);
            throw error;
        }
    }
}

module.exports = new ProductService();