const { TikTokLive } = require('@tiktool/live');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ===============================
// SETTINGS
// ===============================
const TIKTOOL_API_KEY = "tk_91ec88c2870958d10d58fbcfe4e73840d018705e201a96c1";
const TARGET_USERNAME = ""; // Enter username here
const POINTS_PER_LAP = 50;
const configPath = path.join(__dirname, 'config.json');

app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ===============================
// 1. LOAD CONFIG
// ===============================
let countriesList = [];
try {
    if (!fs.existsSync(configPath)) throw new Error("config.json NOT FOUND!");
    const rawConfig = JSON.parse(fs.readFileSync(configPath));
    countriesList = rawConfig.countries.map(c => ({
        ...c,
        score: 0,
        currentPos: 0
    }));
    console.log(`✅ Config Loaded: ${countriesList.length} countries ready.`);
} catch (err) {
    console.error("❌ STARTUP ERROR:", err.message);
    process.exit(1);
}

let giftComboTracker = {};

// ===============================
// 2. TIKTOK LIVE CONNECTION
// ===============================
const tiktok = new TikTokLive({
    uniqueId: TARGET_USERNAME,
    apiKey: TIKTOOL_API_KEY,
    autoReconnect: true,
    signServerUrl: "https://api.tik.tools"
});

tiktok.on('gift', (data) => {
    try {
        if (!data) return;
        
        const trackingId = `${data.userId}_${data.giftName}`;
        let countToProcess = 0;

        if (data.repeatEnd) {
            countToProcess = data.repeatCount - (giftComboTracker[trackingId] || 0);
            delete giftComboTracker[trackingId];
        } else {
            countToProcess = data.repeatCount - (giftComboTracker[trackingId] || 0);
            giftComboTracker[trackingId] = data.repeatCount;
        }

        if (countToProcess <= 0) return;

        const senderName = data.uniqueId || "User";
        const country = countriesList.find(c => c.gift.toLowerCase() === data.giftName.toLowerCase());

        if (!country) return;

        // Process movement
        country.score += countToProcess;
        
        // Reset lap internally if they pass the points limit (optional movement logic)
        country.currentPos = ((country.score % POINTS_PER_LAP) / POINTS_PER_LAP) * 80;

        console.log(`🎁 [GIFT] ${senderName} -> ${countToProcess}x ${data.giftName} (${country.name})`);

        // Sort only for the lane positions (1 to 20)
        const sortedRace = [...countriesList].sort((a, b) => b.score - a.score);

        // EMIT ONLY THE RACE DATA
        io.emit('updateRace', {
            allCountries: sortedRace,
            lastGiftedId: country.id,
            lastGiftAmount: countToProcess,
            senderName: senderName
        });

    } catch (err) {
        console.error("❌ GIFT PROCESSING ERROR:", err);
    }
});

tiktok.on('connected', () => console.log(`✅ Connected: ${TARGET_USERNAME}`));
tiktok.on('disconnected', () => console.log("⚠️ Disconnected!"));
tiktok.on('error', (err) => console.error("❌ TIKTOK ERROR:", err));

try { tiktok.connect(); } catch (err) {}

io.on('connection', (socket) => {
    socket.emit('updateRace', {
        allCountries: countriesList.sort((a, b) => b.score - a.score)
    });
});

server.listen(3000, () => {
    console.log("🚀 SERVER RUNNING AT http://localhost:3000");
});
