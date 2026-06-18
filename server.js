const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

app.use(cors()); 
app.use(express.json());

// Secret key for JWT signing (In production, move this to your .env file!)
const JWT_SECRET = process.env.JWT_SECRET || 'agromarket_super_secret_key_123';

// Establish paths
const uploadFolder = path.join(__dirname, 'uploads');
const dbFilePath = path.join(__dirname, 'listings.json');
const usersFilePath = path.join(__dirname, 'users.json');

if (!fs.existsSync(uploadFolder)) fs.mkdirSync(uploadFolder);
app.use('/uploads', express.static(uploadFolder));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// --- DATABASE HELPERS ---
function getListingsFromFile() {
    if (!fs.existsSync(dbFilePath)) return [];
    return JSON.parse(fs.readFileSync(dbFilePath, 'utf8'));
}
function saveListingsToFile(listings) {
    fs.writeFileSync(dbFilePath, JSON.stringify(listings, null, 2), 'utf8');
}
function getUsersFromFile() {
    if (!fs.existsSync(usersFilePath)) return [];
    return JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
}
function saveUsersToFile(users) {
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2), 'utf8');
}

// --- AUTHENTICATION MIDDLEWARE ---
// This acts as a security guard to check if a valid user token is attached to the request
const protect = (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }
    if (!token) {
        return res.status(401).json({ success: false, error: 'Not authorized. Please log in first.' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Contains userId and phone number
        next();
    } catch (err) {
        return res.status(401).json({ success: false, error: 'Session expired or invalid token.' });
    }
};

// --- AUTH ENDPOINTS ---

// 1. User Registration
app.post('/api/auth/register', async (req, res) => {
    const { phone, name, password } = req.body;
    if (!phone || !name || !password) {
        return res.status(400).json({ success: false, error: 'Please provide name, phone, and password.' });
    }

    const cleanPhone = phone.replace(/\s+/g, '');
    const users = getUsersFromFile();

    // Check if user already exists
    if (users.some(u => u.phone === cleanPhone)) {
        return res.status(400).json({ success: false, error: 'An account with this phone number already exists.' });
    }

    // Securely hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = { id: Date.now(), name, phone: cleanPhone, password: hashedPassword };
    users.push(newUser);
    saveUsersToFile(users);

    // Issue JWT Token immediately
    const token = jwt.sign({ userId: newUser.id, phone: newUser.phone, name: newUser.name }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ success: true, token, user: { name: newUser.name, phone: newUser.phone } });
});

// 2. User Login
app.post('/api/auth/login', async (req, res) => {
    const { phone, password } = req.body;
    if (!phone || !password) {
        return res.status(400).json({ success: false, error: 'Please fill in all inputs.' });
    }

    const cleanPhone = phone.replace(/\s+/g, '');
    const users = getUsersFromFile();
    const user = users.find(u => u.phone === cleanPhone);

    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ success: false, error: 'Invalid login details.' });
    }

    const token = jwt.sign({ userId: user.id, phone: user.phone, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    res.status(200).json({ success: true, token, user: { name: user.name, phone: user.phone } });
});


// --- MARKET ENDPOINTS ---

// 3. GET: Publicly fetch listings
app.get('/api/listings', (req, res) => {
    let allListings = getListingsFromFile();
    const { search, location } = req.query;

    if (search) {
        const query = search.toLowerCase().trim();
        allListings = allListings.filter(item => 
            item.name.toLowerCase().includes(query) || item.category.toLowerCase().includes(query)
        );
    }
    if (location && location !== 'all') {
        allListings = allListings.filter(item => item.location.toLowerCase() === location.toLowerCase().trim());
    }

    res.status(200).json({ success: true, count: allListings.length, data: allListings });
});

// 4. POST: Add listing (PROTECTED - Requires Login)
app.post('/api/listings', protect, upload.single('image'), (req, res) => {
    const { category, name, quantity, location, readyDate, price, unit } = req.body;

    if (!category || !name || !quantity || !location || !price || !unit) {
        return res.status(400).json({ success: false, error: 'Missing core listing data.' });
    }

    let imageUrl = 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=500&q=80';
    if (req.file) imageUrl = `http://localhost:5000/uploads/${req.file.filename}`;

    const currentListings = getListingsFromFile();

    const newListing = {
        id: Date.now(),
        userId: req.user.userId, // Securely track which farmer owns this item
        category,
        name,
        quantity,
        location: location.toLowerCase().trim(),
        readyDate: readyDate || 'Ready Now',
        price: Number(price),
        unit,
        phone: req.user.phone, // Auto-inject the logged-in user's contact number
        image: imageUrl
    };

    currentListings.unshift(newListing);
    saveListingsToFile(currentListings);

    res.status(201).json({ success: true, data: newListing });
});

// 5. DELETE: Remove listing (PROTECTED - Owner Only Verification)
app.delete('/api/listings/:id', protect, (req, res) => {
    const listingId = Number(req.params.id);
    const currentListings = getListingsFromFile();

    const targetItem = currentListings.find(item => item.id === listingId);
    if (!targetItem) return res.status(404).json({ success: false, error: 'Listing not found.' });

    // Enforce matching owner verification rules
    if (targetItem.userId !== req.user.userId) {
        return res.status(403).json({ success: false, error: 'Access denied. You can only delete your own posts!' });
    }

    const updatedListings = currentListings.filter(item => item.id !== listingId);
    saveListingsToFile(updatedListings);

    res.status(200).json({ success: true, message: 'Item deleted safely.' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🟢 Secure Auth Server running on port ${PORT}`));