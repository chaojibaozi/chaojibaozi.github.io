const fs = require('fs');

function extractNGrams(str, n) {
    const grams = new Set();
    for (let i = 0; i <= str.length - n; i++) grams.add(str.substring(i, i + n));
    return grams;
}

function jaccardSimilarity(setA, setB) {
    if (setA.size === 0 && setB.size === 0) return 1;
    let intersection = 0;
    for (const item of setA) if (setB.has(item)) intersection++;
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
}

function longestCommonSubstring(str1, str2) {
    const len1 = str1.length, len2 = str2.length;
    if (len1 === 0 || len2 === 0) return 0;
    let maxLen = 0;
    const dp = new Array(len1 + 1);
    for (let i = 0; i <= len1; i++) dp[i] = new Array(len2 + 1).fill(0);
    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
                maxLen = Math.max(maxLen, dp[i][j]);
            }
        }
    }
    return maxLen;
}

function calculateChineseSimilarity(keyword, searchWord) {
    if (!keyword || !searchWord) return 0;
    const kw = keyword.toLowerCase().trim();
    const sw = searchWord.toLowerCase().trim();
    if (kw === sw) return 1;
    
    const kwChars = new Set(kw);
    const swChars = new Set(sw);
    const charJaccard = jaccardSimilarity(kwChars, swChars);
    
    const kwBigrams = extractNGrams(kw, 2);
    const swBigrams = extractNGrams(sw, 2);
    const bigramJaccard = kwBigrams.size > 0 && swBigrams.size > 0 ? jaccardSimilarity(kwBigrams, swBigrams) : 0;
    
    const kwTrigrams = extractNGrams(kw, 3);
    const swTrigrams = extractNGrams(sw, 3);
    const trigramJaccard = kwTrigrams.size > 0 && swTrigrams.size > 0 ? jaccardSimilarity(kwTrigrams, swTrigrams) : 0;
    
    const lcsLen = longestCommonSubstring(kw, sw);
    const lcsRatio = lcsLen / Math.max(kw.length, sw.length);
    
    const weights = { char: 0.2, bigram: 0.35, trigram: 0.15, lcs: 0.3 };
    let similarity = charJaccard * weights.char + bigramJaccard * weights.bigram + trigramJaccard * weights.trigram + lcsRatio * weights.lcs;
    
    if (sw.length <= 3) similarity = charJaccard * 0.5 + bigramJaccard * 0.3 + lcsRatio * 0.2;
    
    return Math.max(0, Math.min(1, similarity));
}

const COMPETITOR_WORDS = new Set([
    'tiktok', '抖音', 'ozon', 'shopee', 'lazada', 'temu', '美客多', 'ebay', 'avito',
    'amazon', '亚马逊', 'wish', '速卖通', 'aliexpress', 'shein', '希音',
    '淘宝', '天猫', '京东', '拼多多', 'pdd', '抖音电商', '快手电商', '小红书',
    '得物', '唯品会', '苏宁', '国美', '当当', '1688', '阿里巴巴',
    '新东方', '学而思', '高途', '作业帮', '猿辅导', '中公', '华图', '粉笔',
    '中信建投', '永安期货', '国泰君安', '银河期货', '广发期货', '华泰期货',
    '招商银行', '工商银行', '建设银行', '农业银行', '中国银行', '平安银行',
    '支付宝', '微信支付', '连连支付', 'PayPal',
    '美团', '饿了么', '大众点评', '百度', '高德', '滴滴', '哈啰'
]);

const UNIVERSAL_LOW_WORDS = new Set([
    '吗', '呢', '啊', '吧', '呀',
    '首页', '教程', '流程', '方法', '技巧', '步骤', '下载',
    '安装', '使用', '查看', '点击', '详情', '成功', '失败', '办理', '申请', '审核', '通过',
    '充值', '开通', '关闭', '启用', '停用', '修改', '编辑',
    '删除', '保存', '分享', '转发', '收藏', '点赞', '评论', '关注', '私信', '客服', '电话',
    '地址', '联系方式', '时间', '免费', '付费', '会员',
    '正规', '靠谱', '最新', '2024', '2025', '大全', '汇总',
    '入门', '基础', '进阶', '高级', '专业', '详细', '完整', '简单', '快速', '高效', '精准',
    '电脑版', '网页版', '手机版', 'APP', '小程序', '公众号', '中文版', '官方版', '最新版',
    '已', '了', '的', '和', '与', '或', '及', '之', '于', '以', '为', '在', '有', '无',
    '不', '也', '都', '就', '才', '还', '又', '很', '非常', '太', '更', '我', '你', '他',
    '这', '那', '哪', '个', '款', '家', '种', '里', '中', '上', '下', '前', '后', '左', '右',
    '存入', '零钱', '微信', '支付宝', '银行卡', '账户', '账号', '密码', '验证码', '短信', '邮件'
]);

const GEOGRAPHIC_WORDS = new Set([
    '日本', '中国', '美国', '英国', '法国', '德国', '韩国', '新加坡',
    '北京', '上海', '广州', '深圳', '杭州', '南京', '武汉', '成都', '重庆', '天津',
    '东京', '纽约', '伦敦', '巴黎', '柏林', '首尔'
]);

const GENERIC_BUSINESS_WORDS = new Set([
    '公司', '企业', '有限', '科技', '网络', '信息', '服务', '咨询',
    '在线', '下单', '打样', '生产', '定制', '批发', '零售', '销售',
    '专业', '优质', '高效', '快速', '精准', '全面', '完善',
    '中国', '北京', '上海', '广州', '深圳', '杭州', '南京', '武汉',
    '成都', '重庆', '天津', '苏州', '宁波', '厦门', '青岛', '大连',
    '全国', '地区', '本地', '附近', '远程', '线上', '线下',
    '价格', '报价', '费用', '多少钱', '收费', '成本',
    '什么', '怎么', '如何', '哪个', '哪些', '哪里',
    '推荐', '排行', '排名', '排名榜', '十大', '哪个好',
    '作用', '功效', '效果', '副作用', '禁忌',
    '症状', '原因', '治疗', '预防', '护理',
    '官网', '官方', '首页', '入口', '平台', '网站',
    '电话', '地址', '联系方式', '客服',
    '加盟', '代理', '招商', '合作',
    '品牌', '品牌词', '竞品', '竞品词'
]);

let BRAND_WORDS = new Set();
let PRODUCT_WORDS = new Set();
let AUTO_COMPETITOR_WORDS = new Set();
let HAS_AUTO_EXTRACTED = false;
let CO_OCCURRENCE_INDEX = null;
let KEYWORD_BIGRAM_POOL = new Set();
let CUSTOM_KEYWORDS = new Set();
let CUSTOM_COMPETITOR_KEYWORDS = new Set();

function checkCompetitorWord(searchWord) {
    if (!searchWord) return false;
    const searchLower = searchWord.toLowerCase();
    for (const word of COMPETITOR_WORDS) if (searchLower.includes(word.toLowerCase())) return true;
    for (const word of AUTO_COMPETITOR_WORDS) if (searchLower.includes(word.toLowerCase())) return true;
    return false;
}

function checkCustomCompetitorKeyword(searchWord) {
    if (CUSTOM_COMPETITOR_KEYWORDS.size === 0) return false;
    const searchLower = searchWord.toLowerCase();
    for (const keyword of CUSTOM_COMPETITOR_KEYWORDS) if (searchLower.includes(keyword)) return true;
    return false;
}

function getProductWordBonus(swLower) {
    if (PRODUCT_WORDS.size === 0) return 0;
    const hasProductWord = Array.from(PRODUCT_WORDS).some(product => swLower.includes(product));
    return hasProductWord ? 2 : -1;
}

function getMeaningfulWordOverlap(keyword, searchWord) {
    const kw = keyword.toLowerCase().trim();
    const sw = searchWord.toLowerCase().trim();
    const separator = /[\s\-_,，.。！!?？;；:：、\/\\()（）【】\[\]{}"'「」~`]+/;
    const kwWords = kw.split(separator).filter(w => w.length > 0 && !UNIVERSAL_LOW_WORDS.has(w) && !GENERIC_BUSINESS_WORDS.has(w));
    const swWords = sw.split(separator).filter(w => w.length > 0 && !UNIVERSAL_LOW_WORDS.has(w) && !GENERIC_BUSINESS_WORDS.has(w));
    if (kwWords.length === 0 || swWords.length === 0) return 0;
    let overlapCount = 0;
    for (const kwWord of kwWords) {
        for (const swWord of swWords) {
            if (kwWord.includes(swWord) || swWord.includes(kwWord)) {
                overlapCount++;
                break;
            }
        }
    }
    return overlapCount / Math.min(kwWords.length, swWords.length);
}

function getCooccurrenceBonus(keyword, searchWord) {
    if (!CO_OCCURRENCE_INDEX || CO_OCCURRENCE_INDEX.size === 0) return 0;
    const kw = keyword.toLowerCase().trim();
    const sw = searchWord.toLowerCase().trim();
    const kwGrams = extractNGrams(kw, 2);
    const swGrams = extractNGrams(sw, 2);
    if (kwGrams.size === 0 || swGrams.size === 0) return 0;
    
    let totalHits = 0, totalChecks = 0;
    for (const sg of swGrams) {
        if (!CO_OCCURRENCE_INDEX.has(sg)) continue;
        const relatedMap = CO_OCCURRENCE_INDEX.get(sg);
        for (const kg of kwGrams) {
            totalChecks++;
            if (relatedMap.has(kg)) totalHits++;
        }
    }
    
    if (totalChecks === 0) return 0;
    const hitRate = totalHits / totalChecks;
    if (hitRate < 0.1) return 0;
    if (hitRate >= 0.5) return 3;
    if (hitRate >= 0.3) return 2;
    return 1;
}

function calculateSemanticScore(keyword, searchWord) {
    if (!keyword || !searchWord) return { score: 0, branch: 'empty_input' };
    const kwLower = keyword.toLowerCase().trim();
    const swLower = searchWord.toLowerCase().trim();

    if (checkCompetitorWord(searchWord) || checkCustomCompetitorKeyword(searchWord)) {
        let score = 5;
        const productBonus = getProductWordBonus(swLower);
        score = Math.max(1, Math.min(10, score + productBonus));
        return { score: Math.round(score), branch: '1-竞品词检测' };
    }
    
    if (kwLower === swLower) {
        return { score: 10, branch: '2-完全匹配' };
    }
    
    const shorter = kwLower.length <= swLower.length ? kwLower : swLower;
    const longer = kwLower.length > swLower.length ? kwLower : swLower;
    const hasIncludeRelation = longer.includes(shorter);
    if (hasIncludeRelation) {
        let score = 8;
        if (shorter.length >= longer.length * 0.6) {
            score = 9;
        }
        const productBonus = getProductWordBonus(swLower);
        score = Math.max(2, Math.min(10, score + productBonus));
        return { score: Math.round(score), branch: '3-包含关系' };
    }
    
    const hasBrandWord = Array.from(BRAND_WORDS).some(brand => swLower.includes(brand));
    if (hasBrandWord) {
        const chineseSim = calculateChineseSimilarity(kwLower, swLower);
        const productBonus = getProductWordBonus(swLower);
        let brandScore;
        if (productBonus > 0) {
            brandScore = 5 + chineseSim * 3 + productBonus;
        } else {
            brandScore = 3 + chineseSim * 5 + productBonus;
        }
        brandScore = Math.max(1, Math.min(10, brandScore));
        return { score: Math.round(brandScore), branch: '4-品牌词检测', chineseSim: chineseSim };
    }
    
    const chineseSim = calculateChineseSimilarity(kwLower, swLower);
    const wordOverlap = getMeaningfulWordOverlap(kwLower, swLower);
    let baseScore = chineseSim * 6 + wordOverlap * 3;
    
    let bonusScore = 0;
    bonusScore += getProductWordBonus(swLower);
    
    const cooccurBonus = getCooccurrenceBonus(kwLower, swLower);
    bonusScore += cooccurBonus;
    
    let finalScore = Math.min(Math.max(baseScore + bonusScore, 0), 10);
    
    const swWords = swLower.split(/[\s\-_,，.。！!?？;；:]+/).filter(w => w.length > 0);
    if (swWords.length > 0 && swWords.every(w => UNIVERSAL_LOW_WORDS.has(w))) {
        finalScore = Math.min(finalScore, 2);
    }
    
    return { score: Math.max(0, Math.round(finalScore)), branch: '5-语义相似度', chineseSim: chineseSim, baseScore: baseScore, bonusScore: bonusScore, wordOverlap: wordOverlap };
}

function extractKeywordCandidates(text) {
    const candidates = new Set();
    const separator = /[\s\-_+,，.。！!?？;；:：、\/\\()（）【】\[\]{}"'「」~`]+/;
    const segments = text.split(separator).filter(s => s.length > 0);
    
    segments.forEach(segment => {
        if (segment.length < 2) return;
        const hasChinese = /[\u4e00-\u9fa5]/.test(segment);
        const hasLatin = /[a-z]/.test(segment);
        
        if (hasChinese || hasLatin) {
            if (segment.length >= 2 && segment.length <= 30) candidates.add(segment);
            
            const chineseChars = segment.match(/[\u4e00-\u9fa5]{2,}/g);
            if (chineseChars) {
                chineseChars.forEach(cc => {
                    if (cc.length >= 2 && cc.length <= 8) candidates.add(cc);
                    for (let i = 0; i < cc.length - 1; i++) {
                        const bigram = cc.substring(i, i + 2);
                        if (!GENERIC_BUSINESS_WORDS.has(bigram) && !UNIVERSAL_LOW_WORDS.has(bigram)) candidates.add(bigram);
                    }
                    for (let i = 0; i < cc.length - 2; i++) candidates.add(cc.substring(i, i + 3));
                });
            }
            
            const engParts = segment.match(/[a-z]{2,}/g);
            if (engParts) engParts.forEach(ep => { if (ep.length >= 2 && !/^[a-z]{1,2}$/i.test(ep)) candidates.add(ep); });
        }
    });
    return candidates;
}

function isLikelyBrandWord(word) {
    if (/^[a-z]{2,6}$/i.test(word)) return true;
    if (/^[a-z]+\d+[a-z]*$/i.test(word)) return true;
    if (/^[a-z\d]{3,12}$/i.test(word) && /[a-z]/.test(word) && /\d/.test(word)) return true;
    return false;
}

function buildCooccurrenceIndex(rows, keywordCol, searchCol) {
    CO_OCCURRENCE_INDEX = null;
    KEYWORD_BIGRAM_POOL.clear();
    if (!rows || rows.length === 0) return;
    
    const coMatrix = new Map();
    const keywordBigramSet = new Set();
    
    rows.forEach(row => {
        const kw = (row[keywordCol] || '').toLowerCase().trim();
        const sw = (row[searchCol] || '').toLowerCase().trim();
        if (!kw || !sw) return;
        
        const kwGrams = extractNGrams(kw, 2);
        const swGrams = extractNGrams(sw, 2);
        
        kwGrams.forEach(g => keywordBigramSet.add(g));
        
        for (const kg of kwGrams) {
            if (!coMatrix.has(kg)) coMatrix.set(kg, new Map());
            const swMap = coMatrix.get(kg);
            for (const sg of swGrams) swMap.set(sg, (swMap.get(sg) || 0) + 1);
        }
        
        for (const sg of swGrams) {
            if (!coMatrix.has(sg)) coMatrix.set(sg, new Map());
            const kwMap = coMatrix.get(sg);
            for (const kg of kwGrams) kwMap.set(kg, (kwMap.get(kg) || 0) + 1);
        }
    });
    
    const filteredMatrix = new Map();
    for (const [bigram, relatedMap] of coMatrix) {
        const filtered = new Map();
        for (const [related, count] of relatedMap) if (count >= 2) filtered.set(related, count);
        if (filtered.size > 0) filteredMatrix.set(bigram, filtered);
    }
    
    CO_OCCURRENCE_INDEX = filteredMatrix;
    KEYWORD_BIGRAM_POOL = keywordBigramSet;
}

function extractAutoCompetitorWords(keywords, plans, groups) {
    if (HAS_AUTO_EXTRACTED) return;
    
    AUTO_COMPETITOR_WORDS.clear();
    if (!keywords || keywords.length === 0) return;

    const competitorGroupKeywords = [];
    
    for (let i = 0; i < Math.min((keywords || []).length, (plans || []).length); i++) {
        if (keywords[i] && plans[i]) {
            const planLower = plans[i].toLowerCase();
            if (planLower.includes('竞品')) {
                competitorGroupKeywords.push(keywords[i].toLowerCase().trim());
            }
        }
    }
    
    for (let i = 0; i < Math.min((keywords || []).length, (groups || []).length); i++) {
        if (keywords[i] && groups[i]) {
            const groupLower = groups[i].toLowerCase();
            if (groupLower.includes('竞品')) {
                competitorGroupKeywords.push(keywords[i].toLowerCase().trim());
            }
        }
    }
    
    const uniqueCompetitorKeywords = [...new Set(competitorGroupKeywords)];
    if (uniqueCompetitorKeywords.length < 2) return;

    const ngramFreq = {};
    uniqueCompetitorKeywords.forEach(kw => {
        for (let n = 2; n <= 6 && n <= kw.length; n++) {
            for (let i = 0; i <= kw.length - n; i++) {
                const substr = kw.substring(i, i + n);
                const chineseChars = substr.match(/[\u4e00-\u9fa5]/g);
                const englishChars = substr.match(/[a-z]/g);
                if ((chineseChars && chineseChars.length >= 2) || 
                    (englishChars && englishChars.length >= 2)) {
                    ngramFreq[substr] = (ngramFreq[substr] || 0) + 1;
                }
            }
        }
    });
    
    const ngramCoverage = {};
    Object.keys(ngramFreq).forEach(ngram => {
        let count = 0;
        uniqueCompetitorKeywords.forEach(kw => {
            if (kw.includes(ngram)) count++;
        });
        ngramCoverage[ngram] = count / uniqueCompetitorKeywords.length;
    });
    
    const minCoverage = uniqueCompetitorKeywords.length <= 3 ? 0.3 : 0.5;
    
    Object.entries(ngramFreq)
        .filter(([ngram, freq]) => {
            if (freq < 2) return false;
            if (/^\d+$/.test(ngram)) return false;
            if (ngramCoverage[ngram] < minCoverage) return false;
            if (GENERIC_BUSINESS_WORDS.has(ngram) || UNIVERSAL_LOW_WORDS.has(ngram)) return false;
            if (BRAND_WORDS.has(ngram) || PRODUCT_WORDS.has(ngram)) return false;
            return true;
        })
        .sort((a, b) => {
            const coverageDiff = ngramCoverage[b[0]] - ngramCoverage[a[0]];
            if (coverageDiff !== 0) return coverageDiff;
            return b[1] - a[1];
        })
        .slice(0, 5)
        .forEach(([ngram]) => {
            let isBrandRelated = false;
            for (const brand of BRAND_WORDS) {
                if (ngram.includes(brand) || brand.includes(ngram)) {
                    isBrandRelated = true;
                    break;
                }
            }
            if (!isBrandRelated) {
                AUTO_COMPETITOR_WORDS.add(ngram);
            }
        });
}

function extractBrandAndProductWords(keywords, plans, groups) {
    if (HAS_AUTO_EXTRACTED) return;
    
    BRAND_WORDS.clear();
    PRODUCT_WORDS.clear();
    
    if ((!keywords || keywords.length === 0) && (!plans || plans.length === 0) && (!groups || groups.length === 0)) return;

    const productCandidateFreq = {};
    (keywords || []).forEach(kw => {
        if (!kw || kw.trim() === '') return;
        const kwStr = kw.toLowerCase().trim();
        const candidates = extractKeywordCandidates(kwStr);
        candidates.forEach(word => productCandidateFreq[word] = (productCandidateFreq[word] || 0) + 1);
    });

    const uniquePlans = [...new Set((plans || []).filter(p => p && p.trim() !== ''))];
    uniquePlans.forEach(plan => {
        if (!plan) return;
        const planStr = plan.trim();
        
        const match1 = planStr.match(/^(.+?)品牌词[-_\s]/i);
        if (match1) {
            const brand = match1[1].trim();
            if (brand.length >= 1 && brand.length <= 10) {
                BRAND_WORDS.add(brand.toLowerCase());
            }
            return;
        }
        
        const match2 = planStr.match(/^(.+?)品牌[-_\s]/i);
        if (match2) {
            const brand = match2[1].trim();
            if (brand.length >= 1 && brand.length <= 10) {
                BRAND_WORDS.add(brand.toLowerCase());
            }
        }
    });

    // 从包含"品牌"的推广组关键词中提取品牌特征（仅提取6字以上完整短语）
    const brandGroupKeywords = [];
    for (let i = 0; i < Math.min((keywords || []).length, (groups || []).length); i++) {
        if (keywords[i] && groups[i]) {
            const groupLower = groups[i].toLowerCase();
            if (groupLower.includes('品牌')) {
                brandGroupKeywords.push(keywords[i].toLowerCase().trim());
            }
        }
    }
    
    if (brandGroupKeywords.length >= 2) {
        const fullPhraseFreq = {};
        brandGroupKeywords.forEach(kw => {
            if (kw.length >= 4) {
                fullPhraseFreq[kw] = (fullPhraseFreq[kw] || 0) + 1;
            }
        });
        
        Object.entries(fullPhraseFreq)
            .filter(([phrase, freq]) => freq >= 2)
            .forEach(([phrase]) => {
                if (phrase.length >= 6) {
                    BRAND_WORDS.add(phrase);
                }
            });
    }

    const allKwCandidates = {};
    (keywords || []).forEach(kw => {
        if (!kw || kw.trim() === '') return;
        const kwStr = kw.toLowerCase().trim();
        const candidates = extractKeywordCandidates(kwStr);
        candidates.forEach(word => allKwCandidates[word] = (allKwCandidates[word] || 0) + 1);
    });
    
    Object.entries(allKwCandidates).forEach(([word, freq]) => {
        if (isLikelyBrandWord(word)) {
            BRAND_WORDS.add(word);
        }
    });

    if (Object.keys(productCandidateFreq).length === 0) return;

    const sortedTerms = Object.entries(productCandidateFreq)
        .sort((a, b) => b[1] - a[1])
        .filter(([word, freq]) => {
            if (word.length < 2) return false;
            if (/^\d+$/.test(word)) return false;
            if (GENERIC_BUSINESS_WORDS.has(word)) return false;
            if (UNIVERSAL_LOW_WORDS.has(word)) return false;
            if (COMPETITOR_WORDS.has(word)) return false;
            if (GEOGRAPHIC_WORDS.has(word)) return false;
            if (word.includes('品牌词') || word.includes('牌词')) return false;
            if (/^[\u4e00-\u9fa5]{2,}$/.test(word) && !word.match(/[a-z0-9]/)) {
                const regionChars = ['京', '津', '沪', '渝', '冀', '豫', '云', '辽', '黑', '湘', '皖', '鲁', '新', '苏', '浙', '赣', '鄂', '桂', '甘', '晋', '蒙', '陕', '吉', '闽', '贵', '粤', '青', '藏', '川', '宁', '琼'];
                const regionCount = regionChars.filter(r => word.includes(r)).length;
                if (regionCount >= 3) return false;
            }
            if (word.length === 2 && /^[\u4e00-\u9fa5]{2}$/.test(word)) {
                const commonPairs = ['培训', '留学', '会计', '英语', '日本', '中介', '服务', '咨询', '教育', '课程', '学习', '考试', '报名', '申请', '费用', '价格', '机构', '学校', '老师', '学生', '工作', '实习', '就业', '面试', '简历', '招聘'];
                if (!commonPairs.includes(word) && !isLikelyBrandWord(word)) {
                    return false;
                }
            }
            const totalKwCount = (keywords || []).filter(k => k && k.trim()).length;
            if (totalKwCount <= 5) return freq >= 1;
            return freq >= 2;
        });

    sortedTerms.forEach(([word, freq]) => {
        if (BRAND_WORDS.has(word)) return;
        const maxProductCount = Math.min(15, Math.max(2, Math.floor(sortedTerms.length * 0.6)));
        if (PRODUCT_WORDS.size < maxProductCount) {
            PRODUCT_WORDS.add(word);
        }
    });

    extractAutoCompetitorWords(keywords, plans, groups);
    
    HAS_AUTO_EXTRACTED = true;
}

const csvText = fs.readFileSync('test_data.csv', 'utf-8');
const lines = csvText.trim().split('\n');
const headers = lines[0].split(',');
const data = [];

for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',');
    const row = {};
    headers.forEach((h, idx) => {
        row[h.trim()] = (vals[idx] || '').trim();
    });
    data.push(row);
}

console.log(`共读取 ${data.length} 行数据\n`);

const keywordCol = '关键词';
const searchCol = '搜索词';
const planCol = '推广计划';
const groupCol = '推广组';

const keywords = data.map(row => row[keywordCol]).filter(kw => kw && kw.trim() !== '');
const plans = data.map(row => row[planCol]).filter(p => p);
const groups = data.map(row => row[groupCol]).filter(g => g);

buildCooccurrenceIndex(data, keywordCol, searchCol);

extractBrandAndProductWords(keywords, plans, groups);

console.log('========== BRAND_WORDS (品牌词) ==========');
console.log([...BRAND_WORDS]);
console.log();

console.log('========== PRODUCT_WORDS (核心产品词) ==========');
console.log([...PRODUCT_WORDS]);
console.log();

console.log('========== AUTO_COMPETITOR_WORDS (自动识别竞品词) ==========');
console.log([...AUTO_COMPETITOR_WORDS]);
console.log();

console.log('========== 优化后评分结果 ==========\n');

data.forEach((row, idx) => {
    const keyword = row[keywordCol] || '';
    const searchWord = row[searchCol] || '';
    
    const result = calculateSemanticScore(keyword, searchWord);
    
    let detail = '';
    if (result.branch === '5-语义相似度') {
        detail = ` sim=${result.chineseSim.toFixed(4)} overlap=${result.wordOverlap.toFixed(4)} base=${result.baseScore.toFixed(2)} bonus=${result.bonusScore}`;
    } else if (result.branch === '4-品牌词检测') {
        detail = ` sim=${result.chineseSim.toFixed(4)}`;
    }
    
    const rowNum = idx + 1;
    console.log(`行${rowNum}: ${keyword} → ${searchWord}`);
    console.log(`   评分: ${result.score} | 分支: ${result.branch}${detail}`);
    
    const swLower = searchWord.toLowerCase().trim();
    const matchedProductWords = Array.from(PRODUCT_WORDS).filter(p => swLower.includes(p));
    const matchedBrandWords = Array.from(BRAND_WORDS).filter(b => swLower.includes(b));
    if (matchedProductWords.length > 0) {
        console.log(`   命中产品词: [${matchedProductWords.join(', ')}] → +2`);
    } else if (PRODUCT_WORDS.size > 0) {
        console.log(`   未命中产品词 → -1`);
    }
    if (matchedBrandWords.length > 0) {
        console.log(`   命中品牌词: [${matchedBrandWords.join(', ')}]`);
    }
    
    const isCompetitor = checkCompetitorWord(searchWord) || checkCustomCompetitorKeyword(searchWord);
    if (isCompetitor) {
        console.log(`   命中竞品词 → 竞品分支`);
    }
    console.log();
});
