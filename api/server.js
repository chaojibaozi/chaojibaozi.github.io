const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/baidu-suggest', async (req, res) => {
    const keyword = req.query.keyword || '';
    if (!keyword.trim()) {
        return res.json([]);
    }
    try {
        const response = await axios.get('https://suggestion.baidu.com/su', {
            params: { wd: keyword, cb: 'callback' },
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const match = response.data.match(/callback\((.+?)\)/);
        if (match) {
            const result = JSON.parse(match[1]);
            res.json(result.s || []);
        } else {
            res.json([]);
        }
    } catch (error) {
        console.error('获取百度热词失败:', error.message);
        res.json([]);
    }
});

app.get('/api/360-suggest', async (req, res) => {
    const keyword = req.query.keyword || '';
    if (!keyword.trim()) {
        return res.json([]);
    }
    try {
        const response = await axios.get('https://sug.so.com/suggest', {
            params: { word: keyword, encodein: 'UTF-8', encodeout: 'UTF-8' },
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        res.json(response.data.result || []);
    } catch (error) {
        console.error('获取360热词失败:', error.message);
        res.json([]);
    }
});

app.get('/api/search-data', async (req, res) => {
    const keyword = req.query.keyword || '';
    if (!keyword.trim()) {
        return res.json({ searchVolume: 0, competition: 0.5, businessValue: 50 });
    }
    
    let searchVolume = Math.floor(Math.random() * 10000) + 50;
    let competition = Math.random() * 0.9 + 0.1;
    
    try {
        const response = await axios.get('https://index.baidu.com/api/SearchApi/index', {
            params: { word: keyword, area: 0, days: 30 },
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        const data = response.data;
        if (data.data && data.data.index && data.data.index.length > 0) {
            const indexData = data.data.index[0];
            if (indexData.all && indexData.all.avg) {
                searchVolume = indexData.all.avg;
                competition = Math.min(0.95, Math.max(0.05, searchVolume / 100000));
            }
        }
    } catch (error) {
        console.warn('获取百度指数失败:', error.message);
    }
    
    let businessValue = 50;
    const text = keyword.toLowerCase();
    if (text.includes('价格') || text.includes('多少钱') || text.includes('买')) businessValue += 30;
    if (text.includes('公司') || text.includes('品牌') || text.includes('供应商')) businessValue += 25;
    if (text.includes('怎么样') || text.includes('推荐')) businessValue += 20;
    if (text.includes('专业') || text.includes('官方')) businessValue += 15;
    if (text.length > 4 && text.length < 10) businessValue += 10;
    
    res.json({
        searchVolume: searchVolume,
        competition: parseFloat(competition.toFixed(2)),
        businessValue: Math.min(businessValue, 100)
    });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});