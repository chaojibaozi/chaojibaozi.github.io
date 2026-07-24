with open(r'd:\BianCheng\Keyword-Segmentation-Tool\index.html','r',encoding='utf-8') as f:
    lines=f.readlines()
for i in [648,649,650]:
    s=lines[i].rstrip()
    print(f'Line {i+1}: ...{s[-80:]}')
