require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const STT_MODEL = process.env.GEMINI_STT_MODEL || 'gemini-3.5-flash-lite';
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';

const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

function correctMathTranscription(text) {
    if (!text) return '';
    let corrected = text;

    const mathPhoneticMap = [
        [/\b(musical|music|music call)\b/gi, 'circle geometry'],
        [/\b(circle jam tree|circle jam|circle geom|search geometry)\b/gi, 'circle geometry'],
        [/\b(quad ratic|quad ratics|quadratics)\b/gi, 'quadratic equations'],
        [/\b(trigonom tree|trigonom|trig)\b/gi, 'trigonometry'],
        [/\b(simul tenous|simultaneous)\b/gi, 'simultaneous equations'],
        [/\b(sear ds|third|third surds)\b/gi, 'surds'],
        [/\b(mat rices|may trices)\b/gi, 'matrices'],
        [/\b(log rithms|logarithm|logs)\b/gi, 'logarithms'],
        [/\b(in equalities|in quality)\b/gi, 'inequalities']
    ];

    for (const [regex, replacement] of mathPhoneticMap) {
        corrected = corrected.replace(regex, replacement);
    }

    return corrected;
}

/**
 * Seam 1: Speech-to-Text (STT) via Gemini Multimodal Audio Streaming
 * Transcribes audio buffer to plain text using generateContentStream.
 * @param {Buffer} audioBuffer - Raw audio data (wav, mp3, webm, pcm)
 * @param {string} [mimeType='audio/wav'] - Audio mime type
 * @returns {Promise<string>} Transcribed text
 */
async function transcribeAudio(audioBuffer, mimeType = 'audio/wav') {
    if (!ai) throw new Error('GEMINI_API_KEY missing for STT.');
    if (!audioBuffer || audioBuffer.length === 0) return '';

    try {
        const base64Audio = audioBuffer.toString('base64');
        const cleanMime = (mimeType || 'audio/webm').split(';')[0];
        const responseStream = await ai.models.generateContentStream({
            model: STT_MODEL,
            contents: [
                {
                    inlineData: {
                        mimeType: cleanMime,
                        data: base64Audio
                    }
                },
                {
                    text: "Transcribe the user's spoken audio into accurate English text. The user is a ZIMSEC Mathematics student asking about topics such as: circle geometry, quadratic equations, matrices, logarithms, surds, vectors, trigonometry, calculus, inequalities, indices, sets, probability, consumer arithmetic, linear programming, and mensuration. Output only the verbatim transcription text without quotes."
                }
            ]
        });

        let fullTranscript = '';
        for await (const chunk of responseStream) {
            fullTranscript += chunk.text || '';
        }

        const raw = fullTranscript.trim();
        return correctMathTranscription(raw);
    } catch (err) {
        console.error('⚠️ [STT Error]:', err.message);
        throw new Error(`Speech transcription failed: ${err.message}`);
    }
}

/**
 * Helper to convert raw PCM audio buffer to valid playable WAV buffer.
 */
function pcmToWav(pcmBuffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
    const header = Buffer.alloc(44);
    const dataLen = pcmBuffer.length;
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataLen, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
    header.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataLen, 40);
    return Buffer.concat([header, pcmBuffer]);
}

function cleanTextForTTS(text) {
    if (!text) return '';
    return text
        .replace(/\\times/g, ' times ')
        .replace(/\\div/g, ' divided by ')
        .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1 over $2')
        .replace(/\\sqrt\[([^\]]+)\]\{([^}]+)\}/g, '$1 root of $2')
        .replace(/\\sqrt\{([^}]+)\}/g, 'square root of $1')
        .replace(/\^\{([^}]+)\}/g, ' to the power $1')
        .replace(/\^([0-9a-zA-Z]+)/g, ' to the power $1')
        .replace(/[\\[\]{}#*_`$\\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Seam 2: Text-to-Speech (TTS) via Gemini Native Voice Generation Streaming (Fenrir Profile)
 * Synthesizes spoken audio from text using generateContentStream.
 * @param {string} text - Text to speak
 * @returns {Promise<Buffer>} Playable WAV Audio buffer
 */
async function synthesizeSpeech(text) {
    if (!ai) throw new Error('GEMINI_API_KEY missing for TTS.');
    if (!text || !text.trim()) return Buffer.alloc(0);

    try {
        const cleanText = cleanTextForTTS(text);
        if (!cleanText) return Buffer.alloc(0);

        const responseStream = await ai.models.generateContentStream({
            model: TTS_MODEL,
            contents: cleanText,
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

        if (pcmChunks.length > 0) {
            const fullPcmBuffer = Buffer.concat(pcmChunks);
            return pcmToWav(fullPcmBuffer, 24000, 1, 16);
        }

        console.warn('⚠️ [TTS Warning]: No audio part found in Gemini TTS stream.');
        return Buffer.alloc(0);
    } catch (err) {
        console.error('⚠️ [TTS Error]:', err.message);
        return Buffer.alloc(0);
    }
}

module.exports = {
    transcribeAudio,
    synthesizeSpeech,
    pcmToWav
};
