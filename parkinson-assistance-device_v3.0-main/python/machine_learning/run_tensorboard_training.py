"""
帕金森症模型TensorBoard训练快速启动脚本
一键运行数据生成、模型训练和可视化
"""

import os
import sys
import subprocess
import threading
import time
import webbrowser
from datetime import datetime

def check_dependencies():
    """检查必要的依赖包"""
    print("📦 跳过依赖检查，直接开始训练...")
    return True

def start_tensorboard(log_dir, port=6006):
    """启动TensorBoard服务器"""
    def run_tensorboard():
        try:
            cmd = f"tensorboard --logdir={log_dir} --port={port} --host=localhost"
            print(f"🚀 启动TensorBoard: {cmd}")
            
            # 在Windows上使用shell=True
            subprocess.run(cmd, shell=True, check=True)
        except subprocess.CalledProcessError as e:
            print(f"❌ TensorBoard启动失败: {e}")
        except KeyboardInterrupt:
            print("🛑 TensorBoard已停止")
    
    # 在后台线程中运行TensorBoard
    tensorboard_thread = threading.Thread(target=run_tensorboard, daemon=True)
    tensorboard_thread.start()
    
    # 等待TensorBoard启动
    print("⏳ 等待TensorBoard启动...")
    time.sleep(3)
    
    # 自动打开浏览器
    tensorboard_url = f"http://localhost:{port}"
    print(f"🌐 TensorBoard URL: {tensorboard_url}")
    
    try:
        webbrowser.open(tensorboard_url)
        print("🔗 已自动打开浏览器")
    except:
        print("⚠️ 无法自动打开浏览器，请手动访问上述URL")
    
    return tensorboard_thread

def run_training_with_tensorboard():
    """运行带TensorBoard的模型训练"""
    print("🎯 帕金森症CNN-TCN模型TensorBoard训练")
    print("=" * 50)
    
    # 检查依赖
    if not check_dependencies():
        return False
    
    # 导入模型类
    try:
        from cnn_lstm_tensorboard_model import ParkinsonCNNLSTMTensorBoardModel
        print("✅ 模型类导入成功")
    except ImportError as e:
        print(f"❌ 模型导入失败: {e}")
        return False
    
    # 创建实验名称
    experiment_name = f"parkinson_demo_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    print(f"🧪 实验名称: {experiment_name}")
    
    # 创建模型实例
    model = ParkinsonCNNLSTMTensorBoardModel(sequence_length=50, feature_dim=9)
    
    # 预先设置日志目录
    log_dir = f"logs/{experiment_name}"
    
    # 启动TensorBoard
    print("\n📊 启动TensorBoard服务器...")
    tensorboard_thread = start_tensorboard(log_dir)
    
    try:
        print("\n📊 开始数据准备和模型训练...")
        
        # 加载或生成数据
        print("1️⃣ 数据准备...")
        df = model.load_synthetic_data("data", generate_if_missing=True)
        
        # 训练模型
        print("2️⃣ 模型训练...")
        history = model.train_model_with_tensorboard(
            df, 
            epochs=20,  # 减少epochs用于演示
            batch_size=16,
            experiment_name=experiment_name
        )
        
        # 保存模型
        print("3️⃣ 保存模型...")
        model.save_model_and_artifacts()
        
        print("\n🎉 训练完成！")
        print(f"📊 TensorBoard: http://localhost:6006")
        print(f"📁 日志目录: {log_dir}")
        
        # 保持TensorBoard运行
        print("\n⏳ TensorBoard将继续运行...")
        print("💡 在浏览器中查看训练过程可视化")
        print("🛑 按 Ctrl+C 停止")
        
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n🛑 停止TensorBoard...")
            return True
            
    except Exception as e:
        print(f"❌ 训练过程出错: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """主函数"""
    print("🚀 帕金森症模型TensorBoard可视化启动器")
    print("=" * 60)
    
    # 切换到脚本目录
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    print(f"📁 工作目录: {script_dir}")
    
    # 运行训练
    success = run_training_with_tensorboard()
    
    if success:
        print("\n✅ 程序执行完成")
    else:
        print("\n❌ 程序执行失败")
        sys.exit(1)

if __name__ == "__main__":
    main()
