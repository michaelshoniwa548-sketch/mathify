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
        // Remove active class from all links and views instantly
        navLinks.forEach(l => l.classList.remove('active'));
        views.forEach(v => {
            v.classList.remove('active');
            v.classList.add('hidden'); // Immediately hide others
        });

        // Add active class to clicked link
        link.classList.add('active');

        // Show target view
        const targetId = link.getAttribute('data-target');
        const targetView = document.getElementById(targetId);
        targetView.classList.remove('hidden');

        // Small timeout to allow display:flex to apply before opacity transition
        setTimeout(() => targetView.classList.add('active'), 10);
    });
});

// --- Utility Functions ---
function showLoading(show) {
    if (show) {
        loadingOverlay.classList.remove('hidden');
    } else {
        loadingOverlay.classList.add('hidden');
    }
}

// Handle Enter key in textareas
function handleEnter(e, submitBtn) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitBtn.click();
    }
}

// --- Auto-scroll helpers ---
// Only auto-scroll when the user is already near the bottom, so scrolling up
// to re-read earlier content isn't interrupted by streaming updates.
function isNearBottom(el, threshold = 120) {
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

function scrollToBottom(el, smooth = false) {
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}

// --- 1. Chat Functionality ---
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat');
const chatHistory = document.getElementById('chat-history');

chatInput.addEventListener('keydown', (e) => handleEnter(e, sendChatBtn));

function addChatMessage(content, isUser = false) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isUser ? 'user' : 'ai'}`;

    let htmlContent = isUser ? content : marked.parse(content);

    msgDiv.innerHTML = `
        <div class="avatar">${isUser ? '👤' : '<img src="logo.png" alt="Mathify">'}</div>
        <div class="bubble markdown-body">${htmlContent}</div>
    `;

    chatHistory.appendChild(msgDiv);
    scrollToBottom(chatHistory, true);
}

sendChatBtn.addEventListener('click', async () => {
    const message = chatInput.value.trim();
    if (!message) return;

    // Add user message to UI
    addChatMessage(message, true);
    chatInput.value = '';

    // Add thinking message bubble to chat history
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

    // Disable input and button
    chatInput.disabled = true;
    sendChatBtn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });

        if (thinkingDiv) thinkingDiv.remove();

        if (!res.ok) throw new Error('API Error');

        // Prepare UI for streaming response
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
            if (stick) scrollToBottom(chatHistory);
        }

        bubble.classList.remove('streaming');

    } catch (err) {
        if (thinkingDiv) thinkingDiv.remove();
        addChatMessage(`Error: ${err.message}`);
    } finally {
        chatInput.disabled = false;
        sendChatBtn.disabled = false;
        chatInput.focus();
    }
});

// --- 2. Solve Functionality ---
const solveInput = document.getElementById('solve-input');
const btnSolve = document.getElementById('btn-solve');
const solveOutput = document.getElementById('solve-output');

solveInput.addEventListener('keydown', (e) => handleEnter(e, btnSolve));

btnSolve.addEventListener('click', async () => {
    const problem = solveInput.value.trim();
    if (!problem) return;

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

    try {
        const res = await fetch(`${API_BASE}/solve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ problem })
        });

        const data = await res.json();
        if (data.error) throw new Error(data.error);

        solveOutput.innerHTML = marked.parse(data.solution);

    } catch (err) {
        solveOutput.innerHTML = `<p style="color: #ff5252;">Error: ${err.message}</p>`;
    } finally {
        solveInput.disabled = false;
        btnSolve.disabled = false;
        btnSolve.textContent = 'Solve Problem';
    }
});

// --- 3. Quiz Functionality ---
// Panels
const panelSetup = document.getElementById('quiz-setup');
const panelActive = document.getElementById('quiz-active');
const panelResults = document.getElementById('quiz-results');

// Setup UI
const btnGenerateQuiz = document.getElementById('btn-generate-quiz');
const topicInput = document.getElementById('quiz-topic');
const difficultySelect = document.getElementById('quiz-difficulty');

// Active UI
const questionsContainer = document.getElementById('quiz-questions-container');
const btnSubmitQuiz = document.getElementById('btn-submit-quiz');
const activeQuizTitle = document.getElementById('active-quiz-title');

// Results UI
const quizFeedbackContainer = document.getElementById('quiz-feedback');
const btnNewQuiz = document.getElementById('btn-new-quiz');

let currentQuizData = null;

btnGenerateQuiz.addEventListener('click', async () => {
    const topic = topicInput.value.trim();
    if (!topic) {
        alert("Please enter a topic.");
        return;
    }

    const difficulty = difficultySelect.value;
    
    btnGenerateQuiz.disabled = true;
    topicInput.disabled = true;
    difficultySelect.disabled = true;
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
            body: JSON.stringify({ topic, difficulty })
        });

        const data = await res.json();
        if (data.error) throw new Error(data.error);

        currentQuizData = data.quiz;
        renderQuiz(currentQuizData, topic);

        // Switch Panels
        panelSetup.classList.add('hidden');
        panelActive.classList.remove('hidden');

    } catch (err) {
        alert(`Error generating quiz: ${err.message}`);
    } finally {
        btnGenerateQuiz.disabled = false;
        topicInput.disabled = false;
        difficultySelect.disabled = false;
        btnGenerateQuiz.textContent = 'Generate Quiz';
        statusMsg.remove();
    }
});

function renderQuiz(questions, topic) {
    activeQuizTitle.textContent = `Quiz: ${topic}`;
    questionsContainer.innerHTML = '';

    questions.forEach((q, index) => {
        const qDiv = document.createElement('div');
        qDiv.className = 'quiz-question-card';
        qDiv.innerHTML = `
            <h4>Question ${index + 1}</h4>
            <p>${q.question}</p>
            <input type="text" id="answer-${q.id}" placeholder="Your answer here..." class="mt-4">
        `;
        questionsContainer.appendChild(qDiv);
    });
}

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

    // Show Results Panel immediately for streaming
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
            quizFeedbackContainer.innerHTML = marked.parse(accumulatedText);
            if (stick) scrollToBottom(panelResults);
        }

        quizFeedbackContainer.classList.remove('streaming');

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

btnNewQuiz.addEventListener('click', () => {
    currentQuizData = null;
    topicInput.value = '';
    panelResults.classList.add('hidden');
    panelSetup.classList.remove('hidden');
});
