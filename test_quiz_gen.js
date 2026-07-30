const http = require('http');

async function testQuizGen() {
    const postData = JSON.stringify({
        topics: ['Algebra', 'Quadratic Equations'],
        difficulty: 'medium',
        count: 3
    });

    const options = {
        hostname: 'localhost',
        port: 3002,
        path: '/api/quiz/generate',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const req = http.request(options, (res) => {
        console.log(`STATUS: ${res.statusCode}`);
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                const parsed = JSON.parse(data);
                console.log('✅ QUIZ GENERATION SUCCESSFUL!');
                console.log('Generated Questions:', JSON.stringify(parsed.quiz, null, 2));
            } catch(e) {
                console.error('❌ RESPONSE PARSE ERROR:', e.message);
                console.log('RAW RESPONSE:', data);
            }
        });
    });

    req.on('error', (e) => console.error('Request error:', e.message));
    req.write(postData);
    req.end();
}

testQuizGen();
