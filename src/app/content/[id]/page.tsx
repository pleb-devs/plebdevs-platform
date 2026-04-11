import ResourcePageClient from './resource-page-client'

interface ResourcePageProps {
  params: Promise<{
    id: string
  }>
}

export default async function ResourcePage({ params }: ResourcePageProps) {
  const { id } = await params

  return <ResourcePageClient resourceId={id} />
}
