import WebSocket, { type WebSocketServer } from 'ws';
import type { AttachTokenPayload } from '../auth/attach-token';
import type { CharacterCheckpoint } from '../platform/r1fs-characters';
import type { PresenceLease } from '../../shared/domain/types';
import {
  parseInboundMessage,
  serializeOutboundMessage,
  type AttachedOutboundMessage,
  type ErrorOutboundMessage,
  type InboundMessage,
  type MoveInboundMessage,
  type OutboundMessage,
  type StateOutboundMessage,
} from './message-protocol';

export interface SessionHostDependencies {
  nodeId: string;
  shardWorldInstanceId: string;
  heartbeatGraceMs: number;
  verifyAttachToken(token: string): Promise<AttachTokenPayload>;
  readPresenceLease(characterId: string): Promise<PresenceLease | null>;
  writePresenceLease(characterId: string, lease: PresenceLease): Promise<unknown>;
  clearPresenceLease(characterId: string, connectionId: string): Promise<boolean>;
  loadCharacterByCid(cid: string): Promise<CharacterCheckpoint>;
  createConnectionId?: () => string;
  now?: () => number;
}

interface ActiveSession {
  characterId: string;
  connectionId: string;
  socket: WebSocket;
  heartbeatTimer: NodeJS.Timeout | null;
  ended: boolean;
  state: unknown;
}

interface PendingAttach {
  characterId: string;
  connectionId: string;
}

function cloneState<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function createError(code: string): ErrorOutboundMessage {
  return { type: 'error', code };
}

function adjustPosition(state: unknown, direction: MoveInboundMessage['direction']) {
  if (!isObject(state) || !isObject(state.position)) {
    return state;
  }

  const position = state.position as Record<string, unknown>;
  const currentX = typeof position.x === 'number' ? position.x : 0;
  const currentY = typeof position.y === 'number' ? position.y : 0;

  switch (direction) {
    case 'north':
      position.y = currentY - 1;
      break;
    case 'south':
      position.y = currentY + 1;
      break;
    case 'west':
      position.x = currentX - 1;
      break;
    case 'east':
      position.x = currentX + 1;
      break;
  }

  return state;
}

export function createSessionHost(dependencies: SessionHostDependencies) {
  const activeSessions = new Map<string, ActiveSession>();
  const now = dependencies.now ?? Date.now;
  const createConnectionId = dependencies.createConnectionId ?? (() => crypto.randomUUID());

  function send(socket: WebSocket, message: OutboundMessage) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(serializeOutboundMessage(message));
    }
  }

  function sendAndClose(socket: WebSocket, message: OutboundMessage) {
    if (socket.readyState !== WebSocket.OPEN) {
      socket.close();
      return;
    }

    socket.send(serializeOutboundMessage(message), () => {
      setTimeout(() => {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CLOSING) {
          socket.close();
        }
      }, 100);
    });
  }

  async function clearPendingLease(pending: PendingAttach) {
    await dependencies.clearPresenceLease(pending.characterId, pending.connectionId);
  }

  function clearPendingLeaseSafely(pending: PendingAttach) {
    void clearPendingLease(pending).catch(() => undefined);
  }

  function endSession(session: ActiveSession, message: OutboundMessage) {
    if (session.ended) {
      return;
    }

    session.ended = true;

    if (session.heartbeatTimer) {
      clearTimeout(session.heartbeatTimer);
      session.heartbeatTimer = null;
    }

    activeSessions.delete(session.characterId);
    sendAndClose(session.socket, message);
  }

  async function getOwnershipStatus(session: ActiveSession) {
    const lease = await dependencies.readPresenceLease(session.characterId);

    if (!lease) {
      return { status: 'expired' as const };
    }

    const leaseExpired = Date.parse(lease.lease_expires_at) <= now();
    const ownsConnection =
      lease.connection_id === session.connectionId && lease.session_host_node_id === dependencies.nodeId;

    if (!ownsConnection) {
      return { status: leaseExpired ? ('expired' as const) : ('taken_over' as const) };
    }

    if (leaseExpired) {
      return { status: 'expired' as const };
    }

    return { status: 'current' as const, lease };
  }

  function armExpiryTimer(session: ActiveSession) {
    if (session.heartbeatTimer) {
      clearTimeout(session.heartbeatTimer);
    }

    session.heartbeatTimer = setTimeout(() => {
      void (async () => {
        if (session.ended) {
          return;
        }

        const ownership = await getOwnershipStatus(session);

        if (ownership.status === 'current') {
          endSession(session, { type: 'session_expired' });
          return;
        }

        endSession(session, ownership.status === 'taken_over' ? { type: 'taken_over' } : { type: 'session_expired' });
      })();
    }, dependencies.heartbeatGraceMs);
  }

  async function refreshHeartbeat(session: ActiveSession) {
    const ownership = await getOwnershipStatus(session);

    if (ownership.status !== 'current') {
      endSession(session, ownership.status === 'taken_over' ? { type: 'taken_over' } : { type: 'session_expired' });
      return false;
    }

    const nextLease: PresenceLease = {
      ...ownership.lease,
      lease_expires_at: new Date(now() + dependencies.heartbeatGraceMs).toISOString(),
    };

    await dependencies.writePresenceLease(session.characterId, nextLease);

    const confirm = await getOwnershipStatus(session);

    if (confirm.status !== 'current') {
      endSession(session, confirm.status === 'taken_over' ? { type: 'taken_over' } : { type: 'session_expired' });
      return false;
    }

    armExpiryTimer(session);
    return true;
  }

  async function onMessage(
    sessionRef: { current: ActiveSession | null; pending: PendingAttach | null },
    socket: WebSocket,
    raw: WebSocket.RawData
  ) {
    const message = parseInboundMessage(raw);

    if (!message) {
      send(socket, createError('invalid_message'));
      socket.close();
      return;
    }

    if (!sessionRef.current) {
      if (message.type !== 'attach') {
        send(socket, createError('expected_attach'));
        socket.close();
        return;
      }

      try {
        const attachPayload = await dependencies.verifyAttachToken(message.attachToken);
        const connectionId = createConnectionId();
        const pendingAttach: PendingAttach = {
          characterId: attachPayload.characterId,
          connectionId,
        };
        const lease: PresenceLease = {
          current_character_cid: attachPayload.characterId,
          shard_world_instance_id: dependencies.shardWorldInstanceId,
          session_host_node_id: dependencies.nodeId,
          connection_id: connectionId,
          position: null,
          buffs_debuffs: [],
          lease_expires_at: new Date(now() + dependencies.heartbeatGraceMs).toISOString(),
          last_persisted_at: null,
          persist_revision: 0,
        };

        await dependencies.writePresenceLease(attachPayload.characterId, lease);
        sessionRef.pending = pendingAttach;

        const ownership = await getOwnershipStatus({
          characterId: attachPayload.characterId,
          connectionId,
          socket,
          heartbeatTimer: null,
          ended: false,
          state: null,
        });

        if (ownership.status !== 'current') {
          clearPendingLeaseSafely(pendingAttach);
          sessionRef.pending = null;
          send(socket, createError('lease_conflict'));
          socket.close();
          return;
        }

        const checkpoint = await dependencies.loadCharacterByCid(attachPayload.characterId);
        const postLoadOwnership = await getOwnershipStatus({
          characterId: attachPayload.characterId,
          connectionId,
          socket,
          heartbeatTimer: null,
          ended: false,
          state: null,
        });

        if (postLoadOwnership.status !== 'current') {
          clearPendingLeaseSafely(pendingAttach);
          sessionRef.pending = null;
          send(socket, postLoadOwnership.status === 'taken_over' ? { type: 'taken_over' } : { type: 'session_expired' });
          socket.close();
          return;
        }

        const existingSession = activeSessions.get(attachPayload.characterId);
        const session: ActiveSession = {
          characterId: attachPayload.characterId,
          connectionId,
          socket,
          heartbeatTimer: null,
          ended: false,
          state: cloneState(checkpoint.snapshot),
        };

        if (existingSession && existingSession !== session) {
          endSession(existingSession, { type: 'taken_over' });
        }

        activeSessions.set(session.characterId, session);
        sessionRef.current = session;
        sessionRef.pending = null;
        armExpiryTimer(session);

        const attachedMessage: AttachedOutboundMessage = {
          type: 'attached',
          shardWorldInstanceId: dependencies.shardWorldInstanceId,
          character: checkpoint.snapshot,
        };

        send(socket, attachedMessage);
        return;
      } catch {
        if (sessionRef.pending) {
          clearPendingLeaseSafely(sessionRef.pending);
          sessionRef.pending = null;
        }
        send(socket, createError('attach_failed'));
        socket.close();
        return;
      }
    }

    const session = sessionRef.current;

    if (session.ended) {
      return;
    }

    const ownership = await getOwnershipStatus(session);

    if (ownership.status !== 'current') {
      endSession(session, ownership.status === 'taken_over' ? { type: 'taken_over' } : { type: 'session_expired' });
      return;
    }

    if (message.type === 'heartbeat') {
      await refreshHeartbeat(session);
      return;
    }

    if (message.type === 'move') {
      session.state = adjustPosition(cloneState(session.state), message.direction);
      const stateMessage: StateOutboundMessage = { type: 'state', state: session.state };
      send(socket, stateMessage);
    }
  }

  function bindWebSocketServer(wss: WebSocketServer) {
    wss.on('connection', (socket) => {
      const sessionRef = { current: null as ActiveSession | null, pending: null as PendingAttach | null };

      socket.on('message', (raw) => {
        void onMessage(sessionRef, socket, raw).catch(() => {
          send(socket, createError('session_error'));
          socket.close();
        });
      });

      socket.on('close', () => {
        if (sessionRef.pending && !sessionRef.current) {
          clearPendingLeaseSafely(sessionRef.pending);
          sessionRef.pending = null;
        }
      });
    });
  }

  return {
    bindWebSocketServer,
  };
}
