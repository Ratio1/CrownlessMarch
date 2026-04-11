import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateCharacterPage from '@/app/create-character/page';

describe('CreateCharacterPage', () => {
  it('renders the character creation form', () => {
    render(<CreateCharacterPage />);

    expect(screen.getByRole('heading', { name: /create character/i })).toBeInTheDocument();
    expect(screen.getByText(/allocate up to 22 points/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/character name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create character/i })).toBeInTheDocument();
  });

  it('requires a character name before allowing submit', async () => {
    const user = userEvent.setup();
    render(<CreateCharacterPage />);

    const submitButton = screen.getByRole('button', { name: /create character/i });
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByLabelText(/character name/i), 'Mossblade');
    expect(submitButton).toBeEnabled();
  });
});
