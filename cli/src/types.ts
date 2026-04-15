/**
 * 统一接口类型定义
 */

export const API_ERROR_CODES = [
    'BAD_REQUEST',
    'INVALID_JSON',
    'UNSUPPORTED_PLATFORM',
    'PLATFORM_MISMATCH',
    'INVALID_DOWNLOAD_TYPE',
    'INVALID_QUALITY',
    'NOT_FOUND',
    'DOWNLOAD_URL_NOT_FOUND',
    'RATE_LIMITED',
    'UPSTREAM_ERROR',
    'SERVICE_UNAVAILABLE',
    'INTERNAL_ERROR',
    'FEEDBACK_SUBMIT_FAILED',
    'MEDIA_PROCESSOR_INIT_FAILED',
    'PARSE_FAILED',
] as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[number]
export type ApiErrorDetails = Record<string, unknown>
export type VideoMediaAction = 'direct-download' | 'merge-then-download' | 'hide'
export type AudioMediaAction = 'direct-download' | 'extract-audio' | 'hide'

export interface MediaActions {
    video: VideoMediaAction;
    audio: AudioMediaAction;
}

/**
 * 多P视频的单个分P信息
 */
export interface PageInfo {
    page: number;
    cid: string;
    part: string;
    duration: number;
    downloadAudioUrl: string | null;
    downloadVideoUrl: string | null;
}

export interface VideoQualityOption {
    quality: string;
    label?: string;
    width?: number;
    height?: number;
    formatId?: number;
}

export interface EmbeddedVideoInfo {
    id: string;
    title: string;
    cover?: string | null;
    duration?: number;
    qualityOptions?: VideoQualityOption[];
    downloadVideoUrl?: string | null;
    originDownloadVideoUrl?: string | null;
    mediaActions?: MediaActions;
}

export interface UnifiedParseResult {
    success: boolean;
    code?: ApiErrorCode | string;
    status?: number;
    requestId?: string;
    details?: ApiErrorDetails;
    data?: {
        title: string;
        desc?: string;
        cover?: string | null;
        platform: string;
        downloadAudioUrl: string | null;
        downloadVideoUrl: string | null;
        originDownloadAudioUrl?: string | null;
        originDownloadVideoUrl: string | null;
        mediaActions?: MediaActions;
        url: string;
        duration?: number;
        isMultiPart?: boolean;
        currentPage?: number;
        pages?: PageInfo[];
        noteType?: 'video' | 'image' | 'audio';
        images?: string[];
        videos?: EmbeddedVideoInfo[];
    };
    error?: string;
    message?: string;
    url?: string;
}

export interface UnifiedDownloadOptions {
    format: 'audio' | 'video';
    quality?: string;
}

export interface UnifiedApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    code?: ApiErrorCode | string;
    status?: number;
    requestId?: string;
    details?: ApiErrorDetails;
    error?: string;
    message?: string;
}

export type CanonicalPlatform =
    | 'bilibili'
    | 'bilibili_tv'
    | 'douyin'
    | 'youtube'
    | 'telegram'
    | 'threads'
    | 'wechat'
    | 'niconico'
    | 'weibo'
    | 'xiaohongshu'
    | 'tiktok'
    | 'instagram'
    | 'x'
    | 'unknown'