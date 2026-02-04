
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
建議保存到: `tensorboard_screenshots/` 目錄下
文件命名格式: `圖表名稱.png`

生成時間: 2026-02-03 22:33:06
