"""Temporary probe: can a GitHub runner download candidate second sources?"""
import gzip, pathlib, urllib.request
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
out = pathlib.Path("probe-out"); out.mkdir(exist_ok=True)
for name, url in {
    "eia_gasdiesel": "https://www.eia.gov/petroleum/gasdiesel/",
    "eia_pswrgvwall": "https://www.eia.gov/petroleum/gasdiesel/xls/pswrgvwall.xls",
    "eia_weekly_csv": "https://www.eia.gov/dnav/pet/pet_pri_gnd_dcus_nus_w.htm",
    "gasbuddy": "https://www.gasbuddy.com/usa",
}.items():
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
        body = urllib.request.urlopen(req, timeout=30).read()
        (out / f"{name}.gz").write_bytes(gzip.compress(body))
        print(name, "OK", len(body))
    except Exception as e:
        print(name, "FAILED", repr(e))
