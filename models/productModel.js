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

// Static method to get or create a product
productSchema.statics.findOrCreate = async function(productData) {
    const { name, vendorId, vendorName } = productData;

    try {
        // Look for an existing product
        let product = await this.findOne({
            name: name,
            vendor: vendorId
        });

        // If no product found, create a new one
        if (!product) {
            product = await this.create({
                name: name,
                vendor: vendorId,
                vendorName: vendorName,
                versions: productData.versions || [],
                firstSeen: new Date(),
                lastSeen: new Date()
            });
        } else {
            // Update the product
            product.lastSeen = new Date();

            // Update versions if provided
            if (productData.versions && productData.versions.length > 0) {
                // Merge existing versions with new ones
                const existingVersions = new Map(
                    product.versions.map(v => [v.version, v.affected])
                );

                productData.versions.forEach(v => {
                    existingVersions.set(v.version, v.affected);
                });

                product.versions = Array.from(existingVersions).map(([version, affected]) => ({
                    version,
                    affected
                }));
            }

            await product.save();
        }

        return product;
    } catch (error) {
        console.error(`Error in findOrCreate product: ${error.message}`);
        throw error;
    }
};

const Product = mongoose.model('Product', productSchema);

module.exports = Product;