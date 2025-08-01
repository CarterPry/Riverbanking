export interface WebSocketOptions {
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

export interface WebSocketMessage {
  type: 'status' | 'progress' | 'result' | 'error' | 'restraint' | 'hitl';
  workflowId?: string;
  data: any;
  restraint?: 'requiresAuth' | 'requiresHITL' | 'blocked';
  hitlReasons?: string[];
  timestamp: string;
}

export function connect(
  url: string,
  onMessage: (message: WebSocketMessage) => void,
  onError?: (error: Event) => void,
  options: WebSocketOptions = {}
): WebSocket {
  const {
    reconnectDelay = 1000,
    maxReconnectAttempts = 10
  } = options;

  let ws: WebSocket;
  let reconnectAttempts = 0;
  let shouldReconnect = true;

  const connect = () => {
    try {
      ws = new WebSocket(url);

      ws.onopen = () => {
        console.log('WebSocket connected');
        reconnectAttempts = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;
          
          // Handle restraint notifications
          if (message.restraint === 'requiresAuth') {
            console.warn('Restraint: Authentication required for workflow');
            // Could trigger UI notification here
            if (typeof window !== 'undefined' && window.alert) {
              window.alert('Restraint: Authentication Required - Awaiting HITL');
            }
          }
          
          if (message.restraint === 'requiresHITL') {
            console.warn('Restraint: HITL approval required', message.hitlReasons);
            // Could trigger UI notification here
            if (typeof window !== 'undefined' && window.alert) {
              const reasons = message.hitlReasons?.join('\n') || 'Manual approval required';
              window.alert(`HITL Approval Needed:\n${reasons}`);
            }
          }
          
          onMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
          // Fallback for plain text messages
          onMessage({
            type: 'status',
            data: event.data,
            timestamp: new Date().toISOString()
          });
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (onError) {
          onError(error);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        
        if (shouldReconnect && reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          console.log(`Reconnecting... (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
          
          setTimeout(() => {
            if (shouldReconnect) {
              connect();
            }
          }, reconnectDelay * reconnectAttempts);
        }
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      if (onError) {
        onError(error as Event);
      }
    }
  };

  connect();

  // Return a wrapped WebSocket that handles cleanup
  return {
    close: () => {
      shouldReconnect = false;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    },
    send: (data: string | object) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        const message = typeof data === 'object' ? JSON.stringify(data) : data;
        ws.send(message);
      } else {
        console.warn('WebSocket is not connected');
      }
    },
    get readyState() {
      return ws ? ws.readyState : WebSocket.CLOSED;
    }
  } as any;
} 