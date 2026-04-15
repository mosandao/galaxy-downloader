/**
 * 格式化时长（秒 -> mm:ss 或 hh:mm:ss）
 */
export function formatDuration(seconds: number): string {
    const totalSeconds = Math.max(0, Math.floor(seconds))
    const hours = Math.floor(totalSeconds / 3600)
    const mins = Math.floor((totalSeconds % 3600) / 60)
    const secs = totalSeconds % 60

    if (hours > 0) {
        return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }

    return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * 清理文件名中的非法字符
 */
export function sanitizeFilename(filename: string, replacement: string = '-'): string {
    return filename
        .replace(/[<>:"/\\|?*]/g, replacement)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200) // 限制长度
}

/**
 * 格式化字节为可读的文件大小
 */
export function formatBytes(bytes: number, decimals: number = 1): string {
    if (bytes === 0) return '0 Bytes'

    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${(bytes / Math.pow(k, i)).toFixed(decimals)} ${sizes[i]}`
}