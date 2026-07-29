require('dotenv').config();
const { synthesizeSpeech } = require('./services/audioService');

async function run() {
    console.log('Testing synthesizeSpeech...');
    try {
        const wavBuf = await synthesizeSpeech('Hello! I am Trillion, your voice assistant.');
        console.log('WAV Buffer Length:', wavBuf ? wavBuf.length : 0);
    } catch (e) {
        console.error('Error in synthesizeSpeech:', e);
    }
}

run();
