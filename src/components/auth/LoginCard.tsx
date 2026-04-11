'use client';

import { FormEvent, useState } from 'react';

export function LoginCard() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(body.error ?? 'Unable to sign in.');
        return;
      }

      window.location.assign('/create-character');
    } catch {
      setError('Unable to sign in.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="hero" aria-label="login card">
      <h2>Sign In</h2>
      <form onSubmit={onSubmit}>
        <label htmlFor="login-username">Username</label>
        <input
          id="login-username"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />

        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        {error ? <p role="alert">{error}</p> : null}
        <button type="submit" disabled={pending}>
          {pending ? 'Signing in...' : 'Enter the Briar March'}
        </button>
      </form>
    </section>
  );
}
