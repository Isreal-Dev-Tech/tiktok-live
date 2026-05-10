const { WebcastPushConnection } = require('tiktok-live-connector');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the "assets" folder
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Serve the index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Load Config
let config = JSON.parse(fs.readFileSync('./config.json'));

// Initialize N (laps) and currentLapScore for each country if not present
config.countries = config.countries.map(c => ({
    ...c,
    score: c.score || 0, // Total lifetime points
    laps: Math.floor((c.score || 0) / 100), // Number of times reached 100 (N)
    currentPos: (c.score || 0) % 100 // Position on the 1-100 track
}));

let tiktokUsername = "YOUR_TIKTOK_USERNAME"; 
let tiktokConn = new WebcastPushConnection(tiktokUsername);

tiktokConn.connect().then(state => {
    console.log(`Connected to ${state.roomId}`);
}).catch(err => console.error("TikTok Connection Failed", err));

tiktokConn.on('gift', (data) => {
    // Each gift (like a Rose) counts as 1 point
    let country = config.countries.find(c => c.gift === data.giftName);
    
    if (country) {
        // 1. Update total score
        country.score += data.repeatCount;
        
        // 2. Calculate N (Laps) and current position (1-100)
        country.laps = Math.floor(country.score / 100);
        country.currentPos = country.score % 100;

        // 3. Sort by total score (Highest score = 1st Place)
        // This ensures the country with the most laps/points is always at index
        config.countries.sort((a, b) => b.score - a.score);

        // 4. Send updated data to the frontend
        io.emit('updateRace', config.countries);
    }
});

// Send initial data when phone connects
io.on('connection', (socket) => {
    socket.emit('updateRace', config.countries);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Race Running on Port ${PORT}`));
