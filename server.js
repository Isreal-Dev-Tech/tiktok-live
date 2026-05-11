const { TikTokLive } = require('@tiktool/live');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const TIKTOOL_API_KEY = "tk_91ec88c2870958d10d58fbcfe4e73840d018705e201a96c1"; 
const TARGET_USERNAME = "jimsbel"; 

app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Configuration for the race
const POINTS_PER_LAP = 150; // Upgraded to 150 points

let giftComboTracker = {};
let rawConfig = JSON.parse(fs.readFileSync('./config.json'));
let countriesList = rawConfig.countries.map(c => ({
    ...c,
    score: c.score || 0,
    laps: Math.floor((c.score || 0) / POINTS_PER_LAP),
    currentPos: (c.score || 0) % POINTS_PER_LAP
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
    const trackingId = `${data.userId}_${data.giftName}`;
    let newGiftsCount = 0;

    if (data.repeatEnd) {
        newGiftsCount = data.repeatCount - (giftComboTracker[trackingId] || 0);
        delete giftComboTracker[trackingId];
    } else {
        newGiftsCount = data.repeatCount - (giftComboTracker[trackingId] || 0);
        giftComboTracker[trackingId] = data.repeatCount;
    }

    if (newGiftsCount <= 0) return;

    let country = countriesList.find(c => 
        c.gift.toLowerCase() === data.giftName.toLowerCase()
    );
    
    if (country) {
        // Console log for tracking gifts in terminal
        console.log(`🎁 ${data.nickname} sent ${newGiftsCount}x ${data.giftName} for ${country.name}`);

        country.score += newGiftsCount;
        country.laps = Math.floor(country.score / POINTS_PER_LAP);
        
        // Calculate position based on 150 points
        country.currentPos = ((country.score % POINTS_PER_LAP) / POINTS_PER_LAP) * 85; 

        countriesList.sort((a, b) => b.score - a.score);

        // Sending specific objects instead of the whole list to fix "undefined"
        io.emit('updateRace', {
            allCountries: countriesList,
            winner: countriesList || null,
            second: countriesList || null,
            third: countriesList || null,
            lastGiftedId: country.id,
            lastGiftIcon: country.giftIcon
        });
    }
});

tiktok.on('connected', () => console.log(`✅ Connected to Live: ${TARGET_USERNAME}`));
tiktok.on('error', (err) => console.error('❌ TikTok Error:', err));

tiktok.connect();

io.on('connection', (socket) => {
    socket.emit('updateRace', {
        allCountries: countriesList,
        winner: countriesList || null,
        second: countriesList || null,
        third: countriesList || null
    });
});

server.listen(3000, () => console.log(`🚀 Server running on http://localhost:3000`));
