import { render, screen } from '@testing-library/react';
import HomePage from '@/app/page';

describe('HomePage', () => {
  it('renders the Thornwrithe title and login prompt', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { name: /thornwrithe/i })).toBeInTheDocument();
    expect(screen.getByText(/sign in to enter the briar march/i)).toBeInTheDocument();
  });
});
