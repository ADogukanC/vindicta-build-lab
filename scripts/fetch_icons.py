"""Download every item icon from deadlock.wiki and point the seed at them.

Icons live at File:<Item Name>.png. The imageinfo API takes up to 50 titles per
request, so this is 4 metadata calls plus one download each, run politely.
"""
import json, os, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = os.path.join(ROOT, "data", "seed-items.json")
ICON_DIR = os.path.join(ROOT, "public", "items")
API = "https://deadlock.wiki/api.php"
UA = "VindictaBuildLab/0.1 (personal Deadlock build calculator)"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def main():
    items = json.load(open(SEED, encoding="utf-8"))
    os.makedirs(ICON_DIR, exist_ok=True)

    # 1. Resolve File: pages to real image URLs, 50 at a time.
    urls = {}
    titles = [f"File:{it['name']}.png" for it in items]
    for i in range(0, len(titles), 50):
        chunk = titles[i : i + 50]
        query = urllib.parse.urlencode(
            {
                "action": "query",
                "titles": "|".join(chunk),
                "prop": "imageinfo",
                "iiprop": "url",
                "format": "json",
            }
        )
        data = json.loads(get(f"{API}?{query}"))
        for page in data.get("query", {}).get("pages", {}).values():
            info = page.get("imageinfo")
            if info:
                urls[page["title"]] = info[0]["url"]
        time.sleep(0.4)

    print(f"resolved {len(urls)}/{len(titles)} icon URLs")

    # 2. Download.
    ok, missing = 0, []
    for it in items:
        title = f"File:{it['name']}.png"
        url = urls.get(title)
        if not url:
            missing.append(it["name"])
            continue
        path = os.path.join(ICON_DIR, f"{it['slug']}.png")
        if not os.path.exists(path):
            try:
                blob = get(url)
            except Exception as exc:  # noqa: BLE001
                missing.append(f"{it['name']} ({exc})")
                continue
            with open(path, "wb") as fh:
                fh.write(blob)
            time.sleep(0.15)
        it["iconUrl"] = f"/items/{it['slug']}.png"
        ok += 1

    json.dump(items, open(SEED, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"icons on disk: {ok}")
    if missing:
        print(f"no icon found for {len(missing)}:")
        for m in missing:
            print("  ", m)


if __name__ == "__main__":
    main()
