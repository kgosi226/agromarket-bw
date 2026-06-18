require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const app = express();

app.use(express.json());

// 1. Static Files: Tell Express where your frontend is
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// 2. Catch-all: Try to send index.html
app.get('*', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    res.sendFile(indexPath, (err) => {
        if (err) {
            res.status(404).send("File not found! Please check if 'public/index.html' exists.");
        }
    });
});

// 3. Connect to DB and Start
const PORT = process.env.PORT || 10000;
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ Connected to MongoDB Atlas");
        app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
    })
    .catch((err) => console.error("❌ Database connection failed:", err));