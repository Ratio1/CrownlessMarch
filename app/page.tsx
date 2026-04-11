import { LoginCard } from '@/components/auth/LoginCard';
import { RegisterCard } from '@/components/auth/RegisterCard';

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <p>Shared shard. Persistent heroes. Fog-bound wildlands.</p>
        <h1>Thornwrithe</h1>
        <p>Sign in to enter the Briar March, burn back roots, and survive the paths the forest keeps rewriting.</p>
      </section>
      <LoginCard />
      <RegisterCard />
    </main>
  );
}
