import WebSocket, { type WebSocketServer } from 'ws';
import type { AttachTokenPayload } from '../auth/attach-token';
import type { CharacterCheckpoint } from '../platform/r1fs-characters';
import type { PresenceLease } from '../../shared/domain/types';
import { ShardRuntime, type ShardRuntimeLike } from './shard-runtime';
import {
  parseInboundMessage,
  serializeOutboundMessage,
  type AttachedOutboundMessage,
  type ErrorOutboundMessage,
  type OutboundMessage,
  type StateOutboundMessage,
} from './message-protocol';

export interface SessionHostDependencies {
  nodeId: string;
  shardWorldInstanceId: string;
  heartbeatGraceMs: number;
  leaseRefreshIntervalMs?: number;
  shardRuntime?: ShardRuntimeLike;
  verifyAttachToken(token: string): Promise<AttachTokenPayload>;
  readPresenceLease(accountId: string): Promise<PresenceLease | null>;
  writePresenceLease(accountId: string, lease: PresenceLease): Promise<unknown>;
  clearPresenceLease(accountId: string, connectionId: string): Promise<boolean>;
  loadCharacterByCid(cid: string): Promise<CharacterCheckpoint>;
  persistProgression?(input: {
    accountId: string;
    connectionId: string;
    progression: Record<string, unknown>;
  }): Promise<CharacterCheckpoint>;
  createConnectionId?: () => string;
  now?: () => number;
}

interface ActiveSession {
  accountId: string;
  characterId: string;
  connectionId: string;
  socket: WebSocket;
  heartbeatTimer: NodeJS.Timeout | null;
  nextLeaseRefreshAt: number;
  ended: boolean;
}

interface PendingAttach {
  accountId: string;
  characterId: string;
  connectionId: string;
}

function createError(code: string): ErrorOutboundMessage {
  return { type: 'error', code };
}

export function createSessionHost(dependencies: SessionHostDependencies) {
  const activeSessions = new Map<string, ActiveSession>();
  const shardRuntime = dependencies.shardRuntime ?? new ShardRuntime();
  const now = dependencies.now ?? Date.now;
  const createConnectionId = dependencies.createConnectionId ?? (() => crypto.randomUUID());
  const leaseRefreshIntervalMs =
    dependencies.leaseRefreshIntervalMs ??
    Math.max(1, Math.min(20_000, Math.floor(dependencies.heartbeatGraceMs / 3)));

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
    await dependencies.clearPresenceLease(pending.accountId, pending.connectionId);
  }

  function clearPendingLeaseSafely(pending: PendingAttach) {
    void clearPendingLease(pending).catch(() => undefined);
  }

  async function clearSessionLease(session: ActiveSession) {
    await dependencies.clearPresenceLease(session.accountId, session.connectionId);
  }

  function clearSessionLeaseSafely(session: ActiveSession) {
    void clearSessionLease(session).catch(() => undefined);
  }

  function createSessionLease(session: ActiveSession, lease?: PresenceLease): PresenceLease {
    return {
      current_character_cid: session.characterId,
      shard_world_instance_id: dependencies.shardWorldInstanceId,
      session_host_node_id: dependencies.nodeId,
      connection_id: session.connectionId,
      position: lease?.position ?? null,
      buffs_debuffs: lease?.buffs_debuffs ?? [],
      lease_expires_at: new Date(now() + dependencies.heartbeatGraceMs).toISOString(),
      last_persisted_at: lease?.last_persisted_at ?? null,
      persist_revision: lease?.persist_revision ?? 0,
    };
  }

  function beginSessionEnd(session: ActiveSession) {
    if (session.ended) {
      return false;
    }

    session.ended = true;

    if (session.heartbeatTimer) {
      clearTimeout(session.heartbeatTimer);
      session.heartbeatTimer = null;
    }

    activeSessions.delete(session.accountId);
    shardRuntime.removePlayer(session.characterId);

    return true;
  }

  function endSession(session: ActiveSession, message?: OutboundMessage) {
    if (!beginSessionEnd(session)) {
      return;
    }

    clearSessionLeaseSafely(session);

    if (message) {
      sendAndClose(session.socket, message);
      return;
    }

    session.socket.close();
  }

  async function logoutSession(session: ActiveSession) {
    if (!beginSessionEnd(session)) {
      return;
    }

    try {
      await clearSessionLease(session);
    } catch {
      // Graceful logout waits for the clear attempt to finish, but cleanup remains best-effort.
    }

    session.socket.close();
  }

  async function getOwnershipStatus(session: ActiveSession) {
    const lease = await dependencies.readPresenceLease(session.accountId);

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
    if (session.ended) {
      return false;
    }

    if (now() < session.nextLeaseRefreshAt) {
      armExpiryTimer(session);
      return true;
    }

    const ownership = await getOwnershipStatus(session);

    if (session.ended) {
      return false;
    }

    if (ownership.status !== 'current') {
      endSession(session, ownership.status === 'taken_over' ? { type: 'taken_over' } : { type: 'session_expired' });
      return false;
    }

    if (session.ended) {
      return false;
    }

    const nextLease: PresenceLease = {
      ...ownership.lease,
      lease_expires_at: new Date(
        Math.max(
          Date.parse(ownership.lease.lease_expires_at) + 1,
          now() + dependencies.heartbeatGraceMs
        )
      ).toISOString(),
    };

    await dependencies.writePresenceLease(session.accountId, nextLease);

    if (session.ended) {
      clearSessionLeaseSafely(session);
      return false;
    }

    const confirm = await getOwnershipStatus(session);

    if (session.ended) {
      clearSessionLeaseSafely(session);
      return false;
    }

    if (confirm.status !== 'current') {
      endSession(session, confirm.status === 'taken_over' ? { type: 'taken_over' } : { type: 'session_expired' });
      return false;
    }

    session.nextLeaseRefreshAt = now() + leaseRefreshIntervalMs;
    armExpiryTimer(session);
    return true;
  }

  async function emitRuntimeState(socket: WebSocket, session: ActiveSession, state: StateOutboundMessage['state']) {
    send(socket, { type: 'state', state });
  }

  async function maybePersistProgression(
    session: ActiveSession,
    update: { snapshot: StateOutboundMessage['state']; progressionToPersist?: Record<string, unknown> }
  ) {
    if (!dependencies.persistProgression || !update.progressionToPersist) {
      return update.snapshot;
    }

    try {
      const saved = await dependencies.persistProgression({
        accountId: session.accountId,
        connectionId: session.connectionId,
        progression: update.progressionToPersist,
      });

      shardRuntime.markProgressionPersisted(session.characterId, saved.cid);
      session.characterId = saved.cid;

      return shardRuntime.snapshotFor(session.characterId);
    } catch (error) {
      console.error('[thornwrithe] failed to persist progression', {
        accountId: session.accountId,
        characterId: session.characterId,
        error: error instanceof Error ? error.message : String(error),
      });
      return update.snapshot;
    }
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
        const existingLease = await dependencies.readPresenceLease(attachPayload.accountId);

        if (existingLease && Date.parse(existingLease.lease_expires_at) > now()) {
          send(socket, createError('already_connected'));
          socket.close();
          return;
        }

        const connectionId = createConnectionId();
        const pendingAttach: PendingAttach = {
          accountId: attachPayload.accountId,
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

        await dependencies.writePresenceLease(attachPayload.accountId, lease);
        sessionRef.pending = pendingAttach;

        const ownership = await getOwnershipStatus({
          accountId: attachPayload.accountId,
          characterId: attachPayload.characterId,
          connectionId,
          socket,
          heartbeatTimer: null,
          nextLeaseRefreshAt: now() + leaseRefreshIntervalMs,
          ended: false,
        });

        if (ownership.status !== 'current') {
          clearPendingLeaseSafely(pendingAttach);
          sessionRef.pending = null;
          send(socket, createError('already_connected'));
          socket.close();
          return;
        }

        const checkpoint = await dependencies.loadCharacterByCid(attachPayload.characterId);
        const postLoadOwnership = await getOwnershipStatus({
          accountId: attachPayload.accountId,
          characterId: attachPayload.characterId,
          connectionId,
          socket,
          heartbeatTimer: null,
          nextLeaseRefreshAt: now() + leaseRefreshIntervalMs,
          ended: false,
        });

        if (postLoadOwnership.status !== 'current') {
          clearPendingLeaseSafely(pendingAttach);
          sessionRef.pending = null;
          send(socket, postLoadOwnership.status === 'taken_over' ? { type: 'taken_over' } : { type: 'session_expired' });
          socket.close();
          return;
        }

        const character = {
          ...checkpoint.snapshot,
          cid: attachPayload.characterId,
        };

        const session: ActiveSession = {
          accountId: attachPayload.accountId,
          characterId: attachPayload.characterId,
          connectionId,
          socket,
          heartbeatTimer: null,
          nextLeaseRefreshAt: now() + leaseRefreshIntervalMs,
          ended: false,
        };

        activeSessions.set(session.accountId, session);
        const runtimeUpdate = shardRuntime.addPlayer(character);
        sessionRef.current = session;
        sessionRef.pending = null;
        armExpiryTimer(session);

        const attachedMessage: AttachedOutboundMessage = {
          type: 'attached',
          shardWorldInstanceId: dependencies.shardWorldInstanceId,
          character: checkpoint.snapshot,
        };

        send(socket, attachedMessage);
        const initialState = await maybePersistProgression(session, runtimeUpdate);
        await emitRuntimeState(socket, session, initialState);
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

    if (message.type === 'heartbeat') {
      const refreshed = await refreshHeartbeat(session);
      if (!refreshed || session.ended) {
        return;
      }

      const runtimeUpdate = shardRuntime.tickPlayer(session.characterId);
      const nextState = await maybePersistProgression(session, runtimeUpdate);
      await emitRuntimeState(socket, session, nextState);
      return;
    }

    const ownership = await getOwnershipStatus(session);

    if (session.ended) {
      return;
    }

    if (ownership.status !== 'current') {
      endSession(session, ownership.status === 'taken_over' ? { type: 'taken_over' } : { type: 'session_expired' });
      return;
    }

    if (message.type === 'move') {
      const runtimeUpdate = shardRuntime.movePlayer(session.characterId, message.direction);
      const nextState = await maybePersistProgression(session, runtimeUpdate);
      await emitRuntimeState(socket, session, nextState);
      return;
    }

    if (message.type === 'override') {
      const runtimeUpdate = shardRuntime.queueOverride(session.characterId, message.command);
      const nextState = await maybePersistProgression(session, runtimeUpdate);
      await emitRuntimeState(socket, session, nextState);
      return;
    }

    if (message.type === 'command') {
      const runtimeUpdate = shardRuntime.commandPlayer(session.characterId, message.command);
      const nextState = await maybePersistProgression(session, runtimeUpdate);
      await emitRuntimeState(socket, session, nextState);
      return;
    }

    if (message.type === 'logout') {
      await logoutSession(session);
      return;
    }
  }

  function bindWebSocketServer(wss: WebSocketServer) {
    wss.on('connection', (socket) => {
      const sessionRef = { current: null as ActiveSession | null, pending: null as PendingAttach | null };
      let messageQueue = Promise.resolve();

      socket.on('message', (raw) => {
        messageQueue = messageQueue
          .then(() => onMessage(sessionRef, socket, raw))
          .catch(() => {
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
