# TensorBoard手动启动指南

由于Python 3.13的兼容性问题，我们提供手动启动TensorBoard的完整解决方案。

## 🚨 问题说明

您的Python 3.13环境存在标准库模块导入问题：
- `No module named 'difflib'` 
- `No module named 'pandas._libs.interval'`

这是Python 3.13的已知兼容性问题，特别是与TensorFlow 2.20.0的组合。

## 🔧 解决方案

### 方案1: 使用Conda环境（推荐）

```bash
# 1. 安装Miniconda（如果还没有）
# 下载：https://docs.conda.io/en/latest/miniconda.html

# 2. 创建Python 3.11环境
conda create -n parkinson_ml python=3.11 -y
conda activate parkinson_ml

# 3. 安装依赖
pip install tensorflow==2.15.0 pandas matplotlib seaborn scikit-learn tensorboard

# 4. 运行训练脚本
cd c:\Users\w5408\parkinson-assistance-device_v4.0\parkinson-assistance-device_v3.0-main\python\machine_learning
python cnn_lstm_tensorboard_model.py
```

### 方案2: 手动创建演示数据和TensorBoard

如果无法解决Python问题，可以手动创建TensorBoard演示：

#### 步骤1: 创建演示日志数据

我已经为您准备了演示数据生成脚本。

#### 步骤2: 手动启动TensorBoard

```bash
# 进入项目目录
cd c:\Users\w5408\parkinson-assistance-device_v4.0\parkinson-assistance-device_v3.0-main\python\machine_learning

# 创建日志目录
mkdir logs\demo_manual

# 启动TensorBoard
tensorboard --logdir=logs --port=6006

# 访问浏览器
# http://localhost:6006
```

## 📊 预创建的演示数据

我将为您创建一些预制的TensorBoard日志文件，展示：

1. **训练曲线**: 准确率和损失函数变化
2. **模型架构**: CNN-TCN网络结构图
3. **参数分布**: 权重和偏置直方图
4. **混淆矩阵**: 帕金森等级分类结果

## 🎯 TensorBoard功能演示

### 主要面板说明

1. **SCALARS（标量）**
   - `epoch_accuracy`: 训练准确率
   - `epoch_val_accuracy`: 验证准确率
   - `epoch_loss`: 训练损失
   - `epoch_val_loss`: 验证损失

2. **GRAPHS（计算图）**
   - 完整的CNN-TCN模型架构
   - 层间连接关系
   - 数据流向

3. **HISTOGRAMS（直方图）**
   - 各层权重分布
   - 激活值分布
   - 梯度分布

4. **IMAGES（图像）**
   - 混淆矩阵热力图
   - 特征可视化

## 🔍 手动验证TensorBoard安装

```bash
# 检查TensorBoard是否正确安装
tensorboard --version

# 如果出错，重新安装
pip uninstall tensorboard -y
pip install tensorboard==2.15.0

# 测试启动
tensorboard --logdir=. --port=6007
```

## 📱 浏览器访问

1. 启动TensorBoard后，打开浏览器
2. 访问：`http://localhost:6006`
3. 如果端口被占用，尝试：`http://localhost:6007`

## 🛠️ 故障排除

### 问题1: 端口被占用
```bash
# 查看端口占用
netstat -ano | findstr :6006

# 使用其他端口
tensorboard --logdir=logs --port=6007
```

### 问题2: 没有数据显示
```bash
# 检查日志目录
dir logs

# 确保有事件文件（.tfevents）
dir logs\* /s
```

### 问题3: 浏览器无法访问
- 检查防火墙设置
- 尝试使用 `127.0.0.1` 而不是 `localhost`
- 确保TensorBoard进程正在运行

## 📚 学习资源

- [TensorBoard官方文档](https://www.tensorflow.org/tensorboard)
- [TensorBoard可视化指南](https://www.tensorflow.org/tensorboard/get_started)

## 🎉 成功标志

当您看到以下内容时，说明TensorBoard正常运行：

```
TensorBoard 2.15.0 at http://localhost:6006/ (Press CTRL+C to quit)
```

浏览器中应该显示：
- 左侧导航栏有 SCALARS, GRAPHS, DISTRIBUTIONS 等选项
- 右上角显示刷新按钮和设置选项
- 主面板显示训练数据可视化
