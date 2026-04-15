/**
 * Bilibili 平台解析器
 *
 * 支持格式:
 * - https://www.bilibili.com/video/BVxxx
 * - https://www.bilibili.com/video/avxxx
 * - https://b23.tv/xxx (短链接)
 * - https://www.bilibili.com/bangumi/play/epxxx (番剧)
 */

import type { PlatformParser, ParseContext, ParserResult } from './index.js'
import type { CanonicalPlatform, UnifiedParseResult } from '../types.js'

export const bilibiliParser: PlatformParser = {
    name: 'bilibili',
    patterns: [
        /bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/,
        /bilibili\.com\/video\/av(\d+)/,
        /b23\.tv\/([a-zA-Z0-9]+)/,
        /bilibili\.com\/bangumi\/play\/ep(\d+)/,
    ],

    async parse(ctx: ParseContext): Promise<ParserResult> {
        const { url } = ctx

        // 1. 提取视频 ID (BV 号或 AV 号)
        const videoId = extractBilibiliVideoId(url)
        if (!videoId) {
            return {
                success: false,
                error: '无法从链接中提取视频 ID',
                code: 'PARSE_FAILED',
            }
        }

        console.log(`[Bilibili] 视频 ID: ${videoId}`)

        // 2. 获取视频详情
        try {
            const videoInfo = await fetchBilibiliVideoInfo(videoId, url)

            // 3. 构造返回结果
            const result: NonNullable<UnifiedParseResult['data']> = {
                title: videoInfo.title,
                desc: videoInfo.desc,
                cover: videoInfo.cover,
                platform: 'bilibili',
                url: url,
                duration: videoInfo.duration,
                downloadVideoUrl: videoInfo.videoUrl,
                downloadAudioUrl: videoInfo.audioUrl,
                originDownloadVideoUrl: videoInfo.videoUrl,
                originDownloadAudioUrl: videoInfo.audioUrl,
                mediaActions: {
                    video: 'direct-download',
                    audio: 'direct-download',
                },
                noteType: 'video',
                isMultiPart: (videoInfo.pages?.length ?? 0) > 1,
                pages: videoInfo.pages ?? undefined,
            }

            return {
                success: true,
                data: result,
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : '获取视频信息失败',
                code: 'UPSTREAM_ERROR',
            }
        }
    },
}

/**
 * 从 URL 中提取 Bilibili 视频 ID
 */
function extractBilibiliVideoId(url: string): string | null {
    // 尝试多种匹配模式
    for (const pattern of bilibiliParser.patterns) {
        const match = url.match(pattern)
        if (match && match[1]) {
            // 如果是 AV 号，添加 av 前缀
            if (url.includes('/av') && !match[1].startsWith('BV')) {
                return `av${match[1]}`
            }
            return match[1]
        }
    }

    // 尝试从 URL path 中提取
    try {
        const urlObj = new URL(url)
        const pathname = urlObj.pathname

        // /video/BVxxx 格式
        const bvMatch = pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/)
        if (bvMatch) return bvMatch[1]

        // /video/avxxx 格式
        const avMatch = pathname.match(/\/video\/av(\d+)/)
        if (avMatch) return `av${avMatch[1]}`

        // /bangumi/play/epxxx 格式
        const epMatch = pathname.match(/\/bangumi\/play\/ep(\d+)/)
        if (epMatch) return `ep${epMatch[1]}`

        // /bangumi/play/ssxxx 格式
        const ssMatch = pathname.match(/\/bangumi\/play\/ss(\d+)/)
        if (ssMatch) return `ss${ssMatch[1]}`

        // /BVxxx 格式（短链接）
        const shortMatch = pathname.match(/\/(BV[a-zA-Z0-9]+)/)
        if (shortMatch) return shortMatch[1]
    } catch {
        // URL 解析失败
    }

    return null
}

/**
 * Bilibili 视频信息
 */
interface BilibiliVideoInfo {
    title: string
    desc: string
    cover: string
    videoUrl: string | null
    audioUrl: string | null
    duration: number
    cid?: string
    pages?: Array<{
        page: number
        cid: string
        part: string
        duration: number
        downloadVideoUrl: string | null
        downloadAudioUrl: string | null
    }>
}

/**
 * 获取 Bilibili 视频详情
 */
async function fetchBilibiliVideoInfo(videoId: string, originalUrl: string): Promise<BilibiliVideoInfo> {
    // 方法 1: 官方 API（需要处理 BV/AV 转换）
    console.log(`[Bilibili] 尝试官方 API...`)
    try {
        const result = await tryOfficialApi(videoId)
        if (result) return result
    } catch (e) {
        console.log(`[Bilibili] 官方 API 失败: ${e instanceof Error ? e.message : 'unknown'}`)
    }

    // 方法 2: 页面解析
    console.log(`[Bilibili] 尝试页面解析...`)
    try {
        const result = await tryPageParse(videoId, originalUrl)
        if (result) return result
    } catch (e) {
        console.log(`[Bilibili] 页面解析失败`)
    }

    throw new Error('无法获取视频信息。请稍后再试')
}

/**
 * 方法 1: 官方 API
 */
async function tryOfficialApi(videoId: string): Promise<BilibiliVideoInfo | null> {
    // 确定是 BV 号还是 AV 号
    let bvid: string | null = null
    let avid: number | null = null

    if (videoId.startsWith('BV')) {
        bvid = videoId
    } else if (videoId.startsWith('av')) {
        avid = parseInt(videoId.slice(2), 10)
    } else if (videoId.startsWith('ep')) {
        // 番剧需要特殊处理
        return await tryBangumiApi(videoId)
    }

    // 获取视频信息
    const infoUrl = bvid
        ? `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`
        : `https://api.bilibili.com/x/web-interface/view?aid=${avid}`

    const infoResponse = await fetch(infoUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://www.bilibili.com/',
            'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
    })

    if (!infoResponse.ok) return null

    try {
        const infoData = await infoResponse.json() as any

        if (infoData.code !== 0 || !infoData.data) {
            return null
        }

        const data = infoData.data
        const mainCid = data.cid

        const pages = data.pages?.map((p: any, i: number) => ({
            page: i + 1,
            cid: String(p.cid || mainCid),
            part: p.part || `P${i + 1}`,
            duration: p.duration,
            downloadVideoUrl: null,
            downloadAudioUrl: null,
        })) || [{
            page: 1,
            cid: String(mainCid),
            part: data.title,
            duration: data.duration,
            downloadVideoUrl: null,
            downloadAudioUrl: null,
        }]

        // 尝试获取播放地址（需要 cid）
        const cid = data.cid
        let videoUrl: string | null = null
        let audioUrl: string | null = null

        if (cid) {
            const playUrl = `https://api.bilibili.com/x/player/playurl?bvid=${bvid || ''}&cid=${cid}&qn=80&fnver=0&fnval=16&fourk=1`

            const playResponse = await fetch(playUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://www.bilibili.com/',
                    'Accept': 'application/json',
                },
                signal: AbortSignal.timeout(10000),
            })

            if (playResponse.ok) {
                const playData = await playResponse.json() as any

                if (playData.code === 0 && playData.data) {
                    // Bilibili 的 DASH 格式：视频和音频分离
                    const dash = playData.data.dash
                    if (dash) {
                        // 获取最高质量的视频
                        const videoStream = dash.video?.sort((a: any, b: any) => b.id - a.id)?.[0]
                        videoUrl = videoStream?.baseUrl || videoStream?.base_url || null

                        // 获取最高质量的音频
                        const audioStream = dash.audio?.sort((a: any, b: any) => b.id - a.id)?.[0]
                        audioUrl = audioStream?.baseUrl || audioStream?.base_url || null
                    }

                    // 如果没有 DASH，尝试 FLV 或 MP4
                    if (!videoUrl && playData.data.durl) {
                        videoUrl = playData.data.durl?.[0]?.url
                    }
                }
            }
        }

        return {
            title: data.title,
            desc: data.desc || '',
            cover: data.pic || '',
            videoUrl,
            audioUrl,
            duration: data.duration || 0,
            pages,
        }
    } catch {
        return null
    }
}

/**
 * 番剧 API 处理
 */
async function tryBangumiApi(videoId: string): Promise<BilibiliVideoInfo | null> {
    const epId = videoId.startsWith('ep') ? parseInt(videoId.slice(2), 10) : null
    const ssId = videoId.startsWith('ss') ? parseInt(videoId.slice(2), 10) : null

    if (!epId && !ssId) return null

    // 获取番剧信息
    const infoUrl = epId
        ? `https://api.bilibili.com/pgc/view/web/season?ep_id=${epId}`
        : `https://api.bilibili.com/pgc/view/web/season?season_id=${ssId}`

    const response = await fetch(infoUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.bilibili.com/',
            'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) return null

    try {
        const data = await response.json() as any

        if (data.code !== 0 || !data.result) return null

        const result = data.result
        const episodes = result.episodes || []

        // 找到目标剧集
        const targetEp = epId
            ? episodes.find((ep: any) => ep.id === epId)
            : episodes[0]

        if (!targetEp) return null

        const title = `${result.title || '番剧'} - ${targetEp.long_title || targetEp.title || ''}`
        const cover = targetEp.cover || result.cover || ''

        return {
            title,
            desc: result.evaluate || '',
            cover,
            videoUrl: null, // 番剧需要会员，无法直接获取下载链接
            audioUrl: null,
            duration: targetEp.duration || 0,
            pages: [{
                page: 1,
                cid: String(targetEp.cid || ''),
                part: targetEp.long_title || targetEp.title || '正片',
                duration: targetEp.duration || 0,
                downloadVideoUrl: null,
                downloadAudioUrl: null,
            }],
        }
    } catch {
        return null
    }
}

/**
 * 方法 2: 页面解析
 */
async function tryPageParse(videoId: string, originalUrl: string): Promise<BilibiliVideoInfo | null> {
    const pageUrl = originalUrl.includes('bilibili.com') || originalUrl.includes('b23.tv')
        ? originalUrl
        : videoId.startsWith('BV')
            ? `https://www.bilibili.com/video/${videoId}`
            : `https://www.bilibili.com/video/${videoId}`

    console.log(`[Bilibili] 页面 URL: ${pageUrl}`)

    const response = await fetch(pageUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        signal: AbortSignal.timeout(15000),
    })

    console.log(`[Bilibili] 页面响应: ${response.status}`)

    if (!response.ok) return null

    const html = await response.text()
    console.log(`[Bilibili] HTML 长度: ${html.length}`)

    // 从 HTML 中提取标题
    const titleMatch = html.match(/<title>([^<]+)<\/title>/)
    const title = titleMatch ? titleMatch[1].replace('_哔哩哔哩_bilibili', '').trim() : 'Bilibili 视频'

    // 尝试从 window.__INITIAL_STATE__ 提取
    const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{.+?\});/s)
    if (stateMatch) {
        try {
            const stateData = JSON.parse(stateMatch[1])

            const videoData = stateData?.videoData || stateData?.mediaInfo

            if (videoData) {
                return {
                    title: videoData.title || title,
                    desc: videoData.desc || '',
                    cover: videoData.pic || '',
                    videoUrl: null, // 页面解析无法获取下载链接
                    audioUrl: null,
                    duration: videoData.duration || 0,
                    pages: videoData.pages?.map((p: any, i: number) => ({
                        page: i + 1,
                        cid: String(p.cid || p.page_cid || ''),
                        part: p.part || `P${i + 1}`,
                        duration: p.duration,
                        downloadVideoUrl: null,
                        downloadAudioUrl: null,
                    })),
                }
            }
        } catch {
            // JSON 解析失败
        }
    }

    // 尝试从页面的 embed player URL 搜索
    const embedMatch = html.match(/player\.bilibili\.com\/player\.swf[^"']*/)
    if (embedMatch) {
        // 提取描述
        const descMatch = html.match(/"desc"\s*:\s*"([^"]+)"/)
        const desc = descMatch ? descMatch[1] : title

        return {
            title,
            desc,
            cover: '',
            videoUrl: null,
            audioUrl: null,
            duration: 0,
        }
    }

    console.log(`[Bilibili] 页面未找到视频信息`)
    return null
}