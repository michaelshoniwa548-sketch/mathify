require('dotenv').config();
const { Ollama } = require('ollama');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { VertexAI } = require('@google-cloud/vertexai');
// OpenAI is required lazily during initialization to avoid module errors
// in environments where the package isn't installed locally.

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
const onRender = Boolean(process.env.RENDER_SERVICE_ID || process.env.RENDER);
const isCloudDeployment = onCloudRun || onRender || Boolean(GCP_PROJECT);

if (isCloudDeployment) {
    console.log(`[Deployment] Detected cloud environment: onCloudRun=${onCloudRun}, onRender=${onRender}, GCP=${Boolean(GCP_PROJECT)}`);
}

let useGeminiApi = false;
let useVertex = false;
let gemini = null;
let vertex = null;
let geminiKeyValid = false;
let useOpenAI = false;
let openai = null;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// Allow forcing use of local Ollama even if GEMINI_API_KEY is present.
const forceOllama = String(process.env.FORCE_OLLAMA || '').toLowerCase() === 'true';

// Try to initialize Gemini client only if a key is provided. If initialization fails
// we gracefully fall back to Ollama (local) or Vertex where applicable.
if (GEMINI_API_KEY && !forceOllama) {
    try {
        gemini = new GoogleGenerativeAI({ apiKey: GEMINI_API_KEY });
        useGeminiApi = true;
        geminiKeyValid = true;
        console.log('Gemini API key detected and Gemini provider enabled.');
    } catch (initErr) {
        console.error('GoogleGenerativeAI init error - falling back to other providers:', initErr);
        gemini = null;
        useGeminiApi = false;
    }
} else if (!GEMINI_API_KEY) {
    console.log('No GEMINI_API_KEY found; using Ollama or Vertex fallback only.');
}

// Initialize OpenAI if an API key is present.
if (OPENAI_API_KEY) {
    try {
        const { OpenAI } = require('openai');
        openai = new OpenAI({ apiKey: OPENAI_API_KEY });
        useOpenAI = true;
        console.log('OpenAI API key detected and OpenAI provider enabled.');
    } catch (e) {
        console.error('OpenAI init error - skipping OpenAI provider:', e && (e.stack || e));
        openai = null;
        useOpenAI = false;
    }
}

useVertex = !useGeminiApi && !useOpenAI && (onCloudRun || Boolean(GCP_PROJECT));

const ollama = (!useGeminiApi && !useVertex && !isCloudDeployment)
    ? new Ollama({ host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434' })
    : null;

if (!ollama && !useGeminiApi && !useVertex && !isCloudDeployment) {
    console.warn('No Ollama provider available locally. Set OLLAMA_HOST or a valid GEMINI_API_KEY.');
}

if (isCloudDeployment && !useGeminiApi && !useVertex) {
    console.warn('[Cloud Deploy] No provider available: GEMINI_API_KEY not set or invalid, Vertex not configured. Set GEMINI_API_KEY in environment.');
}

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
    if (useGeminiApi) {
        return { provider: 'Gemini', model: GEMINI_MODEL };
    }
    if (useOpenAI) {
        return { provider: 'OpenAI', model: OPENAI_MODEL };
    }
    if (useVertex) {
        return { provider: 'Vertex', model: GEMINI_MODEL };
    }
    if (ollama) {
        return { provider: 'Ollama', model: OLLAMA_MODEL };
    }
    return {
        provider: 'None',
        model: GEMINI_MODEL || OPENAI_MODEL || OLLAMA_MODEL || 'N/A'
    };
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
        } else if (ollama) {
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
        } else {
            throw new Error('No AI provider available: Gemini key invalid or missing, Vertex not configured, and Ollama not accessible.');
        }
        res.end();
    } catch (error) {
        console.error(`${provider} Streaming Error:`, error && (error.stack || error));
        const safeMsg = error && error.message ? error.message : 'Connection to AI interrupted.';

        // On cloud deployment, do not attempt Ollama fallback—return provider error directly.
        if (isCloudDeployment) {
            res.end(`\n\n[Error: ${provider} failed: ${safeMsg}]`);
            return;
        }

        // If OpenAI is configured and Gemini failed, try OpenAI locally (non-streaming fallback only).
        if (!useOpenAI && OPENAI_API_KEY) {
            try {
                const { OpenAI } = require('openai');
                openai = new OpenAI({ apiKey: OPENAI_API_KEY });
                useOpenAI = true;
                console.log('Enabled OpenAI as fallback provider.');
            } catch (e) {
                console.error('OpenAI init in fallback failed:', e && (e.stack || e));
            }
        }

        if (useOpenAI && !isCloudDeployment) {
            try {
                const resp = await openai.chat.completions.create({
                    model: OPENAI_MODEL,
                    messages: [
                        { role: 'system', content: systemInstruction },
                        { role: 'user', content: prompt }
                    ]
                });
                const text = resp.choices?.[0]?.message?.content;
                if (text) res.write(text);
                return res.end();
            } catch (openaiErr) {
                console.error('OpenAI fallback streaming (non-stream) error:', openaiErr && (openaiErr.stack || openaiErr));
            }
        }

        // If Gemini failed due to an invalid API key and we have Ollama locally, gracefully fallback.
        const isGeminiKeyInvalid = /API key not valid|API_KEY_INVALID|api key not valid/i.test(safeMsg);
        if (useGeminiApi && isGeminiKeyInvalid && ollama) {
            console.warn('Gemini API key invalid — falling back to Ollama for streaming response.');
            useGeminiApi = false;
            gemini = null;
            geminiKeyValid = false;
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

        if (useOpenAI) {
            const resp = await openai.chat.completions.create({
                model: OPENAI_MODEL,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: prompt }
                ]
            });
            return resp.choices?.[0]?.message?.content || '';
        }

        if (useVertex) {
            const model = getVertexModel(systemInstruction, forceJson);
            const result = await model.generateContent({ contents: getVertexContents(prompt) });
            return result.response.candidates[0].content.parts[0].text;
        }

        if (!ollama) {
            throw new Error('No AI provider available: Gemini key invalid or missing, Vertex not configured, and Ollama not accessible.');
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

        // On cloud deployment, do not attempt Ollama fallback—return provider error directly.
        if (isCloudDeployment) {
            throw new Error(`Failed to generate response from ${provider}: ${errMsg}`);
        }

        // If Gemini failed due to invalid API key, try Ollama fallback synchronously (local only).
        const isGeminiKeyInvalid = /API key not valid|API_KEY_INVALID|api key not valid/i.test(errMsg);
        if (useGeminiApi && isGeminiKeyInvalid && ollama) {
            console.warn('Gemini API key invalid — falling back to Ollama for non-stream response.');
            useGeminiApi = false;
            gemini = null;
            geminiKeyValid = false;
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
