const appState = {
    sessionId: null,
    stompClient: null,
    connected: false,
    subscription: null,
    messageBuffer: {
        content: '',
        messageElement: null,
        timeout: null,
        isStreaming: false
    },
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
        sessionId: appState.sessionId,
        message: text,
        messageType: 'USER_MESSAGE'
    };
    
    try {
        appState.stompClient.publish({
            destination: '/app/ai/chat/send',
            body: JSON.stringify(message),
            headers: {
                'content-type': 'application/json'
            }
        });
        
        debugLog('Message sent', message);
        displayMessage('You', text, 'user');
    } catch (error) {
        console.error('Failed to send message:', error);
        displayError('Failed to send message: ' + error.message);
    }
}

function handleIncomingMessage(message) {
    try {
        const data = JSON.parse(message.body);
        debugLog('Received message', data);
        
        if (data.messageType === 'AI_RESPONSE') {
            handleStreamingAIMessage(data.message);
        } else if (data.messageType === 'ERROR') {
            displayError('Chat error: ' + data.message);
        } else if (data.messageType === 'SYSTEM_MESSAGE') {
            displayMessage('System', data.message, 'system');
        } else {
            debugLog('Unknown message type', data);
        }
    } catch (error) {
        console.error('Failed to parse incoming message:', error);
        debugLog('Parse error', { error: error.message, rawMessage: message.body });
    }
}

function handleStreamingAIMessage(text) {
    // Clear any existing timeout
    if (appState.messageBuffer.timeout) {
        clearTimeout(appState.messageBuffer.timeout);
    }
    
    // If not currently streaming, create a new message element
    if (!appState.messageBuffer.isStreaming) {
        appState.messageBuffer.isStreaming = true;
        appState.messageBuffer.content = '';
        
        const messagesDiv = document.getElementById('messages');
        const messagesContainer = document.getElementById('messages-container');
        const messageEl = document.createElement('div');
        messageEl.className = 'message ai-message streaming';
        messageEl.innerHTML = `<strong>AI:</strong> <span class="message-content"></span><span class="typing-indicator">▌</span>`;
        messagesDiv.appendChild(messageEl);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        appState.messageBuffer.messageElement = messageEl;
    }
    
    // Append new text to buffer
    appState.messageBuffer.content += text;
    
    // Update the message content with animation
    const contentSpan = appState.messageBuffer.messageElement.querySelector('.message-content');
    
    // Create a temporary element for the new chunk
    const chunkSpan = document.createElement('span');
    chunkSpan.className = 'text-animation';
    chunkSpan.textContent = text;
    contentSpan.appendChild(chunkSpan);
    
    // Trigger animation
    requestAnimationFrame(() => {
        chunkSpan.classList.add('animated');
        
        // Clean up animation classes after animation completes
        setTimeout(() => {
            if (chunkSpan && chunkSpan.parentNode) {
                // Replace the span with its text content to clean up DOM
                const textNode = document.createTextNode(chunkSpan.textContent);
                chunkSpan.parentNode.replaceChild(textNode, chunkSpan);
            }
        }, 300); // Match animation duration
    });
    
    // Scroll to bottom
    const messagesContainer = document.getElementById('messages-container');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Set timeout to finalize message after 2.5 seconds of no new content
    // This prevents splitting messages when there's a brief pause in streaming
    appState.messageBuffer.timeout = setTimeout(() => {
        finalizeStreamingMessage();
    }, 2500);
}

function finalizeStreamingMessage() {
    if (appState.messageBuffer.isStreaming && appState.messageBuffer.messageElement) {
        // Remove streaming class and typing indicator
        appState.messageBuffer.messageElement.classList.remove('streaming');
        const typingIndicator = appState.messageBuffer.messageElement.querySelector('.typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
        
        // Reset buffer state
        appState.messageBuffer.isStreaming = false;
        appState.messageBuffer.messageElement = null;
        appState.messageBuffer.content = '';
        
        debugLog('AI message finalized', 'Stream complete');
    }
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
    const dataStr = typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
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
