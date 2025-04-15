const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    vendor: {
        type: Schema.Types.ObjectId,
        ref: 'Vendor',
        required: true
    },
    vendorName: {
        type: String,
        required: true,
        trim: true
    },
    versions: [{
        version: String,
        affected: Boolean
    }],
    cveCount: {
        type: Number,
        default: 0
    },
    firstSeen: {
        type: Date,
        default: Date.now
    },
    lastSeen: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Compound index to ensure product uniqueness per vendor
productSchema.index({ name: 1, vendor: 1 }, { unique: true });
productSchema.index({ vendorName: 1 });


productSchema.statics.findOrCreate = async function(productData) {
    const { name, vendorId, vendorName, versions } = productData;

    try {
        // Look for an existing product
        let product = await this.findOne({
            name: name,
            vendor: vendorId
        });

        if (!product) {
            try {
                // Try to create new product
                product = await this.create({
                    name: name,
                    vendor: vendorId,
                    vendorName: vendorName,
                    versions: versions || [],
                    firstSeen: new Date(),
                    lastSeen: new Date()
                });
            } catch (createError) {
                // If it's a duplicate key error, try to find the product again
                if (createError.code === 11000) {
                    console.log(`Product ${name} was created concurrently, fetching it now`);
                    product = await this.findOne({
                        name: name,
                        vendor: vendorId
                    });

                    if (!product) {
                        throw new Error(`Failed to find product ${name} after duplicate key error`);
                    }
                } else {
                    throw createError; // Re-throw if it's not a duplicate key error
                }
            }
        } else {
            // Update the product
            product.lastSeen = new Date();

            // Update versions if provided
            if (versions && versions.length > 0) {
                // Merge existing versions with new ones
                const existingVersions = new Map(
                    product.versions.map(v => [v.version, v.affected])
                );

                versions.forEach(v => {
                    existingVersions.set(v.version, v.affected);
                });

                product.versions = Array.from(existingVersions).map(([version, affected]) => ({
                    version,
                    affected
                }));
            }

            try {
                await product.save();
            } catch (saveError) {
                // If there's a version conflict, fetch the latest document
                if (saveError.name === 'VersionError') {
                    console.log(`Version conflict for product ${name}, fetching latest`);
                    product = await this.findOne({
                        name: name,
                        vendor: vendorId
                    });

                    if (!product) {
                        throw new Error(`Failed to find product ${name} after version error`);
                    }
                } else {
                    throw saveError;
                }
            }
        }

        return product;
    } catch (error) {
        console.error(`Error in findOrCreate product: ${error.message}`);
        throw error;
    }
};

const Product = mongoose.model('Product', productSchema);

module.exports = Product;