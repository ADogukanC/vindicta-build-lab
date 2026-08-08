"""Download the raw item data deadlock.wiki publishes, then rebuild the seed.

Run this after a Deadlock patch:

    python scripts/fetch_wiki_data.py     # pull Data:ItemCards.json
    python scripts/convert_items.py       # rebuild data/seed-items.json
    python scripts/fetch_icons.py         # download any new icons

Then `npm test` to confirm the guards in src/lib/data/seed.test.ts still pass —
they will tell you if the patch introduced a stat key the calculator does not
map yet.
"""
import os
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
UA = "VindictaBuildLab/0.1 (personal Deadlock build calculator)"

PAGES = {
    "Data:ItemCards.json": "Data_ItemCards.json",
    "Data:StatLinks.json": "Data_StatLinks.json",
}


def main():
    for page, filename in PAGES.items():
        url = f"https://deadlock.wiki/index.php?title={urllib.parse.quote(page)}&action=raw"
        request = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(request, timeout=60) as response:
            blob = response.read()
        path = os.path.join(HERE, filename)
        with open(path, "wb") as fh:
            fh.write(blob)
        print(f"{page} -> scripts/{filename} ({len(blob):,} bytes)")


if __name__ == "__main__":
    main()
