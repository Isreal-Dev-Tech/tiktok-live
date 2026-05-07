const { WebcastPushConnection } = require('tiktok-live-connector');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 1. Serve the HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. Load Config
let config = JSON.parse(fs.readFileSync('./config.json'));

// 3. TikTok Connection Logic
let tiktokUsername = "big_shaxxy"; 
let tiktokConn = new WebcastPushConnection(tiktokUsername);

// Connect to TikTok
tiktokConn.connect().then(state => {
    console.log(`Connected to ${state.roomId}`);
}).catch(err => {
    console.log("TikTok Connection Error: ", err.message);
});

// 4. Send data to your phone when you open the site
io.on('connection', (socket) => {
    console.log("Phone connected to website");
    // This sends the countries to your screen IMMEDIATELY
    socket.emit('updateRace', config.countries);
});

// 5. Listen for Gifts
tiktokConn.on('gift', (data) => {
    let country = config.countries.find(c => c.gift === data.giftName);
    if (country) {
        country.score += data.repeatCount;
        config.countries.sort((a, b) => b.score - a.score);
        io.emit('updateRace', config.countries);
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Race Running on Port ${PORT}`));
