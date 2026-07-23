# -*- coding: utf-8 -*-
"""下载全国行政区划数据(省/市/县级)，生成 geo 词表并直接写回 app.html 的 BASE.geo"""
import json, re, urllib.request, ssl, sys, os

URLS = [
    "https://cdn.jsdelivr.net/gh/modood/Administrative-divisions-of-China@master/dist/pca-code.json",
    "https://fastly.jsdelivr.net/gh/modood/Administrative-divisions-of-China@master/dist/pca-code.json",
    "https://raw.githubusercontent.com/modood/Administrative-divisions-of-China/master/dist/pca-code.json",
]

def download():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    last = None
    for u in URLS:
        try:
            print("try:", u)
            req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
            data = urllib.request.urlopen(req, timeout=60, context=ctx).read()
            print("  ok bytes:", len(data))
            return json.loads(data.decode("utf-8"))
        except Exception as e:
            print("  fail:", type(e).__name__, e)
            last = e
    raise last

# 省级短形去后缀
PROV_SUF = ["维吾尔自治区", "壮族自治区", "回族自治区", "特别行政区", "自治区", "省", "市"]
# 直接屏蔽的通用/占位名（避免误匹配）
BLACK = {"市辖区", "城区", "矿区", "郊区", "市区", "新区", "县", "区", "省直辖县级行政区划",
         "自治区直辖县级行政区划", "县级行政区划", "白银"}  # 白银=贵金属，屏蔽短形
# 强歧义词：作区/县全称保留，但不生成短形(避免与常用词/品牌冲突)
AMBIG_STEM = {"和平", "长安", "南山", "福田", "中山", "城关", "新华", "解放", "民主", "建设",
              "团结", "胜利", "红旗", "东风", "前进", "光明", "向阳", "文峰", "高新", "经开",
              "宝山", "花山", "长寿", "美兰", "秀英", "龙湖", "永康", "华龙", "金牛", "青秀",
              "太平", "友谊", "站前", "振兴", "元宝", "银州", "清河", "站前", "双塔", "龙山"}


def extract_tokens(src, key):
    """从 app.html 中抽取 BASE.<key> 数组里的所有词条(用于排除冲突)"""
    m = re.search(r'  ' + key + r': \[', src)
    if not m:
        return set()
    i = m.end()
    depth = 1
    j = i
    while j < len(src) and depth:
        if src[j] == '[':
            depth += 1
        elif src[j] == ']':
            depth -= 1
        j += 1
    block = src[i:j]
    return set(re.findall(r'"([^"]+)"', block))

def prov_short(name):
    for s in PROV_SUF:
        if name.endswith(s):
            return name[:-len(s)]
    return name

def main():
    data = download()
    app = os.path.join(os.path.dirname(__file__), "app.html")
    src = open(app, encoding="utf-8").read()
    # 排除集：品牌 + 竞品 + 产品词根 + 强歧义，避免县级短形与之冲突误判
    EXCLUDE = extract_tokens(src, "brand") | extract_tokens(src, "competitor") \
        | extract_tokens(src, "product") | AMBIG_STEM
    print("EXCLUDE size:", len(EXCLUDE))

    terms = []           # 保序
    seen = set()
    def add(t):
        t = t.strip()
        if not t or len(t) < 2 or t in BLACK or t in seen:
            return
        seen.add(t); terms.append(t)

    def add_stem(name):
        """为区/县生成简称短形(仅安全情形)，排除品牌/产品/歧义冲突"""
        stem = None
        if name.endswith("新区"):
            stem = name[:-2]            # 浦东新区->浦东  滨海新区->滨海
        elif len(name) == 3 and name[-1] in "区县":
            stem = name[:-1]            # 顺德区->顺德  增城区->增城
        if stem and 2 <= len(stem) <= 3 and stem not in EXCLUDE:
            add(stem)

    n_prov = n_city = n_area = 0
    for prov in data:
        pn = prov["name"]
        add(prov_short(pn)); n_prov += 1
        for city in prov.get("children", []):
            cn = city["name"]
            n_city += 1
            if cn.endswith("市"):
                add(cn[:-1])            # 地级市短形：长沙市->长沙
            else:
                add(cn)                 # 自治州/地区/盟/林区：保留全称
                if len(cn) >= 4:
                    add(cn[:2])         # 附加两字前缀：延边朝鲜族自治州->延边
            for area in city.get("children", []):
                an = area["name"]
                n_area += 1
                if an.endswith("市"):
                    add(an[:-1])        # 县级市短形：义乌市->义乌
                    add(an)             # 同时保留全称
                else:
                    add(an)             # 区/县/旗/自治县：保留全称(带后缀防歧义)
                    add_stem(an)        # 补安全短形：顺德区->顺德 / 浦东新区->浦东

    # 补回港澳台(数据源仅含大陆31省)
    for t in ["台湾", "香港", "澳门", "台北", "高雄", "新竹", "台中", "台南"]:
        add(t)
    # 追加语义辅助地域词
    for t in ["同城", "本地", "附近", "哪里", "哪儿", "周边", "当地"]:
        add(t)

    print("provinces=%d cities=%d areas=%d  => unique terms=%d" % (n_prov, n_city, n_area, len(terms)))
    print("sample:", "，".join(terms[:20]))
    print("sample-county:", "，".join([t for t in terms if t.endswith(("区", "县", "旗"))][:20]))

    # 生成 JS 数组字符串
    js = "  geo: [" + ",".join('"%s"' % t for t in terms) + "],"

    pat = re.compile(r'  geo: \["北京".*?\],')
    m = pat.search(src)
    if not m:
        print("ERROR: geo line not found"); sys.exit(1)
    src2 = src[:m.start()] + js + src[m.end():]
    open(app, "w", encoding="utf-8").write(src2)
    print("app.html geo replaced. old_len=%d new_len=%d" % (len(m.group(0)), len(js)))

if __name__ == "__main__":
    main()
