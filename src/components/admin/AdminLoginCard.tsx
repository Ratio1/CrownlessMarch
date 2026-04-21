'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface ErrorBody {
  error?: string;
}

async function readError(response: Response) {
  try {
    const body = (await response.json()) as ErrorBody;
    return body.error ?? 'Admin login failed';
  } catch {
    return 'Admin login failed';
  }
}

export function AdminLoginCard() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      router.replace('/admin');
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Admin login failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel admin-card">
      <div className="eyebrow">Thornwrithe admin</div>
      <h1>Operations console</h1>
      <p className="lede">
        Sign in with the deployment admin credentials to inspect the durable PC roster,
        live leases, and decoded R1FS checkpoints.
      </p>

      <form className="stack" onSubmit={handleSubmit}>
        <label className="field">
          <span>Admin user</span>
          <input
            autoComplete="username"
            name="username"
            onChange={(event) => setUsername(event.currentTarget.value)}
            required
            type="text"
            value={username}
          />
        </label>

        <label className="field">
          <span>Admin pass</span>
          <input
            autoComplete="current-password"
            name="password"
            onChange={(event) => setPassword(event.currentTarget.value)}
            required
            type="password"
            value={password}
          />
        </label>

        {error ? <p className="error">{error}</p> : <p className="hint">Read-only dashboard. No gameplay controls.</p>}

        <button className="primary-button" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Opening console...' : 'Open admin'}
        </button>
      </form>
    </section>
  );
}
