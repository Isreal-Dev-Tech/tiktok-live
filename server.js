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
const TARGET_USERNAME = "jimsbel"; // Put your username here

app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

let giftComboTracker = {};
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
        country.score += newGiftsCount;
        country.laps = Math.floor(country.score / 100);
        country.currentPos = (country.score % 100) * 0.85; 

        // Re-sort based on score
        countriesList.sort((a, b) => b.score - a.score);

        io.emit('updateRace', {
            allCountries: countriesList,
            winner: countriesList,
            second: countriesList,
            third: countriesList,
            lastGiftedId: country.id,
            lastGiftIcon: country.giftIcon
        });
    }
});

tiktok.connect();
io.on('connection', (socket) => {
    socket.emit('updateRace', {
        allCountries: countriesList,
        winner: countriesList,
        second: countriesList,
        third: countriesList
    });
});

server.listen(3000, () => console.log(`🚀 Server on port 3000`));
