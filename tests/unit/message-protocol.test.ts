import { parseInboundMessage } from '../../src/server/runtime/message-protocol';

describe('message protocol', () => {
  it('accepts trimmed MUD command messages for the gameplay socket', () => {
    const message = parseInboundMessage(Buffer.from(JSON.stringify({
      type: 'command',
      command: '  search roots  ',
    })));

    expect(message).toEqual({
      type: 'command',
      command: 'search roots',
    });
  });

  it('rejects empty command messages', () => {
    expect(parseInboundMessage(Buffer.from(JSON.stringify({
      type: 'command',
      command: '   ',
    })))).toBeNull();
  });
});
