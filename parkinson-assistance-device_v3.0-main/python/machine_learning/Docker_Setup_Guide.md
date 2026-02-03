# Docker TensorBoard 完整设置指南

## 🐳 Docker解决方案

由于您的Python 3.13和Anaconda环境存在兼容性问题，Docker提供了一个完全隔离、可靠的解决方案。

## 📋 前置要求

### 1. 安装Docker Desktop
- 下载：https://www.docker.com/products/docker-desktop/
- 安装后重启电脑
- 确保Docker Desktop正在运行

### 2. 验证Docker安装
```bash
docker --version
docker-compose --version
```

## 🚀 快速启动

### 方法1: 一键启动（推荐）
```bash
# 进入项目目录
cd c:\Users\w5408\parkinson-assistance-device_v4.0\parkinson-assistance-device_v3.0-main\python\machine_learning

# 构建并启动容器
docker-compose up --build
```

这将自动：
- 🏗️ 构建Python 3.11环境
- 📦 安装所有依赖包
- 📊 生成合成帕金森症数据
- 🎯 训练CNN-TCN模型
- 🌐 启动TensorBoard服务器

### 方法2: 分步执行
```bash
# 1. 构建镜像
docker build -t parkinson-ml .

# 2. 生成数据
docker run --rm -v ${PWD}/data:/app/data parkinson-ml python synthetic_data_generator.py

# 3. 训练模型
docker run --rm -v ${PWD}/logs:/app/logs -v ${PWD}/data:/app/data parkinson-ml python cnn_lstm_tensorboard_model.py

# 4. 启动TensorBoard
docker run -p 6006:6006 -v ${PWD}/logs:/app/logs parkinson-ml tensorboard --logdir=/app/logs --host=0.0.0.0
```

## 📊 访问TensorBoard

训练开始后，在浏览器中访问：
- **本地访问**: http://localhost:6006
- **网络访问**: http://你的IP地址:6006

## 🔧 Docker命令详解

### 查看容器状态
```bash
docker ps                    # 查看运行中的容器
docker logs parkinson_tensorboard  # 查看容器日志
```

### 进入容器调试
```bash
docker exec -it parkinson_tensorboard bash
```

### 停止和清理
```bash
docker-compose down          # 停止容器
docker system prune -f       # 清理未使用的资源
```

## 📁 文件结构

```
machine_learning/
├── Dockerfile              # Docker镜像定义
├── docker-compose.yml      # 容器编排配置
├── requirements.txt         # Python依赖
├── synthetic_data_generator.py
├── cnn_lstm_tensorboard_model.py
├── data/                    # 数据目录（挂载到宿主机）
└── logs/                    # 日志目录（挂载到宿主机）
```

## 🎯 TensorBoard功能

### 主要面板
1. **SCALARS**: 训练指标曲线
2. **GRAPHS**: 模型架构图
3. **HISTOGRAMS**: 参数分布
4. **IMAGES**: 混淆矩阵等图像

### 实时监控
- 训练/验证准确率
- 损失函数变化
- 学习率调度
- 梯度分布

## 🛠️ 故障排除

### 问题1: Docker Desktop未启动
```bash
# 错误: Cannot connect to the Docker daemon
# 解决: 启动Docker Desktop应用
```

### 问题2: 端口被占用
```bash
# 修改docker-compose.yml中的端口映射
ports:
  - "6007:6006"  # 使用6007端口
```

### 问题3: 权限问题
```bash
# Windows上可能需要以管理员身份运行
# 或者在Docker Desktop设置中启用文件共享
```

### 问题4: 内存不足
```bash
# 在docker-compose.yml中限制内存使用
deploy:
  resources:
    limits:
      memory: 4G
```

## 📈 性能优化

### GPU支持（如果有NVIDIA GPU）
```yaml
# 在docker-compose.yml中添加
runtime: nvidia
environment:
  - NVIDIA_VISIBLE_DEVICES=all
```

### 数据持久化
所有训练结果和日志都会保存在宿主机的 `logs/` 目录中，即使容器停止也不会丢失。

## 🎉 成功标志

当看到以下输出时，说明一切正常：
```
🚀 启动帕金森症TensorBoard训练...
📊 数据生成完成，开始训练...
🎯 开始训练...
Epoch 1/20
📊 TensorBoard日志: /app/logs/parkinson_demo_20260203_121500
🌐 TensorBoard: http://localhost:6006
```

## 📚 下一步

1. **模型优化**: 调整超参数
2. **数据扩展**: 增加更多合成数据
3. **实时集成**: 连接Arduino传感器
4. **部署优化**: 模型量化和压缩

## 💡 提示

- 首次运行需要下载Docker镜像，可能需要几分钟
- 训练过程中可以随时在浏览器中查看TensorBoard
- 所有文件都会保存到本地，可以重复使用
- 如需修改代码，重新运行 `docker-compose up --build` 即可
