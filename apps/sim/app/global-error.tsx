'use client'

export const dynamic = 'force-dynamic'

export default function GlobalError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div style={{ padding: '20px', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h2>Something went wrong!</h2>
      <button type='button' onClick={() => reset()}>
        Try again
      </button>
    </div>
  )
}
