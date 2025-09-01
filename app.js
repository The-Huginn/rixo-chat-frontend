const appState = {
    sessionId: null,
    stompClient: null,
    connected: false,
    subscription: null,
    messageBuffer: new Map(),
    currentMessageElement: null,
    currentTypingState: null, // Track current typing animation
    nextExpectedIndex: 0, // Track what index we're waiting for
    backendUrl: window.BACKEND_URL || 'http://localhost:8080'
};

async function createSession() {
    const response = await fetch(`${appState.backendUrl}/api/public/ai/chat/session?chatType=CUSTOMER_ELECTRICITY_CHAT`, {
        method: 'GET',
        headers: {
            'Accept': 'application/json'
        }
    });
    
    const data = await response.json();
    return data;
}

function connectWebSocket(sessionId) {
    const socket = new SockJS(`${appState.backendUrl}/handler`);
    appState.stompClient = new StompJs.Client({
        webSocketFactory: () => socket,
        reconnectDelay: 5000,
        heartbeatIncoming: 25000,
        heartbeatOutgoing: 25000,
        debug: function(str) {
            console.log('STOMP: ' + str);
            debugLog('STOMP Debug', str);
        }
    });
    
    appState.stompClient.onConnect = (frame) => {
        console.log('Connected:', frame);
        debugLog('WebSocket Connected', frame);
        updateConnectionStatus('Connected');
        appState.connected = true;
        
        appState.subscription = appState.stompClient.subscribe(
            `/topic/ai/chat/${sessionId}`,
            handleIncomingMessage
        );
        
        debugLog('Subscribed to topic', `/topic/ai/chat/${sessionId}`);
    };
    
    appState.stompClient.onStompError = (frame) => {
        console.error('STOMP error:', frame);
        debugLog('STOMP Error', frame);
        displayError('WebSocket error: ' + frame.headers.message);
        appState.connected = false;
        updateConnectionStatus('Error');
    };
    
    appState.stompClient.onWebSocketClose = (event) => {
        console.log('WebSocket closed:', event);
        debugLog('WebSocket Closed', event);
        appState.connected = false;
        updateConnectionStatus('Disconnected');
    };
    
    appState.stompClient.onDisconnect = (frame) => {
        console.log('Disconnected:', frame);
        debugLog('STOMP Disconnected', frame);
        appState.connected = false;
        updateConnectionStatus('Disconnected');
    };
    
    appState.stompClient.activate();
}

function sendMessage(text) {
    if (!appState.stompClient || !appState.sessionId || !appState.connected) {
        displayError('Not connected to chat');
        return;
    }
    
    const message = {
        message: text
    };
    
    try {
        const destination = `/app/ai/chat/session/${appState.sessionId}`;
        debugLog('Sending to destination', destination);
        debugLog('Message payload', JSON.stringify(message));
        
        appState.stompClient.publish({
            destination: destination,
            body: JSON.stringify(message),
            headers: {
                'content-type': 'application/json'
            }
        });
        
        debugLog('Message sent successfully', { destination, message });
        displayMessage('You', text, 'user');
    } catch (error) {
        console.error('Failed to send message:', error);
        debugLog('Send error details', { 
            error: error.message, 
            stack: error.stack,
            destination: `/app/session/${appState.sessionId}`,
            sessionId: appState.sessionId
        });
        displayError('Failed to send message: ' + error.message);
    }
}

function handleIncomingMessage(message) {
    try {
        const data = JSON.parse(message.body);
        debugLog('Received message', data);
        
        if (data.type === 'TEXT_CHUNK') {
            // Store the chunk
            if (data.text !== null && data.text !== undefined && data.index !== undefined) {
                appState.messageBuffer.set(data.index, data.text);
                debugLog('Stored chunk', { index: data.index, text: data.text });
                
                // Check if we should start displaying
                checkAndDisplayChunks();
            }
        } else if (data.type === 'TEXT_END') {
            // Display any remaining chunks and finalize
            finalizeMessage();
        } else if (data.type === 'ERROR') {
            displayError('Chat error: ' + (data.text || data.message || 'Unknown error'));
            // Clear everything on error
            resetMessageState();
        } else if (data.type === 'SYSTEM_MESSAGE') {
            displayMessage('System', data.text || data.message, 'system');
        } else {
            debugLog('Unknown message type', data);
        }
    } catch (error) {
        console.error('Failed to parse incoming message:', error);
        debugLog('Parse error', { error: error.message, rawMessage: message.body });
    }
}

function checkAndDisplayChunks() {
    // Count consecutive chunks we have starting from nextExpectedIndex
    let consecutiveChunks = 0;
    let tempIndex = appState.nextExpectedIndex;
    
    while (appState.messageBuffer.has(tempIndex)) {
        consecutiveChunks++;
        tempIndex++;
    }
    
    debugLog('Consecutive chunks available', { 
        from: appState.nextExpectedIndex, 
        count: consecutiveChunks,
        bufferedIndices: Array.from(appState.messageBuffer.keys()).sort((a, b) => a - b)
    });
    
    // If we have 5+ consecutive chunks, start displaying them
    if (consecutiveChunks >= 5) {
        displayAvailableChunks();
    }
}

function displayAvailableChunks() {
    // Initialize message element if needed
    if (!appState.currentMessageElement) {
        initializeMessageElement();
    }
    
    // Process all consecutive chunks from nextExpectedIndex
    let chunksToDisplay = '';
    while (appState.messageBuffer.has(appState.nextExpectedIndex)) {
        chunksToDisplay += appState.messageBuffer.get(appState.nextExpectedIndex);
        appState.messageBuffer.delete(appState.nextExpectedIndex);
        appState.nextExpectedIndex++;
    }
    
    if (chunksToDisplay) {
        appendToTypingAnimation(chunksToDisplay);
    }
}

function initializeMessageElement() {
    const messagesDiv = document.getElementById('messages');
    const messagesContainer = document.getElementById('messages-container');
    const messageEl = document.createElement('div');
    messageEl.className = 'message ai-message';
    messageEl.innerHTML = `<strong>AI:</strong> <span class="typing-text"></span><span class="typing-cursor">▌</span>`;
    messagesDiv.appendChild(messageEl);
    
    appState.currentMessageElement = messageEl;
    appState.currentTypingState = {
        textSpan: messageEl.querySelector('.typing-text'),
        cursorSpan: messageEl.querySelector('.typing-cursor'),
        queue: '',
        isTyping: false
    };
    
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function appendToTypingAnimation(text) {
    if (!appState.currentTypingState) return;
    
    // Add text to queue
    appState.currentTypingState.queue += text;
    
    // Start typing if not already typing
    if (!appState.currentTypingState.isTyping) {
        startTyping();
    }
}

function startTyping() {
    if (!appState.currentTypingState || appState.currentTypingState.isTyping) return;
    
    appState.currentTypingState.isTyping = true;
    const state = appState.currentTypingState;
    const messagesContainer = document.getElementById('messages-container');
    const typingSpeed = 15; // Faster since we're streaming
    
    function typeNext() {
        if (state.queue.length > 0) {
            // Take next character from queue
            const char = state.queue[0];
            state.queue = state.queue.substring(1);
            state.textSpan.textContent += char;
            
            // Scroll to bottom
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            
            // Continue typing
            setTimeout(typeNext, typingSpeed);
        } else {
            // No more in queue
            state.isTyping = false;
            
            // Check if there's new text that arrived while we were typing
            if (state.queue.length > 0) {
                startTyping();
            }
        }
    }
    
    typeNext();
}

function finalizeMessage() {
    // Display any remaining chunks
    displayAvailableChunks();
    
    // Remove cursor
    if (appState.currentTypingState && appState.currentTypingState.cursorSpan) {
        appState.currentTypingState.cursorSpan.remove();
    }
    
    // Reset state for next message
    resetMessageState();
    
    debugLog('Message finalized');
}

function resetMessageState() {
    appState.messageBuffer.clear();
    appState.currentMessageElement = null;
    appState.currentTypingState = null;
    appState.nextExpectedIndex = 0;
}

function displayMessage(sender, text, type) {
    const messagesDiv = document.getElementById('messages');
    const messagesContainer = document.getElementById('messages-container');
    const messageEl = document.createElement('div');
    messageEl.className = `message ${type}-message`;
    messageEl.innerHTML = `<strong>${sender}:</strong> ${escapeHtml(text)}`;
    messagesDiv.appendChild(messageEl);
    
    // Ensure scrolling to bottom works
    setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 10);
}

function displayError(error) {
    const errorContainer = document.getElementById('error-container');
    const errorEl = document.createElement('div');
    errorEl.className = 'error';
    errorEl.textContent = error;
    errorContainer.appendChild(errorEl);
    setTimeout(() => errorEl.remove(), 5000);
}

function debugLog(label, data) {
    const debugLog = document.getElementById('debug-log');
    const entry = document.createElement('div');
    entry.className = 'debug-entry';
    const timestamp = new Date().toLocaleTimeString();
    let dataStr;
    
    if (typeof data === 'object' && data !== null) {
        dataStr = JSON.stringify(data, null, 2);
    } else if (data === undefined) {
        dataStr = 'undefined';
    } else if (data === null) {
        dataStr = 'null';
    } else {
        dataStr = String(data);
    }
    
    entry.innerHTML = `<strong>${timestamp}</strong> ${label}: ${escapeHtml(dataStr)}`;
    debugLog.appendChild(entry);
    debugLog.scrollTop = debugLog.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updateConnectionStatus(status) {
    const statusEl = document.getElementById('connection-status');
    statusEl.textContent = status;
    statusEl.className = status === 'Connected' ? 'connected' : 
                        status === 'Error' ? 'error' : 'disconnected';
}

document.addEventListener('DOMContentLoaded', () => {
    const createSessionBtn = document.getElementById('create-session-btn');
    const sendBtn = document.getElementById('send-btn');
    const messageInput = document.getElementById('message-input');
    const debugPanel = document.getElementById('debug-panel');
    const toggleDebugBtn = document.getElementById('toggle-debug');
    
    // Debug panel toggle functionality
    toggleDebugBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        debugPanel.classList.toggle('collapsed');
    });
    
    // Also allow clicking on header to toggle
    document.querySelector('.debug-header').addEventListener('click', () => {
        debugPanel.classList.toggle('collapsed');
    });
    
    createSessionBtn.addEventListener('click', async () => {
        try {
            createSessionBtn.disabled = true;
            createSessionBtn.textContent = 'Creating session...';
            
            debugLog('Creating session', 'Starting session creation...');
            
            const session = await createSession();
            appState.sessionId = session.sessionId;
            
            debugLog('Session created', session);
            
            document.getElementById('session-id').textContent = session.sessionId;
            document.getElementById('session-info').style.display = 'block';
            document.getElementById('chat-wrapper').style.display = 'flex';
            
            if (session.welcomeMessage) {
                displayMessage('System', session.welcomeMessage, 'system');
            }
            
            connectWebSocket(session.sessionId);
            
            createSessionBtn.style.display = 'none';
        } catch (error) {
            console.error('Failed to create session:', error);
            debugLog('Session creation failed', error.message);
            displayError('Failed to create session: ' + error.message);
            createSessionBtn.disabled = false;
            createSessionBtn.textContent = 'Create Chat Session';
        }
    });
    
    sendBtn.addEventListener('click', () => {
        const text = messageInput.value.trim();
        if (text) {
            sendMessage(text);
            messageInput.value = '';
        }
    });
    
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendBtn.click();
        }
    });
    
    debugLog('Application initialized', 'Ready to create session');
});