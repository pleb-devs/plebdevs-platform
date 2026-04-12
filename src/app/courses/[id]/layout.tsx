import type { Metadata } from 'next'

interface LayoutProps {
  children: React.ReactNode
}

export function generateMetadata(): Metadata {
  return {
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
}

export default function CourseLayout({ children }: LayoutProps) {
  return children
}
