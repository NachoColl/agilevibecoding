import { useEffect, useRef, useCallback, useState } from 'react';

// Module-level constant — window.location.host never changes during a session
const WS_URL = import.meta.env.VITE_WS_URL || `ws://${window.location.host}/ws`;

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 2000;

/**
 * WebSocket hook for real-time updates.
 *
 * Returns wsStatus: 'connecting' | 'connected' | 'disconnected'
 * Callbacks are stored in refs so connect() is stable and the effect
 * only runs once (no infinite reconnect loop from inline callbacks).
 */
export function useWebSocket(options = {}) {
  const { onMessage, onConnected, onDisconnected, onError } = options;

  const [wsStatus, setWsStatus] = useState('connecting');

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);

  // Stable refs — updated every render without triggering reconnects
  const onMessageRef = useRef(onMessage);
  const onConnectedRef = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);
  const onErrorRef = useRef(onError);
  onMessageRef.current = onMessage;
  onConnectedRef.current = onConnected;
  onDisconnectedRef.current = onDisconnected;
  onErrorRef.current = onError;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    try {
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log('WebSocket connected');
        reconnectAttempts.current = 0;
        setWsStatus('connected');
        onConnectedRef.current?.();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessageRef.current?.(data);
        } catch (error) {
          console.error('WebSocket message parse error:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        onErrorRef.current?.(error);
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        wsRef.current = null;
        onDisconnectedRef.current?.();

        if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts.current++;
          console.log(`Reconnecting... (attempt ${reconnectAttempts.current})`);
          setWsStatus('connecting');
          reconnectTimeoutRef.current = setTimeout(connect, RECONNECT_DELAY);
        } else {
          console.error('Max reconnection attempts reached');
          setWsStatus('disconnected');
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('WebSocket connection error:', error);
      onErrorRef.current?.(error);
    }
  }, []); // No callback deps — refs keep them current without recreating connect

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket not connected, cannot send message');
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]); // both stable — effect runs exactly once

  return {
    wsStatus,
    send,
    disconnect,
    reconnect: connect,
  };
}
