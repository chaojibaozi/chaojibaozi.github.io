# PowerShell script to download all-MiniLM-L6-v2 model files
$BASE_URL = "https://hf-mirror.com/Xenova/all-MiniLM-L6-v2/resolve/main"
$OUTPUT_DIR = "D:\GitHub-tongbuwenjianjia\Mysystem\chaojibaozi.github.io\models\Xenova\all-MiniLM-L6-v2"

$files = @(
    "config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "vocab.txt"
)

foreach ($file in $files) {
    $url = "$BASE_URL/$file"
    $output = "$OUTPUT_DIR/$file"
    Write-Host "Downloading $file ..."
    $wc = New-Object System.Net.WebClient
    $wc.DownloadFile($url, $output)
    $size = (Get-Item $output).Length
    Write-Host "  Done! Size: $size bytes"
}

# Download the big model file
$url = "$BASE_URL/onnx/model_quantized.onnx"
$output = "$OUTPUT_DIR/onnx/model_quantized.onnx"
Write-Host "Downloading model_quantized.onnx (this may take a while)..."
$wc = New-Object System.Net.WebClient
$wc.DownloadFile($url, $output)
$size = (Get-Item $output).Length
Write-Host "Done! Size: $($size/1MB) MB"

Write-Host "All downloads complete!"
