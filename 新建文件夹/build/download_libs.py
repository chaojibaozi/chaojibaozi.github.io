import urllib.request, os, sys

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sheetjs.full.min.js")
URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"

def download():
    print("Downloading SheetJS ...")
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    with open(OUT, "wb") as f:
        f.write(data)
    print("Saved:", OUT, len(data), "bytes")

if __name__ == "__main__":
    if os.path.exists(OUT) and os.path.getsize(OUT) > 100000:
        print("Already present, skip.")
    else:
        download()
