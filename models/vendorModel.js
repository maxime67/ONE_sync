const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    productCount: {
        type: Number,
        default: 0
    },
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

const Vendor = mongoose.model('Vendor', vendorSchema);

module.exports = Vendor;