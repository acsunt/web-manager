"""在文本文件中按精确锚点字符串插入或替换内容。

用途：解决在 PatchEdit 工具中处理包含大量 `<` `>` 等 HTML/JS 内容时
频繁触发 JSON 转义问题。该脚本走 Python 直接字节级替换，绕过协议层。

用法：
  python 脚本\\patch-html.py <file> <anchor> <new> [--before | --after | --replace] [--no-newline]

参数：
  file            目标文本文件路径（相对于项目根）
  anchor          锚点字符串（必须字面精确匹配，可通过 --anchor-file 覆盖）
  new             待插入或替换的内容（从 --new-file 指定的文件读取）
  --before        在锚点之前插入（默认）
  --after         在锚点之后插入
  --replace       用 new 替换锚点
  --anchor-file   从该文件读取锚点字符串（避免命令行转义问题，覆盖位置参数 anchor）
  --new-file      new 内容从文件读取（避免命令行参数被 shell 转义）
  --no-newline    不在插入/替换后追加换行
  --dry-run       仅打印将要修改的位置，不实际写盘

示例：
  python 脚本\\patch-html.py index.html "" --anchor-file 脚本\\__anchor.txt --new-file 脚本\\__batch_name.html --after
"""

from pathlib import Path
import argparse
import sys

script_dir = Path(__file__).resolve().parent
root = script_dir.parent


def main():
    parser = argparse.ArgumentParser(description="按精确锚点字符串在文本文件中插入或替换内容。")
    parser.add_argument("file", help="目标文件路径（相对于项目根）")
    parser.add_argument("anchor", nargs="?", default="", help="锚点字符串（必须字面精确匹配，可通过 --anchor-file 覆盖）")
    parser.add_argument("new", nargs="?", default="", help="待插入或替换的内容（与 --new-file 互斥）")
    parser.add_argument("--anchor-file", help="从该文件读取锚点字符串（避免命令行转义问题，覆盖位置参数 anchor）")
    parser.add_argument("--new-file", help="从该文件读取新内容，避免命令行转义问题")
    parser.add_argument("--before", action="store_true", help="在锚点之前插入（默认）")
    parser.add_argument("--after", action="store_true", help="在锚点之后插入")
    parser.add_argument("--replace", action="store_true", help="用新内容替换锚点")
    parser.add_argument("--no-newline", action="store_true", help="不在末尾追加换行")
    parser.add_argument("--dry-run", action="store_true", help="仅打印将要修改的位置，不实际写盘")
    args = parser.parse_args()

    if args.before and args.after or args.before and args.replace or args.after and args.replace:
        parser.error("只能选择一种操作：--before / --after / --replace")
    if args.replace:
        mode = "replace"
    elif args.after:
        mode = "after"
    else:
        mode = "before"

    if args.anchor_file:
        args.anchor = Path(args.anchor_file).read_text(encoding="utf-8").rstrip("\n").rstrip("\r")
        if not args.anchor:
            parser.error(f"锚点文件 {args.anchor_file} 内容为空")

    if args.new_file:
        new_content = Path(args.new_file).read_text(encoding="utf-8")
    else:
        new_content = args.new

    if not args.no_newline and not new_content.endswith("\n"):
        new_content = new_content + "\n"

    target_path = root / args.file if not Path(args.file).is_absolute() else Path(args.file)
    if not target_path.exists():
        print(f"[错误] 目标文件不存在: {target_path}", file=sys.stderr)
        sys.exit(1)

    text = target_path.read_text(encoding="utf-8")
    occurrences = text.count(args.anchor)
    if occurrences == 0:
        print(f"[错误] 锚点字符串在 {target_path} 中未找到。", file=sys.stderr)
        sys.exit(2)
    if occurrences > 1:
        print(f"[警告] 锚点字符串出现 {occurrences} 次，默认仅替换/插入首次出现的位置。")

    idx = text.find(args.anchor)
    if mode == "before":
        next_text = text[:idx] + new_content + text[idx:]
    elif mode == "after":
        end = idx + len(args.anchor)
        next_text = text[:end] + new_content + text[end:]
    else:
        next_text = text[:idx] + new_content + text[idx + len(args.anchor):]

    if args.dry_run:
        print(f"[预览] 文件: {target_path}")
        print(f"[预览] 操作: {mode}")
        print(f"[预览] 锚点偏移: {idx}")
        print(f"[预览] 锚点预览: {args.anchor[:60]!r}{'...' if len(args.anchor) > 60 else ''}")
        print(f"[预览] 新内容前 80 字符: {new_content[:80]!r}{'...' if len(new_content) > 80 else ''}")
        return

    target_path.write_text(next_text, encoding="utf-8", newline="")
    print(f"[完成] {target_path} ({mode}) 新长度: {len(next_text)} 字符")


if __name__ == "__main__":
    main()