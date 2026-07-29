require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Cache environment variables & default model constant
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_MODEL = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;

// Single cached client instance to avoid object allocation per request
let geminiClient = null;
if (GEMINI_API_KEY) {
    geminiClient = new GoogleGenerativeAI(GEMINI_API_KEY);
    console.log(`Gemini client cached (model: ${GEMINI_MODEL}).`);
} else {
    console.error('GEMINI_API_KEY missing in environment.');
}

// Pre-cached system prompt objects
const CACHED_MODELS = new Map();

function getModelInstance(systemInstruction = '', jsonMode = false, maxOutputTokens = 150) {
    if (!geminiClient) {
        throw new Error('Gemini API client not initialized.');
    }
    const cacheKey = `${systemInstruction}:${jsonMode}:${maxOutputTokens}`;
    if (CACHED_MODELS.has(cacheKey)) {
        return CACHED_MODELS.get(cacheKey);
    }

    const config = {
        model: GEMINI_MODEL,
        generationConfig: {
            maxOutputTokens
        }
    };

    if (systemInstruction) {
        config.systemInstruction = systemInstruction;
    }
    if (jsonMode) {
        config.generationConfig.responseMimeType = 'application/json';
    }

    const instance = geminiClient.getGenerativeModel(config);
    CACHED_MODELS.set(cacheKey, instance);
    return instance;
}

function getProviderInfo() {
    return {
        provider: geminiClient ? 'Gemini' : 'None',
        model: GEMINI_MODEL,
        api: 'generativelanguage.googleapis.com',
        configured: !!geminiClient
    };
}

// High-speed stream with single failover attempt
async function streamResponse(prompt, systemInstruction = '', res = null, maxOutputTokens = 150) {
    const model = getModelInstance(systemInstruction, false, maxOutputTokens);
    
    // Attempt 1: Stream
    try {
        const result = await model.generateContentStream(prompt);
        let fullText = '';
        for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
                fullText += text;
                if (res && !res.writableEnded) {
                    res.write(text);
                }
            }
        }
        if (res && !res.writableEnded) res.end();
        return fullText;
    } catch (streamErr) {
        console.warn('Stream failed, executing single non-stream failover:', streamErr.message);
        // Failover: Single non-stream attempt
        try {
            const result = await model.generateContent(prompt);
            const text = result.response.text();
            if (res && !res.writableEnded) {
                res.write(text);
                res.end();
            }
            return text;
        } catch (failoverErr) {
            console.error('Gemini failover error:', failoverErr.message);
            if (res && !res.writableEnded) {
                res.end(`\n[Error: ${failoverErr.message}]`);
            }
            throw failoverErr;
        }
    }
}

async function generateResponseNonStream(prompt, systemInstruction = '', forceJson = false, maxOutputTokens = 150) {
    const model = getModelInstance(systemInstruction, forceJson, maxOutputTokens);
    try {
        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (err) {
        console.error('Non-stream generation failed, retrying once:', err.message);
        const result = await model.generateContent(prompt);
        return result.response.text();
    }
}

module.exports = {
    GEMINI_MODEL,
    getProviderInfo,
    streamResponse,
    generateResponseNonStream,
    getModelInstance
};
