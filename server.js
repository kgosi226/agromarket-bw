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
// This is the missing code. It fetches your data straight from the database 
// and sends it to your frontend so your website actually shows items.
app.get('/api/listings', async (req, res) => {
    try {
        // This connects directly to your 'listings' collection in MongoDB Atlas
        const collection = mongoose.connection.db.collection('listings');
        const data = await collection.find({}).toArray();
        
        // Sends the data back to your website
        res.status(200).json(data);
    } catch (error) {
        console.error("❌ Error fetching data from MongoDB:", error);
        res.status(500).json({ error: "Failed to fetch data" });
    }
});

// --- 3. CATCH-ALL ROUTE (The Render Crash Fix) ---
// This safely handles page refreshes without triggering the PathError
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