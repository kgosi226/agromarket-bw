const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const upload = require('./cloudinaryConfig'); // Your file from step 1
const { User, Listing } = require('./models'); // Your file from step 2

const app = express();
app.use(cors());
app.use(express.json());

// Database Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas'))
    .catch(err => console.error('❌ Database connection error:', err));

// Middleware to protect routes
const protect = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Not authorized' });
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// API Endpoints
app.get('/api/listings', async (req, res) => {
    const listings = await Listing.find({});
    res.json({ success: true, data: listings });
});

app.post('/api/listings', protect, upload.single('image'), async (req, res) => {
    try {
        const newListing = new Listing({
            ...req.body,
            userId: req.user.userId,
            phone: req.user.phone,
            image: req.file ? req.file.path : 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=500'
        });
        await newListing.save();
        res.status(201).json({ success: true, data: newListing });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/listings/:id', protect, async (req, res) => {
    const item = await Listing.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    if (!item) return res.status(404).json({ error: 'Not found or unauthorized' });
    res.json({ success: true, message: 'Deleted' });
});
const path = require('path');

// Tell Express to serve your frontend files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// If the user tries to go to any other page, send them to index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// Add your Auth (Register/Login) routes here using User.create() and User.findOne()

app.listen(process.env.PORT || 5000, () => console.log('🚀 Server running on port 5000'));