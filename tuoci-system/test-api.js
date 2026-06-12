const https = require('https');

function request(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 5000
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data: data }));
        });
        req.on('error', (err) => reject(err));
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

function evalJsonp(data) {
    const match = data.match(/^\s*[\w$]+\s*\(([\s\S]*?)\)\s*;?\s*$/);
    if (!match) return null;
    try { return JSON.parse(match[1]); }
    catch(e) { return null; }
}

async function testBaidu() {
    console.log('\n=== 百度 API ===');
    const r = await request('https://suggestion.baidu.com/su?wd=SEO%E4%BC%98%E5%8C%96&ie=utf-8&cb=baidu_cb');
    console.log('状态码:', r.status);
    const parsed = evalJsonp(r.data);
    if (parsed && parsed.s) {
        console.log('热词列表:');
        parsed.s.forEach((w, i) => console.log(`  ${i + 1}. ${w}`));
    } else {
        console.log('原始数据:', r.data.substring(0, 200));
    }
}

async function test360() {
    console.log('\n=== 360 API (sug.so.360.cn) ===');
    const r = await request('https://sug.so.360.cn/suggest?word=SEO%E4%BC%98%E5%8C%96&callback=qihu_cb');
    console.log('状态码:', r.status);
    const match = r.data.match(/qihu_cb\(([\s\S]*?)\)\s*$/m);
    if (match) {
        try {
            const parsed = JSON.parse(match[1]);
            if (parsed.result && Array.isArray(parsed.result)) {
                console.log('热词列表:');
                parsed.result.forEach((item, i) => console.log(`  ${i + 1}. ${item.word}`));
            } else {
                console.log('解析结果:', JSON.stringify(parsed, null, 2));
            }
        } catch (e) {
            console.log('JSON解析失败:', e.message);
            console.log('原始数据:', r.data);
        }
    } else {
        console.log('未匹配到JSONP格式，原始数据:', r.data);
    }
}

async function main() {
    await testBaidu();
    await test360();
    console.log('\n=== 测试完成 ===');
}
main();
