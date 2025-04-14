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
            let vendor = await Vendor.findOne({ name: vendorName });

            if (!vendor) {
                vendor = await Vendor.create({
                    name: vendorName,
                    firstSeen: new Date(),
                    lastSeen: new Date()
                });
                console.log(`Created new vendor: ${vendorName}`);
            } else {
                // Update the last seen date
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

                // Find or create the vendor
                const vendor = await this.findOrCreateVendor(vendorName);

                // Process each product for this vendor
                for (const productData of vendorData.products || []) {
                    const productName = productData.productName;

                    if (!productName) {
                        console.warn(`Skipping product with no name for vendor ${vendorName} in CVE ${cveData.cveId}`);
                        continue;
                    }

                    // Find or create the product
                    const product = await this.findOrCreateProduct(
                        productName,
                        vendor._id,
                        vendorName,
                        productData.versions || []
                    );

                    // Add to the affected products list
                    affectedProducts.push({
                        product: product._id,
                        vendor: vendor._id,
                        productName,
                        vendorName,
                        versions: productData.versions || []
                    });

                    // Increment CVE counter for the product
                    await Product.findByIdAndUpdate(
                        product._id,
                        { $inc: { cveCount: 1 } }
                    );
                }

                // Increment CVE counter for the vendor
                await Vendor.findByIdAndUpdate(
                    vendor._id,
                    {
                        $inc: { cveCount: 1 },
                        $set: {
                            productCount: vendorData.products ? vendorData.products.length : 0
                        }
                    }
                );
            }

            return affectedProducts;
        } catch (error) {
            console.error(`Error processing vendor products for CVE ${cveData.cveId}:`, error.message);
            throw error;
        }
    }

    /**
     * Get products for a specific vendor
     * @param {string} vendorName - Name of the vendor
     * @returns {Array} - Array of product documents
     */
    async getProductsByVendor(vendorName) {
        try {
            return await Product.find({ vendorName });
        } catch (error) {
            console.error(`Error getting products for vendor ${vendorName}:`, error.message);
            throw error;
        }
    }

    /**
     * Get CVEs for a specific product
     * @param {string} productId - ID of the product
     * @returns {Array} - Array of CVE documents
     */
    async getCVEsByProduct(productId) {
        try {
            const CVE = require('../models/cveModel');
            return await CVE.find({ 'affectedProducts.product': productId });
        } catch (error) {
            console.error(`Error getting CVEs for product ${productId}:`, error.message);
            throw error;
        }
    }

    /**
     * Get CVEs for a specific vendor
     * @param {string} vendorId - ID of the vendor
     * @returns {Array} - Array of CVE documents
     */
    async getCVEsByVendor(vendorId) {
        try {
            const CVE = require('../models/cveModel');
            return await CVE.find({ 'affectedProducts.vendor': vendorId });
        } catch (error) {
            console.error(`Error getting CVEs for vendor ${vendorId}:`, error.message);
            throw error;
        }
    }

    /**
     * Get vendor statistics
     * @returns {Object} - Vendor statistics
     */
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

    /**
     * Get product statistics
     * @returns {Object} - Product statistics
     */
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