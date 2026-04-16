import { execSync, spawn } from 'child_process'
import { join, dirname } from 'path'
import { existsSync, readdirSync, statSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface TranscribeOptions {
    input: string
    output: string
    model?: string
    language?: string
    api?: string
    apiKey?: string
    format?: 'txt' | 'srt' | 'vtt' | 'json'
}

export interface TranscribeResult {
    success: boolean
    files: Array<{
        input: string
        output: string
        text?: string
        error?: string
    }>
    total: number
    successCount: number
    failCount: number
    error?: string
}

/**
 * 获取 Python helper 脚本路径
 */
function getPythonScriptPath(): string {
    const scriptPath = join(__dirname, '..', '..', 'scripts', 'transcribe.py')
    if (!existsSync(scriptPath)) {
        throw new Error(`Python 转录脚本不存在: ${scriptPath}`)
    }
    return scriptPath
}

/**
 * 检查 Python 环境是否有 mlx-audio
 */
function checkMlxAudio(): boolean {
    try {
        execSync('python3 -c "import mlx_audio.stt.generate" 2>/dev/null', { stdio: 'pipe' })
        return true
    } catch {
        return false
    }
}

/**
 * 使用 API 服务转录单个文件
 */
async function transcribeWithApi(
    filePath: string,
    apiUrl: string,
    apiKey: string,
    language: string = 'zh'
): Promise<{ success: boolean; text?: string; error?: string }> {
    try {
        const response = await fetch(`${apiUrl}/v1/audio/transcriptions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
            body: (() => {
                const formData = new FormData()
                // 读取文件内容
                const fileContent = execSync(`cat "${filePath}"`, { encoding: 'binary' })
                formData.append('file', new Blob([fileContent]), filePath.split('/').pop() || 'audio.mp3')
                formData.append('model', 'whisper-large-v3-turbo')
                formData.append('language', language)
                formData.append('response_format', 'json')
                return formData
            })(),
        })

        if (!response.ok) {
            const errorText = await response.text()
            return { success: false, error: `API 错误: ${response.status} - ${errorText}` }
        }

        const data = await response.json() as any
        return { success: true, text: data.text }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'API 请求失败' }
    }
}

/**
 * 使用本地 mlx-audio 转录单个文件
 */
function transcribeWithMlxAudio(
    filePath: string,
    outputPath: string,
    model: string,
    language: string,
    format: string
): { success: boolean; text?: string; error?: string } {
    try {
        const scriptPath = getPythonScriptPath()
        const args = [
            scriptPath,
            '--audio', filePath,
            '--output', outputPath,
            '--model', model,
            '--language', language,
            '--format', format,
        ]

        const result = execSync(`python3 ${args.map(a => `"${a}"`).join(' ')}`, {
            encoding: 'utf-8',
            timeout: 120000, // 2 分钟超时
            stdio: ['pipe', 'pipe', 'pipe'],
        })

        // 读取输出文件
        const outputFile = `${outputPath}.${format}`
        if (existsSync(outputFile)) {
            const text = execSync(`cat "${outputFile}"`, { encoding: 'utf-8' })
            return { success: true, text }
        }

        return { success: true, text: result.trim() }
    } catch (error) {
        const message = error instanceof Error ? error.message : '转录失败'
        return { success: false, error: message }
    }
}

/**
 * 获取输入目录中的所有音频文件
 */
function getAudioFiles(input: string): string[] {
    if (!existsSync(input)) {
        return []
    }

    const stat = statSync(input)
    if (stat.isFile()) {
        // 单文件
        if (input.match(/\.(mp3|wav|m4a|flac|ogg|aac)$/i)) {
            return [input]
        }
        return []
    }

    // 目录
    const files = readdirSync(input)
    return files
        .filter(f => f.match(/\.(mp3|wav|m4a|flac|ogg|aac)$/i))
        .map(f => join(input, f))
        .sort()
}

/**
 * 执行转录命令
 */
export async function transcribeCommand(options: TranscribeOptions): Promise<TranscribeResult> {
    const { input, output, model, language, api, apiKey, format } = options

    // 默认值
    const outputPath = output || './transcripts'
    const modelPath = model || process.env.GALAXY_WHISPER_MODEL || '/Users/yiyi/.omlx/models/whisper-large-v3-turbo'
    const lang = language || 'zh'
    const outputFormat = format || 'txt'

    console.log(`\n[转录] 正在处理: ${input}`)
    console.log(`[输出] 目录: ${outputPath}`)
    console.log(`[模型] ${modelPath}`)
    console.log(`[语言] ${lang}`)
    console.log(`[格式] ${outputFormat}`)

    // 检查转录方式
    const useApi = api && apiKey
    if (!useApi && !checkMlxAudio()) {
        return {
            success: false,
            files: [],
            total: 0,
            successCount: 0,
            failCount: 0,
            error: 'mlx-audio 未安装。请运行: pip install mlx-audio\n或使用 --api 和 --api-key 参数指定 API 服务',
        }
    }

    if (useApi) {
        console.log(`[方式] API 服务: ${api}`)
    } else {
        console.log(`[方式] 本地 mlx-audio`)
    }

    // 创建输出目录
    mkdirSync(outputPath, { recursive: true })

    // 获取音频文件
    const audioFiles = getAudioFiles(input)
    if (audioFiles.length === 0) {
        return {
            success: false,
            files: [],
            total: 0,
            successCount: 0,
            failCount: 0,
            error: '未找到音频文件。支持的格式: mp3, wav, m4a, flac, ogg, aac',
        }
    }

    console.log(`\n[文件] 共 ${audioFiles.length} 个音频文件`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    const results: Array<{ input: string; output: string; text?: string; error?: string }> = []
    let successCount = 0
    let failCount = 0

    for (let i = 0; i < audioFiles.length; i++) {
        const filePath = audioFiles[i]
        const filename = filePath.split('/').pop() || `audio_${i}`
        const baseName = filename.replace(/\.[^.]+$/, '')
        const fileOutputPath = join(outputPath, baseName)

        console.log(`\n[${i + 1}/${audioFiles.length}] ${filename}`)

        // 检查是否已转录
        const existingFile = `${fileOutputPath}.${outputFormat}`
        if (existsSync(existingFile)) {
            console.log(`  跳过（已存在）`)
            results.push({ input: filePath, output: existingFile })
            successCount++
            continue
        }

        let result: { success: boolean; text?: string; error?: string }

        if (useApi) {
            result = await transcribeWithApi(filePath, api!, apiKey!, lang)
            if (result.success && result.text) {
                // 写入文件
                execSync(`echo "${result.text}" > "${existingFile}"`)
            }
        } else {
            result = transcribeWithMlxAudio(filePath, fileOutputPath, modelPath, lang, outputFormat)
        }

        if (result.success) {
            console.log(`  完成`)
            results.push({ input: filePath, output: existingFile, text: result.text })
            successCount++
        } else {
            console.log(`  失败: ${result.error}`)
            results.push({ input: filePath, output: fileOutputPath, error: result.error })
            failCount++
        }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`转录完成: 成功 ${successCount}, 失败 ${failCount}`)
    console.log(`输出目录: ${outputPath}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    return {
        success: failCount === 0,
        files: results,
        total: audioFiles.length,
        successCount,
        failCount,
    }
}