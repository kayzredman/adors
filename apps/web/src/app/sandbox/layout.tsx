import { RoleGuard } from '@/components/layout/RoleGuard'

export default function SandboxLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard minRole="dba">{children}</RoleGuard>
}
