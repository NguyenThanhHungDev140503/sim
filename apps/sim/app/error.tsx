'use client'

import { Chip } from '@sim/emcn'
import { StatusPageContent } from '@/components/status-page'
import { LogoShell } from '@/app/(landing)/components'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErrorPage({ reset }: ErrorProps) {
  return (
    <LogoShell center>
      <StatusPageContent
        title='Something went wrong'
        description='An unexpected error occurred. Please try again.'
      >
        <Chip variant='primary' onClick={reset}>
          Try again
        </Chip>
      </StatusPageContent>
    </LogoShell>
  )
}
