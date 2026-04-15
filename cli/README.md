# Galaxy Downloader CLI

多平台媒体下载命令行工具。支持 Bilibili、抖音、Instagram、小红书、TikTok、X 等平台。

## 安装

```bash
cd cli
npm install
npm run build
```

## 使用方法

### 下载媒体

```bash
# 下载视频（默认）
node dist/index.js "https://www.bilibili.com/video/BV..."

# 下载音频
node dist/index.js "https://v.douyin.com/..." --type audio

# 下载图片
node dist/index.js "https://www.xiaohongshu.com/explore/..." --type images

# 指定输出目录
node dist/index.js "https://..." --output ./my-downloads

# 多P视频下载特定分P
node dist/index.js "https://..." --part 2

# JSON 输出
node dist/index.js "https://..." --json
```

### 仅解析信息

```bash
node dist/index.js parse "https://..."
```

### 查看支持平台

```bash
node dist/index.js platforms
```

### 查看配置

```bash
node dist/index.js config
```

## 配置

### 环境变量

```bash
# 设置上游 API 地址
export GALAXY_API_BASE_URL="http://localhost:8080"

# 或使用 --api-base 参数
node dist/index.js "https://..." --api-base http://api.example.com
```

### 默认值

- API 地址: `http://localhost:8080`
- 输出目录: `./downloads`
- 下载类型: `auto`（自动选择）

## 命令选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-t, --type` | 下载类型: video, audio, images, auto | auto |
| `-o, --output` | 输出目录 | ./downloads |
| `-p, --part` | 多P视频指定分P | - |
| `--json` | JSON 输出 | - |
| `--api-base` | 上游 API 地址 | localhost:8080 |

## 支持平台

| 平台 | 视频 | 音频 | 图文 | 多P |
|------|:----:|:----:|:----:|:----:|
| Bilibili | ✓ | ✓ | - | ✓ |
| 抖音 | ✓ | ✓ | ✓ | - |
| Instagram | ✓ | ✓ | ✓ | - |
| 小红书 | ✓ | ✓ | ✓ | - |
| TikTok | ✓ | ✓ | - | - |
| X/Twitter | ✓ | ✓ | - | - |
| YouTube | ✓ | ✓ | - | - |
| 微博 | ✓ | ✓ | - | - |

## 作为 Skill 使用

CLI 已集成到 `media-downloader` Skill，可通过 Claude Code 使用：

```
用户: 帮我下载这个视频 https://...
Claude: [调用 galaxy-downloader CLI]
```

## 项目结构

```
cli/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # CLI 入口
│   ├── types.ts          # 类型定义
│   ├── api-errors.ts     # 错误处理
│   ├── platforms.ts      # 平台识别
│   ├── api/
│   │   └── client.ts     # API 客户端
│   ├── commands/
│   │   ├── parse.ts      # 解析命令
│   │   └── download.ts   # 下载命令
│   └── utils/
│       ├── format.ts     # 格式化工具
│       └── download.ts   # 下载工具
└── dist/                 # 编译产物
```