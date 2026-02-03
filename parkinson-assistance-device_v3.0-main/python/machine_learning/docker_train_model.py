#!/usr/bin/env python3
"""
Docker环境下的CNN+TCN模型训练脚本
使用medical_data目录中的数据进行训练
"""

from cnn_lstm_tensorboard_model import ParkinsonCNNLSTMTensorBoardModel
from datetime import datetime
import os
import sys

def main():
    """Docker环境下的模型训练主程序"""
    print('🎯 帕金森症CNN-TCN模型 - Docker TensorBoard训练')
    print('=' * 60)
    
    # 创建模型实例
    model = ParkinsonCNNLSTMTensorBoardModel(sequence_length=50, feature_dim=9)
    
    try:
        # 检查数据目录
        data_dir = 'medical_data'
        if not os.path.exists(data_dir):
            print(f"❌ 数据目录不存在: {data_dir}")
            print("💡 请先运行数据生成脚本或确保medical_data目录存在")
            return False
        
        # 列出数据文件
        json_files = [f for f in os.listdir(data_dir) if f.endswith('.json') and f != 'medical_dataset_summary.json']
        print(f"📁 使用现有数据: 找到 {len(json_files)} 个JSON数据文件")
        
        if len(json_files) == 0:
            print("❌ 没有找到JSON数据文件")
            print("💡 medical_data目录存在但为空，需要先生成数据")
            return False
        
        print("✅ 跳过数据生成，直接使用现有数据进行训练")
        
        # 加载数据（不生成新数据）
        print("📊 加载医学文献数据...")
        df = model.load_synthetic_data(data_dir, generate_if_missing=False)
        
        # 创建实验名称
        experiment_name = f'parkinson_docker_{datetime.now().strftime("%Y%m%d_%H%M%S")}'
        print(f"🧪 实验名称: {experiment_name}")
        
        # 训练模型
        print("🚀 开始CNN+TCN模型训练...")
        print("📊 TensorBoard功能:")
        print("  - Scalars: 训练指标和学习率曲线")
        print("  - Graphs: CNN+TCN模型结构图")
        print("  - Histograms: 权重分布可视化")
        print("  - Images: 模型层可视化")
        
        history = model.train_model_with_tensorboard(
            df, 
            epochs=25,  # 增加训练轮数以观察学习率变化
            batch_size=16,
            experiment_name=experiment_name
        )
        
        # 保存模型
        print("💾 保存模型和训练结果...")
        model.save_model_and_artifacts()
        
        print("🎉 训练完成！")
        print(f"📊 TensorBoard日志: /app/logs/{experiment_name}")
        print("🌐 访问: http://localhost:6006")
        
        return True
        
    except Exception as e:
        print(f"❌ 训练过程出错: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
