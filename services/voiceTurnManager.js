const { transcribeAudio, synthesizeSpeech } = require('./audioService');
const { chatWithModelStream } = require('./agentCore');

/**
 * Tier 3 Voice Turn Wrapper.
 * Wraps the exact same core agent brain without modifying agent logic.
 * 
 * @param {Buffer} audioBuffer - Spoken audio input from mic/push-to-talk
 * @param {Array} history - Running conversation history
 * @param {Function} [onChunk] - Stream text chunk callback
 * @param {Function} [onToolCall] - Tool call callback
 * @returns {Promise<{ transcript: string, replyText: string, audioBuffer: Buffer }>}
 */
async function processVoiceTurn(audioBuffer, history = [], onChunk = null, onToolCall = null) {
    // 1. Transcribe incoming audio via Gemini STT seam
    const transcript = await transcribeAudio(audioBuffer);
    if (!transcript) {
        throw new Error('No speech detected in audio input.');
    }

    // 2. Append transcribed user turn to history
    history.push({ role: 'user', parts: [{ text: transcript }] });

    // 3. Run the exact same brain seam from Tiers 1 & 2
    let replyText = '';
    const stream = chatWithModelStream(history, onToolCall);

    for await (const chunk of stream) {
        const textChunk = typeof chunk === 'string' ? chunk : (chunk.text || '');
        replyText += textChunk;
        if (onChunk) onChunk(textChunk);
    }

    // Append model reply to history
    history.push({ role: 'model', parts: [{ text: replyText }] });

    // 4. Synthesize spoken response via Gemini TTS seam
    const speechAudioBuffer = await synthesizeSpeech(replyText);

    return {
        transcript,
        replyText,
        audioBuffer: speechAudioBuffer
    };
}

module.exports = {
    processVoiceTurn
};
