import { cookies } from 'next/headers';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { AdminLoginCard } from '@/components/admin/AdminLoginCard';
import {
  ADMIN_SESSION_COOKIE_NAME,
  resolveAdminCredentials,
  verifyAdminSessionToken,
} from '@/server/admin/auth';
import { loadAdminDashboardData } from '@/server/admin/dashboard';

export const dynamic = 'force-dynamic';

function AdminConfigurationError() {
  return (
    <section className="panel admin-card">
      <div className="eyebrow">Thornwrithe admin</div>
      <h1>Admin configuration missing</h1>
      <p className="lede">
        Define <code>ADMIN_USER</code> and <code>ADMIN_PASS</code> or the
        Thornwrithe fallback admin env pair before using the admin console.
      </p>
    </section>
  );
}

export default async function AdminPage() {
  if (!resolveAdminCredentials()) {
    return (
      <main className="page page--admin">
        <AdminConfigurationError />
      </main>
    );
  }

  const token = cookies().get(ADMIN_SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return (
      <main className="page page--admin">
        <AdminLoginCard />
      </main>
    );
  }

  try {
    await verifyAdminSessionToken(token);
  } catch {
    return (
      <main className="page page--admin">
        <AdminLoginCard />
      </main>
    );
  }

  try {
    const data = await loadAdminDashboardData();

    return (
      <main className="page page--admin">
        <AdminDashboard data={data} />
      </main>
    );
  } catch (error) {
    return (
      <main className="page page--admin">
        <section className="panel admin-card">
          <div className="eyebrow">Thornwrithe admin</div>
          <h1>Dashboard unavailable</h1>
          <p className="error">
            {error instanceof Error ? error.message : 'Unable to load the admin dashboard.'}
          </p>
        </section>
      </main>
    );
  }
}
