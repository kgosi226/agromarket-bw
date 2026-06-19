require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

// 👉 Perfectly imports your exact Listing model
const { Listing } = require('./models');

const app = express();
app.use(express.json());

// --- 1. STATIC FILES ---
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// --- 2. THE API ROUTE ---
app.get('/api/listings', async (req, res) => {
    try {
        const { search, location } = req.query;
        const query = {};

        if (search && search.trim() !== '') {
            query.name = { $regex: search.trim(), $options: 'i' }; // case-insensitive partial match
        }

        if (location && location !== 'all') {
            query.location = { $regex: `^${location}$`, $options: 'i' }; // exact match, case-insensitive
        }

        const data = await Listing.find(query);
        res.status(200).json(data);
    } catch (error) {
        console.error("❌ Error fetching data:", error);
        res.status(500).json({ error: "Failed to fetch data" });
    }
});

// --- 3. CATCH-ALL ROUTE ---
app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// --- 4. CONNECT TO DB & START SERVER ---
const PORT = process.env.PORT || 10000;

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ Connected to MongoDB Atlas");
        app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
    })
    .catch((err) => {
        console.error("❌ Database connection failed:", err);
        app.listen(PORT, () => console.log(`🚀 Server running (DB Error) on port ${PORT}`));
    });