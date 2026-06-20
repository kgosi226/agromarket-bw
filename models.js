const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: String,
    phone: { type: String, unique: true },
    password: String
});

const listingSchema = new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    name: String,
    category: String,
    quantity: String,
    location: String,
    readyDate: String,
    price: Number,
    unit: String,
    phone: String,
    image: String,           // kept for backward compatibility with old listings
    images: [String]         // new: up to 4 photos per listing
}, { timestamps: true });    // adds createdAt / updatedAt automatically

module.exports = {
    User: mongoose.model('User', userSchema),
    Listing: mongoose.model('Listing', listingSchema)
};