import { useEffect, useState } from 'react'

type Reply<T> = { key: string; data?: T; error?: string }

// Match each response to its inputs so an earlier scenario can never replace the current one.
export function useApi<T>(path: string, body: string | undefined, enabled: boolean, attempt: number) {
  const key = JSON.stringify([path, body, attempt])
  const [reply, setReply] = useState<Reply<T>>()
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(path, {
          method: body === undefined ? 'GET' : 'POST',
          headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
          body, signal: controller.signal,
        })
        if (!response.ok) {
          const problem = await response.json().catch(() => null)
          throw new Error(problem?.error || 'Could not reach the separation engine. Check that the C++ server is running.')
        }
        const data: T = await response.json()
        if (!controller.signal.aborted) setReply({ key, data })
      } catch (error) {
        if (!controller.signal.aborted) setReply({ key, error: error instanceof Error ? error.message : 'Request failed.' })
      }
    }, body === undefined ? 0 : 150)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [key, path, body, enabled])
  return enabled && reply?.key === key ? reply : undefined
}
