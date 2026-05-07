'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface LoginCardProps {
  message?: string | null;
}

interface LoginResponseBody {
  error?: string;
  needsCharacterCreation?: boolean;
  needsPointBuyAllocation?: boolean;
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
    const body = (await response.json()) as LoginResponseBody;
    return body.error ?? 'Request failed';
  } catch {
    return 'Request failed';
  }
}

export function LoginCard({ message = null }: LoginCardProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const loginResponse = await postJson('/api/auth/login', {
        email,
        password,
      });

      const body = (await loginResponse.json()) as LoginResponseBody;

      if (!loginResponse.ok) {
        throw new Error(body.error ?? 'Unable to enter Thornwrithe.');
      }

      router.replace(
        body.needsCharacterCreation
          ? '/create-character'
          : body.needsPointBuyAllocation
            ? '/create-character?allocation=required'
            : '/play'
      );
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Unable to enter Thornwrithe.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel login-card">
      <div className="eyebrow">Returning wanderer</div>
      <h2>Login</h2>
      <p className="lede">
        Verified accounts can reopen their last hero, mint a fresh attach token,
        and bind to the next live shard.
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

        {error ? <p className="error">{error}</p> : null}
        {!error && message ? <p className="hint">{message}</p> : null}

        <button className="primary-button" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Opening gate...' : 'Enter Thornwrithe'}
        </button>
      </form>
    </section>
  );
}
