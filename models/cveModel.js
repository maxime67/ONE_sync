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
        enum: ['PUBLIC', 'RESERVED', 'REJECTED', 'PUBLISHED'],
        required: true
    },
    problemType: [{
        description: String,
        cweId: String
    }],
    references: [{
        url: String,
        name: String,
        refsource: String,
        tags: [String]
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
cveSchema.index({'affectedProducts.product': 1});
cveSchema.index({'affectedProducts.vendor': 1});
cveSchema.index({'affectedProducts.productName': 1});
cveSchema.index({'affectedProducts.vendorName': 1});
cveSchema.index({'problemType.cweId': 1});
cveSchema.index({cvssScore: 1});
cveSchema.index({publishedDate: 1});

// Method to extract fields from raw data
cveSchema.statics.fromRawData = function (rawData, sourceFile) {
    try {
        // Check format version (v4 is old format, v5 is new format)

        let cveData = {
            sourceFile: sourceFile,
            raw_data: rawData,
            affectedProducts: [] // Will be populated later with actual references
        };

        // New format (v5+)
        // Extract CVE ID, assigner, and state from cveMetadata
        cveData.cveId = rawData.cveMetadata?.cveId || '';
        cveData.assigner = rawData.cveMetadata?.assignerOrgId || rawData.cveMetadata?.assignerShortName || '';
        cveData.state = rawData.cveMetadata?.state || '';

        // Extract dates
        if (rawData.cveMetadata?.datePublished) {
            cveData.publishedDate = new Date(rawData.cveMetadata.datePublished);
        }
        if (rawData.cveMetadata?.dateUpdated) {
            cveData.lastModifiedDate = new Date(rawData.cveMetadata.dateUpdated);
        }

        // Extract description from containers.cna.descriptions
        if (rawData.containers?.cna?.descriptions && rawData.containers.cna.descriptions.length > 0) {
            const engDescription = rawData.containers.cna.descriptions.find(
                desc => desc.lang === 'en'
            );
            if (engDescription) {
                cveData.description = engDescription.value;
            }
        }

        // Extract problem types from containers.cna.problemTypes
        if (rawData.containers?.cna?.problemTypes) {
            cveData.problemType = [];
            rawData.containers.cna.problemTypes.forEach(problem => {
                if (problem.descriptions) {
                    problem.descriptions.forEach(desc => {
                        cveData.problemType.push({
                            description: desc.description || desc.value,
                            cweId: desc.cweId
                        });
                    });
                }
            });
        }

        // Extract references from containers.cna.references
        if (rawData.containers?.cna?.references) {
            cveData.references = rawData.containers.cna.references.map(ref => ({
                url: ref.url,
                name: ref.name,
                refsource: ref.source,
                tags: ref.tags || []
            }));
        }

        // Extract information about affected vendors and products
        if (rawData.containers?.cna?.affected) {
            cveData._extractedVendorProducts = rawData.containers.cna.affected
                .filter(affected => affected.vendor && affected.product)
                .map(affected => {
                    const vendorData = {
                        vendorName: affected.vendor,
                        products: []
                    };

                    const productData = {
                        productName: affected.product,
                        versions: []
                    };

                    // Extract version information
                    if (affected.versions) {
                        productData.versions = affected.versions.map(version => ({
                            version: version.version,
                            affected: version.status === 'affected'
                        }));
                    }

                    vendorData.products.push(productData);
                    return vendorData;
                });
        }

        if (rawData.containers?.adp && rawData.containers?.adp.metrics) {
            if (rawData.containers.adp.metrics && rawData.containers.adp.metrics.length > 0) {
                let adp = rawData.containers.adp
                // try CVSS v2.0
                cvssEntry = adp.metrics.find(metric => metric.cvssV2_0);
                if (cvssEntry && cvssEntry.cvssV2_0) {
                    cveData.cvssScore = cvssEntry.cvssV2_0.baseScore;
                    cveData.severity = cvssEntry.cvssV2_0.severity;
                }

                // try CVSS v3.0
                cvssEntry = adp.metrics.find(metric => metric.cvssV3_0);
                if (cvssEntry && cvssEntry.cvssV3_0) {
                    cveData.cvssScore = cvssEntry.cvssV3_0.baseScore;
                    cveData.severity = cvssEntry.cvssV3_0.baseSeverity;
                }

                // Try CVSS v3.1
                cvssEntry = adp.metrics.find(metric => metric.cvssV3_1);
                if (cvssEntry && cvssEntry.cvssV3_1) {
                    cveData.cvssScore = cvssEntry.cvssV3_1.baseScore;
                    cveData.severity = cvssEntry.cvssV3_1.baseSeverity;
                }
                // Try CVSS v4
                cvssEntry = adp.metrics.find(metric => metric.cvssV4_0);
                if (cvssEntry && cvssEntry.cvssV4_0) {
                    cveData.cvssScore = cvssEntry.cvssV4_0.baseScore;
                    cveData.severity = cvssEntry.cvssV4_0.baseSeverity;
                }
            }

        }

        // Extract CVSS score from containers.cna[].metrics
        if (rawData.containers?.cna && rawData.containers?.cna.metrics) {
            if (rawData.containers.cna.metrics && rawData.containers.cna.metrics.length > 0) {
                let cna = rawData.containers.cna
                // try CVSS v2.0
                cvssEntry = cna.metrics.find(metric => metric.cvssV2_0);
                if (cvssEntry && cvssEntry.cvssV2_0) {
                    cveData.cvssScore = cvssEntry.cvssV2_0.baseScore;
                    cveData.severity = cvssEntry.cvssV2_0.severity;
                }

                // try CVSS v3.0
                cvssEntry = cna.metrics.find(metric => metric.cvssV3_0);
                if (cvssEntry && cvssEntry.cvssV3_0) {
                    cveData.cvssScore = cvssEntry.cvssV3_0.baseScore;
                    cveData.severity = cvssEntry.cvssV3_0.baseSeverity;
                }

                // Try CVSS v3.1
                cvssEntry = cna.metrics.find(metric => metric.cvssV3_1);
                if (cvssEntry && cvssEntry.cvssV3_1) {
                    cveData.cvssScore = cvssEntry.cvssV3_1.baseScore;
                    cveData.severity = cvssEntry.cvssV3_1.baseSeverity;
                }
                // Try CVSS v4
                cvssEntry = cna.metrics.find(metric => metric.cvssV4_0);
                if (cvssEntry && cvssEntry.cvssV4_0) {
                    cveData.cvssScore = cvssEntry.cvssV4_0.baseScore;
                    cveData.severity = cvssEntry.cvssV4_0.baseSeverity;
                }
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