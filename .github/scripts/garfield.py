"""Write garfield.json with today's strip from GoComics.

GoComics sits behind a bot shield that lets a plain request through from some
networks and serves a JavaScript challenge from others (GitHub runners included),
so a real browser is used when the plain request does not yield the strip.
"""
import datetime
import json
import os
import re
import sys
import urllib.error
import urllib.request
import zoneinfo

OG_IMAGE = re.compile(r'property="og:image"\s+content="([^"]+)"')
IMAGE_PREFIX = "https://featureassets.gocomics.com/assets/"
BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Site": "none",
    "Upgrade-Insecure-Requests": "1",
}


def strip_image(html):
    m = OG_IMAGE.search(html)
    return m.group(1) if m and m.group(1).startswith(IMAGE_PREFIX) else None


def via_plain_request(page):
    req = urllib.request.Request(page, headers=BROWSER_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            html = res.read().decode("utf-8", "replace")
            status = res.status
    except urllib.error.HTTPError as e:
        html, status = e.read().decode("utf-8", "replace"), e.code
    print(f"plain request: HTTP {status}, {len(html)} bytes, title={re.search(r'<title>([^<]*)', html or '<title>')[1]!r}")
    return strip_image(html)


def via_browser(page):
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        tab = browser.new_page()
        tab.goto(page, wait_until="domcontentloaded")
        image = None
        for second in range(45):
            image = strip_image(tab.content())
            if image:
                print(f"browser: strip found after {second}s")
                break
            tab.wait_for_timeout(1000)
        else:
            print(f"browser: gave up, title={tab.title()!r}")
        browser.close()
    return image


def main():
    today = datetime.datetime.now(zoneinfo.ZoneInfo("America/New_York")).date()
    page = f"https://www.gocomics.com/garfield/{today:%Y/%m/%d}"
    image = None if os.environ.get("GARFIELD_FORCE_BROWSER") else via_plain_request(page)
    image = image or via_browser(page)
    if not image:
        print(f"Could not find the strip image on {page}")
        sys.exit(1)
    with open("garfield.json", "w") as f:
        json.dump({"date": today.isoformat(), "image": image, "url": page}, f, indent=2)
        f.write("\n")
    print(open("garfield.json").read())


if __name__ == "__main__":
    main()
