import type { RawData } from 'ws';
import type { GameplayShardSnapshot } from '../../shared/gameplay';

export interface AttachInboundMessage {
  type: 'attach';
  attachToken: string;
}

export interface HeartbeatInboundMessage {
  type: 'heartbeat';
}

export interface MoveInboundMessage {
  type: 'move';
  direction: 'north' | 'south' | 'west' | 'east';
}

export interface OverrideInboundMessage {
  type: 'override';
  command: 'encounter power' | 'potion' | 'retreat';
}

export interface CommandInboundMessage {
  type: 'command';
  command: string;
}

export interface LogoutInboundMessage {
  type: 'logout';
}

export type InboundMessage =
  | AttachInboundMessage
  | HeartbeatInboundMessage
  | MoveInboundMessage
  | OverrideInboundMessage
  | CommandInboundMessage
  | LogoutInboundMessage;

export interface AttachedOutboundMessage {
  type: 'attached';
  shardWorldInstanceId: string;
  character: unknown;
}

export interface StateOutboundMessage {
  type: 'state';
  state: GameplayShardSnapshot;
}

export interface TakenOverOutboundMessage {
  type: 'taken_over';
}

export interface SessionExpiredOutboundMessage {
  type: 'session_expired';
}

export interface ErrorOutboundMessage {
  type: 'error';
  code: string;
}

export type OutboundMessage =
  | AttachedOutboundMessage
  | StateOutboundMessage
  | TakenOverOutboundMessage
  | SessionExpiredOutboundMessage
  | ErrorOutboundMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRawData(raw: RawData) {
  if (typeof raw === 'string') {
    return raw;
  }

  if (Buffer.isBuffer(raw)) {
    return raw;
  }

  if (Array.isArray(raw)) {
    return Buffer.concat(raw);
  }

  if (raw instanceof ArrayBuffer) {
    return Buffer.from(raw);
  }

  const view = raw as ArrayBufferView;
  return Buffer.from(view.buffer, view.byteOffset, view.byteLength);
}

export function parseInboundMessage(raw: RawData): InboundMessage | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(normalizeRawData(raw).toString('utf8'));
  } catch {
    return null;
  }

  if (!isRecord(parsed) || typeof parsed.type !== 'string') {
    return null;
  }

  switch (parsed.type) {
    case 'attach':
      return typeof parsed.attachToken === 'string' ? { type: 'attach', attachToken: parsed.attachToken } : null;
    case 'heartbeat':
      return { type: 'heartbeat' };
    case 'move':
      return parsed.direction === 'north' ||
        parsed.direction === 'south' ||
        parsed.direction === 'west' ||
        parsed.direction === 'east'
        ? {
            type: 'move',
            direction: parsed.direction,
          }
        : null;
    case 'override':
      return parsed.command === 'encounter power' ||
        parsed.command === 'potion' ||
        parsed.command === 'retreat'
        ? {
            type: 'override',
            command: parsed.command,
          }
        : null;
    case 'command': {
      if (typeof parsed.command !== 'string') {
        return null;
      }

      const command = parsed.command.trim().replace(/\s+/g, ' ');
      return command ? { type: 'command', command } : null;
    }
    case 'logout':
      return { type: 'logout' };
    default:
      return null;
  }
}

export function serializeOutboundMessage(message: OutboundMessage) {
  return JSON.stringify(message);
}
