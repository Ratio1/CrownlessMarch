import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlayPage from '@/app/play/page';

const originalFetch = global.fetch;

describe('PlayPage', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('renders the play surface with world canvas and text-forward HUD panels', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        snapshot: {
          regionId: 'briar-march',
          position: { x: 5, y: 5 },
          vision: { radius: 1, size: 3 },
          visibleTiles: [
            { x: 5, y: 5, kind: 'town', blocked: false },
            { x: 6, y: 5, kind: 'roots', blocked: false }
          ],
          activeEncounter: {
            id: 'enc-test-1',
            status: 'active',
            round: 2,
            nextRoundAt: '2026-01-01T00:00:02.000Z',
            logs: [{ round: 1, text: 'A Briar Goblin lunges from the roots.' }],
            combatants: [
              { id: 'hero:char-1', kind: 'hero', name: 'Mossblade', initiativeModifier: 2 },
              { id: 'monster:briar-goblin', kind: 'monster', name: 'Briar Goblin', initiativeModifier: 1 }
            ],
            queuedOverrides: []
          }
        }
      })
    );

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        encounter: {
          id: 'enc-test-1',
          status: 'active',
          round: 2,
          nextRoundAt: '2026-01-01T00:00:02.000Z',
          logs: [{ round: 2, text: 'Mossblade braces as thorn-winds rise.' }],
          combatants: [
            { id: 'hero:char-1', kind: 'hero', name: 'Mossblade', initiativeModifier: 2 },
            { id: 'monster:briar-goblin', kind: 'monster', name: 'Briar Goblin', initiativeModifier: 1 }
          ],
          queuedOverrides: [{ actorId: 'hero:char-1', command: 'guard', queuedAt: '2026-01-01T00:00:01.000Z' }]
        }
      })
    );

    render(<PlayPage />);

    expect(screen.getByRole('heading', { name: /thornwrithe field interface/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /world canvas/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /character panel/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /combat log/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /quest ledger/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /movement/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /field override/i })).toBeInTheDocument();

    expect(await screen.findByText(/mossblade braces as thorn-winds rise/i)).toBeInTheDocument();
    const characterPanelSection = screen
      .getByRole('heading', { name: /character panel/i })
      .closest('section');
    expect(characterPanelSection).not.toBeNull();
    expect(characterPanelSection).toHaveTextContent(/region:\s*briar-march/i);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/world/snapshot', expect.any(Object));
      expect(fetchMock).toHaveBeenCalledWith('/api/encounters/enc-test-1/snapshot', expect.any(Object));
    });
  });

  it('ignores stale poll responses and refreshes encounter snapshot for active encounters', async () => {
    const user = userEvent.setup();
    const initialPollDeferred = createDeferred<Response>();

    fetchMock
      .mockImplementationOnce(async () => initialPollDeferred.promise)
      .mockResolvedValueOnce(
        jsonResponse({
          snapshot: {
            regionId: 'briar-march',
            position: { x: 6, y: 5 },
            vision: { radius: 1, size: 3 },
            visibleTiles: [
              { x: 6, y: 5, kind: 'roots', blocked: false },
              { x: 5, y: 5, kind: 'town', blocked: false }
            ],
            activeEncounter: null
          },
          encounter: null
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          snapshot: {
            regionId: 'briar-march',
            position: { x: 7, y: 5 },
            vision: { radius: 1, size: 3 },
            visibleTiles: [
              { x: 7, y: 5, kind: 'road', blocked: false },
              { x: 6, y: 5, kind: 'roots', blocked: false }
            ],
            activeEncounter: {
              id: 'enc-refresh-1',
              status: 'active',
              round: 4,
              nextRoundAt: '2026-01-01T00:00:04.000Z',
              logs: [{ round: 3, text: 'Stale encounter log' }],
              combatants: [
                { id: 'hero:char-1', kind: 'hero', name: 'Mossblade', initiativeModifier: 2 },
                { id: 'monster:briar-goblin', kind: 'monster', name: 'Briar Goblin', initiativeModifier: 1 }
              ],
              queuedOverrides: []
            }
          }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          encounter: {
            id: 'enc-refresh-1',
            status: 'active',
            round: 5,
            nextRoundAt: '2026-01-01T00:00:05.000Z',
            logs: [{ round: 5, text: 'Fresh encounter tick from refresh.' }],
            combatants: [
              { id: 'hero:char-1', kind: 'hero', name: 'Mossblade', initiativeModifier: 2 },
              { id: 'monster:briar-goblin', kind: 'monster', name: 'Briar Goblin', initiativeModifier: 1 }
            ],
            queuedOverrides: []
          }
        })
      );

    render(<PlayPage />);

    await user.click(screen.getByRole('button', { name: /east/i }));
    await expectCharacterPanelText(/position:\s*6,\s*5/i);

    initialPollDeferred.resolve(
      jsonResponse({
        snapshot: {
          regionId: 'briar-march',
          position: { x: 5, y: 5 },
          vision: { radius: 1, size: 3 },
          visibleTiles: [{ x: 5, y: 5, kind: 'town', blocked: false }],
          activeEncounter: null
        }
      })
    );
    await expectCharacterPanelText(/position:\s*6,\s*5/i);

    await user.click(screen.getByRole('button', { name: /refresh/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/encounters/enc-refresh-1/snapshot', expect.any(Object));
    });
    expect(await screen.findByText(/fresh encounter tick from refresh/i)).toBeInTheDocument();
  });

  it('keeps override text on failed submit and hides override controls for resolved encounters', async () => {
    const user = userEvent.setup();

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          snapshot: {
            regionId: 'briar-march',
            position: { x: 5, y: 5 },
            vision: { radius: 1, size: 3 },
            visibleTiles: [{ x: 5, y: 5, kind: 'town', blocked: false }],
            activeEncounter: {
              id: 'enc-override-active',
              status: 'active',
              round: 2,
              nextRoundAt: '2026-01-01T00:00:02.000Z',
              logs: [{ round: 2, text: 'Fight on.' }],
              combatants: [
                { id: 'hero:char-1', kind: 'hero', name: 'Mossblade', initiativeModifier: 2 },
                { id: 'monster:briar-goblin', kind: 'monster', name: 'Briar Goblin', initiativeModifier: 1 }
              ],
              queuedOverrides: []
            }
          }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          encounter: {
            id: 'enc-override-active',
            status: 'active',
            round: 2,
            nextRoundAt: '2026-01-01T00:00:02.000Z',
            logs: [{ round: 2, text: 'Fight on.' }],
            combatants: [
              { id: 'hero:char-1', kind: 'hero', name: 'Mossblade', initiativeModifier: 2 },
              { id: 'monster:briar-goblin', kind: 'monster', name: 'Briar Goblin', initiativeModifier: 1 }
            ],
            queuedOverrides: []
          }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: 'Override failed.'
          },
          {
            ok: false,
            status: 500
          }
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({
          snapshot: {
            regionId: 'briar-march',
            position: { x: 5, y: 5 },
            vision: { radius: 1, size: 3 },
            visibleTiles: [{ x: 5, y: 5, kind: 'town', blocked: false }],
            activeEncounter: {
              id: 'enc-override-resolved',
              status: 'won',
              round: 4,
              nextRoundAt: '2026-01-01T00:00:04.000Z',
              logs: [{ round: 4, text: 'Victory.' }],
              combatants: [
                { id: 'hero:char-1', kind: 'hero', name: 'Mossblade', initiativeModifier: 2 },
                { id: 'monster:briar-goblin', kind: 'monster', name: 'Briar Goblin', initiativeModifier: 1 }
              ],
              queuedOverrides: []
            }
          }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          encounter: {
            id: 'enc-override-resolved',
            status: 'won',
            round: 4,
            nextRoundAt: '2026-01-01T00:00:04.000Z',
            logs: [{ round: 4, text: 'Victory.' }],
            combatants: [
              { id: 'hero:char-1', kind: 'hero', name: 'Mossblade', initiativeModifier: 2 },
              { id: 'monster:briar-goblin', kind: 'monster', name: 'Briar Goblin', initiativeModifier: 1 }
            ],
            queuedOverrides: []
          }
        })
      );

    render(<PlayPage />);

    const input = await screen.findByRole('textbox', { name: /override command/i });
    await user.type(input, 'retreat');
    await user.click(screen.getByRole('button', { name: /^queue$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/override failed/i);
    expect(screen.getByRole('textbox', { name: /override command/i })).toHaveValue('retreat');

    await user.click(screen.getByRole('button', { name: /refresh/i }));
    await screen.findByText(/encounter resolved/i);
    expect(screen.queryByRole('textbox', { name: /override command/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^queue$/i })).not.toBeInTheDocument();
  });
});

async function expectCharacterPanelText(pattern: RegExp) {
  await waitFor(() => {
    const characterPanelSection = screen
      .getByRole('heading', { name: /character panel/i })
      .closest('section');
    expect(characterPanelSection).not.toBeNull();
    expect(characterPanelSection).toHaveTextContent(pattern);
  });
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

function jsonResponse(
  body: unknown,
  options?: {
    ok?: boolean;
    status?: number;
  }
): Response {
  return {
    ok: options?.ok ?? true,
    status: options?.status ?? 200,
    json: async () => body
  } as Response;
}
