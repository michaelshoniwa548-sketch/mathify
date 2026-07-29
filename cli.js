const readline = require('readline');
const { chatWithModelStream } = require('./services/agentCore');

// Setup readline interface for CLI interaction
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Short-term memory (in-memory conversation history list)
const conversationHistory = [];

console.log('====================================================');
console.log(' 🤖 Trillion (Tier 1: Brain Text Conversation Loop)');
console.log(' Type "exit" or "quit" to stop.');
console.log('====================================================\n');

function askQuestion() {
    rl.question('You: ', async (input) => {
        const trimmed = input.trim();
        
        if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
            console.log('Trillion: Goodbye!');
            rl.close();
            return;
        }

        if (!trimmed) {
            askQuestion();
            return;
        }

        // 1. Append user's turn to running history
        conversationHistory.push({ role: 'user', parts: [{ text: trimmed }] });

        // 2. Pass history to thin provider seam
        process.stdout.write('Trillion: ');
        const onToolCall = (name, args) => {
            console.log(`\n⚙️  [Tool Call]: ${name}(${JSON.stringify(args)})`);
            process.stdout.write('Trillion: ');
        };

        try {
            const stream = await chatWithModelStream(conversationHistory, onToolCall);
            let fullReply = '';

            // 3. Stream reply as generated
            for await (const chunk of stream) {
                const textChunk = typeof chunk === 'string' ? chunk : (chunk.text || '');
                process.stdout.write(textChunk);
                fullReply += textChunk;
            }
            
            console.log('\n');

            // 4. Append model's reply to history
            conversationHistory.push({ role: 'model', parts: [{ text: fullReply }] });

        } catch (err) {
            console.log(`\nTrillion: Error processing turn - ${err.message}\n`);
        }

        // Wait for next turn
        askQuestion();
    });
}

// Start the loop
askQuestion();
