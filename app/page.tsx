import { LoginCard } from '@/components/auth/LoginCard';
import { RegisterCard } from '@/components/auth/RegisterCard';

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function Page({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const verification = firstValue(searchParams?.verification);
  const verificationError = firstValue(searchParams?.verification_error);
  const verificationMessage =
    verification === 'verified'
      ? 'Email verified. Log in to create your character.'
      : verification === 'failed' && verificationError
        ? verificationError
        : null;

  return (
    <main className="page page--login">
      <section className="auth-shell">
        <section className="panel auth-hero">
          <p className="eyebrow">Thornwrithe</p>
          <h1>Forest-bound heroes, shard-bound runtime.</h1>
          <p className="lede">
            Register by email, verify the gate link, shape a simplified D20
            hero, then enter whichever live Thornwrithe shard answers first.
          </p>
          {verificationMessage ? <p className="hint auth-hero__message">{verificationMessage}</p> : null}
        </section>

        <section className="auth-grid">
          <LoginCard message={verification === 'verified' ? verificationMessage : null} />
          <RegisterCard />
        </section>
      </section>
    </main>
  );
}
