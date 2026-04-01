'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, Music } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { useFFmpeg, type FFmpegStatus } from '@/hooks/use-ffmpeg'
import { useDictionary } from '@/i18n/client'
import { ApiRequestError, isApiRequestError, resolveApiErrorMessage } from '@/lib/api-errors'
import { API_ENDPOINTS } from '@/lib/config'
import { toast } from '@/lib/deferred-toast'
import type { UnifiedParseResult } from '@/lib/types'
import { downloadFile, formatBytes } from '@/lib/utils'

interface AudioExtractDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

type AudioToolStage =
    | 'idle'
    | 'parsing'
    | 'direct-downloading'
    | 'fallback-extracting'
    | 'completed'
    | 'error'

type UnifiedParseSuccessResult = UnifiedParseResult & {
    success: true
    data: NonNullable<UnifiedParseResult['data']>
}

async function requestUnifiedParse(videoUrl: string): Promise<UnifiedParseSuccessResult> {
    const params = new URLSearchParams({ url: videoUrl })
    const requestUrl = `${API_ENDPOINTS.unified.parse}?${params.toString()}`
    const response = await fetch(requestUrl, {
        method: 'GET',
        cache: 'no-store',
    })

    let payload: UnifiedParseResult | null = null
    try {
        payload = await response.json() as UnifiedParseResult
    } catch {
        throw new ApiRequestError({
            status: response.status,
        })
    }

    if (!response.ok || !payload?.success || !payload.data) {
        throw new ApiRequestError({
            code: payload?.code,
            status: payload?.status ?? response.status,
            requestId: payload?.requestId,
            details: payload?.details,
            fallbackMessage: payload?.error || payload?.message,
        })
    }

    return payload as UnifiedParseSuccessResult
}

export function AudioExtractDialog({ open, onOpenChange }: AudioExtractDialogProps) {
    const dict = useDictionary()
    const [url, setUrl] = useState('')
    const [stage, setStage] = useState<AudioToolStage>('idle')
    const [errorMessage, setErrorMessage] = useState('')
    const { status, progress, progressInfo, error, extractAudio, reset } = useFFmpeg()

    const ffmpegProcessing = useMemo(
        () => (['loading', 'downloading', 'converting'] as FFmpegStatus[]).includes(status),
        [status]
    )
    const showProgress = useMemo(
        () => (['downloading', 'converting'] as FFmpegStatus[]).includes(status),
        [status]
    )
    const isBusy = stage === 'parsing' || stage === 'direct-downloading' || ffmpegProcessing

    const statusText = useMemo(() => {
        if (stage === 'parsing') {
            return dict.audioTool.statusParsing
        }

        if (stage === 'direct-downloading') {
            return dict.audioTool.statusDirectDownloading
        }

        if (status === 'loading') {
            return dict.extractAudio.loading
        }

        if (status === 'downloading') {
            if (progressInfo?.loaded && progressInfo?.total && dict.extractAudio.downloadingWithSize) {
                return dict.extractAudio.downloadingWithSize
                    .replace('{progress}', String(Math.floor(progress)))
                    .replace('{loaded}', formatBytes(progressInfo.loaded))
                    .replace('{total}', formatBytes(progressInfo.total))
            }
            return dict.extractAudio.downloading.replace('{progress}', String(Math.floor(progress)))
        }

        if (status === 'converting') {
            return dict.extractAudio.converting.replace('{progress}', String(Math.floor(progress)))
        }

        if (stage === 'fallback-extracting') {
            return dict.audioTool.statusFallbackExtracting
        }

        if (stage === 'completed' || status === 'completed') {
            return dict.audioTool.statusCompleted
        }

        if (stage === 'error' || status === 'error') {
            return errorMessage || error || dict.errors.downloadError
        }

        return dict.audioTool.statusIdle
    }, [
        dict,
        error,
        errorMessage,
        progress,
        progressInfo?.loaded,
        progressInfo?.total,
        stage,
        status,
    ])

    useEffect(() => {
        if (status === 'completed') {
            setStage('completed')
        }

        if (status === 'error') {
            setStage('error')
            if (error) {
                setErrorMessage(error)
            }
        }
    }, [error, status])

    useEffect(() => {
        if (!open) {
            const timer = window.setTimeout(() => {
                setUrl('')
                setStage('idle')
                setErrorMessage('')
                reset()
            }, 150)

            return () => window.clearTimeout(timer)
        }
    }, [open, reset])

    const handlePaste = async () => {
        try {
            const text = await navigator.clipboard.readText()
            setUrl(text)
            toast.success(dict.toast.linkFilled)
        } catch (err) {
            console.error('Failed to read clipboard:', err)
            toast.error(dict.errors.clipboardFailed, {
                description: dict.errors.clipboardPermission,
            })
        }
    }

    const handleExtract = async () => {
        if (!url.trim()) {
            setStage('error')
            setErrorMessage(dict.errors.emptyUrl)
            return
        }

        if (status === 'error') {
            reset()
        }

        setStage('parsing')
        setErrorMessage('')

        try {
            const apiResult = await requestUnifiedParse(url.trim())
            const parsed = apiResult.data
            const audioDownloadUrl = parsed.downloadAudioUrl || parsed.originDownloadAudioUrl || null
            const videoDownloadUrl = parsed.downloadVideoUrl || parsed.originDownloadVideoUrl || null
            const outputTitle = parsed.title || parsed.desc || dict.history.unknownTitle

            if (audioDownloadUrl) {
                setStage('direct-downloading')
                downloadFile(audioDownloadUrl)
                setStage('completed')
                setUrl('')
                return
            }

            if (!videoDownloadUrl) {
                throw new Error(dict.audioTool.noAudioSource)
            }

            setStage('fallback-extracting')
            await extractAudio(videoDownloadUrl, outputTitle)
            setUrl('')
        } catch (err) {
            if (isApiRequestError(err)) {
                console.error('Audio tool parse failed', {
                    code: err.code,
                    status: err.status,
                    requestId: err.requestId,
                    details: err.details,
                })
            }

            const resolvedMessage = resolveApiErrorMessage(err, dict)
            setStage('error')
            setErrorMessage(resolvedMessage)
            toast.error(dict.errors.downloadFailed, {
                description: resolvedMessage,
            })
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{dict.audioTool.title}</DialogTitle>
                    <DialogDescription>{dict.audioTool.description}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Textarea
                            value={url}
                            onChange={(event) => setUrl(event.target.value)}
                            placeholder={dict.audioTool.placeholder}
                            className="min-h-22 resize-none break-all"
                        />
                        <p className="text-xs text-muted-foreground">{dict.audioTool.strategyHint}</p>
                    </div>

                    <div className="flex gap-2">
                        <Button type="button" variant="outline" className="flex-1" onClick={handlePaste} disabled={isBusy}>
                            {dict.audioTool.pasteButton}
                        </Button>
                        <Button
                            type="button"
                            className="flex-1 flex items-center justify-center gap-2"
                            onClick={handleExtract}
                            disabled={isBusy || !url.trim()}
                        >
                            {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                            {isBusy ? dict.audioTool.processingButton : dict.audioTool.submitButton}
                        </Button>
                    </div>

                    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                        <div className="flex items-start gap-2 text-sm">
                            {(stage === 'error' || status === 'error') ? (
                                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                            ) : (stage === 'completed' || status === 'completed') ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                            ) : ffmpegProcessing || stage === 'parsing' || stage === 'direct-downloading' ? (
                                <Loader2 className="h-4 w-4 animate-spin mt-0.5 shrink-0" />
                            ) : (
                                <Music className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                            )}
                            <p className={(stage === 'error' || status === 'error') ? 'text-destructive' : 'text-foreground/80'}>
                                {statusText}
                            </p>
                        </div>

                        {showProgress && (
                            <Progress value={Math.floor(progress)} className="h-2" />
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}