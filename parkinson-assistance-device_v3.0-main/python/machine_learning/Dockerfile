# 帕金森症TensorBoard训练Docker环境
FROM python:3.11-slim

# 设置工作目录
WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# 复制requirements文件
COPY requirements.txt .

# 安装Python依赖
RUN pip install --no-cache-dir -r requirements.txt

# 复制项目文件
COPY . .

# 创建日志目录
RUN mkdir -p logs

# 暴露TensorBoard端口
EXPOSE 6006

# 设置环境变量
ENV PYTHONPATH=/app
ENV TF_ENABLE_ONEDNN_OPTS=0

# 默认命令
CMD ["python", "cnn_lstm_tensorboard_model.py"]
