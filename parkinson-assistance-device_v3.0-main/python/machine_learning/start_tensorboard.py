"""
TensorBoard启动器 - 解决Python 3.13兼容性问题
"""

import os
import sys
import subprocess
import webbrowser
import time
from pathlib import Path

def create_sample_logs():
    """创建示例日志文件用于TensorBoard演示"""
    # 查找最新的日志目录
    logs_base = "logs"
    if os.path.exists(logs_base):
        subdirs = [d for d in os.listdir(logs_base) if os.path.isdir(os.path.join(logs_base, d))]
        if subdirs:
            # 按时间排序，选择最新的
            subdirs.sort(reverse=True)
            log_dir = os.path.join(logs_base, subdirs[0])
            print(f"📁 使用最新日志目录: {log_dir}")
        else:
            log_dir = "logs/demo_experiment"
            os.makedirs(log_dir, exist_ok=True)
            print(f"📁 创建新日志目录: {log_dir}")
    else:
        log_dir = "logs/demo_experiment"
        os.makedirs(log_dir, exist_ok=True)
        print(f"📁 创建新日志目录: {log_dir}")
    
    # 创建一个简单的事件文件
    events_file = os.path.join(log_dir, "events.out.tfevents.demo")
    
    # 如果没有真实的训练日志，创建一个占位符
    if not os.path.exists(events_file):
        with open(events_file, 'w') as f:
            f.write("# TensorBoard Demo Events File\n")
    
    print(f"📁 日志目录已准备: {log_dir}")
    return log_dir

def start_tensorboard_alternative():
    """使用替代方法启动TensorBoard"""
    
    # 创建示例日志
    log_dir = create_sample_logs()
    
    print("🚀 尝试启动TensorBoard...")
    
    # 方法1: 直接使用Python模块
    try:
        print("📊 方法1: 使用python -m tensorboard.main")
        cmd = [
            sys.executable, "-m", "tensorboard.main",
            "--logdir", log_dir,
            "--port", "6006",
            "--host", "localhost"
        ]
        
        print(f"🔧 执行命令: {' '.join(cmd)}")
        
        # 启动TensorBoard进程
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        # 等待启动
        time.sleep(3)
        
        # 检查进程是否还在运行
        if process.poll() is None:
            print("✅ TensorBoard启动成功!")
            print(f"🌐 访问地址: http://localhost:6006")
            
            # 尝试打开浏览器
            try:
                webbrowser.open("http://localhost:6006")
                print("🔗 已自动打开浏览器")
            except:
                print("⚠️ 无法自动打开浏览器，请手动访问上述地址")
            
            print("\n💡 TensorBoard功能说明:")
            print("  - Scalars: 查看训练指标曲线")
            print("  - Graphs: 查看模型结构图 (支持3D可视化)")
            print("  - Histograms: 查看权重分布")
            print("  - Embeddings: 查看特征空间投影")
            
            print("\n🛑 按 Ctrl+C 停止TensorBoard")
            
            try:
                # 保持进程运行
                process.wait()
            except KeyboardInterrupt:
                print("\n🛑 正在停止TensorBoard...")
                process.terminate()
                process.wait()
                print("✅ TensorBoard已停止")
            
            return True
        else:
            # 获取错误信息
            stdout, stderr = process.communicate()
            print(f"❌ TensorBoard启动失败")
            print(f"错误信息: {stderr}")
            return False
            
    except Exception as e:
        print(f"❌ 方法1失败: {e}")
        return False

def create_simple_training_demo():
    """创建简单的训练演示并生成TensorBoard日志"""
    print("🎯 创建CNN+TCN训练演示...")
    
    try:
        # 尝试导入TensorFlow
        import tensorflow as tf
        
        # 创建简单模型
        model = tf.keras.Sequential([
            tf.keras.layers.Input(shape=(50, 9)),
            tf.keras.layers.Conv1D(16, 3, activation='relu', padding='same'),
            tf.keras.layers.GlobalAveragePooling1D(),
            tf.keras.layers.Dense(32, activation='relu'),
            tf.keras.layers.Dense(5, activation='softmax')
        ])
        
        model.compile(
            optimizer='adam',
            loss='sparse_categorical_crossentropy',
            metrics=['accuracy']
        )
        
        # 生成示例数据
        import numpy as np
        X = np.random.randn(100, 50, 9).astype(np.float32)
        y = np.random.randint(0, 5, 100)
        
        # 设置TensorBoard回调
        log_dir = "logs/cnn_tcn_demo"
        tensorboard_callback = tf.keras.callbacks.TensorBoard(
            log_dir=log_dir,
            histogram_freq=1,
            write_graph=True
        )
        
        print("🚀 开始训练演示...")
        
        # 训练模型
        model.fit(
            X, y,
            epochs=5,
            batch_size=16,
            validation_split=0.2,
            callbacks=[tensorboard_callback],
            verbose=1
        )
        
        print(f"✅ 训练完成，日志保存在: {log_dir}")
        return log_dir
        
    except ImportError:
        print("⚠️ TensorFlow不可用，使用模拟日志")
        return create_sample_logs()
    except Exception as e:
        print(f"⚠️ 训练演示失败: {e}")
        return create_sample_logs()

def main():
    """主程序"""
    print("🎯 TensorBoard启动器 - Python 3.13兼容版")
    print("=" * 50)
    
    # 选择操作
    print("请选择操作:")
    print("1. 直接启动TensorBoard (使用现有日志)")
    print("2. 运行训练演示并启动TensorBoard")
    
    try:
        choice = input("请输入选择 (1 或 2): ").strip()
        
        if choice == "2":
            log_dir = create_simple_training_demo()
        else:
            log_dir = create_sample_logs()
        
        # 启动TensorBoard
        success = start_tensorboard_alternative()
        
        if not success:
            print("\n📋 手动启动TensorBoard的方法:")
            print(f"1. 打开命令行，切换到: {os.getcwd()}")
            print(f"2. 运行: python -m tensorboard.main --logdir={log_dir}")
            print("3. 访问: http://localhost:6006")
            
    except KeyboardInterrupt:
        print("\n🛑 用户取消操作")
    except Exception as e:
        print(f"❌ 程序执行失败: {e}")

if __name__ == "__main__":
    main()
