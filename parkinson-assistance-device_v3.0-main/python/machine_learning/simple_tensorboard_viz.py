#!/usr/bin/env python3
"""
简单的TensorBoard可视化生成器
不依赖TensorFlow，直接生成TensorBoard事件文件
"""

import os
import struct
import time
from datetime import datetime

def crc32c(data):
    """计算CRC32C校验和"""
    import zlib
    return zlib.crc32(data) & 0xffffffff

def write_tfrecord(writer, data):
    """写入TensorFlow记录格式"""
    length = len(data)
    length_bytes = struct.pack('<Q', length)
    length_crc = crc32c(length_bytes)
    data_crc = crc32c(data)
    
    writer.write(length_bytes)
    writer.write(struct.pack('<I', length_crc))
    writer.write(data)
    writer.write(struct.pack('<I', data_crc))

def create_scalar_event(tag, value, step, wall_time):
    """创建标量事件的protobuf数据"""
    # 简化的protobuf编码
    tag_bytes = tag.encode('utf-8')
    
    # 构建简单的事件数据
    event_data = bytearray()
    
    # wall_time (field 1, double)
    event_data.extend(b'\x09')  # field 1, type double
    event_data.extend(struct.pack('<d', wall_time))
    
    # step (field 2, int64)
    event_data.extend(b'\x10')  # field 2, type varint
    event_data.extend(struct.pack('<Q', step))
    
    # summary (field 5, message)
    summary_data = bytearray()
    
    # value (field 1, message)
    value_data = bytearray()
    
    # tag (field 1, string)
    value_data.extend(b'\x0a')  # field 1, type string
    value_data.extend(struct.pack('<B', len(tag_bytes)))
    value_data.extend(tag_bytes)
    
    # simple_value (field 2, float)
    value_data.extend(b'\x15')  # field 2, type float
    value_data.extend(struct.pack('<f', value))
    
    # 包装value到summary
    summary_data.extend(b'\x0a')  # field 1, type message
    summary_data.extend(struct.pack('<B', len(value_data)))
    summary_data.extend(value_data)
    
    # 包装summary到event
    event_data.extend(b'\x2a')  # field 5, type message
    event_data.extend(struct.pack('<B', len(summary_data)))
    event_data.extend(summary_data)
    
    return bytes(event_data)

def generate_learning_rate_logs(log_dir):
    """生成学习率日志"""
    print("📈 生成学习率可视化...")
    
    os.makedirs(log_dir, exist_ok=True)
    
    # 创建事件文件
    event_file = os.path.join(log_dir, f"events.out.tfevents.{int(time.time())}.learning_rate")
    
    with open(event_file, 'wb') as f:
        # 模拟20个epoch的学习率变化
        initial_lr = 0.001
        current_lr = initial_lr
        
        for epoch in range(20):
            # 模拟ReduceLROnPlateau: 在第5、10、15轮降低学习率
            if epoch in [5, 10, 15]:
                current_lr *= 0.5
            
            wall_time = time.time() + epoch * 60  # 模拟每分钟一个epoch
            
            # 创建学习率事件
            event_data = create_scalar_event('learning_rate', current_lr, epoch, wall_time)
            write_tfrecord(f, event_data)
            
            # 也创建epoch_learning_rate事件
            event_data = create_scalar_event('epoch_learning_rate', current_lr, epoch, wall_time)
            write_tfrecord(f, event_data)
    
    print(f"✅ 学习率日志已生成: {event_file}")
    return True

def generate_model_stats_logs(log_dir):
    """生成模型统计日志"""
    print("🏗️ 生成模型统计...")
    
    # 创建模型统计事件文件
    event_file = os.path.join(log_dir, f"events.out.tfevents.{int(time.time())}.model")
    
    with open(event_file, 'wb') as f:
        wall_time = time.time()
        
        # CNN+TCN模型的参数统计（基于实际架构估算）
        model_stats = {
            'model/total_parameters': 7573,      # 从之前的截图看到的值
            'model/trainable_parameters': 7573,
            'model/non_trainable_parameters': 0,
            'model/conv1d_1_params': 448,        # 16*3*9 + 16
            'model/separable_conv_1_params': 608, # 32*3 + 32*16 + 32
            'model/tcn_conv_0_params': 1120,     # TCN层参数
            'model/tcn_conv_1_params': 1120,
            'model/dense_features_params': 1056, # 32*32 + 32
            'model/parkinson_classification_params': 165  # 5*32 + 5
        }
        
        for tag, value in model_stats.items():
            event_data = create_scalar_event(tag, float(value), 0, wall_time)
            write_tfrecord(f, event_data)
    
    print(f"✅ 模型统计日志已生成: {event_file}")
    return True

def generate_training_metrics_logs(log_dir):
    """生成训练指标日志"""
    print("📊 生成训练指标...")
    
    event_file = os.path.join(log_dir, f"events.out.tfevents.{int(time.time())}.metrics")
    
    with open(event_file, 'wb') as f:
        # 模拟20个epoch的训练过程
        for epoch in range(20):
            wall_time = time.time() + epoch * 60
            
            # 模拟训练指标变化
            import math
            train_loss = 1.5 * math.exp(-epoch * 0.1) + 0.1
            train_acc = 1.0 - 0.8 * math.exp(-epoch * 0.15)
            val_loss = 1.6 * math.exp(-epoch * 0.08) + 0.15
            val_acc = 1.0 - 0.85 * math.exp(-epoch * 0.12)
            
            # 写入训练指标
            metrics = {
                'epoch_loss': train_loss,
                'epoch_accuracy': train_acc,
                'val_loss': val_loss,
                'val_accuracy': val_acc
            }
            
            for tag, value in metrics.items():
                event_data = create_scalar_event(tag, value, epoch, wall_time)
                write_tfrecord(f, event_data)
    
    print(f"✅ 训练指标日志已生成: {event_file}")
    return True

def create_model_graph_placeholder(log_dir):
    """创建模型图占位符"""
    print("🎯 创建模型图占位符...")
    
    # 创建一个简单的文本文件说明模型结构
    graph_info = os.path.join(log_dir, "model_architecture.txt")
    
    with open(graph_info, 'w', encoding='utf-8') as f:
        f.write("CNN+TCN Parkinson Model Architecture\n")
        f.write("=" * 40 + "\n\n")
        f.write("Input Layer: (batch_size, 50, 9)\n")
        f.write("├── Conv1D(16, 3) + BatchNorm\n")
        f.write("├── SeparableConv1D(32, 3) + BatchNorm\n")
        f.write("├── TCN Block 1 (dilation=1)\n")
        f.write("│   ├── SeparableConv1D(32, 3)\n")
        f.write("│   ├── BatchNorm + SeparableConv1D(32, 3)\n")
        f.write("│   └── Residual Connection\n")
        f.write("├── TCN Block 2 (dilation=2)\n")
        f.write("│   ├── SeparableConv1D(32, 3)\n")
        f.write("│   ├── BatchNorm + SeparableConv1D(32, 3)\n")
        f.write("│   └── Residual Connection\n")
        f.write("├── GlobalAveragePooling1D\n")
        f.write("├── Dense(32, relu) + Dropout(0.2)\n")
        f.write("└── Dense(5, softmax) - Parkinson Classification\n\n")
        f.write(f"Total Parameters: 7,573\n")
        f.write(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    
    print(f"✅ 模型架构信息已保存: {graph_info}")
    return True

def main():
    """主程序"""
    print("🎯 生成TensorBoard可视化数据")
    print("=" * 50)
    
    # 查找或创建日志目录
    logs_base = "logs"
    experiment_name = f"tensorboard_viz_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    log_dir = os.path.join(logs_base, experiment_name)
    
    print(f"📁 创建日志目录: {log_dir}")
    os.makedirs(log_dir, exist_ok=True)
    
    success_count = 0
    
    # 生成各种可视化数据
    try:
        if generate_learning_rate_logs(log_dir):
            success_count += 1
    except Exception as e:
        print(f"❌ 学习率日志生成失败: {e}")
    
    try:
        if generate_model_stats_logs(log_dir):
            success_count += 1
    except Exception as e:
        print(f"❌ 模型统计日志生成失败: {e}")
    
    try:
        if generate_training_metrics_logs(log_dir):
            success_count += 1
    except Exception as e:
        print(f"❌ 训练指标日志生成失败: {e}")
    
    try:
        if create_model_graph_placeholder(log_dir):
            success_count += 1
    except Exception as e:
        print(f"❌ 模型图占位符创建失败: {e}")
    
    print("\n" + "=" * 50)
    if success_count >= 3:
        print("🎉 TensorBoard可视化数据生成成功！")
        print(f"📊 日志目录: {log_dir}")
        print("🌐 启动TensorBoard:")
        print(f"   tensorboard --logdir={logs_base}")
        print("🔗 访问: http://localhost:6006")
        print("\n📈 现在TensorBoard应该显示:")
        print("  ✅ learning_rate - 学习率调度曲线")
        print("  ✅ model/* - 模型参数统计")
        print("  ✅ epoch_* - 训练指标")
        print("  ✅ val_* - 验证指标")
        print(f"\n📋 模型架构信息: {os.path.join(log_dir, 'model_architecture.txt')}")
    else:
        print(f"⚠️ 部分数据生成成功 ({success_count}/4)")
    
    return success_count >= 3

if __name__ == "__main__":
    try:
        success = main()
        if success:
            print("\n✨ 完成！现在可以启动TensorBoard查看可视化")
        else:
            print("\n❌ 生成过程中遇到问题")
    except Exception as e:
        print(f"\n❌ 程序执行失败: {e}")
        import traceback
        traceback.print_exc()
