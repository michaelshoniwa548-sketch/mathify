require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const compression = require('compression');
const { GoogleGenAI } = require('@google/genai');

// 1. USE THE FASTEST MODEL & CACHE CONFIGURATIONS
// REST chat/solve/quiz model vs Live WebSocket model
const PORT = process.env.PORT || 3002;
const GEMINI_MODEL = (process.env.GEMINI_MODEL && !process.env.GEMINI_MODEL.includes('live'))
    ? process.env.GEMINI_MODEL
    : "gemini-3.5-flash-lite";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';

// 10. CACHE CLIENTS & SYSTEM PROMPTS
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;
let cachedElevenLabsVoiceId = ELEVENLABS_VOICE_ID;

// ZIMSEC System Persona & Minimal Prompts (English Only)
const ZIMSEC_VOICE_PROMPT = `You are Trillion, a warm, conversational, and direct AI assistant and ZIMSEC math tutor.
STRICT INSTRUCTIONS:
1. Speak ONLY in English. Never respond in Shona, Ndebele, or any other language.
2. Provide thorough, step-by-step ZIMSEC math explanations with clear formulas and working.
3. Format math equations in standard inline LaTeX using single dollar signs (e.g. $x^2 + 5x + 6 = 0$ or $\\frac{a}{b}$) so the interface renders them as visual math symbols.
4. Ground answers in ZIMSEC math syllabus specifications.
5. Do not use markdown symbols (#, **, bullet points) in voice mode so audio flows naturally.`;

const ZIMSEC_TEXT_PROMPT = `You are Mathify, an expert AI Mathematics Tutor specializing strictly in the ZIMSEC (Zimbabwe School Examinations Council) curriculum for O-Level (Code 4075) and A-Level (Code 6042/9164).
STRICT INSTRUCTIONS:
1. Respond ONLY in English. Never respond in Shona, Ndebele, or any other language.
2. Always teach and solve problems according to ZIMSEC exam specifications (Paper 1 Non-Calculator & Paper 2 Structured Paper).
3. Show step-by-step working clearly with intermediate steps (Method marks M, Accuracy marks A, Independent marks B).
4. Format ALL mathematical equations, fractions, variables, and symbols directly inside sentences using standard LaTeX inline delimiters ($ ... $ or \\( ... \\)), e.g. $x^2 + 5x + 6 = 0$, $\\frac{a}{b}$, $\\sqrt{x^2 + y^2}$, $\\theta$, $\\pi$, $\\pm$, $\\int_0^1 x dx$. Use display math ($$ ... $$) for large standalone formulas.
5. Use ZIMSEC terminology, metric units, and standard mathematical notation.
6. For non-mathematical topics, politely redirect the student back to ZIMSEC Mathematics.`;

// In-memory chat & conversation store
let chatHistory = [];
let conversationHistory = [];
let uploadedZimsecFiles = [];

// Automatic ZIMSEC File Indexer (RAG Upload)
async function indexZimsecStore() {
    const storeDir = path.join(__dirname, 'zimsec_store');
    if (!fs.existsSync(storeDir) || !ai) return;

    try {
        const files = fs.readdirSync(storeDir);
        for (const file of files) {
            const filePath = path.join(storeDir, file);
            const stat = fs.statSync(filePath);
            if (stat.isFile()) {
                let mimeType = 'text/plain';
                if (file.endsWith('.pdf')) mimeType = 'application/pdf';
                else if (file.endsWith('.json')) mimeType = 'application/json';

                console.log(`Uploading ZIMSEC knowledge document to Gemini File Search: ${file}`);
                try {
                    const uploadResult = await ai.files.upload({
                        file: filePath,
                        mimeType
                    });
                    uploadedZimsecFiles.push({
                        name: file,
                        uri: uploadResult.uri,
                        mimeType
                    });
                    console.log(`ZIMSEC document indexed successfully: ${uploadResult.uri}`);
                } catch (uploadErr) {
                    console.warn(`Failed to upload ZIMSEC file ${file}:`, uploadErr.message);
                }
            }
        }
        if (uploadedZimsecFiles.length > 0) {
            console.log(`Attached ${uploadedZimsecFiles.length} ZIMSEC RAG knowledge document(s).`);
        }
    } catch (err) {
        console.error('Error reading zimsec_store directory:', err.message);
    }
}

// Process Safety Nets for Production / Render Deployment
process.on('uncaughtException', (err) => {
    console.error('⚠️ [Uncaught Exception]:', err ? err.message : err);
});

process.on('unhandledRejection', (reason) => {
    console.error('⚠️ [Unhandled Rejection]:', reason ? (reason.message || reason) : reason);
});

// Trigger background indexing safely without blocking server boot
setImmediate(() => {
    indexZimsecStore().catch(err => console.warn('Background indexing warning:', err.message));
});

// Express app initialization
const app = express();
app.disable('x-powered-by');

app.use(compression({
    filter: (req, res) => {
        if (req.headers['x-no-compression'] || req.path.includes('/api/chat') || req.path.includes('/api/solve') || req.path.includes('/api/trillion') || req.path.includes('/api/voice-chat')) {
            return false;
        }
        return compression.filter(req, res);
    }
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/katex', express.static(path.join(__dirname, 'node_modules', 'katex', 'dist')));
app.use('/vendor/marked', express.static(path.join(__dirname, 'node_modules', 'marked', 'lib')));

app.use((req, res, next) => {
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Keep-Alive', 'timeout=60, max=1000');
    next();
});

// 13. FAILOVER & STREAMING HELPER WITH GOOGLE SEARCH & RAG GROUNDING
async function streamGeminiHelper({ prompt, systemInstruction, attachment, maxTokens = 1024, res, isSSE = false, enableGrounding = true }) {
    if (!ai) {
        throw new Error('Gemini API key is not configured.');
    }

    const recentHistory = conversationHistory.slice(-4);
    const historyText = recentHistory.length > 0
        ? recentHistory.map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.parts[0].text}`).join('\n') + '\n\n'
        : '';

    const parts = [];
    if (attachment && attachment.data && attachment.mimeType) {
        const cleanBase64 = attachment.data.replace(/^data:[^;]+;base64,/, '');
        parts.push({
            inlineData: {
                mimeType: attachment.mimeType,
                data: cleanBase64
            }
        });
    }
    parts.push({ text: `${systemInstruction}\n\n${historyText}User: ${prompt || 'Analyze and solve the math problem in this attached image/file step-by-step according to ZIMSEC exam specifications.'}` });

    const contents = [{ role: 'user', parts }];

    const config = {
        maxOutputTokens: maxTokens,
        temperature: 0.7
    };

    if (enableGrounding && false) {
        config.tools = [{ googleSearch: {} }];
    }

    // Failover attempt 1: Stream
    try {
        const stream = await ai.models.generateContentStream({
            model: GEMINI_MODEL,
            contents,
            config
        });

        let fullText = '';
        let groundingSources = [];

        for await (const chunk of stream) {
            if (res.writableEnded) break;
            const text = chunk.text || '';
            if (text) {
                fullText += text;
                if (isSSE) {
                    res.write(`data: ${JSON.stringify({ text })}\n\n`);
                } else {
                    res.write(text);
                }
                if (typeof res.flush === 'function') res.flush();
            }

            // Extract Google Search grounding metadata
            const chunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
            if (chunks && Array.isArray(chunks)) {
                for (const c of chunks) {
                    if (c.web && c.web.title && !groundingSources.includes(c.web.title)) {
                        groundingSources.push(c.web.title);
                    }
                }
            }
        }

        if (isSSE && !res.writableEnded) {
            res.write(`data: ${JSON.stringify({ done: true, sources: groundingSources })}\n\n`);
        }
        if (!res.writableEnded) res.end();

        setImmediate(() => {
            conversationHistory.push({ role: 'user', parts: [{ text: prompt }] });
            conversationHistory.push({ role: 'model', parts: [{ text: fullText }] });
            chatHistory.push({ id: Date.now(), role: 'user', content: prompt });
            chatHistory.push({ id: Date.now() + 1, role: 'assistant', content: fullText, sources: groundingSources });
        });

        return fullText;

    } catch (streamErr) {
        console.warn('Stream failed, executing single non-stream failover:', streamErr.message);

        try {
            const response = await ai.models.generateContent({
                model: GEMINI_MODEL,
                contents,
                config
            });
            const text = response.text || '';
            const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map(c => c.web?.title).filter(Boolean) || [];

            if (isSSE && !res.writableEnded) {
                res.write(`data: ${JSON.stringify({ text, sources })}\n\n`);
                res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            } else if (!res.writableEnded) {
                res.write(text);
            }
            if (!res.writableEnded) res.end();
            return text;
        } catch (failoverErr) {
            console.error('Gemini failover error:', failoverErr.message);
            if (!res.headersSent) {
                res.status(500).json({ error: failoverErr.message });
            } else if (!res.writableEnded) {
                if (isSSE) {
                    res.write(`data: ${JSON.stringify({ error: failoverErr.message })}\n\n`);
                } else {
                    res.write(`\n[Error: ${failoverErr.message}]`);
                }
                res.end();
            }
        }
    }
}

// ----------------------------------------------------
// TRILLION VOICE-FIRST ENGINE ENDPOINTS
// ----------------------------------------------------
const { chatWithModelStream } = require('./services/agentCore');
const { getPendingNotices, dismissNotice } = require('./services/heartbeatService');
const { synthesizeSpeech, transcribeAudio, pcmToWav } = require('./services/audioService');

// In-memory running turn history for Trillion engine
const trillionHistory = [];
let currentActiveTurnId = 0;

app.post('/api/trillion/voice-turn', async (req, res) => {
    const { audioBase64, mimeType } = req.body || {};
    if (!audioBase64) {
        return res.status(200).json({ status: 'ignored', message: 'Audio payload empty' });
    }

    const thisTurnId = Date.now();
    currentActiveTurnId = thisTurnId;

    try {
        const audioBuf = Buffer.from(audioBase64.replace(/^data:audio\/\w+;base64,/, ''), 'base64');
        const transcribedText = await transcribeAudio(audioBuf, mimeType || 'audio/webm');

        if (currentActiveTurnId !== thisTurnId) return;

        let userText = (transcribedText || '').trim();
        if (!userText) {
            userText = "Please ask your ZIMSEC math question.";
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();

        // Emit transcribed text event so client displays user bubble
        res.write(`data: ${JSON.stringify({ type: 'user_text', text: userText })}\n\n`);

        broadcastObserverEvent({ type: 'turn_started', text: userText });

        const historySnapshot = [
            ...trillionHistory,
            { role: 'user', parts: [{ text: userText }] }
        ];

        let fullReply = '';
        const onToolCall = (name, args) => {
            if (currentActiveTurnId === thisTurnId && !res.writableEnded) {
                res.write(`data: ${JSON.stringify({ type: 'tool', name, args })}\n\n`);
            }
        };

        const stream = chatWithModelStream(historySnapshot, onToolCall);
        let sentenceBuffer = '';
        const audioPromises = [];

        for await (const chunk of stream) {
            if (currentActiveTurnId !== thisTurnId || req.aborted || req.socket.destroyed || res.writableEnded) {
                console.log(`⚡ [Voice Turn Aborted]: Turn ${thisTurnId} superseded by ${currentActiveTurnId}`);
                if (!res.writableEnded) res.end();
                return;
            }

            const textChunk = typeof chunk === 'string' ? chunk : (chunk.text || '');
            if (textChunk && !res.writableEnded) {
                fullReply += textChunk;
                res.write(`data: ${JSON.stringify({ type: 'text', chunk: textChunk })}\n\n`);
                if (typeof res.flush === 'function') res.flush();
            }
        }

        if (currentActiveTurnId !== thisTurnId || req.aborted || req.socket.destroyed) {
            if (!res.writableEnded) res.end();
            return;
        }

        trillionHistory.push({ role: 'user', parts: [{ text: userText }] });
        trillionHistory.push({ role: 'model', parts: [{ text: fullReply }] });
        if (trillionHistory.length > 20) {
            trillionHistory.splice(0, trillionHistory.length - 20);
        }

        // Synthesize full-formed audio for the complete reply to guarantee 100% sentence completion
        if (fullReply.trim() && !res.writableEnded && currentActiveTurnId === thisTurnId) {
            const audioBuf = await synthesizeSpeech(fullReply).catch(() => null);
            if (audioBuf && audioBuf.length > 44) {
                const audioOutBase64 = `data:audio/wav;base64,${audioBuf.toString('base64')}`;
                res.write(`data: ${JSON.stringify({ type: 'audio', audioBase64: audioOutBase64 })}\n\n`);
            }
        }

        if (!res.writableEnded) {
            broadcastObserverEvent({ type: 'turn_completed' });
            res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
            res.end();
        }

    } catch (err) {
        console.error('Voice turn error:', err.message);
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
            res.end();
        }
    }
});

// ----------------------------------------------------
// LIVING MIND 3D MAP ENDPOINTS (Tier 1 Data Contract)
// ----------------------------------------------------
const { buildMindSkeleton, getNodeDetail } = require('./services/mindMapService');

app.get('/api/mind-map', (req, res) => {
    try {
        const skeleton = buildMindSkeleton();
        res.json(skeleton);
    } catch (err) {
        console.error('MindMap skeleton endpoint error:', err.message);
        res.status(500).json({ error: 'Failed to build mind map skeleton' });
    }
});

app.get('/api/mind-map/node/:id', (req, res) => {
    try {
        const detail = getNodeDetail(req.params.id);
        if (!detail) {
            return res.status(404).json({ error: `Node "${req.params.id}" not found` });
        }
        res.json(detail);
    } catch (err) {
        console.error('MindMap node detail error:', err.message);
        res.status(500).json({ error: 'Failed to load node details' });
    }
});

app.get('/mind', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'mind.html'));
});

app.post('/api/trillion/turn', async (req, res) => {
    const userInput = req.body.text || req.body.message || '';
    if (!userInput.trim()) {
        return res.status(200).json({ status: 'ignored', message: 'Input text is empty' });
    }

    const thisTurnId = Date.now();
    currentActiveTurnId = thisTurnId;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    broadcastObserverEvent({ type: 'turn_started', text: userInput });

    let fullReply = '';

    const onToolCall = (name, args) => {
        if (currentActiveTurnId === thisTurnId && !res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'tool', name, args })}\n\n`);
        }
    };

    try {
        const historySnapshot = [
            ...trillionHistory,
            { role: 'user', parts: [{ text: userInput.trim() }] }
        ];

        const stream = chatWithModelStream(historySnapshot, onToolCall);
        let sentenceBuffer = '';
        const audioPromises = [];

        for await (const chunk of stream) {
            if (currentActiveTurnId !== thisTurnId || req.aborted || req.socket.destroyed || res.writableEnded) {
                console.log(`⚡ [Text Turn Aborted]: Turn ${thisTurnId} superseded by ${currentActiveTurnId}`);
                if (!res.writableEnded) res.end();
                return;
            }

            const textChunk = typeof chunk === 'string' ? chunk : (chunk.text || '');
            if (textChunk && !res.writableEnded) {
                fullReply += textChunk;
                res.write(`data: ${JSON.stringify({ type: 'text', chunk: textChunk })}\n\n`);
                if (typeof res.flush === 'function') res.flush();
            }
        }

        if (currentActiveTurnId !== thisTurnId || req.aborted || req.socket.destroyed) {
            if (!res.writableEnded) res.end();
            return;
        }

        trillionHistory.push({ role: 'user', parts: [{ text: userInput.trim() }] });
        trillionHistory.push({ role: 'model', parts: [{ text: fullReply }] });
        if (trillionHistory.length > 20) {
            trillionHistory.splice(0, trillionHistory.length - 20);
        }

        // Synthesize full-formed audio for the complete reply to guarantee 100% sentence completion
        if (fullReply.trim() && !res.writableEnded && currentActiveTurnId === thisTurnId) {
            const audioBuf = await synthesizeSpeech(fullReply).catch(() => null);
            if (audioBuf && audioBuf.length > 44) {
                const audioBase64 = `data:audio/wav;base64,${audioBuf.toString('base64')}`;
                res.write(`data: ${JSON.stringify({ type: 'audio', audioBase64 })}\n\n`);
            }
        }

        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
            res.end();
        }

    } catch (err) {
        console.error('Trillion turn error:', err.message);
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
            res.end();
        }
    }
});

app.get('/api/trillion/notices', (req, res) => {
    try {
        const notices = getPendingNotices();
        res.json({ success: true, notices });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/trillion/notices/dismiss', (req, res) => {
    try {
        const noticeId = req.body.noticeId;
        const dismissed = dismissNotice(noticeId);
        res.json({ success: true, dismissed });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ----------------------------------------------------
// STREAMING ENDPOINTS
// ----------------------------------------------------

app.get('/api/voice-stream', async (req, res) => {
    const prompt = req.query.q || req.query.message || 'Hello';
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    await streamGeminiHelper({
        prompt,
        systemInstruction: ZIMSEC_VOICE_PROMPT,
        maxTokens: 140,
        res,
        isSSE: true,
        enableGrounding: true
    });
});

app.get('/api/stream', async (req, res) => {
    const prompt = req.query.q || req.query.message || 'Hello';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    await streamGeminiHelper({
        prompt,
        systemInstruction: ZIMSEC_TEXT_PROMPT,
        maxTokens: 400,
        res,
        isSSE: true,
        enableGrounding: true
    });
});

app.post('/api/voice-chat', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: 'Message is required' });

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        await streamGeminiHelper({
            prompt: message,
            systemInstruction: ZIMSEC_VOICE_PROMPT,
            maxTokens: 140,
            res,
            isSSE: false,
            enableGrounding: true
        });
    } catch (error) {
        if (!res.headersSent) res.status(500).json({ error: error.message });
    }
});

app.post('/api/chat', async (req, res) => {
    try {
        const { message, attachment } = req.body;
        if (!message && !attachment) return res.status(400).json({ error: 'Message or file attachment is required' });

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        await streamGeminiHelper({
            prompt: message || '',
            systemInstruction: ZIMSEC_TEXT_PROMPT,
            attachment,
            maxTokens: 1024,
            res,
            isSSE: false,
            enableGrounding: true
        });
    } catch (error) {
        if (!res.headersSent) res.status(500).json({ error: error.message });
    }
});

app.post('/api/solve', async (req, res) => {
    try {
        const { problem, attachment } = req.body;
        if (!problem && !attachment) return res.status(400).json({ error: 'Problem statement or file attachment is required' });

        const systemInstruction = `${ZIMSEC_TEXT_PROMPT}\nBreak down the solution into clear, numbered, step-by-step ZIMSEC examination method instructions. Show working for Paper 1 and Paper 2.`;

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        await streamGeminiHelper({
            prompt: problem || '',
            systemInstruction,
            attachment,
            maxTokens: 1024,
            res,
            isSSE: false,
            enableGrounding: true
        });
    } catch (error) {
        if (!res.headersSent) res.status(500).json({ error: error.message });
    }
});

// --- QUIZ GENERATION ENDPOINT ---
app.post('/api/quiz/generate', async (req, res) => {
    try {
        const { topics = ['Algebra'], difficulty = 'medium', count = 5 } = req.body;
        
        if (!ai) {
            return res.status(500).json({ error: 'Gemini API key is not configured.' });
        }

        const prompt = `Generate a ${count}-question ${difficulty} difficulty mathematics quiz covering topics: ${topics.join(', ')}. Include ZIMSEC examination standard questions where appropriate.
Return ONLY valid JSON matching this exact structure, with no extra text:
{
  "quiz": [
    { "id": 1, "question": "Question text here..." },
    { "id": 2, "question": "Question text here..." }
  ]
}`;

        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: prompt,
            config: {
                maxOutputTokens: 1000,
                temperature: 0.7,
                responseMimeType: 'application/json'
            }
        });

        const rawText = response.text || '';
        const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const quizJson = JSON.parse(cleanJson);
        
        res.json(quizJson);

    } catch (error) {
        console.error('Quiz generation error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// --- QUIZ EVALUATION ENDPOINT ---
app.post('/api/quiz/evaluate', async (req, res) => {
    try {
        const { questions, userAnswers } = req.body;
        if (!questions || !userAnswers) {
            return res.status(400).json({ error: 'Questions and userAnswers are required' });
        }

        const prompt = `Evaluate the following math quiz submission step-by-step:
Questions and Student Answers:
${questions.map(q => `Q${q.id}: ${q.question}\nStudent Answer: ${userAnswers[q.id] || '(No Answer)'}`).join('\n\n')}

Provide:
1. Overall Score (e.g. 4/5) and ZIMSEC Grade classification.
2. Step-by-step feedback for each question showing correct answer, working, and marks awarded.
3. Brief study encouragement.`;

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        await streamGeminiHelper({
            prompt,
            systemInstruction: ZIMSEC_TEXT_PROMPT,
            maxTokens: 800,
            res,
            isSSE: false,
            enableGrounding: true
        });

    } catch (error) {
        if (!res.headersSent) res.status(500).json({ error: error.message });
    }
});

// FAST TTS ENDPOINT
app.post('/api/tts', async (req, res) => {
    try {
        const { text, voiceName = 'Kore' } = req.body;
        if (!text) return res.status(400).json({ error: 'Text is required' });

        const cleanText = text
            .replace(/```[\s\S]*?```/g, '')
            .replace(/`[^`]+`/g, '')
            .replace(/[#*_~[\]]/g, '')
            .replace(/<[^>]+>/g, '')
            .replace(/\n+/g, ' ')
            .trim()
            .slice(0, 1500);

        if (!cleanText) return res.status(400).json({ error: 'No speakable text' });

        const ttsModels = ['gemini-2.5-flash-preview-tts', 'gemini-3.1-flash-tts-preview'];
        for (const model of ttsModels) {
            try {
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: `Read out loud: ${cleanText}` }] }],
                            generationConfig: {
                                responseModalities: ['AUDIO'],
                                speechConfig: {
                                    voiceConfig: {
                                        prebuiltVoiceConfig: { voiceName }
                                    }
                                }
                            }
                        })
                    }
                );

                if (response.ok) {
                    const data = await response.json();
                    const inlineData = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
                    if (inlineData?.data) {
                        const pcmBuffer = Buffer.from(inlineData.data, 'base64');
                        const wavHeader = createWavHeader(pcmBuffer.length);
                        const wavBuffer = Buffer.concat([wavHeader, pcmBuffer]);

                        res.set('Content-Type', 'audio/wav');
                        res.set('Content-Length', wavBuffer.length);
                        return res.send(wavBuffer);
                    }
                }
            } catch (err) {
                console.warn(`TTS attempt with model ${model} failed:`, err.message);
            }
        }

        if (ELEVENLABS_API_KEY) {
            try {
                const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${cachedElevenLabsVoiceId}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'xi-api-key': ELEVENLABS_API_KEY
                    },
                    body: JSON.stringify({
                        text: cleanText,
                        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
                    })
                });

                if (elRes.ok) {
                    const audioBuffer = await elRes.arrayBuffer();
                    res.set('Content-Type', 'audio/mpeg');
                    return res.send(Buffer.from(audioBuffer));
                }
            } catch (elErr) {
                console.warn('ElevenLabs TTS failed:', elErr.message);
            }
        }

        return res.status(502).json({ error: 'TTS audio generation failed' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// STT Endpoint (English Only)
app.post('/api/stt', async (req, res) => {
    try {
        const { audioBase64, mimeType } = req.body;
        if (!audioBase64) return res.status(400).json({ error: 'Audio data is required' });

        const prompt = `You are a specialized Speech-to-Text transcriber for ZIMSEC Mathematics tutoring.
Transcribe the spoken audio accurately in English (accounting for Zimbabwean accents and math terms like "algebra", "quadratic", "matrices", "calculus", "vectors", "ZIMSEC").
Output ONLY the exact transcribed English text without extra commentary or markdown.`;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { inlineData: { mimeType: mimeType || 'audio/webm', data: audioBase64 } },
                            { text: prompt }
                        ]
                    }],
                    generationConfig: { maxOutputTokens: 100, temperature: 0.2 }
                })
            }
        );

        if (!response.ok) {
            return res.status(502).json({ error: 'STT transcription failed' });
        }

        const data = await response.json();
        const transcript = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        res.json({ transcript: transcript.trim() });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: GEMINI_API_KEY ? 'ok' : 'error',
        provider: 'Gemini',
        model: GEMINI_MODEL,
        curriculum: 'ZIMSEC Zimbabwe (O-Level 4075 / A-Level 6042)',
        grounding: 'Google Search + ZIMSEC RAG Store',
        name: 'Mathify ZIMSEC Tutor by Michael Shoniwa'
    });
});

app.get('/api/chat-history', (req, res) => {
    res.json(chatHistory);
});

app.delete('/api/chat-history', (req, res) => {
    chatHistory = [];
    conversationHistory = [];
    res.json({ message: 'Chat history cleared' });
});

// Helper: STT Conversion
async function transcribeAudioHelper(audioBase64, mimeType) {
    if (!ai || !audioBase64) return '';
    try {
        const prompt = `You are a specialized Speech-to-Text transcriber for ZIMSEC Mathematics tutoring.
Transcribe the spoken audio accurately in English (accounting for Zimbabwean accents and math terms like "algebra", "quadratic", "matrices", "calculus", "vectors", "ZIMSEC").
Output ONLY the exact transcribed English text without extra commentary or markdown.`;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { inlineData: { mimeType: mimeType || 'audio/webm', data: audioBase64 } },
                            { text: prompt }
                        ]
                    }],
                    generationConfig: { maxOutputTokens: 100 }
                })
            }
        );

        if (!response.ok) return '';
        const data = await response.json();
        return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    } catch (e) {
        console.warn('STT helper error:', e.message);
        return '';
    }
}

// Helper: TTS Generation (ElevenLabs primary with Google AI Voice fallback)
async function generateTtsUrlHelper(text) {
    const cleanText = text
        .replace(/ZIMSEC/gi, 'Zimsec')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`[^`]+`/g, '')
        .replace(/[#*_~[\]]/g, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\n+/g, ' ')
        .trim();

    if (!cleanText) return null;

    if (ELEVENLABS_API_KEY) {
        try {
            const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${cachedElevenLabsVoiceId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'xi-api-key': ELEVENLABS_API_KEY
                },
                body: JSON.stringify({
                    text: cleanText,
                    voice_settings: { stability: 0.5, similarity_boost: 0.75 }
                })
            });

            if (elRes.ok) {
                const audioBuffer = await elRes.arrayBuffer();
                return `data:audio/mpeg;base64,${Buffer.from(audioBuffer).toString('base64')}`;
            }
        } catch (elErr) {
            console.warn('ElevenLabs TTS failed:', elErr.message);
        }
    }

    try {
        const encodedText = encodeURIComponent(cleanText.substring(0, 200));
        const googleVoiceUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=en-ZA&client=tw-ob`;
        const gRes = await fetch(googleVoiceUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (gRes.ok) {
            const audioBuffer = await gRes.arrayBuffer();
            return `data:audio/mpeg;base64,${Buffer.from(audioBuffer).toString('base64')}`;
        }
    } catch (gErr) {
        console.warn('Google Voice TTS error:', gErr.message);
    }

    return null;
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
    console.log(`Using Gemini model: ${GEMINI_MODEL}`);
    console.log(`Curriculum: ZIMSEC Zimbabwe (O-Level 4075 & A-Level 6042/9164)`);
    console.log(`Trillion WebSocket active at ws://localhost:${PORT}/ws/trillion`);
});

// ----------------------------------------------------
// WEBSOCKET ENDPOINT: ws://localhost:3002/ws/trillion
// ----------------------------------------------------
const WebSocket = require('ws');
const wss = new WebSocket.Server({ server, path: '/ws/trillion' });

wss.on('connection', (ws) => {
    console.log('⚡ [WebSocket]: Client connected to ws://localhost:3002/ws/trillion');

    ws.on('message', async (data) => {
        let msg;
        try {
            msg = JSON.parse(data.toString());
        } catch(e) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON payload' }));
            }
            return;
        }

        const prompt = msg.prompt || msg.text || '';
        if (!prompt.trim()) return;

        trillionHistory.push({ role: 'user', parts: [{ text: prompt.trim() }] });

        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'start' }));
        }

        let fullReply = '';

        const onToolCall = (name, args) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'tool', name, args }));
            }
        };

        try {
            const stream = chatWithModelStream(trillionHistory, onToolCall);

            for await (const chunk of stream) {
                if (ws.readyState !== WebSocket.OPEN) break;
                const textChunk = typeof chunk === 'string' ? chunk : (chunk.text || '');
                if (textChunk) {
                    fullReply += textChunk;
                    ws.send(textChunk);
                }
            }

            trillionHistory.push({ role: 'model', parts: [{ text: fullReply }] });

            let audioBase64 = '';
            try {
                const audioBuffer = await synthesizeSpeech(fullReply);
                if (audioBuffer && audioBuffer.length > 0) {
                    audioBase64 = `data:audio/wav;base64,${audioBuffer.toString('base64')}`;
                }
            } catch (e) {}

            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'done', audioBase64 }));
            }
        } catch (err) {
            console.error('[WebSocket Error]:', err.message);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'error', message: err.message }));
            }
        }
    });

    ws.on('close', () => {
        console.log('⚡ [WebSocket]: Client disconnected from /ws/trillion');
    });
});

// ----------------------------------------------------
// READ-ONLY OBSERVER WEBSOCKET: ws://localhost:3002/ws/observe
// ----------------------------------------------------
const observerSockets = new Set();
const wssObserve = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

    if (pathname === '/ws/observe') {
        wssObserve.handleUpgrade(request, socket, head, (ws) => {
            wssObserve.emit('connection', ws, request);
        });
    }
});

wssObserve.on('connection', (ws) => {
    console.log('👁️ [MindMap Observer]: New spectator connected to /ws/observe');
    observerSockets.add(ws);

    ws.on('close', () => {
        observerSockets.delete(ws);
    });

    ws.on('error', () => {
        observerSockets.delete(ws);
        try { ws.close(); } catch(e) {}
    });
});

/**
 * Non-blocking, timeout-guarded broadcast helper to observers
 */
function broadcastObserverEvent(event) {
    if (observerSockets.size === 0) return;

    const payload = JSON.stringify(event);

    observerSockets.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            // Guard send with 1s timeout to prevent blocking main execution loops
            const timer = setTimeout(() => {
                observerSockets.delete(ws);
                try { ws.close(); } catch(e) {}
            }, 1000);

            try {
                ws.send(payload, () => {
                    clearTimeout(timer);
                });
            } catch(e) {
                clearTimeout(timer);
                observerSockets.delete(ws);
            }
        }
    });
}




