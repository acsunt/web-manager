from pathlib import Path
import re

script_dir = Path(__file__).resolve().parent
root = script_dir.parent
history = root / "历史"
target = history / "网页管理13.0.html"

index_files = list(root.glob("*index.html"))
if len(index_files) != 1:
    raise RuntimeError(f"Expected one index.html, found {len(index_files)}")

html = index_files[0].read_text(encoding="utf-8")
css = (root / "style.css").read_text(encoding="utf-8")
api = (root / "api.js").read_text(encoding="utf-8")
ui = (root / "ui.js").read_text(encoding="utf-8")
utils = (root / "utils.js").read_text(encoding="utf-8")
main = (root / "main.js").read_text(encoding="utf-8")

style_reference = '    <link rel="stylesheet" href="./style.css">'
module_reference = '<script type="module" src="./main.js"></script>'
if style_reference not in html or module_reference not in html:
    raise RuntimeError("Expected CSS or module script reference was not found.")

html = html.replace(style_reference, f"    <style>\n{css.rstrip()}\n    </style>", 1)
main = re.sub(r"^import\s+.*?;\s*$", "", main, flags=re.MULTILINE)
modules = [
    re.sub(r"^export\s+", "", source, flags=re.MULTILINE).rstrip()
    for source in (api, ui, utils)
]
modules.append(main.strip())
combined_js = "\n\n".join(modules)
html = html.replace(module_reference, f"<script>\n{combined_js}\n</script>", 1)

if "./style.css" in html or "./main.js" in html:
    raise RuntimeError("External application references remain in merged HTML.")
if "import {" in combined_js or re.search(r"^export\s+", combined_js, re.MULTILINE):
    raise RuntimeError("ES module syntax remains in merged HTML.")
if '<style id="custom-css-style"></style>' not in html:
    raise RuntimeError("Runtime custom CSS container is missing.")

history.mkdir(exist_ok=True)
target.write_text(html, encoding="utf-8", newline="\n")
print(f"Created: {target} ({target.stat().st_size} bytes)")