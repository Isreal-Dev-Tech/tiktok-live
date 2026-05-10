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

// Store combo history to prevent "cheating" / double counting
let giftComboTracker = {};

// Load Data
let rawConfig = JSON.parse(fs.readFileSync('./config.json'));
let countriesList = rawConfig.countries.map(c => ({
    ...c,
    score: c.score || 0,
    laps: Math.floor((c.score || 0) / 100),
    currentPos: (c.score || 0) % 100
}));

const tiktok = new TikTokLive({
    uniqueId: TARGET_USERNAME,
    apiKey: TIKTOOL_API_KEY,
    autoReconnect: true,
    signServerUrl: "https://api.tik.tools",
    clientParams: {
        "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    }
});

tiktok.on('gift', (data) => {
    // 1. COMBO LOGIC: Prevent 1+2+3... calculation error
    // We identify a unique gift session by User + Gift Name
    const trackingId = `${data.userId}_${data.giftName}`;
    let newGiftsCount = 0;

    if (data.repeatEnd) {
        // If the combo is finished, we see how many were sent in total minus what we already counted
        newGiftsCount = data.repeatCount - (giftComboTracker[trackingId] || 0);
        delete giftComboTracker[trackingId]; // Clear memory
    } else {
        // During the combo, we only add the difference
        newGiftsCount = data.repeatCount - (giftComboTracker[trackingId] || 0);
        giftComboTracker[trackingId] = data.repeatCount;
    }

    if (newGiftsCount <= 0) return; // Skip if no new gifts in this update

    let country = countriesList.find(c => 
        c.gift.toLowerCase() === data.giftName.toLowerCase()
    );
    
    if (country) {
        console.log(`🎁 ${data.nickname} sent ${newGiftsCount} ${data.giftName} for ${country.name}`);

        country.score += newGiftsCount;
        
        // 2. FINISH LINE LOGIC: Reset at 100 points
        country.laps = Math.floor(country.score / 100);
        
        // currentPos logic: 0 to 90 (90 is the finish line before it resets)
        country.currentPos = (country.score % 100) * 0.9; 
        
        // Sort: Leader always at index 0
        countriesList.sort((a, b) => b.score - a.score);

        io.emit('updateRace', {
            allCountries: countriesList,
            winner: countriesList, // Explicitly send the leader
            lastGiftedId: country.id,
            lastGiftIcon: country.giftIcon
        });
    }
});

tiktok.on('connected', () => console.log(`✅ Live: ${TARGET_USERNAME}`));
tiktok.connect();

io.on('connection', (socket) => {
    socket.emit('updateRace', {
        allCountries: countriesList,
        winner: countriesList
    });
});

server.listen(3000, () => console.log(`🚀 Server on http://localhost:3000`));
