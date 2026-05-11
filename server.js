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
const TARGET_USERNAME = ""; // Your TikTok username

app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const POINTS_PER_LAP = 50;
const recordsPath = path.join(__dirname, 'records.json');

// Create records.json if not existing
if (!fs.existsSync(recordsPath)) {
    fs.writeFileSync(recordsPath, JSON.stringify({ winners: [] }, null, 2));
}

let giftComboTracker = {};

// Load countries
let rawConfig = JSON.parse(fs.readFileSync('./config.json'));

let countriesList = rawConfig.countries.map(c => ({
    ...c,
    score: c.score || 0,
    currentPos: 0
}));

// ===============================
// LEADERBOARD SYSTEM
// ===============================
function getLeaderboard() {
    try {
        const data = JSON.parse(fs.readFileSync(recordsPath));

        const winCounts = {};

        data.winners.forEach(w => {

            // First time country appears
            if (!winCounts[w.name]) {
                winCounts[w.name] = {
                    name: w.name,
                    flag: w.flag,
                    wins: 0,
                    firstTimestamp: w.timestamp
                };
            }

            // Add win
            winCounts[w.name].wins += 1;
        });

        // Sort leaderboard
        return Object.values(winCounts).sort((a, b) => {

            // Highest wins first
            if (b.wins !== a.wins) {
                return b.wins - a.wins;
            }

            // If same wins, first to reach stays ahead
            return a.firstTimestamp - b.firstTimestamp;
        });

    } catch (err) {
        console.log("Leaderboard Error:", err);
        return [];
    }
}

// ===============================
// TIKTOK CONNECTION
// ===============================
const tiktok = new TikTokLive({
    uniqueId: TARGET_USERNAME,
    apiKey: TIKTOOL_API_KEY,
    autoReconnect: true,
    signServerUrl: "https://api.tik.tools"
});

// ===============================
// GIFT EVENT
// ===============================
tiktok.on('gift', (data) => {

    const trackingId = `${data.userId}_${data.giftName}`;

    let countToProcess = 0;

    // Combo gift handling
    if (data.repeatEnd) {

        countToProcess =
            data.repeatCount - (giftComboTracker[trackingId] || 0);

        delete giftComboTracker[trackingId];

    } else {

        countToProcess =
            data.repeatCount - (giftComboTracker[trackingId] || 0);

        giftComboTracker[trackingId] = data.repeatCount;
    }

    if (countToProcess <= 0) return;

    // Sender username
    const senderName =
        data.uniqueId ||
        (data.user && data.user.uniqueId) ||
        data.nickname ||
        "Gifter";

    // Find country by gift
    let country = countriesList.find(c =>
        c.gift.toLowerCase() === data.giftName.toLowerCase()
    );

    if (!country) return;

    console.log(
        `🎁 ${senderName} sent ${countToProcess}x ${data.giftName} for ${country.name}`
    );

    // ===============================
    // SCORE UPDATE
    // ===============================
    let oldLaps = Math.floor(country.score / POINTS_PER_LAP);

    country.score += countToProcess;

    let newLaps = Math.floor(country.score / POINTS_PER_LAP);

    // ===============================
    // FINISH LINE REACHED
    // ===============================
    if (newLaps > oldLaps) {

        let records =
            JSON.parse(fs.readFileSync(recordsPath));

        records.winners.push({
            name: country.name,
            flag: country.flag,
            timestamp: Date.now()
        });

        fs.writeFileSync(
            recordsPath,
            JSON.stringify(records, null, 2)
        );

        console.log(`🏆 ${country.name} reached finish line!`);
    }

    // Runner position
    country.currentPos =
        ((country.score % POINTS_PER_LAP) / POINTS_PER_LAP) * 80;

    // Sort race positions
    countriesList.sort((a, b) => b.score - a.score);

    // Get leaderboard
    const leaders = getLeaderboard();

    // ===============================
    // SEND TO FRONTEND
    // ===============================
    io.emit('updateRace', {

        allCountries: countriesList,

        // FIXED PODIUM
        winner: leaders[0] || null,
        second: leaders[1] || null,
        third: leaders[2] || null,

        // Gift effect
        lastGiftedId: country.id,
        lastGiftAmount: countToProcess,
        senderName: senderName
    });
});

// ===============================
// CONNECTED
// ===============================
tiktok.on('connected', () => {
    console.log(`✅ Connected to: ${TARGET_USERNAME}`);
});

tiktok.connect();

// ===============================
// SOCKET CONNECTION
// ===============================
io.on('connection', (socket) => {

    const leaders = getLeaderboard();

    socket.emit('updateRace', {

        allCountries: countriesList,

        winner: leaders[0] || null,
        second: leaders[1] || null,
        third: leaders[2] || null
    });

    console.log("🟢 Browser Connected");
});

// ===============================
// START SERVER
// ===============================
server.listen(3000, () => {
    console.log(`🚀 Server running on http://localhost:3000`);
});
