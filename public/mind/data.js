/**
 * Data module for Mind Map (Fetching + Live Observer Socket)
 */

export async function fetchMindSkeleton() {
    try {
        const res = await fetch('/api/mind-map');
        if (!res.ok) {
            throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
        }
        return await res.json();
    } catch (err) {
        console.error('[MindMap Data Fetch Error]:', err.message);
        throw err;
    }
}

export async function fetchNodeDetail(nodeId) {
    if (!nodeId) return null;
    try {
        const res = await fetch(`/api/mind-map/node/${encodeURIComponent(nodeId)}`);
        if (!res.ok) return null;
        return await res.json();
    } catch (err) {
        console.warn(`[MindMap Detail Fetch Error for ${nodeId}]:`, err.message);
        return null;
    }
}

/**
 * Live Observer WebSocket Connection
 * Connects to /ws/observe with exponential backoff and visibility handling.
 */
export function setupObserverSocket(onEventCallback) {
    let ws = null;
    let reconnectDelay = 1000;
    const MAX_RECONNECT_DELAY = 15000;
    let isDisposed = false;

    function connect() {
        if (isDisposed) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/observe`;

        try {
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                reconnectDelay = 1000;
            };

            ws.onmessage = (evt) => {
                try {
                    const data = JSON.parse(evt.data);
                    if (onEventCallback && typeof onEventCallback === 'function') {
                        onEventCallback(data);
                    }
                } catch (e) {}
            };

            ws.onclose = () => {
                if (isDisposed) return;
                ws = null;
                setTimeout(connect, reconnectDelay);
                reconnectDelay = Math.min(MAX_RECONNECT_DELAY, reconnectDelay * 2);
            };

            ws.onerror = () => {
                try { ws.close(); } catch(e) {}
            };
        } catch (e) {
            setTimeout(connect, reconnectDelay);
            reconnectDelay = Math.min(MAX_RECONNECT_DELAY, reconnectDelay * 2);
        }
    }

    // Close socket when tab is hidden to prevent event queue buildup
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            if (ws) {
                try { ws.close(); } catch(e) {}
                ws = null;
            }
        } else {
            if (!ws) connect();
        }
    });

    connect();

    return {
        close: () => {
            isDisposed = true;
            if (ws) {
                try { ws.close(); } catch(e) {}
                ws = null;
            }
        }
    };
}
