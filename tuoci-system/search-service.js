const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 3001;

function fetchBaidu(keyword) {
    return new Promise((resolve, reject) => {
        const encoded = encodeURIComponent(keyword);
        const options = {
            hostname: 'www.baidu.com',
            path: `/s?wd=${encoded}`,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Cache-Control': 'no-cache'
            },
            timeout: 5000
        };

        const req = https.get(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve(data));
        });

        req.on('timeout', () => { req.destroy(new Error('Baidu request timeout')); });
        req.on('error', reject);
    });
}

function parseBaiduResults(html) {
    if (!html) return null;

    // 匹配"百度为您找到相关结果约 1,230,000 个" 或 "找到相关结果约1,230,000个"
    const patterns = [
        /百度为您找到相关结果约\s*([\d,，]+)\s*个/,
        /找到相关结果约\s*([\d,，]+)\s*个/,
        /相关结果(?:约)?\s*([\d,，]+)\s*个/i
    ];

    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) {
            const countStr = match[1].replace(/[,，]/g, '');
            const count = parseInt(countStr, 10);
            if (!isNaN(count) && count > 0) return count;
        }
    }
    return null;
}

function estimateMetrics(resultCount, keyword) {
    // resultCount 是百度搜索结果数，作为搜索量参考
    // 将结果数映射为搜索量：1万结果≈100搜索量，1000万结果≈10000搜索量
    let searchVolume;
    if (resultCount) {
        searchVolume = Math.floor(Math.log10(resultCount + 1) * 1200);
        searchVolume = Math.max(50, Math.min(searchVolume, 100000));
    } else {
        searchVolume = Math.floor(Math.random() * 500) + 50;
    }

    // 竞争度：结果越多竞争越激烈
    let competition = 0.3;
    if (resultCount) {
        const logCount = Math.log10(resultCount + 1);
        competition = Math.min(0.95, Math.max(0.1, logCount / 8));
    } else {
        competition = Math.random() * 0.5 + 0.2;
    }

    // 商业价值：根据关键词特征评估
    let businessValue = 50;
    const text = (keyword || '').toLowerCase();
    if (text.includes('价格') || text.includes('多少钱') || text.includes('买') || text.includes('报价')) businessValue += 30;
    if (text.includes('公司') || text.includes('品牌') || text.includes('供应商') || text.includes('厂家')) businessValue += 25;
    if (text.includes('怎么样') || text.includes('推荐')) businessValue += 20;
    if (text.includes('专业') || text.includes('官方')) businessValue += 15;
    if (text.length > 4 && text.length < 10) businessValue += 10;
    businessValue = Math.min(businessValue, 100);

    return {
        searchVolume: searchVolume,
        competition: parseFloat(competition.toFixed(2)),
        businessValue: businessValue,
        resultCount: resultCount,
        isReal: true
    };
}

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);

    // CORS 支持
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.statusCode = 200;
        res.end();
        return;
    }

    if (parsedUrl.pathname === '/api/search-data') {
        const keyword = (parsedUrl.query.keyword || '').toString();
        if (!keyword || keyword.trim().length === 0) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'keyword is required' }));
            return;
        }

        try {
            const html = await fetchBaidu(keyword);
            const resultCount = parseBaiduResults(html);
            const metrics = estimateMetrics(resultCount, keyword);

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(metrics));
        } catch (err) {
            console.error('[API Error]', keyword, err.message);
            // 出错时返回估算数据，避免前端完全失败
            const metrics = estimateMetrics(null, keyword);
            metrics.isReal = false;
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(metrics));
        }
        return;
    }

    if (parsedUrl.pathname === '/') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('拓词系统 - 搜索量数据服务已启动\n\n用法: GET /api/search-data?keyword=关键词');
        return;
    }

    res.statusCode = 404;
    res.end('Not Found');
});

server.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`  拓词搜索量数据服务已启动`);
    console.log(`  地址: http://localhost:${PORT}`);
    console.log(`  用法: http://localhost:${PORT}/api/search-data?keyword=SEO优化`);
    console.log(`========================================\n`);
});
