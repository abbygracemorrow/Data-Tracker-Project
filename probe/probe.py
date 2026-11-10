"""Temporary probe: saves the AAA gas-price pages, as a GitHub runner sees them, for parser development."""
import gzip, pathlib, time, urllib.request

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
STATES = "AK AL AR AZ CA CO CT DC DE FL GA HI IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY".split()
out = pathlib.Path("probe-out"); out.mkdir(exist_ok=True)
urls = {"states": "https://gasprices.aaa.com/state-gas-price-averages/"}
urls.update({s: f"https://gasprices.aaa.com/?state={s}" for s in STATES})
for name, url in urls.items():
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
        body = urllib.request.urlopen(req, timeout=30).read()
        (out / f"{name}.html.gz").write_bytes(gzip.compress(body))
        print(name, len(body))
    except Exception as e:
        print(name, "FAILED", repr(e))
    time.sleep(0.5)
