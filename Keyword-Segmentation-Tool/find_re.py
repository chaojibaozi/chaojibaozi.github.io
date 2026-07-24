# -*- coding: utf-8 -*-
import re
with open(r'd:\BianCheng\Keyword-Segmentation-Tool\index.html', 'r', encoding='utf-8') as f:
    content = f.read()
# Check existing real estate words
checks = ["房产公司","房地产公司","开发商","中介","出租","租房","售楼处","房屋租赁","房产中介"]
for w in checks:
    print(f'{w}: {"YES" if w in content else "NO" if w not in content else ""}')
# Find last items
for arr_name in ['company', 'phone', 'factory']:
    m = re.search(rf'{arr_name}: \[(.*?)\]', content, re.DOTALL)
    if m:
        items = re.findall(r'"(?:[^"\\]|\\.)*"', m.group(1))
        last = items[-1] if items else ''
        print(f'{arr_name} last: {last}')
