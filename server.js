require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');

// 👉 Perfectly imports your exact User and Listing models
const { Listing, User } = require('./models');

const app = express();
app.use(express.json());

// --- Cloudinary config (uses your existing Render env vars) ---
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer stores files in memory so we can stream them straight to Cloudinary
const upload = multer({ storage: multer.memoryStorage() });

// --- JWT auth middleware ---
function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }
}

// Helper: upload a single file buffer to Cloudinary, returns the secure_url
function uploadToCloudinary(fileBuffer) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder: 'agromarket' },
            (error, result) => {
                if (error) reject(error);
                else resolve(result.secure_url);
            }
        );
        stream.end(fileBuffer);
    });
}

// --- 1. STATIC FILES ---
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// --- 2. LISTINGS API ROUTES ---

// Get listings (with optional search/location filtering)
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

        const data = await Listing.find(query).sort({ createdAt: -1 });
        res.status(200).json(data);
    } catch (error) {
        console.error("❌ Error fetching data:", error);
        res.status(500).json({ error: "Failed to fetch data" });
    }
});

// Get a single listing by ID (for the detail view page)
app.get('/api/listings/:id', async (req, res) => {
    try {
        const listing = await Listing.findById(req.params.id);

        if (!listing) {
            return res.status(404).json({ error: "Listing not found." });
        }

        res.status(200).json(listing);
    } catch (error) {
        console.error("❌ Error fetching listing:", error);
        res.status(500).json({ error: "Failed to fetch listing." });
    }
});

// Create a new listing (with up to 4 photos uploaded to Cloudinary)
app.post('/api/listings', verifyToken, upload.array('images', 4), async (req, res) => {
    try {
        const { category, name, location, price, unit, quantity, readyDate } = req.body;

        if (!name || !location || !price || !unit || !quantity) {
            return res.status(400).json({ error: "Missing required fields." });
        }

        // Look up the logged-in user's phone number to attach to the listing
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(401).json({ error: "User not found." });
        }

        let imageUrls = [];

        if (req.files && req.files.length > 0) {
            // Upload all photo buffers to Cloudinary in parallel
            imageUrls = await Promise.all(
                req.files.map(file => uploadToCloudinary(file.buffer))
            );
        }

        const newListing = await Listing.create({
            userId: req.userId,
            name,
            category,
            quantity,
            location,
            readyDate,
            price: Number(price),
            unit,
            phone: user.phone,
            image: imageUrls[0] || '',   // first photo also stored here for backward compatibility (card thumbnails)
            images: imageUrls
        });

        res.status(201).json(newListing);

    } catch (error) {
        console.error("❌ Error creating listing:", error);
        res.status(500).json({ error: "Failed to create listing." });
    }
});

// Delete a listing (owner only)
app.delete('/api/listings/:id', verifyToken, async (req, res) => {
    try {
        const listing = await Listing.findById(req.params.id);

        if (!listing) {
            return res.status(404).json({ error: "Listing not found." });
        }

        // Only the owner can delete their own listing
        if (listing.userId.toString() !== req.userId) {
            return res.status(403).json({ error: "You can only delete your own listings." });
        }

        await Listing.findByIdAndDelete(req.params.id);

        res.status(200).json({ message: "Listing deleted successfully." });

    } catch (error) {
        console.error("❌ Error deleting listing:", error);
        res.status(500).json({ error: "Failed to delete listing." });
    }
});

// --- USER PROFILE ROUTES ---

// Get current user's profile
app.get('/api/users/me', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('name phone');
        if (!user) {
            return res.status(404).json({ error: "User not found." });
        }
        res.status(200).json({ name: user.name, phone: user.phone });
    } catch (error) {
        console.error("❌ Error fetching profile:", error);
        res.status(500).json({ error: "Failed to fetch profile." });
    }
});

// Change current user's password
app.put('/api/users/me/password', verifyToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: "Current and new password are required." });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: "New password must be at least 6 characters." });
        }

        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ error: "User not found." });
        }

        const passwordMatches = await bcrypt.compare(currentPassword, user.password);
        if (!passwordMatches) {
            return res.status(401).json({ error: "Current password is incorrect." });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        res.status(200).json({ message: "Password updated successfully." });

    } catch (error) {
        console.error("❌ Error changing password:", error);
        res.status(500).json({ error: "Failed to change password." });
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