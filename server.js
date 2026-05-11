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
const TARGET_USERNAME = ""; 

app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const POINTS_PER_LAP = 150; 
const recordsPath = path.join(__dirname, 'records.json');

if (!fs.existsSync(recordsPath)) {
    fs.writeFileSync(recordsPath, JSON.stringify({ winners: [] }, null, 2));
}

let giftComboTracker = {};
let rawConfig = JSON.parse(fs.readFileSync('./config.json'));
let countriesList = rawConfig.countries.map(c => ({
    ...c,
    score: c.score || 0,
    laps: 0,
    currentPos: 0
}));

// NEW FUNCTION: This calculates the true Top 3 based on TOTAL WINS in the file
function getLeaderboard() {
    try {
        const data = JSON.parse(fs.readFileSync(recordsPath));
        const winCounts = {};

        // Loop through every win ever recorded
        data.winners.forEach(w => {
            if (!winCounts[w.name]) {
                winCounts[w.name] = { name: w.name, flag: w.flag, wins: 0 };
            }
            winCounts[w.name].wins += 1;
        });

        // Sort by most wins and take top 3
        return Object.values(winCounts).sort((a, b) => b.wins - a.wins).slice(0, 3);
    } catch (e) {
        return [];
    }
}

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
    let countToProcess = 0;

    if (data.repeatEnd) {
        countToProcess = data.repeatCount - (giftComboTracker[trackingId] || 0);
        delete giftComboTracker[trackingId];
    } else {
        countToProcess = data.repeatCount - (giftComboTracker[trackingId] || 0);
        giftComboTracker[trackingId] = data.repeatCount;
    }

    if (countToProcess <= 0) return;

    const senderName = data.uniqueId || data.nickname || "User";

    let country = countriesList.find(c => 
        c.gift.toLowerCase() === data.giftName.toLowerCase()
    );
    
    if (country) {
        let oldLaps = Math.floor(country.score / POINTS_PER_LAP);
        country.score += countToProcess;
        let newLaps = Math.floor(country.score / POINTS_PER_LAP);
        
        // RECORD THE WIN WHEN THEY CROSS THE LINE
        if (newLaps > oldLaps) {
            let records = JSON.parse(fs.readFileSync(recordsPath));
            records.winners.push({
                name: country.name,
                flag: country.flag,
                time: new Date().toLocaleTimeString()
            });
            fs.writeFileSync(recordsPath, JSON.stringify(records, null, 2));
            console.log(`🏆 ${country.name} FINISHED A LAP!`);
        }

        country.currentPos = ((country.score % POINTS_PER_LAP) / POINTS_PER_LAP) * 80; 

        // SORT LANES BY SCORE (Morocco moves up)
        countriesList.sort((a, b) => b.score - a.score);

        // GET FRESH TOP 3
        const leaders = getLeaderboard();

        io.emit('updateRace', {
            allCountries: countriesList,
            winner: leaders || null, 
            second: leaders || null, 
            third: leaders || null,  
            lastGiftedId: country.id,
            lastGiftAmount: countToProcess,
            senderName: senderName 
        });
    }
});

tiktok.on('connected', () => console.log(`✅ Connected to: ${TARGET_USERNAME}`));
tiktok.connect();

io.on('connection', (socket) => {
    const leaders = getLeaderboard();
    socket.emit('updateRace', {
        allCountries: countriesList,
        winner: leaders || null,
        second: leaders || null,
        third: leaders || null
    });
});

server.listen(3000, () => console.log(`🚀 Server on http://localhost:3000`));
