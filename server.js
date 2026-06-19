require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
app.use(express.json());

// --- 1. STATIC FILES ---
// Tells Express where your frontend is (the public folder)
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// --- 2. THE API ROUTE (MongoDB Data Fetch) ---
// This uses your models.js file to securely fetch data without crashing
app.get('/api/listings', async (req, res) => {
    try {
        // 1. Import your actual database models
        const models = require('./models');
        
        // 2. Find the Listing model (handles different export methods)
        const Listing = models.Listing || mongoose.models.Listing || models;
        
        // 3. Fetch all listings from the database
        const data = await Listing.find({});
        
        // 4. Send the data array back to the frontend
        res.status(200).json(data);
    } catch (error) {
        console.error("❌ Error fetching data:", error);
        res.status(500).json({ error: "Failed to fetch data" });
    }
});

// --- 3. CATCH-ALL ROUTE (The Render Crash Fix) ---
// Safely handles page refreshes without triggering the PathError
app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// --- 4. CONNECT TO DB & START SERVER ---
const PORT = process.env.PORT || 10000;

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ Connected to MongoDB Atlas");
        app.listen(PORT, () => console.log(`🚀 Server running and ready on port ${PORT}`));
    })
    .catch((err) => {
        console.error("❌ Database connection failed:", err);
        // Start the server anyway so Render stays "Live" and doesn't crash
        app.listen(PORT, () => console.log(`🚀 Server running (DB Error) on port ${PORT}`));
    });