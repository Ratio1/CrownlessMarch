'use client';

import { useState } from 'react';

interface RegisterResponseBody {
  error?: string;
  verificationToken?: string;
}

export function RegisterCard() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setPending(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = (await response.json()) as RegisterResponseBody;

      if (!response.ok) {
        setError(body.error ?? 'Unable to register.');
        return;
      }

      const tokenHint = body.verificationToken ? ` Test token: ${body.verificationToken}` : '';
      setMessage(`Account created. Verify your email link before logging in.${tokenHint}`);
      setPassword('');
    } catch {
      setError('Unable to register.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel login-card">
      <div className="eyebrow">First descent</div>
      <h2>Register</h2>
      <p className="lede">
        Thornwrithe registration is email-gated. We send a verification link,
        then you return to log in and shape your first character.
      </p>

      <form className="stack" onSubmit={onSubmit}>
        <label className="field">
          <span>Email</span>
          <input
            autoComplete="email"
            inputMode="email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
            required
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            autoComplete="new-password"
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            required
          />
        </label>

        {error ? <p className="error">{error}</p> : null}
        {message ? <p className="hint">{message}</p> : null}

        <button className="primary-button" disabled={pending} type="submit">
          {pending ? 'Sending link...' : 'Register By Email'}
        </button>
      </form>
    </section>
  );
}
