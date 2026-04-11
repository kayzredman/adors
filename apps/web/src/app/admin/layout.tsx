import { RoleGuard } from '@/components/layout/RoleGuard'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard minRole="super_admin">{children}</RoleGuard>
}
