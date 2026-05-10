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
const TARGET_USERNAME = "bunko353"; 

app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Load and Clean Initial Data
let rawConfig = JSON.parse(fs.readFileSync('./config.json'));
let countriesList = rawConfig.countries.map(c => ({
    id: c.id,
    name: c.name,
    flag: c.flag,
    gift: c.gift,
    giftIcon: c.giftIcon,
    score: c.score || 0,
    laps: Math.floor((c.score || 0) / 100),
    currentPos: (c.score || 0) % 100
}));

// --- TIKTOK CONNECTION ---
const tiktok = new TikTokLive({
    uniqueId: TARGET_USERNAME,
    apiKey: TIKTOOL_API_KEY,
    autoReconnect: true,
    signServerUrl: "https://api.tik.tools",
    clientParams: {
        "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    }
});

tiktok.on('connected', () => console.log(`✅ SUCCESS: Connected to ${TARGET_USERNAME}`));
tiktok.on('error', (err) => console.error("❌ Connection Error:", err.message));

tiktok.on('gift', (data) => {
    console.log(`🎁 Gift: ${data.giftName} x${data.repeatCount}`);

    let country = countriesList.find(c => 
        c.gift.toLowerCase() === data.giftName.toLowerCase()
    );
    
    if (country) {
        country.score += data.repeatCount;
        country.laps = Math.floor(country.score / 100);
        country.currentPos = country.score % 100;
        
        // Sort for the leaderboard
        countriesList.sort((a, b) => b.score - a.score);

        // Sending a clean object that matches the HTML script
        io.emit('updateRace', {
            allCountries: countriesList,
            winner: countriesList,
            lastGiftedId: country.id,
            lastGiftIcon: country.giftIcon
        });
    }
});

tiktok.connect();

io.on('connection', (socket) => {
    socket.emit('updateRace', {
        allCountries: countriesList,
        winner: countriesList
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Race Server: http://localhost:${PORT}`);
    console.log(`Watching: ${TARGET_USERNAME}`);
});
