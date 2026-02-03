# 帕金森症模型TensorBoard可视化指南

## 快速开始

### 1. 环境准备

确保已安装必要的Python包：

```bash
pip install tensorflow numpy pandas matplotlib seaborn scikit-learn tensorboard
```

### 2. 一键启动训练和可视化

```bash
cd python/machine_learning
python run_tensorboard_training.py
```

这将自动：
- ✅ 检查依赖包
- 📊 生成合成帕金森症数据
- 🚀 启动TensorBoard服务器
- 🎯 训练CNN-TCN模型
- 🌐 自动打开浏览器查看可视化

### 3. 手动步骤（可选）

如果需要分步执行：

#### 步骤1: 生成合成数据
```python
from synthetic_data_generator import ParkinsonSyntheticDataGenerator

generator = ParkinsonSyntheticDataGenerator()
generator.generate_dataset(num_patients_per_level=15, output_dir="data")
```

#### 步骤2: 训练模型
```python
from cnn_lstm_tensorboard_model import ParkinsonCNNLSTMTensorBoardModel

model = ParkinsonCNNLSTMTensorBoardModel()
df = model.load_synthetic_data("data")
model.train_model_with_tensorboard(df, epochs=30)
```

#### 步骤3: 启动TensorBoard
```bash
tensorboard --logdir=logs --port=6006
```

然后访问: http://localhost:6006

## TensorBoard可视化内容

### 📊 训练监控面板

1. **SCALARS（标量）**
   - `epoch_accuracy` / `epoch_val_accuracy`: 训练/验证准确率
   - `epoch_loss` / `epoch_val_loss`: 训练/验证损失
   - `learning_rate`: 学习率变化
   - `gradients/avg_norm`: 梯度范数

2. **GRAPHS（计算图）**
   - CNN-TCN模型完整架构
   - 层间连接和数据流向
   - 操作节点详细信息

3. **DISTRIBUTIONS（分布）**
   - 各层权重分布变化
   - 激活值分布
   - 梯度分布

4. **HISTOGRAMS（直方图）**
   - 权重直方图随训练变化
   - 偏置参数变化
   - 批归一化参数

5. **IMAGES（图像）**
   - 混淆矩阵热力图
   - 模型权重可视化
   - 特征图可视化

### 📈 自定义指标

- **数据集统计**
  - `dataset/total_samples`: 总样本数
  - `dataset/training_samples`: 训练样本数
  - `dataset/level_X_count`: 各等级样本数量

- **特征统计**
  - `features/finger_X_mean`: 手指传感器均值
  - `features/emg_mean`: EMG信号均值
  - `features/imu_X_mean`: IMU传感器均值

- **评估指标**
  - `evaluation/等级X_precision`: 各等级精确率
  - `evaluation/等级X_recall`: 各等级召回率
  - `evaluation/等级X_f1-score`: 各等级F1分数

## 数据说明

### 合成数据特征

生成的合成数据模拟真实帕金森症患者的传感器信号：

#### 🖐️ 手指弯曲传感器 (5维)
- **小指到拇指**: 基础弯曲度 + 震颤 + 僵直 + 协调性损失
- **震颤频率**: 4.5-6.5 Hz（典型帕金森震颤）
- **等级差异**: 震颤幅度随等级增加

#### 💪 EMG肌电信号 (1维)
- **肌肉激活**: 与手指运动相关
- **肌肉疲劳**: 随时间累积
- **震颤成分**: 与手指震颤相关但有延迟

#### 📱 IMU惯性传感器 (3维)
- **X/Y/Z轴**: 手部运动加速度
- **运动协调**: 不协调表现为不规则变化
- **震颤检测**: 高频振动成分

### 帕金森等级特征

| 等级 | 震颤幅度 | 震颤频率 | 僵直程度 | 协调损失 | 疲劳率 |
|------|----------|----------|----------|----------|--------|
| 1级  | 0.05     | 4.5 Hz   | 0.1      | 0.05     | 0.02   |
| 2级  | 0.12     | 5.0 Hz   | 0.2      | 0.15     | 0.05   |
| 3级  | 0.25     | 5.5 Hz   | 0.35     | 0.3      | 0.08   |
| 4级  | 0.4      | 6.0 Hz   | 0.5      | 0.5      | 0.12   |
| 5级  | 0.6      | 6.5 Hz   | 0.7      | 0.7      | 0.15   |

## 模型架构

### CNN-TCN混合架构

```
输入 [50×9] 
    ↓
Conv1D (16 filters) + BatchNorm
    ↓
SeparableConv1D (32 filters) + BatchNorm
    ↓
TCN Block 1 (dilation=1) + Residual
    ↓
TCN Block 2 (dilation=2) + Residual
    ↓
GlobalAveragePooling1D
    ↓
Dense(32) + Dropout(0.2)
    ↓
Dense(5, softmax) → [等级1-5]
```

### 关键特性

- **参数量**: ~15K (适合Arduino部署)
- **输入**: 50个时间步 × 9个特征
- **输出**: 5个帕金森等级概率
- **优化**: INT8量化支持

## 使用技巧

### 🔍 分析训练过程

1. **监控过拟合**
   - 观察训练/验证准确率差距
   - 验证损失是否开始上升

2. **学习率调优**
   - 查看学习率调度曲线
   - 观察损失下降趋势

3. **模型收敛**
   - 梯度范数是否稳定
   - 权重分布是否合理

### 📊 性能分析

1. **混淆矩阵**
   - 哪些等级容易混淆
   - 分类边界是否清晰

2. **特征重要性**
   - 哪些传感器贡献最大
   - 时序模式是否被捕获

3. **数据质量**
   - 各等级样本是否平衡
   - 特征分布是否合理

## 故障排除

### 常见问题

1. **TensorBoard无法启动**
   ```bash
   # 检查端口占用
   netstat -ano | findstr :6006
   
   # 使用不同端口
   tensorboard --logdir=logs --port=6007
   ```

2. **内存不足**
   ```python
   # 减少批次大小
   model.train_model_with_tensorboard(df, batch_size=8)
   ```

3. **训练过慢**
   ```python
   # 减少数据量
   generator.generate_dataset(num_patients_per_level=5)
   ```

### 性能优化

1. **GPU加速**
   ```python
   # 检查GPU可用性
   print(tf.config.list_physical_devices('GPU'))
   ```

2. **数据预处理**
   ```python
   # 使用tf.data管道
   dataset = tf.data.Dataset.from_tensor_slices((X, y))
   dataset = dataset.batch(32).prefetch(tf.data.AUTOTUNE)
   ```

## 扩展功能

### 添加自定义指标

```python
class CustomCallback(keras.callbacks.Callback):
    def on_epoch_end(self, epoch, logs=None):
        # 自定义指标计算
        custom_metric = calculate_custom_metric()
        tf.summary.scalar('custom/metric', custom_metric, step=epoch)
```

### 实时数据接入

```python
def real_data_generator():
    """接入真实Arduino数据"""
    # 从串口读取数据
    # 实时预处理
    # 返回标准格式
    pass
```

## 下一步

1. **模型优化**: 尝试不同架构和超参数
2. **数据增强**: 添加噪声和变换
3. **实时部署**: 集成Arduino数据流
4. **临床验证**: 与真实患者数据对比

---

📧 如有问题，请查看日志文件或联系开发团队
