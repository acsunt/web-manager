import json
import os
import pathlib
import urllib.error
import urllib.parse
import urllib.request

token = os.environ["GH_TOKEN"]
repo = os.environ["GITHUB_REPOSITORY"]
tag = os.environ["TAG"]
if os.environ.get("NOTES_FILE"):
    notes = pathlib.Path(os.environ["NOTES_FILE"]).read_text(encoding="utf-8")
else:
    notes = os.environ["NOTES"]
files = [
    pathlib.Path("dist") / os.environ["ONLINE"],
    pathlib.Path("dist") / os.environ["OFFLINE"],
]
apk_name = os.environ.get("APK")
apk_path = pathlib.Path("dist") / apk_name if apk_name else None
if apk_path and apk_path.is_file():
    files.append(apk_path)


def api(method, url, data=None, content_type="application/json"):
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    if data is not None:
        req.add_header("Content-Type", content_type)
    with urllib.request.urlopen(req) as res:
        body = res.read()
        return json.loads(body.decode()) if body else {}


try:
    release = api("GET", f"https://api.github.com/repos/{repo}/releases/tags/{tag}")
except urllib.error.HTTPError as err:
    if err.code != 404:
        raise
    release = api(
        "POST",
        f"https://api.github.com/repos/{repo}/releases",
        json.dumps({
            "tag_name": tag,
            "name": tag,
            "body": notes,
            "target_commitish": os.environ.get("GITHUB_SHA", "main"),
        }).encode(),
    )
else:
    api("PATCH", release["url"], json.dumps({"name": tag, "body": notes}).encode())
    release = api("GET", f"https://api.github.com/repos/{repo}/releases/tags/{tag}")

existing = {asset["name"]: asset for asset in release.get("assets", [])}
for path in files:
    asset = existing.get(path.name)
    if asset:
        api("DELETE", asset["url"])
    encoded = urllib.parse.quote(path.name)
    upload_url = release["upload_url"].split("{", 1)[0] + f"?name={encoded}"
    api("POST", upload_url, path.read_bytes(), "application/octet-stream")
    print(f"uploaded {path.name}")
