'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  GameplayDirection,
  GameplayShardSnapshot,
  GameplaySocketStatus,
} from '@/shared/gameplay';

interface AttachedMessage {
  type: 'attached';
  shardWorldInstanceId: string;
  character: unknown;
}

interface StateMessage {
  type: 'state';
  state: GameplayShardSnapshot;
}

interface SessionTerminalMessage {
  type: 'session_expired' | 'taken_over';
}

interface ErrorMessage {
  type: 'error';
  code: string;
}

type GameplayInboundMessage =
  | AttachedMessage
  | StateMessage
  | SessionTerminalMessage
  | ErrorMessage;

const ATTACH_ENDPOINT = '/api/auth/attach';
const HEARTBEAT_INTERVAL_MS = 5_000;
const RECONNECT_DELAY_MS = 1_500;

function resolveGameplaySocketUrl(gameplayPath: string) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  return `${protocol}//${window.location.host}${gameplayPath}`;
}

function isGameplayMessage(value: unknown): value is GameplayInboundMessage {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

function describeError(code: string) {
  switch (code) {
    case 'already_connected':
      return 'A previous shard lease is still clearing. Retrying shortly.';
    case 'attach_failed':
      return 'Shard attach failed. Retrying against a fresh host.';
    case 'session_error':
      return 'The shard session failed unexpectedly.';
    default:
      return 'The shard connection failed.';
  }
}

export function useGameplaySocket(gameplayPath: string) {
  const [status, setStatus] = useState<GameplaySocketStatus>('connecting');
  const [shardWorldInstanceId, setShardWorldInstanceId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<GameplayShardSnapshot | null>(null);
  const [statusDetail, setStatusDetail] = useState('Binding to shard host.');
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptRef = useRef(0);

  useEffect(() => {
    let active = true;

    const clearReconnectTimer = () => {
      if (!reconnectTimerRef.current) {
        return;
      }

      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    };

    const clearHeartbeatTimer = () => {
      if (!heartbeatTimerRef.current) {
        return;
      }

      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    };

    const closeSocket = () => {
      const socket = socketRef.current;

      socketRef.current = null;

      if (!socket) {
        return;
      }

      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;

      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    };

    const scheduleReconnect = (reason: string) => {
      if (!active) {
        return;
      }

      clearReconnectTimer();
      clearHeartbeatTimer();
      setStatus('reconnecting');
      setStatusDetail(reason);
      reconnectTimerRef.current = setTimeout(() => {
        void connect(true);
      }, RECONNECT_DELAY_MS);
    };

    const startHeartbeat = (socket: WebSocket, attempt: number) => {
      clearHeartbeatTimer();
      heartbeatTimerRef.current = setInterval(() => {
        if (!active || attemptRef.current !== attempt || socket.readyState !== WebSocket.OPEN) {
          return;
        }

        socket.send(JSON.stringify({ type: 'heartbeat' }));
      }, HEARTBEAT_INTERVAL_MS);
    };

    const connect = async (isRetry: boolean) => {
      const attempt = attemptRef.current + 1;
      attemptRef.current = attempt;
      clearReconnectTimer();
      clearHeartbeatTimer();
      closeSocket();
      setStatus(isRetry ? 'reconnecting' : 'connecting');
      setStatusDetail(isRetry ? 'Seeking a fresh shard host.' : 'Minting an attach token.');
      setShardWorldInstanceId(null);
      setSnapshot(null);

      try {
        const response = await fetch(ATTACH_ENDPOINT, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: '{}',
          credentials: 'include',
        });

        if (!active || attemptRef.current !== attempt) {
          return;
        }

        if (!response.ok) {
          if (response.status === 401) {
            setStatus('disconnected');
            setStatusDetail('Sign in again to request a new shard session.');
            return;
          }

          scheduleReconnect('Attach minting failed. Retrying shortly.');
          return;
        }

        const body = (await response.json()) as { attachToken?: string };

        if (!body.attachToken) {
          scheduleReconnect('Attach minting returned no token. Retrying shortly.');
          return;
        }

        const socket = new WebSocket(resolveGameplaySocketUrl(gameplayPath));
        socketRef.current = socket;
        setStatusDetail('Opening gameplay socket.');

        socket.onopen = () => {
          if (!active || attemptRef.current !== attempt) {
            socket.close();
            return;
          }

          setStatusDetail('Authenticating shard attach.');
          socket.send(JSON.stringify({ type: 'attach', attachToken: body.attachToken }));
        };

        socket.onmessage = (event) => {
          if (!active || attemptRef.current !== attempt) {
            return;
          }

          let parsed: unknown;

          try {
            parsed =
              typeof event.data === 'string'
                ? JSON.parse(event.data)
                : JSON.parse(String(event.data));
          } catch {
            return;
          }

          if (!isGameplayMessage(parsed)) {
            return;
          }

          if (parsed.type === 'attached') {
            setShardWorldInstanceId(parsed.shardWorldInstanceId);
            setStatus('connected');
            setStatusDetail('Connected to live shard.');
            startHeartbeat(socket, attempt);
            return;
          }

          if (parsed.type === 'state') {
            setSnapshot(parsed.state);
            return;
          }

          if (parsed.type === 'session_expired') {
            scheduleReconnect('The shard host expired the session. Rebinding to a fresh host.');
            return;
          }

          if (parsed.type === 'taken_over') {
            scheduleReconnect('The shard host replaced this session. Rebinding to a fresh host.');
            return;
          }

          if (parsed.type === 'error') {
            setStatusDetail(describeError(parsed.code));
          }
        };

        socket.onclose = () => {
          if (!active || attemptRef.current !== attempt) {
            return;
          }

          socketRef.current = null;
          clearHeartbeatTimer();
          scheduleReconnect('Socket closed. Rebinding to a fresh shard host.');
        };

        socket.onerror = () => {
          if (!active || attemptRef.current !== attempt) {
            return;
          }

          setStatusDetail('Socket error. Waiting for the host to close.');
        };
      } catch {
        if (!active || attemptRef.current !== attempt) {
          return;
        }

        scheduleReconnect('Unable to reach the shard host. Retrying shortly.');
      }
    };

    void connect(false);

    return () => {
      active = false;
      attemptRef.current += 1;
      clearReconnectTimer();
      clearHeartbeatTimer();
      closeSocket();
    };
  }, [gameplayPath]);

  function sendMove(direction: GameplayDirection) {
    const socket = socketRef.current;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(JSON.stringify({ type: 'move', direction }));
  }

  return {
    status,
    statusDetail,
    shardWorldInstanceId,
    snapshot,
    sendMove,
  };
}
