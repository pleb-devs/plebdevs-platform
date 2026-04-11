import type { Metadata } from 'next'
import { ResourceAdapter } from '@/lib/db-adapter'

interface LayoutProps {
  children: React.ReactNode
  params: Promise<{ id: string }>
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params

  // Only fetch for UUID resource IDs (database resources)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(id)) {
    return {
      title: 'Content | pleb.school',
      description: 'View content on pleb.school',
    }
  }

  try {
    const resource = await ResourceAdapter.findById(id)
    if (!resource) {
      return {
        title: 'Content Not Found | pleb.school',
        description: 'The requested content could not be found.',
      }
    }

    const metadata: Metadata = {
      title: 'Content | pleb.school',
      description: 'View content on pleb.school',
      openGraph: {
        title: 'Content',
        description: 'View content on pleb.school',
        type: 'article',
        siteName: 'pleb.school',
      },
      twitter: {
        card: 'summary',
        title: 'Content',
        description: 'View content on pleb.school',
      },
    }

    return metadata
  } catch (error) {
    console.error('Error generating content metadata:', error)
    return {
      title: 'Content | pleb.school',
      description: 'View content on pleb.school',
    }
  }
}

export default function ContentLayout({ children }: LayoutProps) {
  return children
}
