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
const TARGET_USERNAME = ""; // your TikTok username

const POINTS_PER_LAP = 50;

const recordsPath =
path.join(__dirname, 'records.json');

// ===============================
// EXPRESS
// ===============================

app.use(
    '/assets',
    express.static(path.join(__dirname, 'assets'))
);

app.get('/', (req, res) => {

    res.sendFile(
        path.join(__dirname, 'index.html')
    );
});

// ===============================
// CREATE RECORDS FILE
// ===============================

if (!fs.existsSync(recordsPath)) {

    fs.writeFileSync(
        recordsPath,
        JSON.stringify({ winners: [] }, null, 2)
    );
}

// ===============================
// SAFE RECORDS FIX
// ===============================

function ensureRecordsFile() {

    try {

        // Missing file
        if (!fs.existsSync(recordsPath)) {

            fs.writeFileSync(
                recordsPath,
                JSON.stringify({ winners: [] }, null, 2)
            );
        }

        let raw =
        fs.readFileSync(recordsPath, 'utf8');

        // Empty file
        if (!raw || raw.trim() === '') {

            raw =
            JSON.stringify({ winners: [] });

            fs.writeFileSync(recordsPath, raw);
        }

        let data =
        JSON.parse(raw);

        // Missing winners array
        if (!data.winners ||
            !Array.isArray(data.winners)) {

            data.winners = [];

            fs.writeFileSync(
                recordsPath,
                JSON.stringify(data, null, 2)
            );
        }

        return data;

    } catch (err) {

        console.log("⚠️ Fixing records.json");

        const fresh = { winners: [] };

        fs.writeFileSync(
            recordsPath,
            JSON.stringify(fresh, null, 2)
        );

        return fresh;
    }
}

// ===============================
// LOAD COUNTRIES
// ===============================

const rawConfig =
JSON.parse(fs.readFileSync('./config.json'));

let countriesList =
rawConfig.countries.map(c => ({
    ...c,
    score: c.score || 0,
    currentPos: 0
}));

// ===============================
// GIFT TRACKER
// ===============================

let giftComboTracker = {};

// ===============================
// LEADERBOARD
// ===============================

function getLeaderboard() {

    try {

        const data =
        ensureRecordsFile();

        const winCounts = {};

        data.winners.forEach((w) => {

            if (!winCounts[w.name]) {

                winCounts[w.name] = {

                    name: w.name,
                    flag: w.flag,

                    wins: 0,

                    firstTimestamp:
                    w.timestamp || Date.now()
                };
            }

            winCounts[w.name].wins += 1;
        });

        // SORT
        return Object.values(winCounts)
        .sort((a, b) => {

            // Highest wins first
            if (b.wins !== a.wins) {

                return b.wins - a.wins;
            }

            // Same wins:
            // first to reach stays ahead
            return a.firstTimestamp -
                   b.firstTimestamp;
        });

    } catch (err) {

        console.log(
            "❌ Leaderboard Error:",
            err
        );

        return [];
    }
}

// ===============================
// TIKTOK LIVE
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

    try {

        const trackingId =
        `${data.userId}_${data.giftName}`;

        let countToProcess = 0;

        // ===============================
        // COMBO GIFTS
        // ===============================

        if (data.repeatEnd) {

            countToProcess =
            data.repeatCount -
            (giftComboTracker[trackingId] || 0);

            delete giftComboTracker[trackingId];

        } else {

            countToProcess =
            data.repeatCount -
            (giftComboTracker[trackingId] || 0);

            giftComboTracker[trackingId] =
            data.repeatCount;
        }

        if (countToProcess <= 0) return;

        // ===============================
        // USERNAME
        // ===============================

        const senderName =

            data.uniqueId ||

            (data.user &&
            data.user.uniqueId) ||

            data.nickname ||

            "Gifter";

        // ===============================
        // FIND COUNTRY
        // ===============================

        const country =
        countriesList.find(c =>

            c.gift.toLowerCase() ===
            data.giftName.toLowerCase()
        );

        if (!country) return;

        console.log(
            `🎁 ${senderName} sent ${countToProcess}x ${data.giftName} for ${country.name}`
        );

        // ===============================
        // SCORE
        // ===============================

        const oldLaps =
        Math.floor(
            country.score / POINTS_PER_LAP
        );

        country.score += countToProcess;

        const newLaps =
        Math.floor(
            country.score / POINTS_PER_LAP
        );

        // ===============================
        // FINISH LINE
        // ===============================

        if (newLaps > oldLaps) {

            const records =
            ensureRecordsFile();

            records.winners.push({

                name: country.name,

                flag: country.flag,

                timestamp: Date.now()
            });

            fs.writeFileSync(

                recordsPath,

                JSON.stringify(
                    records,
                    null,
                    2
                )
            );

            console.log(
                `🏆 ${country.name} reached finish line`
            );
        }

        // ===============================
        // POSITION
        // ===============================

        country.currentPos =

        (
            (country.score % POINTS_PER_LAP)
            / POINTS_PER_LAP
        ) * 80;

        // ===============================
        // SORT TRACK
        // ===============================

        countriesList.sort(
            (a, b) => b.score - a.score
        );

        // ===============================
        // LEADERBOARD
        // ===============================

        const leaders =
        getLeaderboard();

        // ===============================
        // SEND TO CLIENT
        // ===============================

        io.emit('updateRace', {

            allCountries:
            countriesList,

            winner:
            leaders[0] || null,

            second:
            leaders[1] || null,

            third:
            leaders[2] || null,

            lastGiftedId:
            country.id,

            lastGiftAmount:
            countToProcess,

            senderName:
            senderName
        });

    } catch (err) {

        console.log(
            "❌ Gift Event Error:",
            err
        );
    }
});

// ===============================
// CONNECTED
// ===============================

tiktok.on('connected', () => {

    console.log(
        `✅ Connected to ${TARGET_USERNAME}`
    );
});

// ===============================
// CONNECT
// ===============================

tiktok.connect();

// ===============================
// SOCKET CONNECTION
// ===============================

io.on('connection', (socket) => {

    const leaders =
    getLeaderboard();

    socket.emit('updateRace', {

        allCountries:
        countriesList,

        winner:
        leaders[0] || null,

        second:
        leaders[1] || null,

        third:
        leaders[2] || null
    });

    console.log(
        "🟢 Browser Connected"
    );
});

// ===============================
// START SERVER
// ===============================

server.listen(3000, () => {

    console.log(
        "🚀 Server running on http://localhost:3000"
    );
});
