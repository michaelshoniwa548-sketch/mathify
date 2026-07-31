const API_BASE = window.location.origin + '/api';

// DOM Elements
const navLinks = document.querySelectorAll('.nav-links li');
const views = document.querySelectorAll('.view');
const loadingOverlay = document.getElementById('loading-overlay');
const apiStatusDot = document.getElementById('api-status-dot');
const apiStatusText = document.getElementById('api-status-text');

// --- Initialization ---
async function checkApiHealth() {
    try {
        const res = await fetch(`${API_BASE}/health`);
        const data = await res.json();
        if (data.status === 'ok') {
            apiStatusDot.className = 'dot online';
            apiStatusText.textContent = `${data.provider} (${data.model})`;
        } else {
            throw new Error('API not ok');
        }
    } catch (error) {
        apiStatusDot.className = 'dot offline';
        apiStatusText.textContent = 'Backend Offline';
    }
}

// Run health check on load
checkApiHealth();

// --- Navigation ---
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        navLinks.forEach(l => l.classList.remove('active'));
        views.forEach(v => {
            v.classList.remove('active');
            v.classList.add('hidden');
        });

        link.classList.add('active');

        const targetId = link.getAttribute('data-target');
        const targetView = document.getElementById(targetId);
        if (targetView) {
            targetView.classList.remove('hidden');
            setTimeout(() => targetView.classList.add('active'), 10);
        }
    });
});

// --- Utility Functions ---
function renderMath(element) {
    if (!element || !window.renderMathInElement) return;
    try {
        window.renderMathInElement(element, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false },
                { left: '\\(', right: '\\)', display: false },
                { left: '\\[', right: '\\]', display: true }
            ],
            throwOnError: false
        });
    } catch (e) {
        console.warn('[KaTeX Render Warning]:', e.message);
    }
}

function formatPureKaTeX(text) {
    if (!text || typeof text !== 'string') return '';
    let processed = text;

    // 1. Un-escape double-encoded HTML entities
    processed = processed
        .replace(/&amp;#36;/g, '$')
        .replace(/&#36;/g, '$')
        .replace(/&amp;lt;/g, '<')
        .replace(/&amp;gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');

    // 2. Strip raw HTML list tags outputted by Gemini (e.g. <ol>, <li>, <ul>, </ol>, </li>, </ul>)
    processed = processed.replace(/<\/?(ol|ul|li|p|div|span)[^>]*>/gi, '\n');

    // 3. Fix unclosed single $ delimiters around single numbers or variables (e.g. $3, $0, $6)
    processed = processed.replace(/\$([0-9a-zA-Z\+\-\*\/]+)(?=\s|[\,\.\:\;\!\?]|$)(?!\$)/g, '$$$1$$');

    // 4. Unwrap accidental $...$ blocks that enclose regular English sentences
    processed = processed.replace(/\$([^\$\n]+?)\$/g, (match, expr) => {
        if (/\b[a-zA-Z]{2,}\s+[a-zA-Z]{2,}\s+[a-zA-Z]{2,}\b/.test(expr)) {
            return expr.replace(/\b([a-zA-Z0-9_\+\-\*\/\=\(\)\{\}\^]+)\b/g, (m) => {
                if (/^(?:[a-zA-Z]|[0-9]+[a-zA-Z]+|\(?[xYzabc0-9\+\-\*\/\^]+\)?)$/.test(m)) {
                    return `$${m}$`;
                }
                return m;
            });
        }
        return match;
    });

    // Auto-fix unclosed $$ display math blocks
    const countDisplayDelims = (processed.match(/\$\$/g) || []).length;
    if (countDisplayDelims % 2 !== 0) {
        processed += '$$';
    }

    // Auto-fix unclosed $ inline math blocks
    const sansDisplay = processed.replace(/\$\$/g, '');
    const countInlineDelims = (sansDisplay.match(/\$/g) || []).length;
    if (countInlineDelims % 2 !== 0) {
        processed += '$';
    }

    // Auto-close missing braces in \frac{num}{den} if truncated
    const openBraces = (processed.match(/\{/g) || []).length;
    const closeBraces = (processed.match(/\}/g) || []).length;
    if (openBraces > closeBraces) {
        processed += '}'.repeat(openBraces - closeBraces);
    }

    // Clean bare \text{x} or \text{(x-1)} into $x$ or $(x-1)$ BEFORE parsing
    processed = processed.replace(/\\text\{([^}]+)\}/g, '$$$1$$');

    // 1. Run markdown parsing FIRST so marked does NOT mangle rendered KaTeX HTML spans
    let html = processed;
    if (window.marked) {
        try {
            html = window.marked.parse(html);
        } catch (e) {}
    }

    // 2. Run KaTeX rendering SECOND on the HTML content
    if (window.katex) {
        // Render display math $$ ... $$
        html = html.replace(/\$\$([\s\S]+?)\$\$/g, (match, expr) => {
            try {
                const res = window.katex.renderToString(expr.trim(), { displayMode: true, output: 'html', throwOnError: false });
                return res.replace(/<span class="katex-error"[^>]*>([\s\S]*?)<\/span>/g, '$1');
            } catch (e) {
                return match;
            }
        });

        // Render inline math $ ... $
        html = html.replace(/\$([^\$\n]+?)\$/g, (match, expr) => {
            try {
                const res = window.katex.renderToString(expr.trim(), { displayMode: false, output: 'html', throwOnError: false });
                return res.replace(/<span class="katex-error"[^>]*>([\s\S]*?)<\/span>/g, '$1');
            } catch (e) {
                return match;
            }
        });

        // Render bare un-delimited LaTeX commands (\frac, \sqrt, \theta, \pi, etc.)
        html = html.replace(/\\(frac|sqrt|times|div|pm|alpha|beta|theta|pi|int|sum|vec|le|ge|neq|approx)(\{[^}]+\})+/g, (match) => {
            try {
                const res = window.katex.renderToString(match, { displayMode: false, output: 'html', throwOnError: false });
                return res.replace(/<span class="katex-error"[^>]*>([\s\S]*?)<\/span>/g, '$1');
            } catch (e) {
                return match;
            }
        });
    }

    // Ultimate Raw LaTeX Fallback Scrubber: Convert any unrendered LaTeX into clean math text and strip all backslashes
    html = html
        .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)')
        .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
        .replace(/\\text\{([^}]+)\}/g, '$1')
        .replace(/\\left\(|\\right\)/g, (m) => m.includes('left') ? '(' : ')')
        .replace(/\\left\[|\\right\]/g, (m) => m.includes('left') ? '[' : ']')
        .replace(/\\times|\\cdot/g, '×')
        .replace(/\\div/g, '÷')
        .replace(/\\pm/g, '±')
        .replace(/\\leq|\\le/g, '≤')
        .replace(/\\geq|\\ge/g, '≥')
        .replace(/\\neq/g, '≠')
        .replace(/\\approx/g, '≈')
        .replace(/\\alpha/g, 'α')
        .replace(/\\beta/g, 'β')
        .replace(/\\theta/g, 'θ')
        .replace(/\\pi/g, 'π')
        .replace(/\\infty/g, '∞')
        .replace(/\\quad|\\qquad/g, ' ')
        .replace(/\\begin\{[^}]+\}|\\end\{[^}]+\}/g, '')
        .replace(/\\([a-zA-Z]+)/g, '$1')
        .replace(/\\/g, '');

    // Strip any residual red error spans if generated anywhere
    html = html.replace(/<span class="katex-error"[^>]*>([\s\S]*?)<\/span>/g, '$1');

    return html;
}
function showLoading(show) {
    if (show) {
        loadingOverlay.classList.remove('hidden');
    } else {
        loadingOverlay.classList.add('hidden');
    }
}

function handleEnter(e, submitBtn) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitBtn.click();
    }
}

function isNearBottom(el, threshold = 120) {
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

function scrollToBottom(el, smooth = false) {
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}

// --- Attachment State & UI Preview Helper ---
function renderAttachmentPreview(container, attachment, onRemove) {
    if (!container) return;
    if (!attachment) {
        container.innerHTML = '';
        return;
    }
    const isImg = attachment.mimeType.startsWith('image/');
    container.innerHTML = `
        <div class="attachment-chip">
            ${isImg ? `<img src="${attachment.data}" alt="attachment">` : '📄'}
            <span class="chip-name">${attachment.name}</span>
            <span class="chip-remove" title="Remove file">&times;</span>
        </div>
    `;
    const removeBtn = container.querySelector('.chip-remove');
    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            container.innerHTML = '';
            onRemove();
        });
    }
}

// --- 1. Chat Functionality ---
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat');
const chatHistory = document.getElementById('chat-history');
const chatFileBtn = document.getElementById('chat-file-btn');
const chatFileInput = document.getElementById('chat-file-input');
const chatPreviewContainer = document.getElementById('chat-attachment-preview');
let currentChatAttachment = null;

if (chatFileBtn && chatFileInput) {
    chatFileBtn.addEventListener('click', () => chatFileInput.click());
    chatFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            currentChatAttachment = {
                name: file.name,
                mimeType: file.type || 'image/png',
                data: evt.target.result
            };
            renderAttachmentPreview(chatPreviewContainer, currentChatAttachment, () => {
                currentChatAttachment = null;
                chatFileInput.value = '';
            });
        };
        reader.readAsDataURL(file);
    });
}

if (chatInput && sendChatBtn) {
    chatInput.addEventListener('keydown', (e) => handleEnter(e, sendChatBtn));

    sendChatBtn.addEventListener('click', async () => {
        const message = chatInput.value.trim();
        const attachmentToSend = currentChatAttachment;
        if (!message && !attachmentToSend) return;

        let userDisplayMsg = message;
        if (attachmentToSend) {
            userDisplayMsg += `\n\n*📎 Attached File: ${attachmentToSend.name}*`;
        }

        addChatMessage(userDisplayMsg, true);
        chatInput.value = '';
        currentChatAttachment = null;
        if (chatPreviewContainer) chatPreviewContainer.innerHTML = '';
        if (chatFileInput) chatFileInput.value = '';

        const thinkingDiv = document.createElement('div');
        thinkingDiv.className = 'message ai thinking-message';
        thinkingDiv.innerHTML = `
            <div class="avatar"><img src="logo.png" alt="Mathify"></div>
            <div class="bubble">
                <div class="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;
        chatHistory.appendChild(thinkingDiv);
        scrollToBottom(chatHistory, true);

        chatInput.disabled = true;
        sendChatBtn.disabled = true;

        try {
            const res = await fetch(`${API_BASE}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, attachment: attachmentToSend })
            });

            if (thinkingDiv) thinkingDiv.remove();
            if (!res.ok) throw new Error('API Error');

            const msgDiv = document.createElement('div');
            msgDiv.className = 'message ai';
            msgDiv.innerHTML = `<div class="avatar"><img src="logo.png" alt="Mathify"></div><div class="bubble markdown-body streaming"></div>`;
            chatHistory.appendChild(msgDiv);
            const bubble = msgDiv.querySelector('.bubble');
            scrollToBottom(chatHistory, true);

            let accumulatedText = "";
            const reader = res.body.getReader();
            const decoder = new TextDecoder('utf-8');

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const stick = isNearBottom(chatHistory);
                const chunk = decoder.decode(value, { stream: true });
                accumulatedText += chunk;
                bubble.innerHTML = marked.parse(accumulatedText);
                renderMath(bubble);
                if (stick) scrollToBottom(chatHistory);
            }

            bubble.classList.remove('streaming');
            renderMath(bubble);

        } catch (err) {
            if (thinkingDiv) thinkingDiv.remove();
            addChatMessage(`Error: ${err.message}`);
        } finally {
            chatInput.disabled = false;
            sendChatBtn.disabled = false;
            chatInput.focus();
        }
    });
}

function addChatMessage(content, isUser = false) {
    if (!chatHistory) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isUser ? 'user' : 'ai'}`;

    let htmlContent = isUser ? content : marked.parse(content);

    msgDiv.innerHTML = `
        <div class="avatar">${isUser ? '👤' : '<img src="logo.png" alt="Mathify">'}</div>
        <div class="bubble markdown-body">${htmlContent}</div>
    `;

    chatHistory.appendChild(msgDiv);
    const bubble = msgDiv.querySelector('.bubble');
    if (bubble) renderMath(bubble);
    scrollToBottom(chatHistory, true);
}

window.addChatMessage = addChatMessage;


// --- 2. Solve Functionality ---
const solveInput = document.getElementById('solve-input');
const btnSolve = document.getElementById('btn-solve');
const solveOutput = document.getElementById('solve-output');
const solveFileBtn = document.getElementById('solve-file-btn');
const solveFileInput = document.getElementById('solve-file-input');
const solvePreviewContainer = document.getElementById('solve-attachment-preview');
let currentSolveAttachment = null;

if (solveFileBtn && solveFileInput) {
    solveFileBtn.addEventListener('click', () => solveFileInput.click());
    solveFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            currentSolveAttachment = {
                name: file.name,
                mimeType: file.type || 'image/png',
                data: evt.target.result
            };
            renderAttachmentPreview(solvePreviewContainer, currentSolveAttachment, () => {
                currentSolveAttachment = null;
                solveFileInput.value = '';
            });
        };
        reader.readAsDataURL(file);
    });
}

if (solveInput && btnSolve) {
    solveInput.addEventListener('keydown', (e) => handleEnter(e, btnSolve));

    btnSolve.addEventListener('click', async () => {
        const problem = solveInput.value.trim();
        const attachmentToSend = currentSolveAttachment;
        if (!problem && !attachmentToSend) return;

        solveOutput.innerHTML = `
            <div class="solve-thinking">
                <div class="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
                <p class="placeholder-text">Analyzing problem and generating step-by-step solution...</p>
            </div>
        `;
        
        solveInput.disabled = true;
        btnSolve.disabled = true;
        btnSolve.textContent = 'Solving...';

        currentSolveAttachment = null;
        if (solvePreviewContainer) solvePreviewContainer.innerHTML = '';
        if (solveFileInput) solveFileInput.value = '';

        try {
            const res = await fetch(`${API_BASE}/solve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ problem, attachment: attachmentToSend })
            });

            if (!res.ok) throw new Error(`Server error: ${res.statusText}`);

            let accumulatedText = "";
            const reader = res.body.getReader();
            const decoder = new TextDecoder('utf-8');

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                accumulatedText += chunk;
                solveOutput.innerHTML = marked.parse(accumulatedText);
                renderMath(solveOutput);
            }

            renderMath(solveOutput);

        } catch (err) {
            solveOutput.innerHTML = `<p style="color: #ff5252;">Error: ${err.message}</p>`;
        } finally {
            solveInput.disabled = false;
            btnSolve.disabled = false;
            btnSolve.textContent = 'Solve Problem';
        }
    });
}

// --- 3. Quiz Functionality ---
const panelSetup = document.getElementById('quiz-setup');
const panelActive = document.getElementById('quiz-active');
const panelResults = document.getElementById('quiz-results');

const btnGenerateQuiz = document.getElementById('btn-generate-quiz');
const topicInput = document.getElementById('quiz-topic');
const topicsContainer = document.getElementById('quiz-topics');
const difficultySelect = document.getElementById('quiz-difficulty');
const countSelect = document.getElementById('quiz-count');

const questionsContainer = document.getElementById('quiz-questions-container');
const btnSubmitQuiz = document.getElementById('btn-submit-quiz');
const activeQuizTitle = document.getElementById('active-quiz-title');

const quizFeedbackContainer = document.getElementById('quiz-feedback');
const btnNewQuiz = document.getElementById('btn-new-quiz');

let currentQuizData = null;

if (btnGenerateQuiz) {
    btnGenerateQuiz.addEventListener('click', async () => {
        const selectedTopics = Array.from(topicsContainer.querySelectorAll('input:checked')).map(cb => cb.value);
        const customTopics = topicInput.value.split(',').map(t => t.trim()).filter(Boolean);
        const topics = [...selectedTopics, ...customTopics];

        if (topics.length === 0) {
            alert("Please pick at least one topic or add your own.");
            return;
        }

        const difficulty = difficultySelect.value;
        const count = parseInt(countSelect.value, 10) || 5;

        btnGenerateQuiz.disabled = true;
        topicInput.disabled = true;
        difficultySelect.disabled = true;
        countSelect.disabled = true;
        btnGenerateQuiz.textContent = 'Generating Quiz...';

        const statusMsg = document.createElement('div');
        statusMsg.className = 'quiz-status-msg';
        statusMsg.innerHTML = `
            <div class="typing-indicator" style="justify-content: center; margin-top: 1rem;">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;
        panelSetup.appendChild(statusMsg);

        try {
            const res = await fetch(`${API_BASE}/quiz/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topics, difficulty, count })
            });

            const data = await res.json();
            if (data.error) throw new Error(data.error);

            currentQuizData = data.quiz;
            renderQuiz(currentQuizData, topics.join(', '));

            panelSetup.classList.add('hidden');
            panelActive.classList.remove('hidden');

        } catch (err) {
            alert(`Error generating quiz: ${err.message}`);
        } finally {
            btnGenerateQuiz.disabled = false;
            topicInput.disabled = false;
            difficultySelect.disabled = false;
            countSelect.disabled = false;
            btnGenerateQuiz.textContent = 'Generate Quiz';
            statusMsg.remove();
        }
    });
}

function renderQuiz(questions, topic) {
    if (!questionsContainer) return;
    activeQuizTitle.textContent = `ZIMSEC O-Level Quiz: ${topic}`;
    questionsContainer.innerHTML = '';

    questions.forEach((q, index) => {
        const qDiv = document.createElement('div');
        qDiv.className = 'quiz-question-card';
        const formattedQuestion = formatPureKaTeX(q.question);
        qDiv.innerHTML = `
            <h4>Question ${index + 1}</h4>
            <div class="quiz-question-text">${formattedQuestion}</div>
            <input type="text" id="answer-${q.id}" placeholder="Your answer here..." class="mt-4">
        `;
        questionsContainer.appendChild(qDiv);
    });

    renderMath(questionsContainer);
}

if (btnSubmitQuiz) {
    btnSubmitQuiz.addEventListener('click', async () => {
        if (!currentQuizData) return;

        const userAnswers = {};
        currentQuizData.forEach(q => {
            const ansInput = document.getElementById(`answer-${q.id}`);
            userAnswers[q.id] = ansInput ? ansInput.value.trim() : '';
            if (ansInput) ansInput.disabled = true;
        });

        btnSubmitQuiz.disabled = true;
        btnSubmitQuiz.textContent = 'Submitting Answers...';

        quizFeedbackContainer.innerHTML = `
            <div class="quiz-thinking">
                <div class="typing-indicator" style="margin-bottom: 1rem;">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
                <p style="color: var(--text-secondary);">Grading your quiz and generating feedback...</p>
            </div>
        `;
        panelActive.classList.add('hidden');
        panelResults.classList.remove('hidden');

        try {
            const res = await fetch(`${API_BASE}/quiz/evaluate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    questions: currentQuizData,
                    userAnswers
                })
            });

            if (!res.ok) throw new Error('API Error');

            quizFeedbackContainer.innerHTML = '';
            quizFeedbackContainer.classList.add('streaming');

            let accumulatedText = "";
            const reader = res.body.getReader();
            const decoder = new TextDecoder('utf-8');

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const stick = isNearBottom(panelResults);
                const chunk = decoder.decode(value, { stream: true });
                accumulatedText += chunk;
                quizFeedbackContainer.innerHTML = formatPureKaTeX(accumulatedText);
                renderMath(quizFeedbackContainer);
                if (stick) scrollToBottom(panelResults);
            }

            quizFeedbackContainer.classList.remove('streaming');
            renderMath(quizFeedbackContainer);

        } catch (err) {
            quizFeedbackContainer.classList.remove('streaming');
            quizFeedbackContainer.innerHTML = `<p style="color: #ff5252;">Error evaluating quiz: ${err.message}</p>`;
        } finally {
            btnSubmitQuiz.disabled = false;
            btnSubmitQuiz.textContent = 'Submit Answers';
            currentQuizData.forEach(q => {
                const ansInput = document.getElementById(`answer-${q.id}`);
                if (ansInput) ansInput.disabled = false;
            });
        }
    });
}

if (btnNewQuiz) {
    btnNewQuiz.addEventListener('click', () => {
        currentQuizData = null;
        if (topicInput) topicInput.value = '';
        panelResults.classList.add('hidden');
        panelSetup.classList.remove('hidden');
    });
}

// --- 4. AI Voice Assistant Integration (Tier 3) ---
document.addEventListener('DOMContentLoaded', () => {
    const stateBadge = document.getElementById('assistant-state-badge');
    const stateText = document.getElementById('assistant-state-text');
    const feed = document.getElementById('assistant-feed');
    const pttBtn = document.getElementById('ptt-btn');
    const pttText = document.getElementById('ptt-text');
    const textInput = document.getElementById('assistant-text-input');
    const sendBtn = document.getElementById('assistant-send-btn');

    if (!pttBtn) return;

    let currentState = 'Ready';
    let recognition = null;
    let isRecording = false;
    let speechTranscript = '';

    // Autoplay Policy Unlocker for Chrome/Edge/Safari
    const globalAudio = new Audio();
    let isAudioUnlocked = false;

    function unlockBrowserAudio() {
        if (isAudioUnlocked) return;
        globalAudio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
        globalAudio.play().then(() => {
            isAudioUnlocked = true;
        }).catch(() => {});
    }

    document.addEventListener('click', unlockBrowserAudio);
    document.addEventListener('keydown', unlockBrowserAudio);

    // Initialize Web Speech Recognition if available
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (e) => {
            let transcript = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                transcript += e.results[i][0].transcript;
            }
            speechTranscript = transcript;
        };

        recognition.onerror = (e) => {
            console.warn('[STT Warning]:', e.error);
        };
    }

    // --- Interruption Logic ---
    function stopCurrentAudio() {
        if (globalAudio) {
            try { globalAudio.pause(); } catch(e) {}
        }
    }

    // --- State Manager ---
    function setVisualState(state) {
        currentState = state;
        const energyRing = document.getElementById('assistant-energy-ring');
        if (stateText) stateText.textContent = state;
        if (stateBadge) {
            stateBadge.className = `state-badge ${state.toLowerCase()}`;
        }
        if (energyRing) {
            energyRing.className = `energy-ring state-${state.toLowerCase()}`;
        }
    }

    // --- Feed UI Helpers ---
    function appendFeedMessage(role, text) {
        if (!feed) return null;
        const msgDiv = document.createElement('div');
        msgDiv.className = `feed-message ${role}`;
        const parsedHtml = (role === 'assistant' || role === 'user') ? marked.parse(text || '') : (text || '');
        msgDiv.innerHTML = `<div class="msg-content">${parsedHtml}</div>`;
        feed.appendChild(msgDiv);
        const content = msgDiv.querySelector('.msg-content');
        if (content) renderMath(content);
        feed.scrollTop = feed.scrollHeight;
        return msgDiv;
    }

    function appendToolBadge(toolName, args) {
        if (!feed) return;
        const badgeDiv = document.createElement('div');
        badgeDiv.className = 'feed-tool-badge';
        badgeDiv.innerHTML = `⚙️ Called Tool: <strong>${toolName}</strong> (${JSON.stringify(args || {})})`;
        feed.appendChild(badgeDiv);
        feed.scrollTop = feed.scrollHeight;
    }

    const audioPlayer = document.getElementById('mathify-audio-player');
    let activeTurnAbortController = null;

    function stopCurrentAudio() {
        if (audioPlayer) {
            try { audioPlayer.pause(); audioPlayer.src = ''; } catch(e) {}
        }
    }

    function cancelPreviousTurn() {
        if (activeTurnAbortController) {
            try { activeTurnAbortController.abort(); } catch(e) {}
            activeTurnAbortController = null;
        }
        stopCurrentAudio();

        if (feed) {
            const bubbles = feed.querySelectorAll('.feed-message.assistant');
            bubbles.forEach(b => {
                const content = b.querySelector('.msg-content');
                if (content && (!content.textContent.trim() || b.dataset.streaming === 'true')) {
                    b.remove();
                }
            });
        }
    }

    function speakTextFallback(text) {
        if (!('speechSynthesis' in window)) {
            setVisualState('Ready');
            return;
        }
        try {
            window.speechSynthesis.cancel();
            const clean = text
                .replace(/\\times/g, ' times ')
                .replace(/\\div/g, ' divided by ')
                .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1 over $2')
                .replace(/\\sqrt\{([^}]+)\}/g, 'square root of $1')
                .replace(/\^2/g, ' squared')
                .replace(/\^3/g, ' cubed')
                .replace(/[\$\{\}\\\#\*\_]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            if (!clean) {
                setVisualState('Ready');
                return;
            }

            const utterance = new SpeechSynthesisUtterance(clean);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.lang = 'en-US';

            const voices = window.speechSynthesis.getVoices();
            const preferredVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Daniel'))) || voices.find(v => v.lang.startsWith('en'));
            if (preferredVoice) utterance.voice = preferredVoice;

            utterance.onstart = () => setVisualState('Speaking');
            utterance.onend = () => setVisualState('Ready');
            utterance.onerror = () => setVisualState('Ready');

            window.speechSynthesis.speak(utterance);
        } catch (e) {
            setVisualState('Ready');
        }
    }

    // --- Send Turn to Backend (SSE streaming) ---
    async function sendTurn(userInput) {
        if (!userInput || !userInput.trim()) return;

        cancelPreviousTurn();
        activeTurnAbortController = new AbortController();

        // Unlock audio element inside user-gesture stack
        if (audioPlayer) {
            audioPlayer.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
            audioPlayer.load();
            audioPlayer.play().catch(() => {});
        }

        appendFeedMessage('user', userInput);
        setVisualState('Thinking');

        let assistantBubble = null;
        let assistantContent = null;
        let fullText = '';
        let hasPlayedAudioThisTurn = false;

        try {
            const res = await fetch('/api/trillion/turn', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: userInput }),
                signal: activeTurnAbortController.signal
            });

            if (!res.ok) {
                appendFeedMessage('system', 'Unable to reach Trillion server. Please try again.');
                setVisualState('Ready');
                return;
            }

            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                const data = await res.json();
                if (data.status === 'ignored') {
                    setVisualState('Ready');
                    return;
                }
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let sseBuffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                sseBuffer += decoder.decode(value, { stream: true });
                const lines = sseBuffer.split('\n');
                sseBuffer = lines.pop();

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    let event;
                    try { event = JSON.parse(line.slice(6)); } catch { continue; }

                    if (event.type === 'tool') {
                        setVisualState('Thinking');
                        appendToolBadge(event.name, event.args);

                    } else if (event.type === 'text') {
                        setVisualState('Thinking');
                        fullText += event.chunk;

                    } else if (event.type === 'audio' || (event.type === 'done' && event.audioBase64)) {
                        const audioData = event.audioBase64 || event.audio;

                        if (fullText && !assistantBubble) {
                            assistantBubble = appendFeedMessage('assistant', fullText);
                            assistantContent = assistantBubble ? assistantBubble.querySelector('.msg-content') : null;
                            if (assistantContent) {
                                assistantContent.innerHTML = marked.parse(fullText);
                                renderMath(assistantContent);
                            }
                            if (feed) feed.scrollTop = feed.scrollHeight;
                        }

                        if (audioData && audioPlayer) {
                            hasPlayedAudioThisTurn = true;
                            setVisualState('Speaking');
                            audioPlayer.src = audioData;
                            audioPlayer.onended = () => setVisualState('Ready');
                            audioPlayer.onerror = () => {
                                if (fullText) speakTextFallback(fullText);
                                else setVisualState('Ready');
                            };
                            audioPlayer.play().catch((err) => {
                                console.warn('[Audio Autoplay Blocked]:', err.message);
                                if (fullText) speakTextFallback(fullText);
                                else setVisualState('Ready');
                            });
                        } else if (fullText && !hasPlayedAudioThisTurn) {
                            hasPlayedAudioThisTurn = true;
                            speakTextFallback(fullText);
                        } else {
                            setVisualState('Ready');
                        }
                    } else if (event.type === 'done') {
                        if (fullText && !assistantBubble) {
                            assistantBubble = appendFeedMessage('assistant', fullText);
                            assistantContent = assistantBubble ? assistantBubble.querySelector('.msg-content') : null;
                            if (assistantContent) {
                                assistantContent.innerHTML = marked.parse(fullText);
                                renderMath(assistantContent);
                            }
                            if (feed) feed.scrollTop = feed.scrollHeight;
                        }

                        if (!hasPlayedAudioThisTurn && fullText) {
                            hasPlayedAudioThisTurn = true;
                            speakTextFallback(fullText);
                        } else if (currentState !== 'Speaking') {
                            setVisualState('Ready');
                        }
                    } else if (event.type === 'error') {
                        appendFeedMessage('system', 'Unable to process question. Please try again.');
                        setVisualState('Ready');
                    }
                }
            }

            // Audio playback handles setVisualState('Speaking') -> setVisualState('Ready') via onended

        } catch (err) {
            if (
                err.name === 'AbortError' ||
                activeTurnAbortController?.signal?.aborted ||
                (err.message && (
                    err.message.toLowerCase().includes('abort') || 
                    err.message.toLowerCase().includes('cancel') ||
                    err.message.toLowerCase().includes('user') ||
                    err.message.toLowerCase().includes('signal')
                ))
            ) {
                // Intentionally canceled by user or superseded — silence completely!
                return;
            }
            console.error('Turn error:', err);
            appendFeedMessage('system', 'Unable to reach Trillion server. Please try again.');
            setVisualState('Ready');
        }
    }


    // --- Push-to-Talk Voice Handler (Web Speech API) ---
    // Uses the browser's built-in SpeechRecognition for accurate transcription.
    // SpeechRecognition runs while the button is held and sends the final
    // transcript when released.

    let pttRecognition = null;
    let pttTranscript = '';
    let pttActive = false;
    let pttFinalReceived = false;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

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

    function setupPttRecognition() {
        if (!SpeechRecognitionAPI) return null;
        const rec = new SpeechRecognitionAPI();
        rec.lang = 'en-US';
        rec.continuous = false;       // single utterance per press
        rec.interimResults = true;    // show interim so we capture best result
        rec.maxAlternatives = 1;

        rec.onstart = () => {
            pttTranscript = '';
            pttFinalReceived = false;
        };

        rec.onresult = (e) => {
            let interim = '';
            let finalText = '';
            for (let i = 0; i < e.results.length; i++) {
                const t = e.results[i][0].transcript;
                if (e.results[i].isFinal) {
                    finalText += t;
                    pttFinalReceived = true;
                } else {
                    interim += t;
                }
            }
            // Keep best available transcript auto-corrected for math phonemes
            const raw = (finalText || interim).trim();
            pttTranscript = correctMathTranscription(raw);
        };

        rec.onerror = (e) => {
            if (e.error !== 'aborted' && e.error !== 'no-speech') {
                console.warn('[PTT STT error]:', e.error);
            }
        };

        rec.onend = () => {
            // Called when recognition stops (either by us or browser)
            if (pttActive) {
                // Recognition ended while still holding — try to restart
                try { rec.start(); } catch(e) {}
            }
        };

        return rec;
    }

    function unlockAudio() {
        if (audioPlayer) {
            audioPlayer.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
            audioPlayer.load();
            audioPlayer.play().catch(() => {});
        }
    }

    document.addEventListener('click', unlockAudio, { once: true });
    document.addEventListener('keydown', unlockAudio, { once: true });

    async function startRecording() {
        if (pttActive) return;
        unlockAudio();
        cancelPreviousTurn();
        pttActive = true;
        pttTranscript = '';
        pttFinalReceived = false;
        audioChunks = [];

        if (pttText) pttText.textContent = 'Listening... Release to Send';
        pttBtn.classList.add('recording');
        setVisualState('Listening');

        // 1. Web Speech STT
        pttRecognition = setupPttRecognition();
        if (pttRecognition) {
            try { pttRecognition.start(); } catch (e) {
                console.warn('[PTT] Could not start recognition:', e.message);
            }
        }

        // 2. MediaRecorder Audio Stream with cross-platform mobile compatibility (iOS Safari + Android)
        try {
            audioStream = await navigator.mediaDevices.getUserMedia({
                audio: true
            });

            let options = {};
            try {
                if (typeof MediaRecorder.isTypeSupported === 'function') {
                    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                        options = { mimeType: 'audio/webm;codecs=opus' };
                    } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                        options = { mimeType: 'audio/mp4' };
                    } else if (MediaRecorder.isTypeSupported('audio/aac')) {
                        options = { mimeType: 'audio/aac' };
                    }
                }
            } catch(e) {}

            try {
                mediaRecorder = new MediaRecorder(audioStream, options);
            } catch(e) {
                console.warn('[PTT] MediaRecorder options failed, falling back to default:', e.message);
                mediaRecorder = new MediaRecorder(audioStream);
            }

            mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                await new Promise(r => setTimeout(r, 100));
                const text = pttTranscript.trim();
                if (text) {
                    sendTurn(text);
                } else if (audioChunks.length > 0) {
                    const chunksToSend = [...audioChunks];
                    audioChunks = [];
                    await sendAudioBlobTurn(chunksToSend);
                } else {
                    console.warn('[PTT] No audio chunks captured.');
                    setVisualState('Ready');
                }

                if (audioStream) {
                    audioStream.getTracks().forEach(track => track.stop());
                    audioStream = null;
                }
            };

            // Start recorder with 100ms timeslice for continuous mobile audio chunk flushing
            mediaRecorder.start(100);
            console.log('[PTT] Recording started successfully.');

        } catch (err) {
            console.warn('[PTT] MediaRecorder mic access error:', err);
            appendFeedMessage('system', 'Microphone access is blocked or unavailable. Please check mobile browser mic permissions.');
            setVisualState('Ready');
        }
    }

    function stopRecordingAndSend() {
        if (!pttActive) return;
        pttActive = false;
        updateMobilePttLabel();
        pttBtn.classList.remove('recording');
        setVisualState('Thinking');

        try {
            if (pttRecognition) pttRecognition.stop();
        } catch (e) {}

        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
    }

    async function sendAudioBlobTurn(chunks) {
        cancelPreviousTurn();
        activeTurnAbortController = new AbortController();
        setVisualState('Thinking');

        try {
            const mimeType = (mediaRecorder && mediaRecorder.mimeType) || 'audio/webm';
            const blob = new Blob(chunks, { type: mimeType });
            const reader = new FileReader();

            reader.onloadend = async () => {
                const base64Audio = reader.result;
                const res = await fetch('/api/trillion/voice-turn', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ audioBase64: base64Audio, mimeType }),
                    signal: activeTurnAbortController.signal
                });

                if (!res.ok) {
                    setVisualState('Ready');
                    return;
                }

                const streamReader = res.body.getReader();
                const decoder = new TextDecoder();
                let sseBuffer = '';
                let assistantBubble = null;
                let assistantContent = null;
                let fullText = '';
                let hasPlayedAudioThisTurn = false;

                while (true) {
                    const { done, value } = await streamReader.read();
                    if (done) break;

                    sseBuffer += decoder.decode(value, { stream: true });
                    const lines = sseBuffer.split('\n');
                    sseBuffer = lines.pop();

                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;
                        let event;
                        try { event = JSON.parse(line.slice(6)); } catch { continue; }

                        if (event.type === 'user_text') {
                            appendFeedMessage('user', event.text);

                        } else if (event.type === 'tool') {
                            setVisualState('Thinking');
                            appendToolBadge(event.name, event.args);

                        } else if (event.type === 'text') {
                            setVisualState('Thinking');
                            fullText += event.chunk;

                        } else if (event.type === 'audio' || (event.type === 'done' && event.audioBase64)) {
                            const audioData = event.audioBase64 || event.audio;

                            // Display transcript bubble TOGETHER with voice playback at the EXACT same millisecond
                            if (fullText && !assistantBubble) {
                                assistantBubble = appendFeedMessage('assistant', fullText);
                                assistantContent = assistantBubble ? assistantBubble.querySelector('.msg-content') : null;
                                if (assistantContent) {
                                    assistantContent.innerHTML = marked.parse(fullText);
                                    renderMath(assistantContent);
                                }
                                if (feed) feed.scrollTop = feed.scrollHeight;
                            }

                            if (audioData && audioPlayer) {
                                hasPlayedAudioThisTurn = true;
                                setVisualState('Speaking');
                                audioPlayer.src = audioData;
                                audioPlayer.onended = () => setVisualState('Ready');
                                audioPlayer.onerror = () => {
                                    if (fullText) speakTextFallback(fullText);
                                    else setVisualState('Ready');
                                };
                                audioPlayer.play().catch((err) => {
                                    console.warn('[Audio Autoplay Blocked]:', err.message);
                                    if (fullText) speakTextFallback(fullText);
                                    else setVisualState('Ready');
                                });
                            } else if (fullText && !hasPlayedAudioThisTurn) {
                                hasPlayedAudioThisTurn = true;
                                speakTextFallback(fullText);
                            } else {
                                setVisualState('Ready');
                            }
                        } else if (event.type === 'done') {
                            if (fullText && !assistantBubble) {
                                assistantBubble = appendFeedMessage('assistant', fullText);
                                assistantContent = assistantBubble ? assistantBubble.querySelector('.msg-content') : null;
                                if (assistantContent) {
                                    assistantContent.innerHTML = marked.parse(fullText);
                                    renderMath(assistantContent);
                                }
                                if (feed) feed.scrollTop = feed.scrollHeight;
                            }
                            if (!hasPlayedAudioThisTurn && fullText) {
                                hasPlayedAudioThisTurn = true;
                                speakTextFallback(fullText);
                            } else if (currentState !== 'Speaking') {
                                setVisualState('Ready');
                            }
                        }
                    }
                }
            };

            reader.readAsDataURL(blob);
        } catch(e) {
            if (
                e.name === 'AbortError' ||
                activeTurnAbortController?.signal?.aborted ||
                (e.message && (e.message.toLowerCase().includes('abort') || e.message.toLowerCase().includes('cancel')))
            ) {
                // Intentionally canceled by user — silence completely, no error message!
                return;
            }
            console.warn('sendAudioBlobTurn error:', e.message);
            setVisualState('Ready');
        }
    }


    function updateMobilePttLabel() {
        if (!pttText) return;
        if (pttActive) {
            pttText.textContent = 'Listening... Tap orb when done';
        } else if (window.innerWidth <= 768) {
            pttText.textContent = 'Tap Purple Orb to Speak';
        } else {
            pttText.textContent = 'Tap Orb or Hold Space to Speak';
        }
    }

    window.addEventListener('resize', updateMobilePttLabel);
    updateMobilePttLabel();

    let lastTouchTime = 0;

    function handleOrbTapToggle(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        const now = Date.now();
        if (e.type === 'click' && (now - lastTouchTime < 500)) {
            return;
        }
        if (e.type === 'touchstart') {
            lastTouchTime = now;
        }

        unlockAudio();

        if (!pttActive) {
            startRecording();
            updateMobilePttLabel();
        } else {
            stopRecordingAndSend();
        }
    }

    const orbContainer = document.querySelector('.orb-container-compact');

    // PC Mouse Press & Hold Events
    if (pttBtn) {
        pttBtn.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            unlockAudio();
            startRecording();
        });

        pttBtn.addEventListener('mouseup', () => {
            if (pttActive) stopRecordingAndSend();
        });

        pttBtn.addEventListener('mouseleave', () => {
            if (pttActive) stopRecordingAndSend();
        });
    }

    // Touch & Click Toggle Events for PC & Mobile Orbs
    [pttBtn, orbContainer].filter(Boolean).forEach(el => {
        el.addEventListener('touchstart', handleOrbTapToggle, { passive: false });
    });

    // Keyboard Spacebar PTT Event
    document.addEventListener('keydown', (e) => {
        const assistantView = document.getElementById('assistant-view');
        if (!assistantView || assistantView.classList.contains('hidden')) return;

        // Ignore if user is typing inside text input
        if (document.activeElement === textInput) return;

        if (e.code === 'Space' && !e.repeat && !pttActive) {
            e.preventDefault();
            startRecording();
        }
    });

    document.addEventListener('keyup', (e) => {
        if (e.code === 'Space' && pttActive) {
            e.preventDefault();
            stopRecordingAndSend();
        }
    });

    // Text Fallback Submit
    if (sendBtn) {
        sendBtn.addEventListener('click', () => {
            const text = textInput.value.trim();
            if (text) {
                textInput.value = '';
                sendTurn(text);
            }
        });
    }

    if (textInput) {
        textInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const text = textInput.value.trim();
                if (text) {
                    textInput.value = '';
                    sendTurn(text);
                }
            }
        });
    }

    // --- Non-Intrusive Toast Pop-up Notification (Tier 5 Heartbeat) ---
    async function fetchPendingNotices() {
        try {
            const res = await fetch('/api/trillion/notices');
            const data = await res.json();
            if (data.success && data.notices && data.notices.length > 0) {
                data.notices.forEach(showToastNotice);
            }
        } catch (e) {}
    }

    function showToastNotice(notice) {
        // Prevent duplicate toast for same notice
        if (document.getElementById(`toast-${notice.id}`)) return;

        const toast = document.createElement('div');
        toast.id = `toast-${notice.id}`;
        toast.className = 'toast-notice-popup';
        toast.innerHTML = `
            <div class="toast-body">
                <strong>💡 ${notice.title}</strong>
                <p>${notice.message}</p>
            </div>
            <button class="toast-close-btn">&times;</button>
        `;

        const closeBtn = toast.querySelector('.toast-close-btn');
        closeBtn.addEventListener('click', async () => {
            await fetch('/api/trillion/notices/dismiss', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ noticeId: notice.id })
            });
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        });

        document.body.appendChild(toast);

        // Auto-dismiss toast after 8 seconds
        setTimeout(async () => {
            if (document.body.contains(toast)) {
                await fetch('/api/assistant/notices/dismiss', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ noticeId: notice.id })
                });
                toast.classList.add('fade-out');
                setTimeout(() => toast.remove(), 300);
            }
        }, 8000);
    }

    // Poll for proactive notices every 30s
    fetchPendingNotices();
    setInterval(fetchPendingNotices, 30000);
});
