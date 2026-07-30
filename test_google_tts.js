const http = require('https');

function testGoogleTTS() {
    const text = encodeURIComponent('Hello, I am Trillion. Welcome to Mathify!');
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&q=${text}&tl=en`;

    console.log('Testing Google Free TTS endpoint...');
    http.get(url, (res) => {
        console.log('Status code:', res.statusCode);
        console.log('Content-Type:', res.headers['content-type']);
        let data = [];
        res.on('data', chunk => data.push(chunk));
        res.on('end', () => {
            const buf = Buffer.concat(data);
            console.log('Audio Bytes Received:', buf.length);
        });
    }).on('error', (e) => {
        console.error('Error:', e.message);
    });
}

testGoogleTTS();
