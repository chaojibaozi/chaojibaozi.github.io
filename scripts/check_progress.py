import urllib.request as R
import re
r = R.urlopen("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2/+esm", timeout=10)
body = r.read().decode("utf-8", errors="replace")

# Find progress_callback usage patterns
for m in re.finditer(r"progress_callback", body):
    start = max(0, m.start()-100)
    end = min(len(body), m.end()+300)
    print(body[start:end])
    print("---")
