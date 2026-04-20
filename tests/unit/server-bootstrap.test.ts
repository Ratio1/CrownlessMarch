describe('server bootstrap', () => {
  it('exports a createServer function', async () => {
    const mod = await import('../../server');

    expect(typeof mod.createServer).toBe('function');
  });
});
