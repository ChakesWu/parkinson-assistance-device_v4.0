"""
简化版CNN+TCN帕金森症模型演示
使用合成数据训练并展示TensorBoard可视化
"""

import numpy as np
import os
import json
from datetime import datetime

# 尝试导入TensorFlow，如果失败则使用简化版本
try:
    import tensorflow as tf
    from tensorflow import keras
    from tensorflow.keras import layers
    HAS_TENSORFLOW = True
    print("✅ TensorFlow导入成功")
except ImportError as e:
    print(f"⚠️ TensorFlow导入失败: {e}")
    print("🔄 使用简化版本演示...")
    HAS_TENSORFLOW = False

class SimpleCNNTCNDemo:
    def __init__(self, sequence_length=50, feature_dim=9):
        self.sequence_length = sequence_length
        self.feature_dim = feature_dim
        self.model = None
        
    def create_synthetic_data(self, num_samples=1000):
        """创建合成帕金森症数据"""
        print("📊 生成合成数据...")
        
        X = []
        y = []
        
        for level in range(5):  # 5个帕金森等级
            for sample in range(num_samples // 5):
                sequence = []
                
                # 生成50个时间步的数据
                for t in range(self.sequence_length):
                    # 基于等级的症状参数
                    tremor_amp = (level + 1) * 0.1
                    tremor_freq = 4.5 + level * 0.5
                    stiffness = level * 0.15
                    
                    # 9维特征：5个手指 + 1个EMG + 3个IMU
                    features = []
                    
                    # 手指数据 (0-4)
                    for finger in range(5):
                        base_value = 0.3 + finger * 0.1
                        tremor = tremor_amp * np.sin(2 * np.pi * tremor_freq * t / 50)
                        stiff = stiffness * (1 - np.exp(-t / 20))
                        noise = np.random.normal(0, 0.05)
                        
                        finger_value = base_value + tremor + stiff + noise
                        finger_value = np.clip(finger_value, 0, 1)
                        features.append(finger_value)
                    
                    # EMG数据 (5)
                    emg = 0.4 + stiffness + tremor_amp * 0.5 * np.cos(tremor_freq * t / 50)
                    emg += np.random.normal(0, 0.03)
                    emg = np.clip(emg, 0, 1)
                    features.append(emg)
                    
                    # IMU数据 (6-8)
                    for axis in range(3):
                        imu_base = 0.1 * axis
                        imu_tremor = tremor_amp * np.sin(tremor_freq * t / 50 + axis * np.pi/3)
                        imu_noise = np.random.normal(0, 0.04)
                        
                        imu_value = imu_base + imu_tremor + imu_noise
                        imu_value = np.clip(imu_value, -1, 1)
                        features.append(imu_value)
                    
                    sequence.append(features)
                
                X.append(sequence)
                y.append(level)
        
        X = np.array(X, dtype=np.float32)
        y = np.array(y, dtype=np.int32)
        
        print(f"✅ 数据生成完成: {X.shape}, 标签: {y.shape}")
        return X, y
    
    def create_cnn_tcn_model(self):
        """创建CNN+TCN模型架构"""
        if not HAS_TENSORFLOW:
            print("❌ 无法创建TensorFlow模型")
            return None
            
        print("🏗️ 创建CNN+TCN模型...")
        
        # 输入层
        inputs = keras.Input(shape=(self.sequence_length, self.feature_dim), name='sensor_input')
        
        # CNN层 - 特征提取
        x = layers.Conv1D(filters=16, kernel_size=3, activation='relu', padding='same', name='conv1d_1')(inputs)
        x = layers.BatchNormalization(name='batch_norm_1')(x)
        
        # 可分离卷积 (Depthwise Separable)
        x = layers.SeparableConv1D(filters=32, kernel_size=3, activation='relu', padding='same', name='sep_conv_1')(x)
        x = layers.BatchNormalization(name='batch_norm_2')(x)
        
        # TCN块 - 时间建模
        for i, dilation in enumerate([1, 2]):
            residual = x
            
            # 第一个TCN卷积
            x = layers.SeparableConv1D(
                filters=32, kernel_size=3, activation='relu', 
                padding='same', dilation_rate=dilation, 
                name=f'tcn_conv1_{i}'
            )(x)
            x = layers.BatchNormalization(name=f'tcn_bn1_{i}')(x)
            
            # 第二个TCN卷积
            x = layers.SeparableConv1D(
                filters=32, kernel_size=3, activation='relu',
                padding='same', dilation_rate=dilation,
                name=f'tcn_conv2_{i}'
            )(x)
            x = layers.BatchNormalization(name=f'tcn_bn2_{i}')(x)
            
            # 残差连接
            x = layers.add([x, residual], name=f'tcn_residual_{i}')
        
        # 全局池化和分类
        x = layers.GlobalAveragePooling1D(name='global_pool')(x)
        x = layers.Dense(32, activation='relu', name='dense_features')(x)
        x = layers.Dropout(0.2, name='dropout')(x)
        
        # 输出层
        outputs = layers.Dense(5, activation='softmax', name='parkinson_classification')(x)
        
        # 创建模型
        model = keras.Model(inputs=inputs, outputs=outputs, name='ParkinsonCNNTCN')
        
        # 编译模型
        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=0.001),
            loss='sparse_categorical_crossentropy',
            metrics=['accuracy']
        )
        
        print("✅ CNN+TCN模型创建完成")
        model.summary()
        
        return model
    
    def setup_tensorboard(self, experiment_name=None):
        """设置TensorBoard"""
        if not HAS_TENSORFLOW:
            print("❌ 无法设置TensorBoard")
            return None
            
        if experiment_name is None:
            experiment_name = f"cnn_tcn_demo_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        log_dir = f"logs/{experiment_name}"
        os.makedirs(log_dir, exist_ok=True)
        
        tensorboard_callback = keras.callbacks.TensorBoard(
            log_dir=log_dir,
            histogram_freq=1,
            write_graph=True,
            write_images=True,
            update_freq='epoch'
        )
        
        print(f"📊 TensorBoard设置完成")
        print(f"📁 日志目录: {log_dir}")
        print(f"🚀 启动命令: tensorboard --logdir={log_dir}")
        
        return tensorboard_callback, log_dir
    
    def train_model(self, X, y, epochs=10):
        """训练模型"""
        if not HAS_TENSORFLOW:
            print("❌ 无法训练TensorFlow模型，显示模拟训练过程...")
            self.simulate_training(epochs)
            return None
        
        print("🚀 开始模型训练...")
        
        # 创建模型
        self.model = self.create_cnn_tcn_model()
        
        # 设置TensorBoard
        tensorboard_callback, log_dir = self.setup_tensorboard()
        
        # 数据分割
        split_idx = int(0.8 * len(X))
        X_train, X_test = X[:split_idx], X[split_idx:]
        y_train, y_test = y[:split_idx], y[split_idx:]
        
        print(f"📊 训练集: {X_train.shape}, 测试集: {X_test.shape}")
        
        # 训练
        history = self.model.fit(
            X_train, y_train,
            validation_data=(X_test, y_test),
            epochs=epochs,
            batch_size=16,
            callbacks=[tensorboard_callback],
            verbose=1
        )
        
        # 评估
        test_loss, test_acc = self.model.evaluate(X_test, y_test, verbose=0)
        print(f"\n📊 测试准确率: {test_acc:.4f}")
        
        return history, log_dir
    
    def simulate_training(self, epochs):
        """模拟训练过程（当TensorFlow不可用时）"""
        print("🎭 模拟CNN+TCN训练过程...")
        
        for epoch in range(epochs):
            # 模拟训练指标
            train_loss = 1.5 * np.exp(-epoch * 0.1) + np.random.normal(0, 0.05)
            train_acc = 0.2 + 0.7 * (1 - np.exp(-epoch * 0.15)) + np.random.normal(0, 0.02)
            
            val_loss = train_loss + np.random.normal(0, 0.1)
            val_acc = train_acc - 0.05 + np.random.normal(0, 0.03)
            
            print(f"Epoch {epoch+1}/{epochs} - "
                  f"loss: {train_loss:.4f} - acc: {train_acc:.4f} - "
                  f"val_loss: {val_loss:.4f} - val_acc: {val_acc:.4f}")
        
        print("✅ 模拟训练完成")
        print("\n📋 CNN+TCN模型架构说明:")
        print("1. 输入层: (50, 9) - 50个时间步，9维传感器特征")
        print("2. CNN层: Conv1D(16) + BatchNorm - 局部特征提取")
        print("3. 可分离卷积: SeparableConv1D(32) - 高效特征映射")
        print("4. TCN块: 膨胀卷积(dilation=1,2) + 残差连接 - 时间建模")
        print("5. 全局池化: GlobalAveragePooling1D - 序列汇总")
        print("6. 分类层: Dense(32) + Dropout + Dense(5) - 帕金森等级分类")

def main():
    """主程序"""
    print("🎯 CNN+TCN帕金森症模型演示")
    print("=" * 50)
    
    # 创建演示实例
    demo = SimpleCNNTCNDemo()
    
    # 生成数据
    X, y = demo.create_synthetic_data(1000)
    
    # 训练模型
    result = demo.train_model(X, y, epochs=15)
    
    if result and HAS_TENSORFLOW:
        history, log_dir = result
        print(f"\n🎉 训练完成！")
        print(f"📊 TensorBoard: tensorboard --logdir={log_dir}")
        print(f"🌐 访问: http://localhost:6006")
    
    print("\n📋 关于TensorBoard 3D可视化:")
    print("✅ TensorBoard支持以下3D可视化:")
    print("  - 嵌入投影 (Embeddings): t-SNE, PCA, UMAP")
    print("  - 模型图结构 (Graphs): 3D网络拓扑")
    print("  - 权重分布 (Histograms): 3D直方图")
    print("  - 损失曲面 (Loss Landscape): 参数空间可视化")
    print("\n💡 要查看3D模型可视化:")
    print("  1. 在TensorBoard中点击 'Graphs' 标签")
    print("  2. 使用 'Embeddings' 标签查看特征空间")
    print("  3. 'Histograms' 显示权重的3D分布")

if __name__ == "__main__":
    main()
