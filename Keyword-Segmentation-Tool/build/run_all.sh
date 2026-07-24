#!/bin/bash
cd "$(dirname "$0")"
pids=()
for i in 0 1 2 3 4 5 6 7; do
  node --max-old-space-size=2048 audit_v3.mjs "slices_v3/slice_${i}.json" "slices_v3/partial_${i}.json" 50000 > "slices_v3/log_${i}.txt" 2>&1 &
  pids+=($!)
done
echo "启动 ${#pids[@]} 个并行agent, PIDs: ${pids[@]}"
for pid in "${pids[@]}"; do wait $pid; done
echo "ALL_DONE"
