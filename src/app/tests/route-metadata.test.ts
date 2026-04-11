import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  findResourceByIdMock,
  findResourceByIdWithNoteMock,
  findCourseByIdMock,
  findCourseByIdWithNoteMock,
} = vi.hoisted(() => ({
  findResourceByIdMock: vi.fn(),
  findResourceByIdWithNoteMock: vi.fn(),
  findCourseByIdMock: vi.fn(),
  findCourseByIdWithNoteMock: vi.fn(),
}))

vi.mock('@/lib/db-adapter', () => ({
  ResourceAdapter: {
    findById: findResourceByIdMock,
    findByIdWithNote: findResourceByIdWithNoteMock,
  },
  CourseAdapter: {
    findById: findCourseByIdMock,
    findByIdWithNote: findCourseByIdWithNoteMock,
  },
}))

import { generateMetadata as generateContentMetadata } from '@/app/content/[id]/layout'
import { generateMetadata as generateCourseMetadata } from '@/app/courses/[id]/layout'

describe('route metadata generation', () => {
  beforeEach(() => {
    findResourceByIdMock.mockReset()
    findResourceByIdWithNoteMock.mockReset()
    findCourseByIdMock.mockReset()
    findCourseByIdWithNoteMock.mockReset()
  })

  it('uses the DB-only content lookup for UUID routes', async () => {
    findResourceByIdMock.mockResolvedValue({ id: 'resource-id' })

    const metadata = await generateContentMetadata({
      params: Promise.resolve({ id: '123e4567-e89b-12d3-a456-426614174000' }),
    })

    expect(findResourceByIdMock).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000')
    expect(findResourceByIdWithNoteMock).not.toHaveBeenCalled()
    expect(metadata.title).toBe('Content | pleb.school')
  })

  it('uses the DB-only course lookup for UUID routes', async () => {
    findCourseByIdMock.mockResolvedValue({ id: 'course-id' })

    const metadata = await generateCourseMetadata({
      params: Promise.resolve({ id: '123e4567-e89b-12d3-a456-426614174000' }),
    })

    expect(findCourseByIdMock).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000')
    expect(findCourseByIdWithNoteMock).not.toHaveBeenCalled()
    expect(metadata.title).toBe('Course | pleb.school')
  })
})
