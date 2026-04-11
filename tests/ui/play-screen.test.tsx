import { render, screen } from '@testing-library/react';
import HomePage from '@/app/page';

describe('HomePage', () => {
  it('renders the Thornwrithe title and auth prompt', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { name: /thornwrithe/i })).toBeInTheDocument();
    expect(screen.getByText(/sign in to enter the briar march/i)).toBeInTheDocument();
  });

  it('renders register and login cards', () => {
    render(<HomePage />);

    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enter the briar march/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /register/i })).toBeInTheDocument();
  });
});
