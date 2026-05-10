const { WebcastPushConnection } = require('tiktok-live-connector');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Load and Initialize Config
let config = JSON.parse(fs.readFileSync('./config.json'));

config.countries = config.countries.map(c => ({
    ...c,
    score: c.score || 0,
    laps: Math.floor((c.score || 0) / 100),
    currentPos: (c.score || 0) % 100
}));

// TikTok Connection
let tiktokUsername = "justplayingofficial"; 
let tiktokConn = new WebcastPushConnection(tiktokUsername);

tiktokConn.connect().then(state => {
    console.log(`Connected to Room: ${state.roomId}`);
}).catch(err => console.error("TikTok Connection Failed", err));

// Gift Listener
tiktokConn.on('gift', (data) => {
    // Debugging: This helps you see the real name in Render logs
    console.log(`Gift Received: ${data.giftName} (Count: ${data.repeatCount})`);

    // Match gift name (Case-Insensitive to avoid errors with "Rose" vs "rose")
    let country = config.countries.find(c => 
        c.gift.toLowerCase() === data.giftName.toLowerCase()
    );
    
    if (country) {
        // Update physics/movement
        country.score += data.repeatCount;
        country.laps = Math.floor(country.score / 100);
        country.currentPos = country.score % 100;

        // Sort so highest score is first for the top-box UI
        config.countries.sort((a, b) => b.score - a.score);

        // Send data to index.html for the 'hit' animation
        io.emit('updateRace', {
            countries: config.countries,
            lastGiftedId: country.id,
            giftIcon: country.giftIcon,
            amount: data.repeatCount
        });
    }
});

io.on('connection', (socket) => {
    socket.emit('updateRace', { countries: config.countries });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Race Running on Port ${PORT}`));
