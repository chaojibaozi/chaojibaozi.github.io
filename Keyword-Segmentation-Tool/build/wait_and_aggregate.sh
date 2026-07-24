#!/usr/bin/env bash
# 监视 8 个 partial_*.json 落盘后自动合并生成最终报告。
# 后台运行；原 run_all.sh 的后台任务跟踪已丢失，故改用文件系统监视兜底。
BASE=/d/BianCheng/Keyword-Segmentation-Tool
SL="$BASE/build/slices_v3"
echo "monitor start: $(date)"
for i in $(seq 1 240); do
  n=$(ls "$SL"/partial_*.json 2>/dev/null | wc -l)
  if [ "$n" -ge 8 ]; then
    echo "ALL 8 PARTIALS PRESENT at iter $i ($(date))"
    break
  fi
  sleep 20
done
echo "partials found: $(ls "$SL"/partial_*.json 2>/dev/null | wc -l)"
cd "$BASE"
node build/aggregate_v3.mjs
echo "AGGREGATE_DONE_EXIT=$?"
echo "report: $BASE/更细行业分词逻辑压测报告.txt"
ls -la "$BASE/更细行业分词逻辑压测报告.txt" 2>/dev/null
