@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  AI 智能助手 - 启动中...
echo ============================================
echo.
echo 启动 HTTP 服务...
start http://localhost:8000
python -m http.server 8000
echo.
pause
