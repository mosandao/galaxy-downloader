import { createWriteStream, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { pipeline } from 'stream/promises'
import type { Readable } from 'stream'
import { sanitizeFilename, formatBytes } from '../utils/format.js'

/**
 * 下载进度回调
 */
export type ProgressCallback = (progress: DownloadProgress) => void

export interface DownloadProgress {
    downloaded: number
    total?: number
    percentage: number
    speed?: string
}

/**
 * 下载结果
 */
export interface DownloadResult {
    success: boolean
    path: string
    size: number
    error?: string
}

/**
 * 确保目录存在
 */
export function ensureDirectory(dir: string): void {
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
    }
}

/**
 * 从 URL 获取文件名
 */
export function getFilenameFromUrl(url: string): string {
    try {
        const pathname = new URL(url).pathname
        const filename = pathname.split('/').pop() || 'download'
        return filename
    } catch {
        return 'download'
    }
}

/**
 * 从 URL 获取文件扩展名
 */
export function getExtensionFromUrl(url: string): string {
    const filename = getFilenameFromUrl(url)
    const match = filename.match(/\.[a-z0-9]+$/i)
    return match ? match[0] : ''
}

/**
 * 流式下载文件
 */
export async function downloadFile(
    url: string,
    outputPath: string,
    onProgress?: ProgressCallback,
    headers?: Record<string, string>
): Promise<DownloadResult> {
    try {
        ensureDirectory(dirname(outputPath))

        // 默认 headers + 自定义 headers
        const fetchHeaders: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            ...headers,
        }

        const response = await fetch(url, {
            headers: fetchHeaders,
        })
        if (!response.ok) {
            return {
                success: false,
                path: outputPath,
                size: 0,
                error: `HTTP ${response.status}: ${response.statusText}`,
            }
        }

        const contentLength = response.headers.get('content-length')
        const total = contentLength ? parseInt(contentLength, 10) : undefined

        // Node.js 18+ fetch 返回的 body 是 Web Stream，需要转换
        const fileStream = createWriteStream(outputPath)
        const reader = response.body?.getReader()

        if (!reader) {
            return {
                success: false,
                path: outputPath,
                size: 0,
                error: 'No response body',
            }
        }

        let downloaded = 0
        const startTime = Date.now()

        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            fileStream.write(value)
            downloaded += value.length

            if (onProgress) {
                const elapsed = (Date.now() - startTime) / 1000
                const speed = elapsed > 0 ? formatBytes(downloaded / elapsed) + '/s' : undefined

                onProgress({
                    downloaded,
                    total,
                    percentage: total ? Math.round((downloaded / total) * 100) : 0,
                    speed,
                })
            }
        }

        fileStream.end()

        return {
            success: true,
            path: outputPath,
            size: downloaded,
        }
    } catch (error) {
        return {
            success: false,
            path: outputPath,
            size: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
        }
    }
}

/**
 * 批量下载文件
 */
export async function downloadFiles(
    urls: string[],
    outputDir: string,
    baseName: string,
    onProgress?: (index: number, progress: DownloadProgress) => void
): Promise<DownloadResult[]> {
    ensureDirectory(outputDir)
    const results: DownloadResult[] = []

    for (let i = 0; i < urls.length; i++) {
        const url = urls[i]
        const ext = getExtensionFromUrl(url) || '.jpg'
        const filename = `${sanitizeFilename(baseName)}-${i + 1}${ext}`
        const outputPath = join(outputDir, filename)

        const result = await downloadFile(url, outputPath, (p) => {
            onProgress?.(i, p)
        })

        results.push(result)
    }

    return results
}