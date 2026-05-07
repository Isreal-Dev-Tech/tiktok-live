const { WebcastPushConnection } = require('tiktok-live-connector');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Load your JSON config
let config = JSON.parse(fs.readFileSync('./config.json'));

let tiktokUsername = "big_shaxxy"; // Change this
let tiktokConn = new WebcastPushConnection(tiktokUsername);

const path = require('path');

// This tells the server to send your index.html file to the browser
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

tiktokConn.connect().then(state => {
    console.log(`Connected to ${state.roomId}`);
}).catch(err => console.error("Connection Failed", err));

tiktokConn.on('gift', (data) => {
    // Find if the gift matches a country in our JSON
    let country = config.countries.find(c => c.gift === data.giftName);
    
    if (country) {
        country.score += data.repeatCount; // Add points based on gift count
        // Sort by score to get the leaderboard
        config.countries.sort((a, b) => b.score - a.score);
        io.emit('updateRace', config.countries);
    }
});

server.listen(3000, () => console.log('Race Running on Port 3000'));
