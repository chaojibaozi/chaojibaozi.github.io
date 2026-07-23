import os, re
base = os.path.dirname(os.path.abspath(__file__))
app = open(os.path.join(base, 'app.html'), encoding='utf-8').read()
lib = open(os.path.join(base, 'sheetjs.full.min.js'), encoding='utf-8').read()
assert '</script' not in lib.lower(), 'lib contains </script> tag - would break inline'
marker = '<!--__SHEETJS__-->'
assert marker in app, 'marker missing'
out = app.replace(marker, '<script>\n' + lib + '\n</script>')
outpath = os.path.join(os.path.dirname(base), 'index.html')
with open(outpath, 'w', encoding='utf-8') as f:
    f.write(out)
# extract app script for syntax check
m = re.search(r'<script>\s*"use strict";(.*?)</script>\s*</body>', app, re.S)
js = '"use strict";' + m.group(1)
with open(os.path.join(base, '_app_check.js'), 'w', encoding='utf-8') as f:
    f.write(js)
print('BUILT', os.path.getsize(outpath), 'bytes ->', outpath)
