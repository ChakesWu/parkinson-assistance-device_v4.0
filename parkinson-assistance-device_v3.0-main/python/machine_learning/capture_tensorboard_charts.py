#!/usr/bin/env python3
"""
TensorBoard圖表截圖工具
使用Selenium自動化瀏覽器來截取TensorBoard圖表
"""

import os
import time
import json
from datetime import datetime

# 檢查selenium是否可用
try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.chrome.options import Options
    SELENIUM_AVAILABLE = True
except ImportError:
    SELENIUM_AVAILABLE = False
    print("⚠️  Selenium不可用，將使用替代方案")

class TensorBoardChartCapture:
    """TensorBoard圖表截圖器"""
    
    def __init__(self, tensorboard_url="http://localhost:6006"):
        self.tensorboard_url = tensorboard_url
        self.output_dir = "tensorboard_screenshots"
        os.makedirs(self.output_dir, exist_ok=True)
        self.driver = None
        
    def setup_browser(self):
        """設置瀏覽器"""
        if not SELENIUM_AVAILABLE:
            return False
            
        try:
            chrome_options = Options()
            chrome_options.add_argument("--headless")  # 無頭模式
            chrome_options.add_argument("--no-sandbox")
            chrome_options.add_argument("--disable-dev-shm-usage")
            chrome_options.add_argument("--window-size=1920,1080")
            
            self.driver = webdriver.Chrome(options=chrome_options)
            return True
        except Exception as e:
            print(f"❌ 瀏覽器設置失敗: {e}")
            return False
    
    def capture_chart(self, chart_name, element_selector, filename):
        """截取特定圖表"""
        try:
            # 等待元素加載
            wait = WebDriverWait(self.driver, 10)
            element = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, element_selector)))
            
            # 滾動到元素位置
            self.driver.execute_script("arguments[0].scrollIntoView();", element)
            time.sleep(2)
            
            # 截圖
            screenshot_path = os.path.join(self.output_dir, filename)
            element.screenshot(screenshot_path)
            
            print(f"✅ {chart_name} 截圖已保存: {filename}")
            return True
            
        except Exception as e:
            print(f"❌ {chart_name} 截圖失敗: {e}")
            return False
    
    def capture_all_charts(self):
        """截取所有圖表"""
        if not SELENIUM_AVAILABLE:
            print("❌ Selenium不可用，無法進行自動截圖")
            return self.create_manual_instructions()
        
        if not self.setup_browser():
            return False
        
        try:
            print(f"🌐 訪問TensorBoard: {self.tensorboard_url}")
            self.driver.get(self.tensorboard_url)
            
            # 等待頁面加載
            time.sleep(5)
            
            # 定義要截取的圖表
            charts_to_capture = [
                {
                    'name': 'Epoch Accuracy',
                    'tab': 'scalars',
                    'selector': '[data-name="epoch_accuracy"]',
                    'filename': 'epoch_accuracy.png'
                },
                {
                    'name': 'Epoch Loss', 
                    'tab': 'scalars',
                    'selector': '[data-name="epoch_loss"]',
                    'filename': 'epoch_loss.png'
                },
                {
                    'name': 'Learning Rate',
                    'tab': 'scalars', 
                    'selector': '[data-name="learning_rate"]',
                    'filename': 'learning_rate.png'
                }
            ]
            
            captured_count = 0
            
            for chart in charts_to_capture:
                print(f"📊 截取圖表: {chart['name']}")
                
                # 切換到對應標籤頁
                if chart['tab'] == 'scalars':
                    scalars_tab = self.driver.find_element(By.LINK_TEXT, "SCALARS")
                    scalars_tab.click()
                    time.sleep(3)
                
                # 截取圖表
                if self.capture_chart(chart['name'], chart['selector'], chart['filename']):
                    captured_count += 1
            
            print(f"\n🎉 截圖完成！成功截取 {captured_count} 個圖表")
            return captured_count > 0
            
        except Exception as e:
            print(f"❌ 截圖過程出錯: {e}")
            return False
        finally:
            if self.driver:
                self.driver.quit()
    
    def create_manual_instructions(self):
        """創建手動截圖說明"""
        instructions = f"""
# TensorBoard圖表手動截圖指南

由於自動化工具不可用，請按以下步驟手動截取圖表：

## 1. 啟動TensorBoard
```bash
# 使用Docker啟動（推薦）
docker run --rm -p 6007:6006 -v "./logs:/logs" tensorflow/tensorflow:latest tensorboard --logdir=/logs --host=0.0.0.0 --port=6006

# 然後訪問: http://localhost:6007
```

## 2. 截取圖表步驟

### 📊 Scalars標籤頁
1. 點擊 "SCALARS" 標籤
2. 找到以下圖表並截圖：
   - **epoch_accuracy** - 訓練準確率曲線
   - **epoch_loss** - 訓練損失曲線  
   - **learning_rate** - 學習率調度曲線
   - **model/total_parameters** - 模型參數統計

### 📈 Histograms標籤頁  
1. 點擊 "HISTOGRAMS" 標籤
2. 截取權重分布圖：
   - **conv1d_1/kernel_0** - 卷積層權重
   - **batch_norm_1/beta_0** - BatchNorm參數
   - **dense_features/kernel_0** - 全連接層權重
   - **parkinson_classification/kernel_0** - 分類層權重

### 🏗️ Graphs標籤頁
1. 點擊 "GRAPHS" 標籤  
2. 截取模型架構圖

## 3. 截圖技巧
- 使用瀏覽器的開發者工具調整圖表大小
- 右鍵點擊圖表 → "檢查元素" → 找到SVG元素
- 或使用截圖工具（如Snipping Tool）直接截取

## 4. 保存位置
建議保存到: `{self.output_dir}/` 目錄下
文件命名格式: `圖表名稱.png`

生成時間: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
"""
        
        # 保存說明文件
        instructions_path = os.path.join(self.output_dir, "manual_screenshot_guide.md")
        with open(instructions_path, 'w', encoding='utf-8') as f:
            f.write(instructions)
        
        print(f"📋 手動截圖指南已保存: {instructions_path}")
        return True

def main():
    """主程序"""
    print("📸 TensorBoard圖表截圖工具")
    print("="*50)
    
    # 檢查TensorBoard是否運行
    import urllib.request
    import urllib.error
    
    tensorboard_urls = [
        "http://localhost:6006",
        "http://localhost:6007", 
        "http://localhost:6008"
    ]
    
    active_url = None
    for url in tensorboard_urls:
        try:
            urllib.request.urlopen(url, timeout=3)
            active_url = url
            print(f"✅ 找到運行中的TensorBoard: {url}")
            break
        except:
            continue
    
    if not active_url:
        print("❌ 未找到運行中的TensorBoard")
        print("💡 請先啟動TensorBoard:")
        print("   docker run --rm -p 6007:6006 -v \"./logs:/logs\" tensorflow/tensorflow:latest tensorboard --logdir=/logs --host=0.0.0.0 --port=6006")
        
        # 仍然創建手動說明
        capturer = TensorBoardChartCapture()
        capturer.create_manual_instructions()
        return
    
    # 開始截圖
    capturer = TensorBoardChartCapture(active_url)
    
    try:
        success = capturer.capture_all_charts()
        if success:
            print(f"\n✅ 圖表截圖完成！")
            print(f"📁 圖片保存在: {capturer.output_dir}")
        else:
            print(f"\n⚠️  自動截圖失敗，請查看手動說明")
    except Exception as e:
        print(f"\n❌ 截圖過程出錯: {e}")

if __name__ == "__main__":
    main()
