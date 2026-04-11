import { RoleGuard } from '@/components/layout/RoleGuard'

export default function ConnectionsLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard minRole="analyst">{children}</RoleGuard>
}
