require('dotenv').config();
const { Ollama } = require('ollama');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { VertexAI } = require('@google-cloud/vertexai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || 'us-central1';
const GCP_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT;

const onCloudRun = Boolean(process.env.K_SERVICE);
const useGeminiApi = Boolean(GEMINI_API_KEY);
const useVertex = !useGeminiApi && (onCloudRun || Boolean(GCP_PROJECT));

const ollama = (!useGeminiApi && !useVertex)
    ? new Ollama({ host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434' })
    : null;
const gemini = useGeminiApi ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const vertex = useVertex ? new VertexAI({ project: GCP_PROJECT, location: VERTEX_LOCATION }) : null;

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
        console.error(`${provider} Streaming Error:`, error);
        res.end('\n\n[Error: Connection to AI interrupted.]');
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
        console.error(`${provider} Error:`, error);
        throw new Error(`Failed to generate response from ${provider}.`);
    }
}

module.exports = {
    getProviderInfo,
    streamResponse,
    generateResponseNonStream
};
