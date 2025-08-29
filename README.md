# Rixo Chat Test Application

A minimal frontend application to test WebSocket chat functionality with the Rixo backend.

## Prerequisites

1. Rixo backend running on http://localhost:8080
2. Modern web browser with JavaScript enabled

## Setup and Run

1. Ensure the backend is running:
   ```bash
   cd /home/huginn/rixo/rixo-klappka-be
   ./gradlew bootRun
   ```

2. Open the chat application:
   ```bash
   cd /home/huginn/rixo/rixo-chat-tmp
   # Open index.html in your browser
   firefox index.html
   # or
   google-chrome index.html
   # or use a simple HTTP server for better compatibility:
   python3 -m http.server 8000
   # Then navigate to http://localhost:8000
   ```

## Usage

1. Click "Create Chat Session" to initialize a new chat
2. The application will:
   - Create a session via REST API
   - Display the session ID
   - Connect to WebSocket
   - Show connection status
3. Type messages in the input field and press Enter or click Send
4. Watch the debug console for detailed WebSocket communication

## Features

- Session creation via REST API
- WebSocket connection using STOMP over SockJS
- Real-time message exchange
- Connection status indicator
- Error handling and display
- Debug console for monitoring

## Troubleshooting

### CORS Issues
If you encounter CORS errors:
1. Ensure the backend has CORS configured for localhost
2. Use a local HTTP server instead of file:// protocol
3. Check that securityProps.sameOriginDisabled is true in backend

### Connection Issues
- Check the backend is running on port 8080
- Verify WebSocket endpoint is accessible
- Check browser console for detailed errors
- Review debug panel for STOMP frames

## Architecture

- **Technology**: Vanilla JavaScript, HTML5, CSS3
- **WebSocket Library**: STOMP.js with SockJS fallback
- **Backend Integration**:
  - REST: POST /api/v1/ai/chat/session
  - WebSocket: ws://localhost:8080/handler
  - STOMP Subscribe: /topic/ai/chat/{sessionId}
  - STOMP Send: /app/ai/chat/send