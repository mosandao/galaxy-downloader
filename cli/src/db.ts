import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface MediaRecord {
    id: number
    platform: string
    username: string
    title: string
    videoUrl: string
    mediaPath: string
    transcriptText: string
    publishedAt: string
    downloadedAt: string
}

/**
 * 获取数据库路径（项目根目录下的 data/galaxy.db）
 */
function getDbPath(): string {
    const projectRoot = join(__dirname, '..', '..')
    const dataDir = join(projectRoot, '.data')
    if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true })
    }
    return join(dataDir, 'galaxy.db')
}

let db: Database.Database | null = null

function getDb(): Database.Database {
    if (!db) {
        db = new Database(getDbPath())
        db.pragma('journal_mode = WAL')
        db.exec(`
            CREATE TABLE IF NOT EXISTS media (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                platform TEXT NOT NULL,
                username TEXT DEFAULT '',
                title TEXT NOT NULL,
                video_url TEXT NOT NULL,
                media_path TEXT DEFAULT '',
                transcript_text TEXT DEFAULT '',
                published_at TEXT DEFAULT '',
                downloaded_at TEXT DEFAULT (datetime('now', 'localtime'))
            );
        `)
    }
    return db
}

export function insertRecord(record: Omit<MediaRecord, 'id' | 'downloadedAt'>): MediaRecord {
    const d = getDb()
    const stmt = d.prepare(`
        INSERT INTO media (platform, username, title, video_url, media_path, transcript_text, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const info = stmt.run(
        record.platform,
        record.username,
        record.title,
        record.videoUrl,
        record.mediaPath,
        record.transcriptText,
        record.publishedAt,
    )
    return {
        id: info.lastInsertRowid as number,
        downloadedAt: new Date().toISOString(),
        ...record,
    }
}

export function updateTranscript(id: number, transcriptText: string): void {
    const d = getDb()
    d.prepare('UPDATE media SET transcript_text = ? WHERE id = ?').run(transcriptText, id)
}

export function updateMediaPath(id: number, mediaPath: string): void {
    const d = getDb()
    d.prepare('UPDATE media SET media_path = ? WHERE id = ?').run(mediaPath, id)
}

/**
 * 将数据库返回的 snake_case 行转换为 MediaRecord
 */
function rowToRecord(row: any): MediaRecord {
    return {
        id: row.id,
        platform: row.platform,
        username: row.username,
        title: row.title,
        videoUrl: row.video_url,
        mediaPath: row.media_path,
        transcriptText: row.transcript_text,
        publishedAt: row.published_at,
        downloadedAt: row.downloaded_at,
    }
}

export function queryRecords(limit: number = 50): MediaRecord[] {
    const d = getDb()
    const rows = d.prepare('SELECT * FROM media ORDER BY downloaded_at DESC LIMIT ?').all(limit)
    return (rows as any[]).map(rowToRecord)
}

export function queryByTitle(title: string): MediaRecord[] {
    const d = getDb()
    const rows = d.prepare('SELECT * FROM media WHERE title LIKE ? ORDER BY downloaded_at DESC').all(`%${title}%`)
    return (rows as any[]).map(rowToRecord)
}

export function queryByPlatform(platform: string): MediaRecord[] {
    const d = getDb()
    const rows = d.prepare('SELECT * FROM media WHERE platform = ? ORDER BY downloaded_at DESC').all(platform)
    return (rows as any[]).map(rowToRecord)
}

export function queryByVideoUrl(videoUrl: string): MediaRecord | null {
    const d = getDb()
    const rows = d.prepare('SELECT * FROM media WHERE video_url = ? ORDER BY downloaded_at DESC LIMIT 1').all(videoUrl)
    const result = rows as any[]
    return result.length > 0 ? rowToRecord(result[0]) : null
}

export function queryByTitleExact(title: string): MediaRecord | null {
    const d = getDb()
    const rows = d.prepare('SELECT * FROM media WHERE title = ? ORDER BY downloaded_at DESC LIMIT 1').all(title)
    const result = rows as any[]
    return result.length > 0 ? rowToRecord(result[0]) : null
}

export function closeDb(): void {
    if (db) {
        db.close()
        db = null
    }
}
