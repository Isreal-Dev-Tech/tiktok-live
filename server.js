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
const TIKTOOL_API_KEY = "tk_91ec88c2870958d10d58fbcfe4e73840d018705e201a96c1"; // PASTE YOUR KEY HERE
const TARGET_USERNAME = ""; 

app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

let config = JSON.parse(fs.readFileSync('./config.json'));
config.countries = config.countries.map(c => ({
    ...c,
    score: c.score || 0,
    laps: Math.floor((c.score || 0) / 100),
    currentPos: (c.score || 0) % 100
}));

// --- TIKTOK CONNECTION ---
const tiktok = new TikTokLive({
    uniqueId: TARGET_USERNAME,
    apiKey: TIKTOOL_API_KEY,
    autoReconnect: true
});

tiktok.on('connected', () => console.log(`✅ Connected to ${TARGET_USERNAME}`));
tiktok.on('error', (err) => console.error("❌ Connection Error:", err.message));

tiktok.on('gift', (data) => {
    console.log(`🎁 Gift: ${data.giftName} x${data.repeatCount}`);

    // Match gift name (Case-Insensitive)
    let country = config.countries.find(c => 
        c.gift.toLowerCase() === data.giftName.toLowerCase()
    );
    
    if (country) {
        country.score += data.repeatCount;
        country.laps = Math.floor(country.score / 100);
        country.currentPos = country.score % 100;
        config.countries.sort((a, b) => b.score - a.score);

        io.emit('updateRace', {
            countries: config.countries,
            lastGiftedId: country.id,
            giftIcon: country.giftIcon
        });
    }
});

tiktok.connect();

io.on('connection', (socket) => socket.emit('updateRace', { countries: config.countries }));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server on http://localhost:${PORT}`));
