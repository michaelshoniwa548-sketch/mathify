const http = require('http');

async function testQuizEval() {
    const postData = JSON.stringify({
        questions: [
            { id: 1, question: "Solve $2x + 3 = 7$" },
            { id: 2, question: "Factorize $x^2 - 9$" }
        ],
        userAnswers: {
            "1": "x = 2",
            "2": "(x-3)(x+3)"
        }
    });

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
        console.log(`STATUS: ${res.statusCode}`);
        let output = '';
        res.on('data', chunk => output += chunk);
        res.on('end', () => {
            console.log('--- EVALUATION RESULT ---');
            console.log(output);
            console.log('-------------------------');
            console.log('Contains "Marks Awarded"?:', output.includes('Marks Awarded'));
        });
    });

    req.on('error', (e) => console.error('Error:', e.message));
    req.write(postData);
    req.end();
}

testQuizEval();
