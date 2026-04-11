import { render, screen, waitFor } from '@testing-library/react';
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
});

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body
  } as Response;
}
