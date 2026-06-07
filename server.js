require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { getProviderInfo, streamResponse, generateResponseNonStream, getDiagnostics } = require('./ai');

const app = express();
app.disable('x-powered-by');

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

const port = process.env.PORT || 3002;
const { provider, model } = getProviderInfo();

app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.url}`);
    next();
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
    try {
        const diagnostics = getDiagnostics();
        res.json({ status: 'ok', provider, model, name: 'Mathify by Michael Shoniwa', diagnostics });
    } catch (e) {
        res.json({ status: 'ok', provider, model, name: 'Mathify by Michael Shoniwa' });
    }
});

app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: 'Message is required' });

        const systemPrompt = `You are Mathify, a friendly, encouraging, and highly knowledgeable AI Math Tutor. 
        If asked who created you, your response MUST be "Michael Shoniwa".
        If asked what your name is, your response MUST be "Mathify".
        Your goal is to help the user understand math concepts clearly. 
        Use markdown to format your responses. For math formulas, use simple text or markdown syntax.`;

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');
        await streamResponse(message, systemPrompt, res);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/solve', async (req, res) => {
    try {
        const { problem } = req.body;
        if (!problem) return res.status(400).json({ error: 'Problem is required' });

        const systemPrompt = `You are an expert math solver. The user will provide a math problem. 
        You MUST break down the solution into clear, numbered, step-by-step instructions. 
        Do not just give the final answer. Explain the "why" behind each step.
        Format your response in markdown.`;

        const solution = await generateResponseNonStream(problem, systemPrompt);
        res.json({ solution });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/quiz/generate', async (req, res) => {
    try {
        const { topic, difficulty = 'medium' } = req.body;
        if (!topic) return res.status(400).json({ error: 'Topic is required' });

        const systemPrompt = `You are a test generator. Create a short math quiz consisting of exactly 3 questions based on the topic provided by the user.
        The difficulty level should be ${difficulty}.
        Return ONLY a JSON object with a "questions" key containing an array of 3 objects.
        Each question object must have this exact structure:
        {
            "id": 1,
            "question": "The question text here"
        }
        Do NOT provide the answers. Do NOT include any other text besides the JSON object.`;

        let quizDataRaw = await generateResponseNonStream(`Topic: ${topic}\nDifficulty: ${difficulty}`, systemPrompt, true);
        quizDataRaw = quizDataRaw.replace(/```json/gi, '').replace(/```/g, '').trim();

        let quizObj;
        try {
            quizObj = JSON.parse(quizDataRaw);
        } catch (e) {
            const startIdx = quizDataRaw.indexOf('{');
            const endIdx = quizDataRaw.lastIndexOf('}');
            if (startIdx !== -1 && endIdx !== -1) {
                try {
                    quizObj = JSON.parse(quizDataRaw.substring(startIdx, endIdx + 1));
                } catch (innerErr) {
                    console.error('Failed to parse Quiz JSON with fallback:', quizDataRaw);
                    return res.status(500).json({ error: 'AI failed to generate a valid quiz format. Please try again.' });
                }
            } else {
                console.error('Failed to parse Quiz JSON:', quizDataRaw);
                return res.status(500).json({ error: 'AI failed to generate a valid quiz format. Please try again.' });
            }
        }

        if (!quizObj || !Array.isArray(quizObj.questions)) {
            console.error("Quiz JSON does not contain 'questions' array:", quizObj);
            if (Array.isArray(quizObj)) {
                return res.json({ quiz: quizObj });
            }
            return res.status(500).json({ error: 'AI generated invalid quiz data structure.' });
        }

        res.json({ quiz: quizObj.questions });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/quiz/evaluate', async (req, res) => {
    try {
        const { questions, userAnswers } = req.body;
        if (!questions || !userAnswers) return res.status(400).json({ error: 'Questions and userAnswers are required' });

        const systemPrompt = `You are an AI Math Teacher grading a quiz. 
         I will provide you with the original questions and the student's answers.
         You need to evaluate if each answer is correct. 
         Provide encouraging feedback for each question, explaining the correct answer if they got it wrong.
         Format your response clearly using markdown.`;

        const prompt = `Questions and Student Answers:\n${JSON.stringify({ questions, userAnswers }, null, 2)}`;

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');
        await streamResponse(prompt, systemPrompt, res);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Mathify running at http://localhost:${port}`);
    console.log(`Using ${provider} (${model})`);
});
