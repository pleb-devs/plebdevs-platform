"use client"

import React from "react"
import { useRouter } from "next/navigation"
import {
  BookOpen,
  Calendar,
  Eye,
  Heart,
  Lock,
  MessageCircle,
  Unlock,
  User,
  Users,
  Zap,
} from "lucide-react"

import type { ContentItem } from "@/data/types"
import { contentTypeIcons } from "@/data/config"
import { trackEventSafe } from "@/lib/analytics"
import { getPurchaseIcon } from "@/lib/payments-config"
import { resolvePreferredDisplayName } from "@/lib/profile-display"
import { useSession } from "@/hooks/useSession"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { OptimizedImage } from "@/components/ui/optimized-image"

const ShieldCheckIcon = getPurchaseIcon("shieldCheck")

interface HomepageItem {
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  gradient: string
  type?: string
  enrollmentCount?: number
}

interface ContentCardProps {
  item: ContentItem | HomepageItem
  variant?: "content" | "course" | "homepage"
  onTagClick?: (tag: string) => void
  className?: string
  showContentTypeTags?: boolean
  engagementMode?: "off" | "detail"
}

function isContentItem(item: ContentItem | HomepageItem): item is ContentItem {
  return "type" in item && "id" in item
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return "just now"
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`
  if (diffInSeconds < 31536000) return `${Math.floor(diffInSeconds / 2592000)}mo ago`
  return `${Math.floor(diffInSeconds / 31536000)}y ago`
}

function normalizeTopic(topic: string): string {
  const normalized = topic
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")

  return normalized || "unknown"
}

export function ContentCard({
  item,
  variant = "content",
  onTagClick,
  className = "",
  showContentTypeTags = false,
  engagementMode = "off",
}: ContentCardProps) {
  const isContent = isContentItem(item)
  const router = useRouter()
  const { status: sessionStatus } = useSession()
  const isAuthenticated = sessionStatus === "authenticated"
  const isSessionLoading = sessionStatus === "loading"

  const navigateToContent = (source: string) => {
    if (!isContent) return

    trackEventSafe("content_card_opened", {
      source,
      content_type: item.type,
      content_id: item.id,
      is_premium: item.isPremium,
    })

    if (item.type === "course") {
      router.push(`/courses/${item.id}`)
      return
    }

    router.push(`/content/${item.id}`)
  }

  const handleTopicTagClick = (topic: string) => {
    if (!isContent) return

    trackEventSafe("content_card_tag_clicked", {
      tag_id: normalizeTopic(topic),
      content_type: item.type,
      content_id: item.id,
    })
    onTagClick?.(topic)
  }

  if (variant === "homepage") {
    const homepageItem = item as HomepageItem
    return (
      <Card className={`overflow-hidden transition-all duration-200 hover:shadow-lg hover:scale-[1.02] ${className}`}>
        <div className={`h-32 bg-gradient-to-br ${homepageItem.gradient} flex items-center justify-center`}>
          <homepageItem.icon className="h-8 w-8 text-primary" />
        </div>
        <CardHeader>
          <CardTitle className="text-lg">{homepageItem.title}</CardTitle>
          <CardDescription>{homepageItem.description}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const isPremium = isContent && item.price > 0
  const price = isContent ? item.price : 0
  const showEnrollmentCount =
    !isContent &&
    "enrollmentCount" in item &&
    typeof item.enrollmentCount === "number" &&
    item.enrollmentCount > 0
  const purchasedCount =
    isContent && Array.isArray(item.purchases)
      ? item.purchases.filter((purchase) => {
          const snapshot = purchase.priceAtPurchase
          const snapshotValid = snapshot !== null && snapshot !== undefined && snapshot > 0
          const required = Math.min(snapshotValid ? snapshot : price, price)
          return (purchase.amountPaid ?? 0) >= (required ?? 0)
        }).length
      : 0
  const isPurchased = purchasedCount > 0
  const showEngagement = engagementMode === "detail"
  const instructorName = isContent
    ? resolvePreferredDisplayName({
        preferredNames: [item.instructor],
        pubkey: item.instructorPubkey,
      })
    : ""

  return (
    <div className="h-full">
      <Card
        className={`overflow-hidden transition-all duration-200 hover:shadow-lg hover:scale-[1.02] cursor-pointer group flex flex-col h-full ${className}`}
        onClick={() => navigateToContent("card")}
      >
        <div className="relative aspect-video bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10 overflow-hidden">
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)",
                backgroundSize: "20px 20px",
              } as React.CSSProperties}
            />
          </div>

          {(() => {
            if (isContent && (item.image || ("thumbnailUrl" in item && item.thumbnailUrl))) {
              const imageSrc = item.image || ("thumbnailUrl" in item ? item.thumbnailUrl : "") || "/placeholder.svg"
              return (
                <OptimizedImage
                  src={imageSrc as string}
                  alt={item.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
              )
            }
            return null
          })()}

          <div className="thumbnail-type-overlay absolute top-3 left-3 p-2 rounded-lg bg-transparent backdrop-blur-xs border shadow-sm transition-opacity duration-200 pointer-events-none">
            {(() => {
              const IconComponent = isContent ? (contentTypeIcons[item.type] || BookOpen) : BookOpen
              return <IconComponent className="h-4 w-4 text-foreground" />
            })()}
          </div>

          {showEngagement && isContent && (
            <div className="absolute bottom-3 right-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-transparent backdrop-blur-xs shadow-sm border">
                  <Zap className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs font-bold text-foreground">{(item.zapsCount ?? 0).toLocaleString()}</span>
                </div>

                <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-transparent backdrop-blur-xs shadow-sm border">
                  <MessageCircle className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs font-bold text-foreground">{item.commentsCount ?? 0}</span>
                </div>

                <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-transparent backdrop-blur-xs shadow-sm border">
                  <Heart className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs font-bold text-foreground">{item.likesCount ?? 0}</span>
                </div>
              </div>
            </div>
          )}

          {!isContent || (!item.image && !("thumbnailUrl" in item && item.thumbnailUrl)) ? (
            <div className="absolute inset-0 flex items-center justify-center">
              {variant === "course" ? (
                <BookOpen className="h-12 w-12 text-primary/60" />
              ) : (() => {
                const IconComponent = isContent ? (contentTypeIcons[item.type] || BookOpen) : BookOpen
                return <IconComponent className="h-12 w-12 text-primary/60" />
              })()}
            </div>
          ) : null}
        </div>

        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold leading-tight group-hover:text-primary transition-colors line-clamp-2">
            {item.title}
          </CardTitle>

          <div className="flex items-center justify-between gap-2 mt-2" onClick={(event) => event.stopPropagation()}>
            <div className="flex flex-wrap gap-2 flex-1">
              {isContent &&
                item.topics &&
                item.topics.slice(0, 3).map((topic, index) => {
                  if (!showContentTypeTags && (topic === "document" || topic === "video" || topic === "course")) {
                    return null
                  }

                  return (
                    <Badge
                      key={`${topic}-${index}`}
                      variant="outline"
                      className="text-xs cursor-pointer hover:bg-accent transition-colors"
                      onClick={() => handleTopicTagClick(topic)}
                    >
                      {topic}
                    </Badge>
                  )
                })}
            </div>

            {isContent && (
              <div className="flex-shrink-0 ml-2 flex items-center gap-2">
                {isPurchased ? (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-success/10 border border-success/50">
                    <ShieldCheckIcon className="h-3 w-3 text-success" />
                    <span className="text-xs font-medium text-success">Purchased</span>
                  </div>
                ) : isPremium ? (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
                    <Lock className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                      {item.price?.toLocaleString() || "40000"} sats
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                    <Unlock className="h-3 w-3 text-green-600 dark:text-green-400" />
                    <span className="text-xs font-medium text-green-700 dark:text-green-300">Free</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-0 flex-grow flex flex-col">
          <CardDescription className="text-sm leading-relaxed line-clamp-3 mb-4">
            {item.description}
          </CardDescription>

          <div className="flex-grow" />

          {showEnrollmentCount && typeof item.enrollmentCount === "number" && (
            <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  <span>{item.enrollmentCount.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>{isContent ? formatTimeAgo(item.createdAt) : "4 months ago"}</span>
            </div>

            {isContent && instructorName && (
              <div className="flex items-center gap-1">
                <User className="h-3 w-3" />
                <span>{instructorName}</span>
              </div>
            )}
          </div>

          <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
            {isContent && (!isPremium || isPurchased) ? (
              <Button
                className="w-full"
                size="sm"
                variant="outline"
                onClick={() => navigateToContent("primary_cta")}
              >
                <Eye className="h-4 w-4 mr-2" />
                {item.type === "course" ? "Start Learning" : "View Content"}
              </Button>
            ) : (
              <Button
                className="w-full"
                size="sm"
                variant="outline"
                disabled={isSessionLoading}
                onClick={() => {
                  if (!isContent) return

                  if (!isAuthenticated) {
                    trackEventSafe("content_card_auth_redirect_clicked", {
                      content_type: item.type,
                      content_id: item.id,
                    })
                    router.push("/auth/signin")
                    return
                  }

                  navigateToContent("auth_cta")
                }}
              >
                <User className="h-4 w-4 mr-2" />
                {isSessionLoading
                  ? "Loading..."
                  : isAuthenticated
                    ? item.type === "course"
                      ? "View Course"
                      : "View & Unlock"
                    : "Login"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
