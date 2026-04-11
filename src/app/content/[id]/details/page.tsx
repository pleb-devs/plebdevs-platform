import ResourceDetailsPageClient from './resource-details-page-client'

interface ResourceDetailsPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function ResourceDetailsPage({ params }: ResourceDetailsPageProps) {
  const { id } = await params

  return <ResourceDetailsPageClient resourceId={id} />
}
