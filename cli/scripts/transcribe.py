#!/usr/bin/env python3
"""
音频转录脚本 - 使用 mlx-audio whisper 模型

用法:
    python transcribe.py --audio <audio_file> --output <output_path> [--model <model>] [--language <lang>] [--format <format>]
"""

import argparse
import os
import sys
import time

def parse_args():
    parser = argparse.ArgumentParser(description="音频转录工具")
    parser.add_argument("--audio", required=True, help="音频文件路径")
    parser.add_argument("--output", required=True, help="输出文件路径（不含扩展名）")
    parser.add_argument("--model", default="/Users/yiyi/.omlx/models/whisper-large-v3-turbo", help="Whisper 模型路径")
    parser.add_argument("--language", default="zh", help="语言代码 (zh, en, ja, ko 等)")
    parser.add_argument("--format", default="txt", choices=["txt", "srt", "vtt", "json"], help="输出格式")
    parser.add_argument("--verbose", action="store_true", help="详细输出")
    return parser.parse_args()

def main():
    args = parse_args()

    # 检查 mlx_audio 是否可用
    try:
        from mlx_audio.stt.generate import generate_transcription
    except ImportError:
        print("错误: mlx-audio 未安装")
        print("请运行: pip install mlx-audio")
        sys.exit(1)

    # 检查文件是否存在
    if not os.path.exists(args.audio):
        print(f"错误: 音频文件不存在 - {args.audio}")
        sys.exit(1)

    # 创建输出目录
    output_dir = os.path.dirname(os.path.abspath(args.output))
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    if args.verbose:
        print(f"[转录] {args.audio}")
        print(f"[模型] {args.model}")
        print(f"[语言] {args.language}")
        print(f"[格式] {args.format}")

    try:
        start_time = time.time()

        # 执行转录
        segments = generate_transcription(
            model=args.model,
            audio=args.audio,
            output_path=args.output,
            format=args.format,
            language=args.language,
            verbose=args.verbose,
        )

        elapsed = time.time() - start_time

        if args.verbose:
            print(f"[完成] 耗时 {elapsed:.2f}s")
            if hasattr(segments, 'text'):
                preview = segments.text[:100]
                print(f"[内容] {preview}...")

        # 输出文件路径
        output_file = f"{args.output}.{args.format}"
        if os.path.exists(output_file):
            print(output_file)
        else:
            # 如果文件不存在，直接输出文本
            if hasattr(segments, 'text'):
                print(segments.text)

    except Exception as e:
        print(f"错误: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()