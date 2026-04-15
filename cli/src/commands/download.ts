import { parseMediaUrl } from '../api/client.js'
import { normalizePlatform, getPlatformDisplayName } from '../platforms.js'
import { sanitizeFilename, formatBytes } from '../utils/format.js'
import { downloadFile, downloadFiles, ensureDirectory } from '../utils/download.js'
import { getErrorMessage } from '../api-errors.js'
import { join } from 'path'

export interface DownloadOptions {
    url: string
    type: 'video' | 'audio' | 'images' | 'auto'
    output: string
    part?: number
    json?: boolean
}

export interface DownloadResult {
    success: boolean
    files: Array<{
        path: string
        size: number
        type: 'video' | 'audio' | 'image'
    }>
    error?: string
}

/**
 * 执行下载命令
 */
export async function downloadCommand(options: DownloadOptions): Promise<DownloadResult> {
    const { url, type, output, part } = options

    if (!url.trim()) {
        return {
            success: false,
            files: [],
            error: 'URL 不能为空',
        }
    }

    console.log(`\n[下载] 正在处理: ${url}`)
    console.log(`[输出] 目录: ${output}`)

    ensureDirectory(output)

    try {
        const data = await parseMediaUrl(url)
        const platform = normalizePlatform(data.platform)
        const baseName = sanitizeFilename(data.title)

        console.log(`\n[解析] ${data.title}`)
        console.log(`[平台] ${getPlatformDisplayName(platform)}`)

        const files: Array<{ path: string; size: number; type: 'video' | 'audio' | 'image' }> = []

        // 处理多P视频
        if (data.isMultiPart && data.pages?.length) {
            if (part && part > 0) {
                const targetPage = data.pages.find(p => p.page === part)
                if (!targetPage) {
                    return {
                        success: false,
                        files: [],
                        error: `分P ${part} 不存在`,
                    }
                }

                console.log(`\n[下载] P${part}: ${targetPage.part}`)

                if (type === 'video' || type === 'auto') {
                    const videoUrl = targetPage.downloadVideoUrl
                    if (videoUrl) {
                        const result = await downloadWithType(videoUrl, output, baseName + `-P${part}`, 'video', platform)
                        if (result.success) {
                            files.push({ path: result.path, size: result.size, type: 'video' })
                        }
                    }
                }

                if (type === 'audio' || type === 'auto') {
                    const audioUrl = targetPage.downloadAudioUrl
                    if (audioUrl) {
                        const result = await downloadWithType(audioUrl, output, baseName + `-P${part}`, 'audio', platform)
                        if (result.success) {
                            files.push({ path: result.path, size: result.size, type: 'audio' })
                        }
                    }
                }
            } else {
                console.log(`\n[下载] 共 ${data.pages.length} 个分P`)
                for (const page of data.pages) {
                    console.log(`\n[P${page.page}] ${page.part}`)

                    if (type === 'video' || type === 'auto') {
                        const videoUrl = page.downloadVideoUrl
                        if (videoUrl) {
                            const result = await downloadWithType(videoUrl, output, baseName + `-P${page.page}`, 'video', platform)
                            if (result.success) {
                                files.push({ path: result.path, size: result.size, type: 'video' })
                            }
                        }
                    }
                }
            }
        }
        // 处理图文笔记
        else if (data.noteType === 'image' && data.images?.length) {
            console.log(`\n[下载] ${data.images.length} 张图片`)
            const results = await downloadFiles(data.images, output, baseName, (i, p) => {
                console.log(`  图片 ${i + 1}/${data.images!.length}: ${p.percentage}%`)
            })
            results.forEach(r => {
                if (r.success) {
                    files.push({ path: r.path, size: r.size, type: 'image' })
                }
            })
        }
        // 处理单P视频/音频
        else {
            if (type === 'video' || type === 'auto') {
                const videoUrl = data.downloadVideoUrl || data.originDownloadVideoUrl
                if (videoUrl) {
                    const result = await downloadWithType(videoUrl, output, baseName, 'video', platform)
                    if (result.success) {
                        files.push({ path: result.path, size: result.size, type: 'video' })
                    }
                } else {
                    console.log(`[警告] 未找到视频下载链接`)
                }
            }

            if (type === 'audio' || type === 'auto') {
                const audioUrl = data.downloadAudioUrl || data.originDownloadAudioUrl
                if (audioUrl) {
                    const result = await downloadWithType(audioUrl, output, baseName, 'audio', platform)
                    if (result.success) {
                        files.push({ path: result.path, size: result.size, type: 'audio' })
                    }
                } else {
                    console.log(`[提示] 音频需从视频中提取（暂未实现）`)
                }
            }
        }

        // 输出结果
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log('下载完成:')
        files.forEach(f => {
            console.log(`  ${f.type}: ${f.path} (${formatBytes(f.size)})`)
        })
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

        return { success: true, files }
    } catch (error) {
        const message = getErrorMessage(error)
        console.error(`\n[错误] ${message}\n`)
        return {
            success: false,
            files: [],
            error: message,
        }
    }
}

/**
 * 带进度显示的下载
 */
async function downloadWithType(
    url: string,
    output: string,
    baseName: string,
    type: 'video' | 'audio',
    platform?: string
): Promise<{ success: boolean; path: string; size: number }> {
    const ext = type === 'video' ? '.mp4' : '.mp3'
    const filename = baseName + ext
    const outputPath = join(output, filename)

    // 根据平台设置必要的 headers
    const headers: Record<string, string> = {}
    if (platform === 'bilibili') {
        headers['Referer'] = 'https://www.bilibili.com/'
    } else if (platform === 'douyin') {
        headers['Referer'] = 'https://www.douyin.com/'
    }

    const result = await downloadFile(url, outputPath, (p) => {
        const progress = p.total
            ? `${p.percentage}% (${formatBytes(p.downloaded)}/${formatBytes(p.total)})`
            : `${formatBytes(p.downloaded)}`
        const speed = p.speed ? ` @ ${p.speed}` : ''
        process.stdout.write(`\r  [下载] ${progress}${speed}`)
    }, headers)

    if (result.success) {
        process.stdout.write('\r')
        console.log(`  [完成] ${filename}`)
    }

    return result
}