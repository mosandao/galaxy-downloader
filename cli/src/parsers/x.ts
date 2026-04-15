/**
 * X (Twitter) 平台解析器
 *
 * 支持格式:
 * - https://x.com/username/status/xxx
 * - https://twitter.com/username/status/xxx
 * - https://t.co/xxx (短链接)
 */

import type { PlatformParser, ParseContext, ParserResult } from './index.js'
import type { CanonicalPlatform, UnifiedParseResult } from '../types.js'

export const xParser: PlatformParser = {
    name: 'x',
    patterns: [
        /x\.com\/[\w]+\/status\/(\d+)/,
        /twitter\.com\/[\w]+\/status\/(\d+)/,
    ],

    async parse(ctx: ParseContext): Promise<ParserResult> {
        const { url } = ctx

        // 1. 提取推文 ID
        const tweetId = extractTweetId(url)
        if (!tweetId) {
            return {
                success: false,
                error: '无法从链接中提取推文 ID',
                code: 'PARSE_FAILED',
            }
        }

        console.log(`[X] 推文 ID: ${tweetId}`)

        // 2. 获取推文详情
        try {
            const tweetInfo = await fetchTweetInfo(tweetId, url)

            // 3. 构造返回结果
            const result: NonNullable<UnifiedParseResult['data']> = {
                title: tweetInfo.title,
                desc: tweetInfo.desc,
                cover: tweetInfo.cover,
                platform: 'x',
                url: url,
                duration: tweetInfo.duration,
                downloadVideoUrl: tweetInfo.videoUrl,
                downloadAudioUrl: null,
                originDownloadVideoUrl: tweetInfo.videoUrl,
                originDownloadAudioUrl: null,
                mediaActions: {
                    video: 'direct-download',
                    audio: 'extract-audio',
                },
                noteType: tweetInfo.hasVideo ? 'video' : (tweetInfo.hasImages ? 'image' : 'video'),
                images: tweetInfo.images,
            }

            return {
                success: true,
                data: result,
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : '获取推文信息失败',
                code: 'UPSTREAM_ERROR',
            }
        }
    },
}

/**
 * 从 URL 中提取推文 ID
 */
function extractTweetId(url: string): string | null {
    // 尝试多种匹配模式
    for (const pattern of xParser.patterns) {
        const match = url.match(pattern)
        if (match && match[1]) {
            return match[1]
        }
    }

    // 尝试从 URL path 中提取
    try {
        const urlObj = new URL(url)
        const pathname = urlObj.pathname

        // /username/status/xxx 格式
        const statusMatch = pathname.match(/\/[\w]+\/status\/(\d+)/)
        if (statusMatch) return statusMatch[1]
    } catch {
        // URL 解析失败
    }

    return null
}

/**
 * 推文信息
 */
interface TweetInfo {
    title: string
    desc: string
    cover: string
    videoUrl: string | null
    duration: number
    hasVideo: boolean
    hasImages: boolean
    images?: string[]
}

/**
 * 获取推文详情
 */
async function fetchTweetInfo(tweetId: string, originalUrl: string): Promise<TweetInfo> {
    // 方法 1: 页面解析（Guest Token 方式）
    console.log(`[X] 尝试页面解析...`)
    try {
        const result = await tryPageParse(tweetId, originalUrl)
        if (result) return result
    } catch (e) {
        console.log(`[X] 页面解析失败: ${e instanceof Error ? e.message : 'unknown'}`)
    }

    // 方法 2: Guest API
    console.log(`[X] 尝试 Guest API...`)
    try {
        const result = await tryGuestApi(tweetId)
        if (result) return result
    } catch (e) {
        console.log(`[X] Guest API 失败`)
    }

    throw new Error('无法获取推文信息。X 可能需要登录或有反爬限制，请稍后再试')
}

/**
 * 方法 1: 页面解析
 */
async function tryPageParse(tweetId: string, originalUrl: string): Promise<TweetInfo | null> {
    const pageUrl = originalUrl.includes('x.com') || originalUrl.includes('twitter.com')
        ? originalUrl
        : `https://x.com/i/status/${tweetId}`

    console.log(`[X] 页面 URL: ${pageUrl}`)

    const response = await fetch(pageUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(15000),
    })

    console.log(`[X] 页面响应: ${response.status}`)

    if (!response.ok) return null

    const html = await response.text()
    console.log(`[X] HTML 长度: ${html.length}`)

    // 从 HTML 中提取标题
    const titleMatch = html.match(/<title>([^<]+)<\/title>/)
    const title = titleMatch ? titleMatch[1].replace(' on X', '').replace(' on Twitter', '').trim() : 'X Post'

    // 尝试从 video 标签提取
    const videoMatch = html.match(/<video[^>]*src="([^"]+)"[^>]*>/)
    if (videoMatch) {
        const videoUrl = videoMatch[1]
        console.log(`[X] 找到视频 URL: ${videoUrl.slice(0, 50)}...`)

        // 提取 poster（封面）
        const posterMatch = videoMatch[0].match(/poster="([^"]+)"/)
        const cover = posterMatch ? posterMatch[1] : ''

        // 提取推文文本
        const descMatch = html.match(/<div[^>]*class="[^"]*tweet-text[^"]*"[^>]*>([^<]+)<\/div>/)
        const desc = descMatch ? descMatch[1] : title

        return {
            title: desc || title,
            desc: desc || '',
            cover,
            videoUrl,
            duration: 0,
            hasVideo: true,
            hasImages: false,
        }
    }

    // 尝试从 JSON 数据提取
    const jsonMatch = html.match(/<script[^>]*type="application\/json"[^>]*>(.+?)<\/script>/s)
    if (jsonMatch) {
        try {
            const data = JSON.parse(jsonMatch[1])

            // 查找视频信息
            const mediaDetails = data?.video?.variants || []
            const videoVariant = mediaDetails.find((v: any) => v.type?.includes('video/mp4'))
            if (videoVariant) {
                return {
                    title,
                    desc: title,
                    cover: data?.video?.poster || '',
                    videoUrl: videoVariant.src,
                    duration: data?.video?.durationMs ? data.video.durationMs / 1000 : 0,
                    hasVideo: true,
                    hasImages: false,
                }
            }

            // 查找图片信息
            const images = data?.images || []
            if (images.length > 0) {
                return {
                    title,
                    desc: title,
                    cover: images[0],
                    videoUrl: null,
                    duration: 0,
                    hasVideo: false,
                    hasImages: true,
                    images,
                }
            }
        } catch {
            // JSON 解析失败
        }
    }

    // 尝试从 pbs.twimg.com CDN 搜索图片
    const imageMatches = html.match(/pbs\.twimg\.com\/media[^"']+/g)
    if (imageMatches && imageMatches.length > 0) {
        const images = imageMatches.map(m => 'https://' + m.replace(/\\u002F/g, '/'))

        return {
            title,
            desc: title,
            cover: images[0],
            videoUrl: null,
            duration: 0,
            hasVideo: false,
            hasImages: true,
            images,
        }
    }

    // 尝试从 video.twimg.com CDN 搜索视频
    const videoCdnMatch = html.match(/video\.twimg\.com[^"']+\.mp4[^"']*/)
    if (videoCdnMatch) {
        const videoUrl = 'https://' + videoCdnMatch[0].replace(/\\u002F/g, '/')
        console.log(`[X] 通过 CDN 匹配找到视频 URL`)

        return {
            title,
            desc: title,
            cover: '',
            videoUrl,
            duration: 0,
            hasVideo: true,
            hasImages: false,
        }
    }

    console.log(`[X] 页面未找到媒体链接`)
    return null
}

/**
 * 方法 2: Guest API
 */
async function tryGuestApi(tweetId: string): Promise<TweetInfo | null> {
    // X 的 Guest Token API
    // 首先获取 guest token
    let guestToken: string | null = null

    try {
        const activateResponse = await fetch('https://api.x.com/1.1/guest/activate.json', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvBu4g33FeVGW',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            signal: AbortSignal.timeout(5000),
        })

        if (activateResponse.ok) {
            const activateData = await activateResponse.json() as any
            guestToken = activateData?.guest_token
        }
    } catch {
        // 获取 guest token 失败
    }

    if (!guestToken) {
        console.log(`[X] 无法获取 Guest Token`)
        return null
    }

    console.log(`[X] Guest Token: ${guestToken.slice(0, 10)}...`)

    // 使用 guest token 获取推文详情
    const apiUrl = `https://api.x.com/1.1/statuses/show.json?id=${tweetId}&tweet_mode=extended&include_entities=true`

    const response = await fetch(apiUrl, {
        headers: {
            'Authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvBu4g33FeVGW',
            'x-guest-token': guestToken,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) return null

    try {
        const data = await response.json() as any

        const title = data.full_text || data.text || 'X Post'
        const media = data.extended_entities?.media || []

        if (media.length > 0) {
            const firstMedia = media[0]
            const isVideo = firstMedia.type === 'video'

            if (isVideo) {
                // 获取最高质量的视频
                const variants = firstMedia.video_info?.variants || []
                const mp4Variants = variants.filter((v: any) => v.content_type === 'video/mp4')
                const bestVariant = mp4Variants.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0]

                return {
                    title,
                    desc: title,
                    cover: firstMedia.media_url_https || '',
                    videoUrl: bestVariant?.url || null,
                    duration: firstMedia.video_info?.duration_millis ? firstMedia.video_info.duration_millis / 1000 : 0,
                    hasVideo: true,
                    hasImages: false,
                }
            } else {
                // 图片
                const images = media.map((m: any) => m.media_url_https)

                return {
                    title,
                    desc: title,
                    cover: images[0],
                    videoUrl: null,
                    duration: 0,
                    hasVideo: false,
                    hasImages: true,
                    images,
                }
            }
        }
    } catch {
        return null
    }

    return null
}