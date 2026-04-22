import { resolveRequestOrigin } from '../../src/server/http/request-origin';

describe('request origin', () => {
  it('prefers forwarded host and proto when present', () => {
    const request = new Request('http://localhost:3000/api/auth/verify?token=test', {
      headers: {
        host: 'localhost:3000',
        'x-forwarded-host': 'devnet-thorn.ratio1.link',
        'x-forwarded-proto': 'https',
      },
    });

    expect(resolveRequestOrigin(request)).toBe('https://devnet-thorn.ratio1.link');
  });

  it('falls back to the request url origin without proxy headers', () => {
    const request = new Request('http://localhost:3000/api/auth/register', {
      headers: {
        host: 'localhost:3000',
      },
    });

    expect(resolveRequestOrigin(request)).toBe('http://localhost:3000');
  });
});
