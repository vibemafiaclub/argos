import { AdminDashboard } from '@/components/admin/admin-dashboard'
import { AdminLoginForm } from '@/components/admin/admin-login-form'
import { hasAdminSession } from '@/lib/server/admin-auth'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const isAdmin = await hasAdminSession()
  return isAdmin ? <AdminDashboard /> : <AdminLoginForm />
}
