const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const NOTICES_QUEUE_PATH = path.join(__dirname, '..', 'notices_queue.json');
const HEARTBEAT_STATE_PATH = path.join(__dirname, '..', 'heartbeat_state.json');

let heartbeatTimer = null;
let isCheckRunning = false;

// -------------------------------------------------------------
// Helper Disk I/O Functions
// -------------------------------------------------------------

function loadConfig() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) return {};
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
        return {};
    }
}

function loadNoticesQueue() {
    try {
        if (!fs.existsSync(NOTICES_QUEUE_PATH)) return [];
        return JSON.parse(fs.readFileSync(NOTICES_QUEUE_PATH, 'utf8'));
    } catch (e) {
        return [];
    }
}

function saveNoticesQueue(queue) {
    try {
        fs.writeFileSync(NOTICES_QUEUE_PATH, JSON.stringify(queue, null, 2), 'utf8');
    } catch (e) {
        console.error('❌ Failed to save notices_queue.json:', e.message);
    }
}

function loadHeartbeatState() {
    try {
        if (!fs.existsSync(HEARTBEAT_STATE_PATH)) return {};
        return JSON.parse(fs.readFileSync(HEARTBEAT_STATE_PATH, 'utf8'));
    } catch (e) {
        return {};
    }
}

function saveHeartbeatState(state) {
    try {
        fs.writeFileSync(HEARTBEAT_STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
    } catch (e) {
        console.error('❌ Failed to save heartbeat_state.json:', e.message);
    }
}

// -------------------------------------------------------------
// Quiet Hours Check
// -------------------------------------------------------------

function isQuietHours(config) {
    const qh = config.heartbeat?.quietHours;
    if (!qh || !qh.enabled) return false;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = (qh.start || '22:00').split(':').map(Number);
    const [endH, endM] = (qh.end || '07:00').split(':').map(Number);

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes > endMinutes) {
        // Crosses midnight (e.g. 22:00 to 07:00)
        return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    } else {
        return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
}

// -------------------------------------------------------------
// Proactive Notice Management (Catch-Up on Return & Dismiss)
// -------------------------------------------------------------

/**
 * Surface a noteworthy notice to the queue (held safely until user views/dismisses it).
 */
function surfaceNotice(notice) {
    const queue = loadNoticesQueue();
    const newNotice = {
        id: notice.id || `notice_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        title: notice.title || 'Proactive Notice',
        message: notice.message || '',
        urgency: notice.urgency || 'normal',
        timestamp: new Date().toISOString(),
        dismissed: false
    };

    // Avoid duplicate un-dismissed notices with same ID or message
    const exists = queue.some(n => !n.dismissed && (n.id === newNotice.id || n.message === newNotice.message));
    if (!exists) {
        queue.push(newNotice);
        saveNoticesQueue(queue);
        console.log(`\n🔔 [Heartbeat Surfaced Notice]: ${newNotice.title} - ${newNotice.message}`);
    }
    return newNotice;
}

/**
 * Fetch all un-dismissed pending notices (Catch-Up on Return).
 */
function getPendingNotices() {
    const queue = loadNoticesQueue();
    return queue.filter(n => !n.dismissed);
}

/**
 * Dismiss a notice by ID.
 */
function dismissNotice(id) {
    const queue = loadNoticesQueue();
    const notice = queue.find(n => n.id === id);
    if (notice) {
        notice.dismissed = true;
        notice.dismissedAt = new Date().toISOString();
        saveNoticesQueue(queue);
        return true;
    }
    return false;
}

// -------------------------------------------------------------
// Heartbeat Execution Loop
// -------------------------------------------------------------

async function runHeartbeatTick() {
    if (isCheckRunning) {
        // Skip overlapping run if previous tick is still processing
        return;
    }

    isCheckRunning = true;
    try {
        const config = loadConfig();
        const state = loadHeartbeatState();

        if (isQuietHours(config)) {
            isCheckRunning = false;
            return;
        }

        const checks = config.checks || [];
        const nowMs = Date.now();

        for (const check of checks) {
            const lastRun = state[check.id]?.lastRunMs || 0;
            const intervalMs = (check.intervalSeconds || 30) * 1000;

            if (nowMs - lastRun >= intervalMs) {
                // Execute individual check unit
                await executeCheckUnit(check);
                // Update persistent schedule state
                state[check.id] = { lastRunMs: nowMs, lastRunIso: new Date().toISOString() };
                saveHeartbeatState(state);
            }
        }
    } catch (err) {
        console.error('⚠️ [Heartbeat Error]:', err.message);
    } finally {
        isCheckRunning = false;
    }
}

async function executeCheckUnit(check) {
    if (check.id === 'check_pending_reminders') {
        const { loadMemories } = require('./memoryService');
        const memories = loadMemories();
        const pendingMathGoal = memories.find(m => m.fact.toLowerCase().includes('zimsec'));
        if (pendingMathGoal) {
            surfaceNotice({
                id: 'notice_math_reminder',
                title: 'Math Study Schedule',
                message: `Reminder: You have active study goals set for ZIMSEC A-Level Mathematics.`,
                urgency: check.urgency
            });
        }
    }
}

function startHeartbeat(intervalMs = 5000) {
    if (heartbeatTimer) return;
    console.log(`💓 [Heartbeat Started]: Background check loop active (${intervalMs}ms interval).`);
    heartbeatTimer = setInterval(runHeartbeatTick, intervalMs);
}

function stopHeartbeat() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        console.log('🛑 [Heartbeat Stopped]: Background loop paused.');
    }
}

module.exports = {
    startHeartbeat,
    stopHeartbeat,
    surfaceNotice,
    getPendingNotices,
    dismissNotice,
    loadConfig,
    NOTICES_QUEUE_PATH,
    HEARTBEAT_STATE_PATH
};
