const { TikTokLive } = require('@tiktool/live');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- CONFIGURATION ---
const TIKTOOL_API_KEY = "tk_91ec88c2870958d10d58fbcfe4e73840d018705e201a96c1"; 
const TARGET_USERNAME = "bunko353"; // Updated to match your previous logs

app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Load initial configuration
let config = JSON.parse(fs.readFileSync('./config.json'));
config.countries = config.countries.map(c => ({
    ...c,
    score: c.score || 0,
    laps: Math.floor((c.score || 0) / 100),
    currentPos: (c.score || 0) % 100
}));

// --- TIKTOK CONNECTION ---
const tiktok = new TikTokLive({
    uniqueId: TARGET_USERNAME,
    apiKey: TIKTOOL_API_KEY,
    autoReconnect: true,
    // We leave sessionId out and force the use of th>
    signServerUrl: "https://api.tik.tools",
    clientParams: {
        "user_agent": "Mozilla/5.0 (Windows NT 10.0; >
    }
});

tiktok.on('connected', () => {
    console.log(`✅ SUCCESS: Connected to ${TARGET_USERNAME}`);
    console.log("Nigeria is ready to move!");
});

tiktok.on('error', (err) => {
    console.error("❌ Connection Error:", err.message);
    if (err.message.includes("session cookie")) {
        console.log("👉 Tip: Try logging out and back in on your browser to refresh the session.");
    }
});

tiktok.on('gift', (data) => {
    console.log(`🎁 Gift: ${data.giftName} x${data.repeatCount}`);

    // Match gift name (Case-Insensitive)
    let country = config.countries.find(c => 
        c.gift.toLowerCase() === data.giftName.toLowerCase()
    );
    
    if (country) {
        // Move the runner based on gift count
        country.score += data.repeatCount;
        country.laps = Math.floor(country.score / 100);
        country.currentPos = country.score % 100;
        
        // Update the leaderboard ranking
        config.countries.sort((a, b) => b.score - a.score);

        // Send movement to the HTML page
        io.emit('updateRace', {
            countries: config.countries,
            lastGiftedId: country.id,
            giftIcon: country.giftIcon
        });
    }
});

tiktok.connect();

io.on('connection', (socket) => {
    socket.emit('updateRace', { countries: config.countries });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Race Server running on http://localhost:${PORT}`);
    console.log(`Streaming live data for: ${TARGET_USERNAME}`);
});
