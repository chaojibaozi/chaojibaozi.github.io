import sys
import time
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

options = uc.ChromeOptions()
options.add_argument("--headless=new")
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")
options.add_argument("--window-size=1280,2000")
options.add_argument("--enable-logging")
options.set_capability("goog:loggingPrefs", {"browser": "ALL"})

driver = uc.Chrome(options=options, version_main=148)

try:
    driver.get("http://localhost:8000/test-transformers.html")
    time.sleep(2)

    driver.save_screenshot("d:\\GitHub-tongbuwenjianjia\\Mysystem\\chaojibaozi.github.io\\_initial.png")

    print("等待模型加载 35 秒...", flush=True)
    for i in range(35):
        time.sleep(1)
        if i % 5 == 4:
            print(f"  已等待 {i+1} 秒...", flush=True)

    print("\n=== 页面元素内容 ===", flush=True)
    try:
        status_el = driver.find_element(By.ID, "status")
        status_text = status_el.text
        status_class = status_el.get_attribute("class")
        print(f"status 元素 class: {status_class}", flush=True)
        print(f"status 元素文本: {status_text}", flush=True)
    except Exception as e:
        print(f"获取 status 元素失败: {e}", flush=True)

    try:
        log_el = driver.find_element(By.ID, "log")
        log_text = log_el.text
        print(f"\nlog 内容:\n{log_text}", flush=True)
    except Exception as e:
        print(f"获取 log 元素失败: {e}", flush=True)

    print("\n=== 浏览器控制台日志 ===", flush=True)
    logs = driver.get_log("browser")
    for entry in logs[-50:]:
        level = entry["level"]
        msg = entry["message"]
        print(f"[{level}] {msg}", flush=True)

    driver.save_screenshot("d:\\GitHub-tongbuwenjianjia\\Mysystem\\chaojibaozi.github.io\\test_result.png")
    full = driver.execute_script("return document.body.scrollHeight")
    driver.set_window_size(1280, full)
    time.sleep(1)
    driver.save_screenshot("d:\\GitHub-tongbuwenjianjia\\Mysystem\\chaojibaozi.github.io\\test_result_full.png")
    print(f"\n全页高度: {full}px, 截图已保存", flush=True)

finally:
    driver.quit()
