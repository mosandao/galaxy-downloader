/**
 * Instagram 平台解析器
 *
 * 支持格式:
 * - https://www.instagram.com/p/xxx (帖子)
 * - https://www.instagram.com/reel/xxx (Reels 视频)
 * - https://www.instagram.com/stories/username/xxx (Stories)
 */

import type { PlatformParser, ParseContext, ParserResult } from './index.js'
import type { CanonicalPlatform, UnifiedParseResult } from '../types.js'

export const instagramParser: PlatformParser = {
    name: 'instagram',
    patterns: [
        /instagram\.com\/p\/([a-zA-Z0-9_-]+)/,
        /instagram\.com\/reel\/([a-zA-Z0-9_-]+)/,
        /instagram\.com\/reels\/([a-zA-Z0-9_-]+)/,
        /instagram\.com\/stories\/[\w]+\/(\d+)/,
    ],

    async parse(ctx: ParseContext): Promise<ParserResult> {
        const { url } = ctx

        // 1. 提取帖子 ID
        const postId = extractInstagramPostId(url)
        if (!postId) {
            return {
                success: false,
                error: '无法从链接中提取帖子 ID',
                code: 'PARSE_FAILED',
            }
        }

        console.log(`[Instagram] 帖子 ID: ${postId}`)

        // 2. 获取帖子详情
        try {
            const postInfo = await fetchInstagramPostInfo(postId, url)

            // 3. 构造返回结果
            const result: NonNullable<UnifiedParseResult['data']> = {
                title: postInfo.title,
                desc: postInfo.desc,
                cover: postInfo.cover,
                platform: 'instagram',
                url: url,
                duration: postInfo.duration,
                downloadVideoUrl: postInfo.videoUrl,
                downloadAudioUrl: null,
                originDownloadVideoUrl: postInfo.videoUrl,
                originDownloadAudioUrl: null,
                mediaActions: {
                    video: 'direct-download',
                    audio: 'extract-audio',
                },
                noteType: postInfo.isVideo ? 'video' : 'image',
                images: postInfo.images,
            }

            return {
                success: true,
                data: result,
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : '获取帖子信息失败',
                code: 'UPSTREAM_ERROR',
            }
        }
    },
}

/**
 * 从 URL 中提取 Instagram 帖子 ID
 */
function extractInstagramPostId(url: string): string | null {
    // 尝试多种匹配模式
    for (const pattern of instagramParser.patterns) {
        const match = url.match(pattern)
        if (match && match[1]) {
            return match[1]
        }
    }

    // 尝试从 URL path 中提取
    try {
        const urlObj = new URL(url)
        const pathname = urlObj.pathname

        // /p/xxx 格式
        const pMatch = pathname.match(/\/p\/([a-zA-Z0-9_-]+)/)
        if (pMatch) return pMatch[1]

        // /reel/xxx 格式
        const reelMatch = pathname.match(/\/reel\/([a-zA-Z0-9_-]+)/)
        if (reelMatch) return reelMatch[1]

        // /reels/xxx 格式
        const reelsMatch = pathname.match(/\/reels\/([a-zA-Z0-9_-]+)/)
        if (reelsMatch) return reelsMatch[1]

        // /stories/username/xxx 格式
        const storiesMatch = pathname.match(/\/stories\/[\w]+\/(\d+)/)
        if (storiesMatch) return storiesMatch[1]
    } catch {
        // URL 解析失败
    }

    return null
}

/**
 * Instagram 帖子信息
 */
interface InstagramPostInfo {
    title: string
    desc: string
    cover: string
    videoUrl: string | null
    duration: number
    isVideo: boolean
    images?: string[]
}

/**
 * 获取 Instagram 帖子详情
 */
async function fetchInstagramPostInfo(postId: string, originalUrl: string): Promise<InstagramPostInfo> {
    // 方法 1: 页面解析
    console.log(`[Instagram] 尝试页面解析...`)
    try {
        const result = await tryPageParse(postId, originalUrl)
        if (result) return result
    } catch (e) {
        console.log(`[Instagram] 页面解析失败: ${e instanceof Error ? e.message : 'unknown'}`)
    }

    // 方法 2: 嵌入页面解析
    console.log(`[Instagram] 尝试嵌入页面...`)
    try {
        const result = await tryEmbedPage(postId)
        if (result) return result
    } catch (e) {
        console.log(`[Instagram] 嵌入页面失败`)
    }

    throw new Error('无法获取帖子信息。Instagram 需要登录或有反爬限制，请稍后再试')
}

/**
 * 方法 1: 页面解析
 */
async function tryPageParse(postId: string, originalUrl: string): Promise<InstagramPostInfo | null> {
    const pageUrl = originalUrl.includes('instagram.com')
        ? originalUrl
        : `https://www.instagram.com/p/${postId}`

    console.log(`[Instagram] 页面 URL: ${pageUrl}`)

    const response = await fetch(pageUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.instagram.com/',
        },
        signal: AbortSignal.timeout(15000),
    })

    console.log(`[Instagram] 页面响应: ${response.status}`)

    if (!response.ok) return null

    const html = await response.text()
    console.log(`[Instagram] HTML 长度: ${html.length}`)

    // Instagram 使用 React，数据在 <script type="application/json"> 中
    // 尝试提取 __NEXT_DATA__ 或类似的 JSON 数据

    // 尝试从 window._sharedData 提取
    const sharedDataMatch = html.match(/window\._sharedData\s*=\s*(\{.+?\});/s)
    if (sharedDataMatch) {
        try {
            const sharedData = JSON.parse(sharedDataMatch[1])

            // 查找帖子数据
            const entryData = sharedData?.entry_data?.PostPage?.[0] ||
                              sharedData?.entry_data?.ReelsPage?.[0]

            if (entryData) {
                const media = entryData?.graphql?.shortcode_media ||
                              entryData?.media?.media

                if (media) {
                    const isVideo = media.is_video || media.is_reel
                    const videoUrl = isVideo
                        ? (media.video_url || media.video_versions?.[0]?.url)
                        : null

                    const images = !isVideo
                        ? (media.image_versions2?.candidates?.map((img: any) => img.url) ||
                           [media.display_url || media.display_url])
                        : undefined

                    return {
                        title: media.caption?.text || media.title || 'Instagram Post',
                        desc: media.caption?.text || '',
                        cover: media.display_url || media.image_versions2?.candidates?.[0]?.url || '',
                        videoUrl: videoUrl || null,
                        duration: media.video_duration || 0,
                        isVideo,
                        images,
                    }
                }
            }
        } catch (e) {
            console.log(`[Instagram] _sharedData 解析失败`)
        }
    }

    // 尝试直接从 HTML 中搜索视频 URL
    const videoMatch = html.match(/cdninstagram\.com[^"']*\.mp4[^"']*/)
    if (videoMatch) {
        const videoUrl = 'https://' + videoMatch[0].replace(/\\u002F/g, '/')
        console.log(`[Instagram] 找到视频 URL: ${videoUrl.slice(0, 50)}...`)

        const coverMatch = html.match(/cdninstagram\.com[^"']*(?:scontent)[^"']+/)
        const cover = coverMatch ? 'https://' + coverMatch[0].replace(/\\u002F/g, '/') : ''

        // 提取标题/描述
        const descMatch = html.match(/"caption"\s*:\s*"([^"]+)"/)
        const desc = descMatch ? descMatch[1] : 'Instagram Post'

        return {
            title: desc,
            desc: desc || '',
            cover,
            videoUrl,
            duration: 0,
            isVideo: true,
        }
    }

    // 尝试搜索图片 URL
    const imageMatches = html.match(/cdninstagram\.com[^"']*(?:scontent)[^"']+/g)
    if (imageMatches && imageMatches.length > 0) {
        // 过滤重复和缩略图
        const uniqueImages = [...new Set(imageMatches.map(m => 'https://' + m.replace(/\\u002F/g, '/')))]

        return {
            title: 'Instagram Post',
            desc: '',
            cover: uniqueImages[0],
            videoUrl: null,
            duration: 0,
            isVideo: false,
            images: uniqueImages.slice(0, 10), // 限制最多 10 张
        }
    }

    console.log(`[Instagram] 页面未找到媒体链接`)
    return null
}

/**
 * 方法 2: 嵌入页面解析（Instagram 提供公开嵌入页面）
 */
async function tryEmbedPage(postId: string): Promise<InstagramPostInfo | null> {
    const embedUrl = `https://www.instagram.com/p/${postId}/embed/captioned`

    console.log(`[Instagram] 嵌入 URL: ${embedUrl}`)

    const response = await fetch(embedUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(15000),
    })

    console.log(`[Instagram] 嵌入页面响应: ${response.status}`)

    if (!response.ok) return null

    const html = await response.text()
    console.log(`[Instagram] 嵌入 HTML 长度: ${html.length}`)

    // 从嵌入页面提取视频/图片
    const videoMatch = html.match(/<video[^>]*src="([^"]+)"[^>]*>/)
    if (videoMatch) {
        const videoUrl = videoMatch[1]

        // 提取 poster（封面）
        const posterMatch = videoMatch[0].match(/poster="([^"]+)"/)
        const cover = posterMatch ? posterMatch[1] : ''

        // 提取描述
        const captionMatch = html.match(/<div[^>]*class="[^"]*Caption[^"]*"[^>]*>([^<]+)<\/div>/)
        const desc = captionMatch ? captionMatch[1].trim() : 'Instagram Post'

        return {
            title: desc,
            desc: desc || '',
            cover,
            videoUrl,
            duration: 0,
            isVideo: true,
        }
    }

    // 搜索图片
    const imgMatch = html.match(/<img[^>]*class="[^"]*EmbeddedMediaImage[^"]*"[^>]*src="([^"]+)"/)
    if (imgMatch) {
        return {
            title: 'Instagram Post',
            desc: '',
            cover: imgMatch[1],
            videoUrl: null,
            duration: 0,
            isVideo: false,
            images: [imgMatch[1]],
        }
    }

    console.log(`[Instagram] 嵌入页面未找到媒体`)
    return null
}