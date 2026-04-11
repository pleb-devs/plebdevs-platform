import type { CourseUser } from "@/data/types"

export interface ResourceContentInitialMeta {
  resourceUser: CourseUser | null
  serverPrice: number | null
  serverPurchased: boolean
  unlockedViaCourse: boolean
  unlockingCourseId: string | null
}

const RESOURCE_ID_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const resourceMetaRequests = new Map<string, Promise<ResourceContentInitialMeta | null>>()

function parseResourceContentInitialMeta(data: any): ResourceContentInitialMeta {
  const unlockedByPurchase =
    Array.isArray(data?.purchases) && typeof data?.price === "number"
      ? data.purchases.some((purchase: any) => {
          const snapshot = purchase?.priceAtPurchase
          const snapshotValid = snapshot !== null && snapshot !== undefined && snapshot > 0
          const required = Math.min(snapshotValid ? snapshot : data.price, data.price)
          return (purchase?.amountPaid ?? 0) >= required
        })
      : false
  const unlockedByCourse = data?.unlockedViaCourse === true
  const fromCourseId =
    data?.unlockingCourseId ||
    (Array.isArray(data?.lessons)
      ? data.lessons
          .map((lesson: any) => lesson.course?.id || lesson.courseId)
          .find((id: string | undefined) => Boolean(id))
      : null)

  return {
    resourceUser: data?.user ?? null,
    serverPrice: typeof data?.price === "number" ? data.price : null,
    serverPurchased: unlockedByPurchase || unlockedByCourse,
    unlockedViaCourse: unlockedByCourse,
    unlockingCourseId: fromCourseId || null,
  }
}

export function isUuidResourceId(resourceId: string): boolean {
  return RESOURCE_ID_UUID_REGEX.test(resourceId)
}

export async function fetchResourceContentInitialMeta(
  resourceId: string
): Promise<ResourceContentInitialMeta | null> {
  if (!isUuidResourceId(resourceId)) {
    return null
  }

  const cachedRequest = resourceMetaRequests.get(resourceId)
  if (cachedRequest) {
    return cachedRequest
  }

  const request = (async () => {
    const response = await fetch(`/api/resources/${resourceId}`, {
      credentials: "include",
    })

    if (!response.ok) {
      return null
    }

    const body = await response.json()
    return parseResourceContentInitialMeta(body?.data)
  })()
    .catch((error) => {
      console.error("Failed to fetch resource meta", error)
      return null
    })
    .finally(() => {
      resourceMetaRequests.delete(resourceId)
    })

  resourceMetaRequests.set(resourceId, request)
  return request
}
