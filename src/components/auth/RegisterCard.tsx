'use client';

import { FormEvent, useState } from 'react';

export function RegisterCard() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setPending(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });
      const body = (await response.json()) as { error?: string; verificationToken?: string };

      if (!response.ok) {
        setError(body.error ?? 'Unable to register.');
        return;
      }

      const tokenHint = body.verificationToken ? ` Token: ${body.verificationToken}` : '';
      setMessage(`Account created. Verify your email before logging in.${tokenHint}`);
      setPassword('');
    } catch {
      setError('Unable to register.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="hero" aria-label="register card">
      <h2>Create Account</h2>
      <form onSubmit={onSubmit}>
        <label htmlFor="register-username">Username</label>
        <input
          id="register-username"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />

        <label htmlFor="register-email">Email</label>
        <input
          id="register-email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <label htmlFor="register-password">Password</label>
        <input
          id="register-password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        {error ? <p role="alert">{error}</p> : null}
        {message ? <p>{message}</p> : null}
        <button type="submit" disabled={pending}>
          {pending ? 'Registering...' : 'Register'}
        </button>
      </form>
    </section>
  );
}
