'use client'

import '@/app/_styles/globals.css'

interface GlobalErrorProps {
  error?: Error & { digest?: string }
  reset?: () => void
}

export default function GlobalError({ reset }: GlobalErrorProps) {
  return (
    <html lang='en' className='light'>
      <body className='flex min-h-screen items-center justify-center bg-[var(--bg)] font-sans text-[var(--text-primary)]'>
        <div className='flex flex-col items-center gap-4 text-center px-4'>
          <h1 className='text-xl font-semibold'>Something went wrong</h1>
          <p className='text-sm text-[var(--text-muted)]'>
            An unexpected error occurred. Please try again.
          </p>
          {reset && (
            <button
              type='button'
              onClick={() => reset()}
              className='rounded-md bg-[var(--text-primary)] px-4 py-2 text-sm text-[var(--bg)] hover:opacity-90 transition-opacity'
            >
              Try again
            </button>
          )}
        </div>
      </body>
    </html>
  )
}
