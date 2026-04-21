'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface AuthErrorBody {
  error?: string;
  code?: string;
}

async function postJson(url: string, body: Record<string, string>) {
  return await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(body),
  });
}

async function readErrorMessage(response: Response) {
  try {
    const body = (await response.json()) as AuthErrorBody;
    return body.error ?? 'Request failed';
  } catch {
    return 'Request failed';
  }
}

export function LoginCard() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [characterName, setCharacterName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const registrationResponse = await postJson('/api/auth/register', {
        email,
        password,
        characterName,
      });

      if (!registrationResponse.ok && registrationResponse.status !== 409) {
        throw new Error(await readErrorMessage(registrationResponse));
      }

      const loginResponse = await postJson('/api/auth/login', {
        email,
        password,
      });

      if (!loginResponse.ok) {
        throw new Error(await readErrorMessage(loginResponse));
      }

      router.replace('/play');
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Unable to enter the shard.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel login-card">
      <div className="eyebrow">Thornwrithe</div>
      <h1>Enter the shard</h1>
      <p className="lede">
        Sign in, mint a fresh attach token, and bind your character to whichever
        live shard host answers first.
      </p>

      <form className="stack" onSubmit={handleSubmit}>
        <label className="field">
          <span>Email</span>
          <input
            autoComplete="email"
            inputMode="email"
            name="email"
            onChange={(event) => setEmail(event.currentTarget.value)}
            required
            type="email"
            value={email}
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            autoComplete="current-password"
            name="password"
            onChange={(event) => setPassword(event.currentTarget.value)}
            required
            type="password"
            value={password}
          />
        </label>

        <label className="field">
          <span>Character name</span>
          <input
            autoComplete="nickname"
            name="characterName"
            onChange={(event) => setCharacterName(event.currentTarget.value)}
            required
            type="text"
            value={characterName}
          />
        </label>

        {error ? (
          <p className="error">{error}</p>
        ) : (
          <p className="hint">
            First use creates the account. Later sessions reuse the same
            character and just reopen the shard connection.
          </p>
        )}

        <button className="primary-button" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Opening gate...' : 'Enter the shard'}
        </button>
      </form>
    </section>
  );
}
