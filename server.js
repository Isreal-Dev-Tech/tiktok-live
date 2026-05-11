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
const TARGET_USERNAME = "q24gzn4"; 

app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const POINTS_PER_LAP = 150; // Set to 150 points as discussed
const recordsPath = path.join(__dirname, 'records.json');

// Initialize records.json if it doesn't exist
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

    // FIX FOR UNDEFINED: Use data.uniqueId or data.nickname
    const senderName = data.uniqueId || data.nickname || "User";

    let country = countriesList.find(c => 
        c.gift.toLowerCase() === data.giftName.toLowerCase()
    );
    
    if (country) {
        console.log(`🎁 [GIFT] ${senderName} sent ${data.giftName} x${countToProcess} for ${country.name}`);

        let oldLaps = Math.floor(country.score / POINTS_PER_LAP);
        country.score += countToProcess;
        let newLaps = Math.floor(country.score / POINTS_PER_LAP);
        
        // CHECK IF FINISHED A LAP
        if (newLaps > oldLaps) {
            let records = JSON.parse(fs.readFileSync(recordsPath));
            // Add this win to the top of the history
            records.winners.unshift({
                name: country.name,
                flag: country.flag,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            });
            // Keep only the last 10 winners in the file
            records.winners = records.winners.slice(0, 10);
            fs.writeFileSync(recordsPath, JSON.stringify(records, null, 2));
        }

        country.currentPos = ((country.score % POINTS_PER_LAP) / POINTS_PER_LAP) * 80; 

        // Load winners for the podium
        let recordsData = JSON.parse(fs.readFileSync(recordsPath));

        io.emit('updateRace', {
            allCountries: countriesList,
            winner: recordsData.winners || null, // 1st Place from file
            second: recordsData.winners || null, // 2nd Place from file
            third: recordsData.winners || null,  // 3rd Place from file
            lastGiftedId: country.id,
            lastGiftAmount: countToProcess,
            senderName: senderName // Sending username to HTML
        });
    }
});

tiktok.on('connected', () => console.log(`✅ Connected to: ${TARGET_USERNAME}`));
tiktok.connect();

io.on('connection', (socket) => {
    let recordsData = JSON.parse(fs.readFileSync(recordsPath));
    socket.emit('updateRace', {
        allCountries: countriesList,
        winner: recordsData.winners || null,
        second: recordsData.winners || null,
        third: recordsData.winners || null
    });
});

server.listen(3000, () => console.log(`🚀 Server on http://localhost:3000`));
