const { WebcastPushConnection } = require('tiktok-live-connector');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let config = JSON.parse(fs.readFileSync('./config.json'));

config.countries = config.countries.map(c => ({
    ...c,
    score: c.score || 0,
    laps: Math.floor((c.score || 0) / 100),
    currentPos: (c.score || 0) % 100
}));

let tiktokUsername = "justplayingofficial"; 
let tiktokConn = new WebcastPushConnection(tiktokUsername);

tiktokConn.connect().then(state => {
    console.log(`Connected to ${state.roomId}`);
}).catch(err => console.error("TikTok Connection Failed", err));

tiktokConn.on('gift', (data) => {
    let country = config.countries.find(c => c.gift === data.giftName);
    
    if (country) {
        country.score += data.repeatCount;
        country.laps = Math.floor(country.score / 100);
        country.currentPos = country.score % 100;

        // Sort: Leader is always index
        config.countries.sort((a, b) => b.score - a.score);

        // We send 'lastGiftedId' so the HTML knows which GIF to 'hit' with the rose
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
    
