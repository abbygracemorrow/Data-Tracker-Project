"""Temporary probe: shows the structure of the AAA gas-price pages as seen from a GitHub runner."""
import re, sys, urllib.request

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
for url in ["https://gasprices.aaa.com/state-gas-price-averages/", "https://gasprices.aaa.com/?state=CA", "https://gasprices.aaa.com/?state=DC"]:
    print("=" * 30, url)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
        html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
    except Exception as e:
        print("FAILED", repr(e)); continue
    print("LEN", len(html))
    for kw in ["sortable", "accordion-prices", "Current Avg", "Price as of", "Yesterday Avg", "<h3"]:
        i = html.find(kw)
        print("--", kw, i)
    i = html.find("Price as of")
    print(html[i-200:i+300] if i >= 0 else "")
    i = html.find("sortable")
    print(html[i-300:i+2500] if i >= 0 else "")
    i = html.find("accordion-prices")
    print(html[i-300:i+3500] if i >= 0 else "")
    j = html.rfind("accordion-prices")
    print("LAST", j)
