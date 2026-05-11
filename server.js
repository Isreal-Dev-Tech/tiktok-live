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
const TARGET_USERNAME = ""; // Ensure this is correct
const POINTS_PER_LAP = 50;
const recordsPath = path.join(__dirname, 'records.json');
const configPath = path.join(__dirname, 'config.json');

app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ===============================
// 1. DIAGNOSTIC FILE CHECK
// ===============================
function ensureRecordsFile() {
    try {
        if (!fs.existsSync(recordsPath)) {
            console.log("📁 Creating missing records.json...");
            fs.writeFileSync(recordsPath, JSON.stringify({ winners: [] }, null, 2));
        }
        let raw = fs.readFileSync(recordsPath, 'utf8');
        let data = JSON.parse(raw || '{"winners":[]}');
        if (!data.winners) data.winners = [];
        return data;
    } catch (err) {
        console.error("❌ CRITICAL ERROR: records.json is corrupted!", err.message);
        const fresh = { winners: [] };
        fs.writeFileSync(recordsPath, JSON.stringify(fresh, null, 2));
        return fresh;
    }
}

// ===============================
// 2. LOAD CONFIG WITH ERROR HANDLING
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
    console.error("❌ STARTUP ERROR: Failed to load config.json!", err.message);
    process.exit(1); // Stop the server if config is broken
}

let giftComboTracker = {};

// ===============================
// 3. LEADERBOARD LOGIC
// ===============================
function getLeaderboard() {
    try {
        const data = ensureRecordsFile();
        const winCounts = {};

        data.winners.forEach((w) => {
            if (!winCounts[w.name]) {
                winCounts[w.name] = {
                    name: w.name, flag: w.flag, wins: 0,
                    firstTimestamp: w.timestamp || Date.now()
                };
            }
            winCounts[w.name].wins += 1;
        });

        return Object.values(winCounts).sort((a, b) => {
            if (b.wins !== a.wins) return b.wins - a.wins;
            return a.firstTimestamp - b.firstTimestamp;
        });
    } catch (err) {
        console.error("❌ LEADERBOARD CALCULATION ERROR:", err.message);
        return [];
    }
}

// ===============================
// 4. TIKTOK LIVE CONNECTION
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

        const senderName = data.uniqueId || (data.user && data.user.uniqueId) || "User";
        const country = countriesList.find(c => c.gift.toLowerCase() === data.giftName.toLowerCase());

        if (!country) {
            console.log(`⚠️ Unmapped Gift: ${data.giftName} from ${senderName}`);
            return;
        }

        console.log(`🎁 [GIFT] ${senderName} -> ${countToProcess}x ${data.giftName} (${country.name})`);

        const oldLaps = Math.floor(country.score / POINTS_PER_LAP);
        country.score += countToProcess;
        const newLaps = Math.floor(country.score / POINTS_PER_LAP);

        if (newLaps > oldLaps) {
            const records = ensureRecordsFile();
            records.winners.push({ name: country.name, flag: country.flag, timestamp: Date.now() });
            fs.writeFileSync(recordsPath, JSON.stringify(records, null, 2));
            console.log(`🏆 [WIN] ${country.name} finished a lap!`);
        }

        country.currentPos = ((country.score % POINTS_PER_LAP) / POINTS_PER_LAP) * 80;
        countriesList.sort((a, b) => b.score - a.score);

        const leaders = getLeaderboard();

        // 5. DIAGNOSTIC EMISSION
        io.emit('updateRace', {
            allCountries: countriesList,
            winner: leaders || null,
            second: leaders || null,
            third: leaders || null,
            lastGiftedId: country.id,
            lastGiftAmount: countToProcess,
            senderName: senderName
        });

    } catch (err) {
        console.error("❌ ERROR DURING GIFT PROCESSING:", err);
    }
});

// TikTok Status Logs
tiktok.on('connected', () => console.log(`✅ SUCCESS: Connected to TikTok User: ${TARGET_USERNAME}`));
tiktok.on('disconnected', () => console.log("⚠️ WARNING: TikTok Disconnected!"));
tiktok.on('error', (err) => console.error("❌ TIKTOK SDK ERROR:", err));

try {
    tiktok.connect();
} catch (err) {
    console.error("❌ FAILED TO INITIATE TIKTOK CONNECTION:", err.message);
}

// Socket Connection Logs
io.on('connection', (socket) => {
    try {
        const leaders = getLeaderboard();
        socket.emit('updateRace', {
            allCountries: countriesList,
            winner: leaders || null,
            second: leaders || null,
            third: leaders || null
        });
        console.log(`🟢 Browser connected (Total Clients: ${io.engine.clientsCount})`);
    } catch (err) {
        console.error("❌ SOCKET INITIAL LOAD ERROR:", err.message);
    }
});

server.listen(3000, () => {
    console.log("------------------------------------------");
    console.log("🚀 RACE SERVER RUNNING AT http://localhost:3000");
    console.log("------------------------------------------");
});
                                   
