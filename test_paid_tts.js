require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function testPaidTTS(modelName) {
    console.log(`Testing Paid API Key with model: ${modelName}...`);
    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: 'Say in a friendly tutor voice: Hello, I am Trillion your ZIMSEC math tutor!',
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

        const parts = response.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
            if (part.inlineData && part.inlineData.data) {
                const audioBuf = Buffer.from(part.inlineData.data, 'base64');
                console.log(`✅ SUCCESS [${modelName}]: Audio generated! ${audioBuf.length} bytes received.`);
                return true;
            }
        }
        console.warn(`⚠️ [${modelName}]: No audio inlineData found in response.`);
    } catch (e) {
        console.error(`❌ [${modelName} Error]:`, e.message);
    }
    return false;
}

async function run() {
    await testPaidTTS('gemini-2.0-flash-exp');
    await testPaidTTS('gemini-2.5-flash-preview-tts');
    await testPaidTTS('gemini-2.0-flash');
}

run();
