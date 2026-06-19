require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// 👉 Perfectly imports your exact User and Listing models
const { Listing, User } = require('./models');

const app = express();
app.use(express.json());

// --- 1. STATIC FILES ---
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// --- 2. LISTINGS API ROUTE ---
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

// --- 3. AUTH ROUTES ---

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, phone, password } = req.body;

        if (!name || !phone || !password) {
            return res.status(400).json({ error: "All fields are required." });
        }

        const existingUser = await User.findOne({ phone });
        if (existingUser) {
            return res.status(409).json({ error: "An account with this phone number already exists." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await User.create({ name, phone, password: hashedPassword });

        const token = jwt.sign(
            { userId: newUser._id },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.status(201).json({
            token,
            user: { name: newUser.name, phone: newUser.phone }
        });

    } catch (error) {
        console.error("❌ Error registering user:", error);
        res.status(500).json({ error: "Registration failed." });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { phone, password } = req.body;

        if (!phone || !password) {
            return res.status(400).json({ error: "Phone and password are required." });
        }

        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(401).json({ error: "Invalid phone number or password." });
        }

        const passwordMatches = await bcrypt.compare(password, user.password);
        if (!passwordMatches) {
            return res.status(401).json({ error: "Invalid phone number or password." });
        }

        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.status(200).json({
            token,
            user: { name: user.name, phone: user.phone }
        });

    } catch (error) {
        console.error("❌ Error logging in:", error);
        res.status(500).json({ error: "Login failed." });
    }
});

// --- 4. CATCH-ALL ROUTE ---
app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// --- 5. CONNECT TO DB & START SERVER ---
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