'use client'

export const dynamic = 'force-static'

export default function GlobalError({
  error: _error,
  reset: _reset,
}: {
  error?: Error & { digest?: string }
  reset?: () => void
}) {
  return (
    <html lang='en'>
      <head>
        <title>Error</title>
      </head>
      <body>
        <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
          <h2>Something went wrong</h2>
          <p style={{ color: '#666', fontSize: '14px' }}>An unexpected error occurred.</p>
        </div>
      </body>
    </html>
  )
}
