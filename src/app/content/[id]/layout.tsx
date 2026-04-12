import type { Metadata } from 'next'

interface LayoutProps {
  children: React.ReactNode
}

export const metadata: Metadata = {
  title: 'Content | plebdevs.com',
  description: 'View content on plebdevs.com',
  openGraph: {
    title: 'Content',
    description: 'View content on plebdevs.com',
    type: 'article',
    siteName: 'plebdevs.com',
  },
  twitter: {
    card: 'summary',
    title: 'Content',
    description: 'View content on plebdevs.com',
  },
}

export default function ContentLayout({ children }: LayoutProps) {
  return children
}
