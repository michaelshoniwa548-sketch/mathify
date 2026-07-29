const http = require('http');

async function testTurn() {
    const postData = JSON.stringify({ text: 'What is a quadratic equation?' });

    const options = {
        hostname: 'localhost',
        port: 3002,
        path: '/api/trillion/turn',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const req = http.request(options, (res) => {
        console.log(`STATUS: ${res.statusCode}`);
        console.log(`HEADERS: ${JSON.stringify(res.headers)}`);

        res.setEncoding('utf8');
        res.on('data', (chunk) => {
            console.log(`BODY: ${chunk.slice(0, 100)}`);
        });
        res.on('end', () => {
            console.log('No more data in response.');
        });
    });

    req.on('error', (e) => {
        console.error(`problem with request: ${e.message}`);
    });

    req.write(postData);
    req.end();
}

testTurn();
