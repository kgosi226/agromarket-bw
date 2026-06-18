// test-db.js
const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("SUCCESS! Database connection is working.");
        process.exit();
    })
    .catch(err => {
        console.error("FAILED! Error details:");
        console.error(err);
    });