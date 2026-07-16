from pathlib import Path
import re

script_dir = Path(__file__).resolve().parent
root = script_dir.parent
main_path = root / "main.js"
index_files = list(root.glob("*index.html"))

if len(index_files) != 1:
    raise RuntimeError(f"Expected one index.html, found {len(index_files)}")
if not main_path.exists():
    raise RuntimeError("main.js was not found.")

main = main_path.read_text(encoding="utf-8")
html = index_files[0].read_text(encoding="utf-8")
uses_imports = bool(re.search(r"^import\s+", main, re.MULTILINE))
uses_module_tag = '<script type="module" src="./main.js"></script>' in html

if uses_imports and uses_module_tag:
    print("The project already uses ES modules. No files were changed.")
    raise SystemExit(0)

raise RuntimeError(
    "Automatic modularization is intentionally disabled because moving shared "
    "stateful functions requires dependency analysis. No files were changed."
)