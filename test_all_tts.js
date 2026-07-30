require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function testModel(modelName) {
    console.log(`Testing TTS model: ${modelName}...`);
    try {
        const responseStream = await ai.models.generateContentStream({
            model: modelName,
            contents: 'Hello, this is a test of Gemini voice synthesis.',
            config: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: {
                            voiceName: 'Fenrir'
                        }
                    }
                }
            }
        });

        const pcmChunks = [];
        for await (const chunk of responseStream) {
            const candidateParts = chunk.candidates?.[0]?.content?.parts || [];
            for (const part of candidateParts) {
                if (part.inlineData && part.inlineData.data) {
                    pcmChunks.push(Buffer.from(part.inlineData.data, 'base64'));
                }
            }
        }
        console.log(`SUCCESS ${modelName}: ${pcmChunks.length} audio chunks received! Total bytes:`, Buffer.concat(pcmChunks).length);
    } catch (e) {
        console.error(`FAILED ${modelName}:`, e.message);
    }
}

async function runAll() {
    await testModel('gemini-2.5-flash-preview-tts');
    await testModel('gemini-2.5-flash');
    await testModel('gemini-2.0-flash');
}

runAll();
