import type { Metadata } from 'next'
import { CourseAdapter } from '@/lib/db-adapter'

interface LayoutProps {
  children: React.ReactNode
  params: Promise<{ id: string }>
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params

  // Only fetch for UUID course IDs (database courses)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(id)) {
    return {
      title: 'Course | plebdevs.com',
      description: 'View course on plebdevs.com',
    }
  }

  try {
    const courseExists = await CourseAdapter.exists(id)
    if (!courseExists) {
      return {
        title: 'Course Not Found | plebdevs.com',
        description: 'The requested course could not be found.',
      }
    }

    const metadata: Metadata = {
      title: 'Course | plebdevs.com',
      description: 'View course on plebdevs.com',
      openGraph: {
        title: 'Course',
        description: 'View course on plebdevs.com',
        type: 'website',
        siteName: 'plebdevs.com',
      },
      twitter: {
        card: 'summary',
        title: 'Course',
        description: 'View course on plebdevs.com',
      },
    }

    return metadata
  } catch (error) {
    console.error('Error generating course metadata:', error)
    return {
      title: 'Course | plebdevs.com',
      description: 'View course on plebdevs.com',
    }
  }
}

export default function CourseLayout({ children }: LayoutProps) {
  return children
}
