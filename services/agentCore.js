require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getToolDeclarations, executeTool, getTool } = require('./toolRegistry');
const { checkConfirmationGate } = require('./railsService');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

if (!GEMINI_API_KEY) {
    console.warn('⚠️ Warning: GEMINI_API_KEY is not set in environment variables.');
}

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

const { getMemoryPromptContext } = require('./memoryService');

const SYSTEM_PROMPT = `You are Trillion, a warm, plain-spoken, and brief AI assistant.
Your goal is to assist the user with math tutoring, task management, and daily productivity.
Keep your answers helpful, direct, and concise. Never use overly verbose fluff unless explicitly asked.

When you need information or need to perform an action, select and call the appropriate tool.`;

/**
 * Thin provider seam for streaming conversation turns with tool calling capability.
 * Stateless execution loop ensuring exact alignment of model functionCalls and functionResponses.
 * @param {Array} history - Running conversation turns list
 * @param {Function} [onToolCallNotice] - Optional UI callback when a tool call starts
 * @returns {AsyncGenerator<string>} Stream of text tokens or tool execution notices
 */
async function* chatWithModelStream(history = [], onToolCallNotice = null) {
    if (!genAI) {
        yield "Error: GEMINI_API_KEY is missing. Please check your .env file.";
        return;
    }

    try {
        const toolsConfig = getToolDeclarations();
        const memoryContext = getMemoryPromptContext();
        const fullSystemInstruction = `${SYSTEM_PROMPT}\n\n${memoryContext}`;

        // Broadcast memory recall events to Living Mind map
        try {
            const { loadMemories } = require('./memoryService');
            const { broadcastObserverEvent } = require('../server');
            if (typeof broadcastObserverEvent === 'function') {
                const memories = loadMemories();
                memories.forEach(m => {
                    broadcastObserverEvent({ type: 'memory_recalled', memoryId: m.id });
                });
            }
        } catch(e) {}

        const model = genAI.getGenerativeModel({
            model: MODEL_NAME,
            systemInstruction: fullSystemInstruction,
            tools: [{ functionDeclarations: toolsConfig }],
            generationConfig: {
                maxOutputTokens: 2048
            }
        });

        // Deep copy contents from history to manage function call / function response turns cleanly
        const contents = history.map(turn => ({
            role: turn.role === 'assistant' ? 'model' : turn.role,
            parts: turn.parts ? [...turn.parts] : [{ text: turn.text || '' }]
        }));

        let maxToolLoops = 5;
        while (maxToolLoops > 0) {
            maxToolLoops--;

            const result = await model.generateContentStream({ contents });
            let functionCalls = [];
            let functionCallParts = [];

            for await (const chunk of result.stream) {
                if (chunk.functionCalls) {
                    const calls = chunk.functionCalls();
                    if (calls && calls.length > 0) {
                        functionCalls.push(...calls);
                        if (chunk.candidates && chunk.candidates[0] && chunk.candidates[0].content) {
                            functionCallParts.push(...chunk.candidates[0].content.parts);
                        }
                    }
                }

                try {
                    const chunkText = chunk.text();
                    if (chunkText) {
                        yield chunkText;
                    }
                } catch (e) {
                    // FunctionCall chunk without text
                }
            }

            // If no function calls were requested by the model, turn is complete
            if (functionCalls.length === 0) {
                break;
            }

            // 1. Append model's functionCall turn to contents
            contents.push({
                role: 'model',
                parts: functionCallParts.length > 0 ? functionCallParts : functionCalls.map(c => ({ functionCall: c }))
            });

            // 2. Execute requested tools with safety confirmation gate checks
            const functionResponseParts = [];
            for (const call of functionCalls) {
                if (onToolCallNotice) onToolCallNotice(call.name, call.args);

                const toolObj = getTool(call.name);
                const gateCheck = checkConfirmationGate(call.name, call.args, toolObj?.isConsequential);

                let toolResult;
                if (gateCheck.requiresConfirmation) {
                    toolResult = {
                        status: 'CONFIRMATION_REQUIRED',
                        message: `SAFETY GATE: Action "${call.name}" requires explicit user confirmation. State what action you intend to take and ask the user for confirmation before proceeding. Reason: ${gateCheck.reason}`
                    };
                } else {
                    try {
                        const { broadcastObserverEvent } = require('../server');
                        if (typeof broadcastObserverEvent === 'function') {
                            broadcastObserverEvent({ type: 'tool_executed', toolName: call.name });
                        }
                    } catch(e) {}

                    toolResult = await executeTool(call.name, call.args);
                }

                const formattedResponse = typeof toolResult === 'object' ? toolResult : { output: toolResult };

                functionResponseParts.push({
                    functionResponse: {
                        name: call.name,
                        response: formattedResponse
                    }
                });
            }

            // 3. Append functionResponse turn with role 'user' as per Gemini API spec
            contents.push({
                role: 'user',
                parts: functionResponseParts
            });
        }
    } catch (err) {
        console.error('\n[Brain Error]:', err.message);
        yield `\n[Trillion encountered an error: ${err.message}. Please try your turn again.]`;
    }
}

module.exports = {
    chatWithModelStream,
    SYSTEM_PROMPT
};
