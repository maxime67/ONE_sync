const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Create a schema for CVE records
const cveSchema = new mongoose.Schema({
    cveId: {
        type: String,
        required: true,
        unique: true,
        index: true,
        match: /^CVE-\d{4}-\d{4,}$/
    },
    description: {
        type: String,
        required: true
    },
    assigner: {
        type: String,
        required: true
    },
    state: {
        type: String,
        enum: ['PUBLIC', 'RESERVED', 'REJECTED'],
        required: true
    },
    problemType: [{
        description: String,
        cweId: String
    }],
    references: [{
        url: String,
        name: String,
        refsource: String
    }],
    // References to affected products
    affectedProducts: [{
        product: {
            type: Schema.Types.ObjectId,
            ref: 'Product'
        },
        vendor: {
            type: Schema.Types.ObjectId,
            ref: 'Vendor'
        },
        // Store names for quick access without joins
        productName: String,
        vendorName: String,
        versions: [{
            version: String,
            affected: Boolean
        }]
    }],
    publishedDate: Date,
    lastModifiedDate: Date,
    cvssScore: Number,
    severity: String,
    // Store the complete raw data as it is in MongoDB
    raw_data: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    sourceFile: {
        type: String,
        required: true
    }
}, {
    timestamps: true
});

// Create indexes for efficient querying
cveSchema.index({ 'affectedProducts.product': 1 });
cveSchema.index({ 'affectedProducts.vendor': 1 });
cveSchema.index({ 'affectedProducts.productName': 1 });
cveSchema.index({ 'affectedProducts.vendorName': 1 });
cveSchema.index({ 'problemType.cweId': 1 });
cveSchema.index({ cvssScore: 1 });
cveSchema.index({ publishedDate: 1 });

// Method to extract fields from raw data
cveSchema.statics.fromRawData = function(rawData, sourceFile) {
    try {
        let cveData = {
            cveId: rawData.CVE_data_meta?.ID || '',
            assigner: rawData.CVE_data_meta?.ASSIGNER || '',
            state: rawData.CVE_data_meta?.STATE || '',
            sourceFile: sourceFile,
            raw_data: rawData,
            affectedProducts: [] // Will be populated later with actual references
        };

        // Extract description
        if (rawData.description?.description_data?.length > 0) {
            const engDescription = rawData.description.description_data.find(
                desc => desc.lang === 'eng'
            );
            if (engDescription) {
                cveData.description = engDescription.value;
            }
        }

        // Extract problem types
        if (rawData.problemtype?.problemtype_data) {
            cveData.problemType = [];
            rawData.problemtype.problemtype_data.forEach(problem => {
                if (problem.description) {
                    problem.description.forEach(desc => {
                        cveData.problemType.push({
                            description: desc.value,
                            cweId: desc.cweId
                        });
                    });
                }
            });
        }

        // Extract references
        if (rawData.references?.reference_data) {
            cveData.references = rawData.references.reference_data.map(ref => ({
                url: ref.url,
                name: ref.name,
                refsource: ref.refsource
            }));
        }

        // Extract information about affected vendors and products
        // Will be used later to create/update Vendor and Product records
        if (rawData.affects?.vendor?.vendor_data) {
            cveData._extractedVendorProducts = rawData.affects.vendor.vendor_data.map(vendor => {
                const vendorData = {
                    vendorName: vendor.vendor_name,
                    products: []
                };

                if (vendor.product?.product_data) {
                    vendorData.products = vendor.product.product_data.map(product => {
                        const productData = {
                            productName: product.product_name,
                            versions: []
                        };

                        if (product.version?.version_data) {
                            productData.versions = product.version.version_data.map(version => ({
                                version: version.version_value,
                                affected: version.version_affected === '=' ||
                                    version.version_affected === '<=' ||
                                    version.version_affected === '>='
                            }));
                        }

                        return productData;
                    });
                }

                return vendorData;
            });
        }

        // Extract CVSS score from impact
        if (rawData.impact?.cvss) {
            const cvssEntries = Array.isArray(rawData.impact.cvss) ? rawData.impact.cvss : [rawData.impact.cvss];
            const latestCvss = cvssEntries.reduce((latest, current) => {
                // Prioritize CVSS 3.1 over 3.0 over 2.0
                if (!latest) return current;
                if (current.version === '3.1') return current;
                if (current.version === '3.0' && latest.version !== '3.1') return current;
                return latest;
            }, null);

            if (latestCvss) {
                cveData.cvssScore = latestCvss.baseScore;
                cveData.severity = latestCvss.baseSeverity;
            }
        }

        return cveData;
    } catch (error) {
        console.error(`Error processing CVE data: ${error.message}`);
        console.error(`Source file: ${sourceFile}`);
        throw error;
    }
};

const CVE = mongoose.model('CVE', cveSchema);

module.exports = CVE;