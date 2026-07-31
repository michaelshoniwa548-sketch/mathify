const http = require('http');

async function testBatchEval() {
    const questions = [];
    const userAnswers = {};
    for (let i = 1; i <= 25; i++) {
        questions.push({ id: i, question: `Question ${i}: Solve $2x + ${i} = ${i * 5}$` });
        userAnswers[i] = `x = ${2 * i}`;
    }

    const postData = JSON.stringify({ questions, userAnswers });

    const options = {
        hostname: 'localhost',
        port: 3002,
        path: '/api/quiz/evaluate',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const req = http.request(options, (res) => {
        let output = '';
        res.on('data', chunk => output += chunk);
        res.on('end', () => {
            console.log('Total Output Characters:', output.length);
            console.log('SAMPLE OUTPUT (first 800 chars):\n', output.slice(0, 800));
            console.log('SAMPLE OUTPUT (last 800 chars):\n', output.slice(-800));
        });
    });

    req.on('error', (e) => console.error('Error:', e.message));
    req.write(postData);
    req.end();
}

testBatchEval();
