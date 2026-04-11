'use client'

import { useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { MainLayout } from '@/components/layout/main-layout'
import { Section } from '@/components/layout/section'
import { ArrowLeft, FileText } from 'lucide-react'
import { ResourceContentView } from '@/app/content/components/resource-content-view'
import { useIdleMount } from '@/hooks/useIdleMount'
import { useViews } from '@/hooks/useViews'

interface ResourceDetailsPageClientProps {
  resourceId: string
}

function ResourceDetailsContent({ resourceId }: { resourceId: string }) {
  const router = useRouter()
  const socialReady = useIdleMount()
  const { count: viewCount } = useViews({
    ns: 'content',
    id: resourceId,
    enabled: socialReady
  })
  const handleMissingResource = useCallback(() => {
    router.replace('/404')
  }, [router])

  return (
    <MainLayout>
      <Section spacing="lg">
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2">
            <Button variant="ghost" size="sm" className="justify-start w-full sm:w-auto" asChild>
              <Link href={`/content/${resourceId}`}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Overview
              </Link>
            </Button>
            <span className="text-muted-foreground hidden sm:inline">•</span>
          <div className="flex items-center space-x-2">
            <FileText className="h-4 w-4" />
            <span className="text-sm text-muted-foreground">Content Details</span>
          </div>
        </div>

        <ResourceContentView
          resourceId={resourceId}
          onMissingResource={handleMissingResource}
          viewCount={viewCount}
        />
        </div>
      </Section>
    </MainLayout>
  )
}

export default function ResourceDetailsPageClient({ resourceId }: ResourceDetailsPageClientProps) {
  return <ResourceDetailsContent resourceId={resourceId} />
}
