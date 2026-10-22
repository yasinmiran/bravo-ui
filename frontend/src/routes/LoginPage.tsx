import { XIcon } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { api, ApiError, setPassphrase } from '@/api'
import { ThemeSwitch } from '@/components/ThemeSwitch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const input = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!value.trim()) return
    setBusy(true)
    setError(null)
    try {
      await api.login(value)
      setPassphrase(value)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== '/login' ? from : '/', { replace: true })
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Wrong passphrase. Ask whoever set up this Triage for the current one.'
          : 'The server did not answer. Try again in a moment.',
      )
      input.current?.select()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-12 items-center justify-end px-4">
        <ThemeSwitch />
      </header>
      <main className="flex flex-1 justify-center px-4 pt-[14vh]">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-extrabold tracking-tight">Triage</h1>
          <p className="mt-2 max-w-prose text-base text-muted-foreground">
            Drafts maintenance tickets from inspection findings, scored against your platform's own rules, for an engineer to approve.
          </p>
          <form onSubmit={submit} className="panel mt-6 p-5">
            <div className="space-y-2">
              <Label htmlFor="passphrase">Passphrase</Label>
              <Input
                ref={input}
                id="passphrase"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                aria-invalid={!!error}
                aria-describedby={error ? 'passphrase-error' : undefined}
                className={error ? 'border-destructive' : undefined}
              />
              {error && (
                <p id="passphrase-error" role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
                  <XIcon className="mt-0.5 size-3.5 shrink-0" />
                  <span>{error}</span>
                </p>
              )}
            </div>
            <Button type="submit" className="mt-4 w-full" disabled={busy || !value.trim()}>
              {busy ? 'Checking' : 'Sign in'}
            </Button>
          </form>
        </div>
      </main>
    </div>
  )
}
