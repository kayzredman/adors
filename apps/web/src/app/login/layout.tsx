// Login has no sidebar — the root Sidebar component returns null on /login
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
