import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getAllPostMeta, getPostBySlug, getRelatedPosts } from '@/lib/blog/registry'
import { BLOG_SECTION, buildPostGraphJsonLd, buildPostMetadata } from '@/lib/blog/seo'
import { getBaseUrl } from '@/lib/core/utils/urls'
import { ContentPostPage } from '@/app/(landing)/components'

export const dynamicParams = true
export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) notFound()
  const related = await getRelatedPosts(slug, 3)

  return (
    <ContentPostPage
      basePath={BLOG_SECTION.basePath}
      backLabel='Back to Blog'
      post={post}
      related={related}
      graphJsonLd={buildPostGraphJsonLd(post)}
      shareUrl={`${getBaseUrl()}${BLOG_SECTION.basePath}/${slug}`}
    />
  )
}
