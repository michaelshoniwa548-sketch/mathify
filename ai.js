require('dotenv').config();
const { Ollama } = require('ollama');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { VertexAI } = require('@google-cloud/vertexai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-pro';
let GEMINI_MODEL = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
if (/preview/i.test(GEMINI_MODEL)) {
    console.warn(`GEMINI_MODEL contains a preview model (${GEMINI_MODEL}). Using stable default ${DEFAULT_GEMINI_MODEL} instead.`);
    GEMINI_MODEL = DEFAULT_GEMINI_MODEL;
}
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || 'us-central1';
const GCP_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT;

const onCloudRun = Boolean(process.env.K_SERVICE);

let useGeminiApi = false;
let useVertex = false;
let gemini = null;
let vertex = null;

// Allow forcing use of local Ollama even if GEMINI_API_KEY is present.
const forceOllama = String(process.env.FORCE_OLLAMA || '').toLowerCase() === 'true';

// Try to initialize Gemini client only if a key is provided. If initialization fails
// we gracefully fall back to Ollama (local) or Vertex where applicable.
if (GEMINI_API_KEY && !forceOllama) {
    try {
        gemini = new GoogleGenerativeAI({ apiKey: GEMINI_API_KEY });
        useGeminiApi = true;
    } catch (initErr) {
        console.error('GoogleGenerativeAI init error - falling back to other providers:', initErr);
        gemini = null;
        useGeminiApi = false;
    }
}

useVertex = !useGeminiApi && (onCloudRun || Boolean(GCP_PROJECT));

const ollama = (!useGeminiApi && !useVertex)
    ? new Ollama({ host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434' })
    : null;

if (useVertex) {
    try {
        vertex = new VertexAI({ project: GCP_PROJECT, location: VERTEX_LOCATION });
    } catch (vErr) {
        console.error('VertexAI init error - disabling Vertex provider:', vErr);
        vertex = null;
        useVertex = false;
    }
}

function getProviderInfo() {
    if (useGeminiApi || useVertex) {
        return { provider: 'Gemini', model: GEMINI_MODEL };
    }
    return { provider: 'Ollama', model: OLLAMA_MODEL };
}

function getGeminiApiModel(systemInstruction, jsonMode = false) {
    const config = { model: GEMINI_MODEL };
    if (systemInstruction) config.systemInstruction = systemInstruction;
    if (jsonMode) config.generationConfig = { responseMimeType: 'application/json' };
    return gemini.getGenerativeModel(config);
}

function getVertexModel(systemInstruction, jsonMode = false) {
    const config = { model: GEMINI_MODEL };
    if (systemInstruction) {
        config.systemInstruction = { parts: [{ text: systemInstruction }] };
    }
    if (jsonMode) {
        config.generationConfig = { responseMimeType: 'application/json' };
    }
    return vertex.getGenerativeModel(config);
}

function getVertexContents(prompt) {
    return [{ role: 'user', parts: [{ text: prompt }] }];
}

async function streamResponse(prompt, systemInstruction, res) {
    const { provider } = getProviderInfo();
    try {
        if (useGeminiApi) {
            const model = getGeminiApiModel(systemInstruction);
            const result = await model.generateContentStream(prompt);
            for await (const chunk of result.stream) {
                const text = chunk.text();
                if (text) res.write(text);
            }
        } else if (useVertex) {
            const model = getVertexModel(systemInstruction);
            const result = await model.generateContentStream({ contents: getVertexContents(prompt) });
            for await (const chunk of result.stream) {
                const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) res.write(text);
            }
        } else {
            const stream = await ollama.chat({
                model: OLLAMA_MODEL,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: prompt }
                ],
                stream: true
            });
            for await (const chunk of stream) {
                res.write(chunk.message.content);
            }
        }
        res.end();
    } catch (error) {
        console.error(`${provider} Streaming Error:`, error && (error.stack || error));
        const safeMsg = error && error.message ? error.message : 'Connection to AI interrupted.';

        // If Gemini failed due to an invalid API key, gracefully fallback to Ollama if available.
        const isGeminiKeyInvalid = /API key not valid|API_KEY_INVALID|api key not valid/i.test(safeMsg);
        if (useGeminiApi && isGeminiKeyInvalid && ollama) {
            console.warn('Gemini API key invalid — falling back to Ollama for streaming response.');
            try {
                const stream = await ollama.chat({
                    model: OLLAMA_MODEL,
                    messages: [
                        { role: 'system', content: systemInstruction },
                        { role: 'user', content: prompt }
                    ],
                    stream: true
                });
                for await (const chunk of stream) {
                    res.write(chunk.message.content);
                }
                return res.end();
            } catch (ollamaErr) {
                console.error('Ollama fallback streaming error:', ollamaErr && (ollamaErr.stack || ollamaErr));
                const ollamaMsg = ollamaErr && ollamaErr.message ? ollamaErr.message : 'Ollama fallback failed.';
                return res.end(`\n\n[Error: Fallback failed: ${ollamaMsg}]`);
            }
        }

        // Default behavior: return the original safe message to client.
        res.end(`\n\n[Error: ${provider} streaming failed: ${safeMsg}]`);
    }
}

async function generateResponseNonStream(prompt, systemInstruction = '', forceJson = false) {
    const { provider } = getProviderInfo();
    try {
        if (useGeminiApi) {
            const model = getGeminiApiModel(systemInstruction, forceJson);
            const result = await model.generateContent(prompt);
            return result.response.text();
        }

        if (useVertex) {
            const model = getVertexModel(systemInstruction, forceJson);
            const result = await model.generateContent({ contents: getVertexContents(prompt) });
            return result.response.candidates[0].content.parts[0].text;
        }

        const response = await ollama.chat({
            model: OLLAMA_MODEL,
            messages: [
                { role: 'system', content: systemInstruction },
                { role: 'user', content: prompt }
            ],
            format: forceJson ? 'json' : ''
        });
        return response.message.content;
    } catch (error) {
        console.error(`${provider} Error:`, error && (error.stack || error));
        // Surface a helpful message but avoid exposing secrets.
        const errMsg = error && error.message ? error.message : 'unknown error';

        // If Gemini failed due to invalid API key, try Ollama fallback synchronously.
        const isGeminiKeyInvalid = /API key not valid|API_KEY_INVALID|api key not valid/i.test(errMsg);
        if (useGeminiApi && isGeminiKeyInvalid && ollama) {
            try {
                const response = await ollama.chat({
                    model: OLLAMA_MODEL,
                    messages: [
                        { role: 'system', content: systemInstruction },
                        { role: 'user', content: prompt }
                    ],
                    format: forceJson ? 'json' : ''
                });
                return response.message.content;
            } catch (ollamaErr) {
                console.error('Ollama fallback error:', ollamaErr && (ollamaErr.stack || ollamaErr));
                throw new Error(`Failed to generate response from fallback Ollama: ${ollamaErr && ollamaErr.message ? ollamaErr.message : 'unknown'}`);
            }
        }

        throw new Error(`Failed to generate response from ${provider}: ${errMsg}`);
    }
}

module.exports = {
    getProviderInfo,
    streamResponse,
    generateResponseNonStream
};
