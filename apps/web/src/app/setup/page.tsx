'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Database, RefreshCw, CheckCircle2, ArrowRight, Loader2, Shield } from 'lucide-react'
import { AdorsLogo } from '@/components/brand/AdorsLogo'
import { cn } from '@/lib/utils'
import { ConnectionPanel } from '@/components/connections/ConnectionPanel'
import { api } from '@/lib/api'

type Step = 1 | 2 | 3

const STEPS = [
  { n: 1, label: 'Add Connection',       icon: Database    },
  { n: 2, label: 'Run Health Scan',       icon: RefreshCw   },
  { n: 3, label: 'Mission Control Ready', icon: Shield      },
]

export default function SetupPage() {
  const router = useRouter()
  const [step,          setStep]          = useState<Step>(1)
  const [connId,        setConnId]        = useState<string | null>(null)
  const [scanning,      setScanning]      = useState(false)
  const [scanDone,      setScanDone]      = useState(false)
  const [showConnPanel, setShowConnPanel] = useState(false)

  async function runScan() {
    if (!connId) return
    setScanning(true)
    try {
      await api.connections.scan(connId)
      setScanDone(true)
      setStep(3)
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center px-4">
      <div className="w-full max-w-2xl">

        {/* Header */}
        <div className="flex flex-col items-center gap-3 mb-10">
          <AdorsLogo size={52} />
          <h1 className="text-2xl font-bold text-foreground">Welcome to ADORS Mission Control</h1>
          <p className="text-sm text-muted-foreground">Let's get you set up in 3 quick steps</p>
        </div>

        {/* Step progress */}
        <div className="flex items-center justify-center gap-0 mb-10">
          {STEPS.map(({ n, label, icon: Icon }, i) => (
            <div key={n} className="flex items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors',
                  step > n
                    ? 'bg-success border-success text-white'
                    : step === n
                      ? 'bg-brand-500 border-brand-500 text-white'
                      : 'bg-background border-border text-muted-foreground',
                )}>
                  {step > n ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-4 h-4" />}
                </div>
                <span className={cn(
                  'text-xs font-medium whitespace-nowrap',
                  step >= n ? 'text-foreground' : 'text-muted-foreground',
                )}>{label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn(
                  'h-px w-20 mx-3 mb-5 transition-colors',
                  step > n ? 'bg-success' : 'bg-border',
                )} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="rounded-2xl border border-border bg-card p-8 shadow-lg">
          {step === 1 && (
            <div className="text-center space-y-4">
              <Database className="w-12 h-12 text-brand-400 mx-auto" />
              <h2 className="text-xl font-bold text-foreground">Add your first database connection</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Register an Oracle, SQL Server, or MariaDB instance. You can add more later from the Connections page.
              </p>
              <div className="flex justify-center gap-3 pt-2">
                <button
                  onClick={() => setShowConnPanel(true)}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
                >
                  <Database className="w-4 h-4" /> Add Connection
                </button>
                <button
                  onClick={() => router.push('/')}
                  className="px-6 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Skip for now
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="text-center space-y-4">
              <RefreshCw className={cn('w-12 h-12 mx-auto text-brand-400', scanning && 'animate-spin')} />
              <h2 className="text-xl font-bold text-foreground">Run your first health scan</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                ADORS will connect to your database and collect health metrics — takes about 5 seconds.
              </p>
              <div className="flex justify-center gap-3 pt-2">
                <button
                  onClick={runScan}
                  disabled={scanning}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {scanning ? 'Scanning…' : 'Run Scan'}
                </button>
                <button
                  onClick={() => router.push('/')}
                  className="px-6 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Skip for now
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="text-center space-y-4">
              <Shield className="w-12 h-12 text-success mx-auto" />
              <h2 className="text-xl font-bold text-foreground">You're ready!</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                ADORS Mission Control is set up and monitoring your databases. Head to the dashboard to see live metrics.
              </p>
              <button
                onClick={() => router.push('/')}
                className="inline-flex items-center gap-2 px-8 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors"
              >
                Go to Dashboard <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Connection panel */}
      {showConnPanel && (
        <ConnectionPanel
          mode="create"
          onClose={() => setShowConnPanel(false)}
          onSaved={(id?: string) => {
            setShowConnPanel(false)
            if (id) setConnId(id)
            setStep(2)
          }}
        />
      )}
    </div>
  )
}
