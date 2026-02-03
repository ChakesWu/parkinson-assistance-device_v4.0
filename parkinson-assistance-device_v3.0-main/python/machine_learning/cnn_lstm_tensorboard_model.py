"""
CNN-LSTM混合模型用於帕金森症狀分析 - TensorBoard增强版
結合卷積神經網絡和長短期記憶網絡來分析多傳感器數據
集成TensorBoard实时可视化训练过程
"""

import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.metrics import classification_report, confusion_matrix
import matplotlib.pyplot as plt
import seaborn as sns
import json
import os
from datetime import datetime
import io
from synthetic_data_generator import ParkinsonSyntheticDataGenerator

class ParkinsonCNNLSTMTensorBoardModel:
    def __init__(self, sequence_length=50, feature_dim=9):
        """
        初始化CNN-LSTM模型 - TensorBoard增强版
        
        Args:
            sequence_length: 時間序列長度
            feature_dim: 特徵維度 (5個手指 + 1個EMG + 3個IMU = 9)
        """
        self.sequence_length = sequence_length
        self.feature_dim = feature_dim
        self.model = None
        self.scaler = StandardScaler()
        self.label_encoder = LabelEncoder()
        self.history = None
        
        # TensorBoard相关
        self.log_dir = None
        self.tensorboard_callback = None
        self.custom_callbacks = []
        
    def create_model(self, num_classes=5):
        """
        創建CNN-LSTM混合模型架構 - 增强版
        
        Args:
            num_classes: 分類數量 (帕金森等級1-5)
        """
        # 輸入層（固定長度 50x9，便於 Arduino 推論）
        input_layer = keras.Input(shape=(self.sequence_length, self.feature_dim), name='sensor_input')

        # CNN + TCN-Lite
        # 初始卷積降維（通道數小、便於量化）
        x = layers.Conv1D(filters=16, kernel_size=3, activation='relu', padding='same', name='conv1d_1')(input_layer)
        x = layers.BatchNormalization(name='batch_norm_1')(x)

        # Depthwise Separable Conv (Depthwise + Pointwise)
        x = layers.SeparableConv1D(filters=32, kernel_size=3, activation='relu', padding='same', name='separable_conv_1')(x)
        x = layers.BatchNormalization(name='batch_norm_2')(x)

        # TCN-Lite blocks（dilation 1, 2）
        for i, dilation_rate in enumerate([1, 2]):
            residual = x
            x = layers.SeparableConv1D(
                filters=32,
                kernel_size=3,
                activation='relu',
                padding='same',
                dilation_rate=dilation_rate,
                name=f'tcn_conv_1_{i}'
            )(x)
            x = layers.BatchNormalization(name=f'tcn_batch_norm_1_{i}')(x)
            x = layers.SeparableConv1D(
                filters=32,
                kernel_size=3,
                activation='relu',
                padding='same',
                dilation_rate=dilation_rate,
                name=f'tcn_conv_2_{i}'
            )(x)
            x = layers.BatchNormalization(name=f'tcn_batch_norm_2_{i}')(x)
            x = layers.add([x, residual], name=f'tcn_residual_{i}')

        # Global pooling + 輕量全連接
        x = layers.GlobalAveragePooling1D(name='global_avg_pool')(x)
        x = layers.Dense(32, activation='relu', name='dense_features')(x)
        x = layers.Dropout(0.2, name='dropout')(x)

        # 輸出層（多輸出等級）
        output = layers.Dense(num_classes, activation='softmax', name='parkinson_classification')(x)
        
        # 創建模型
        self.model = keras.Model(inputs=input_layer, outputs=output, name='ParkinsonCNNTCN')
        
        # 編譯模型
        self.model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=0.001),
            loss='sparse_categorical_crossentropy',
            metrics=['accuracy']
        )
        
        return self.model
    
    def setup_tensorboard(self, experiment_name=None):
        """设置TensorBoard日志"""
        if experiment_name is None:
            experiment_name = f"parkinson_cnn_tcn_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        self.log_dir = f"logs/{experiment_name}"
        os.makedirs(self.log_dir, exist_ok=True)
        
        # 基础TensorBoard回调
        self.tensorboard_callback = keras.callbacks.TensorBoard(
            log_dir=self.log_dir,
            histogram_freq=1,          # 每epoch记录权重直方图
            write_graph=True,          # 记录模型图
            write_images=True,         # 记录模型权重图像
            update_freq='epoch',       # 更新频率
            profile_batch='500,520',   # 性能分析
            embeddings_freq=1          # 嵌入可视化
        )
        
        print(f"📊 TensorBoard日志目录: {self.log_dir}")
        print(f"🔍 启动命令: tensorboard --logdir={self.log_dir}")
        
        return self.tensorboard_callback
    
    def create_custom_callbacks(self):
        """创建自定义回调函数"""
        
        # 1. 学习率调度器 - 用于TensorBoard可视化
        lr_scheduler = keras.callbacks.ReduceLROnPlateau(
            monitor='val_loss', 
            factor=0.5, 
            patience=5, 
            min_lr=0.00001,
            verbose=1
        )
        
        # 2. 学习率记录回调 - 确保学习率被记录到TensorBoard
        class LearningRateLogger(keras.callbacks.Callback):
            def on_epoch_end(self, epoch, logs=None):
                logs = logs or {}
                logs['learning_rate'] = float(self.model.optimizer.learning_rate)
        
        lr_logger = LearningRateLogger()
        
        # 3. 早停回调
        early_stopping = keras.callbacks.EarlyStopping(
            monitor='val_loss', 
            patience=10, 
            restore_best_weights=True,
            verbose=1
        )
        
        # 4. 模型检查点
        checkpoint_callback = keras.callbacks.ModelCheckpoint(
            filepath=os.path.join(self.log_dir, 'best_model.h5'),
            monitor='val_accuracy',
            save_best_only=True,
            save_weights_only=False,
            verbose=1
        )
        
        # 5. 自定义指标回调
        custom_metrics_callback = CustomMetricsCallback(self.log_dir)
        
        self.custom_callbacks = [
            lr_scheduler,
            lr_logger,
            early_stopping, 
            checkpoint_callback,
            custom_metrics_callback
        ]
        
        return self.custom_callbacks
    
    def prepare_sequences(self, df):
        """
        準備時間序列數據
        
        Args:
            df: 包含傳感器數據的DataFrame
        """
        # 特徵列
        feature_cols = ['finger_pinky', 'finger_ring', 'finger_middle', 
                       'finger_index', 'finger_thumb', 'emg', 
                       'imu_x', 'imu_y', 'imu_z']
        
        sequences = []
        labels = []
        
        # 按患者分組處理
        for patient_id in df['patient_id'].unique():
            patient_data = df[df['patient_id'] == patient_id].sort_values('timestamp')
            
            if len(patient_data) < self.sequence_length:
                continue
            
            features = patient_data[feature_cols].values
            patient_label = patient_data['parkinson_level'].iloc[0] - 1  # 轉換為0-4
            
            # 創建滑動窗口序列
            for i in range(len(features) - self.sequence_length + 1):
                sequences.append(features[i:i + self.sequence_length])
                labels.append(patient_label)
        
        return np.array(sequences), np.array(labels)
    
    def load_synthetic_data(self, data_dir="medical_data", generate_if_missing=True):
        """
        加载合成数据或生成新数据
        
        Args:
            data_dir: 数据目录
            generate_if_missing: 如果数据不存在是否生成
        """
        if not os.path.exists(data_dir) or len(os.listdir(data_dir)) == 0:
            if generate_if_missing:
                print("📊 未找到数据，正在生成合成数据集...")
                generator = ParkinsonSyntheticDataGenerator()
                generator.generate_dataset(num_patients_per_level=10, output_dir=data_dir)
            else:
                raise ValueError(f"数据目录 {data_dir} 不存在或为空")
        
        return self.load_and_preprocess_data(data_dir)
    
    def load_and_preprocess_data(self, data_dir="data"):
        """
        加載和預處理數據
        
        Args:
            data_dir: 數據目錄
        """
        all_data = []
        
        # 讀取所有JSON文件
        json_files = [f for f in os.listdir(data_dir) if f.endswith('.json') and f != 'dataset_summary.json']
        
        print(f"📁 找到 {len(json_files)} 个数据文件")
        
        for filename in json_files:
            filepath = os.path.join(data_dir, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    session_data = json.load(f)
                
                # 轉換為DataFrame
                data_points = session_data['data']
                for point in data_points:
                    # 确保parkinson_level不为None
                    parkinson_level = session_data.get('parkinson_level')
                    if parkinson_level is None:
                        # 从patient_id中提取等级信息
                        patient_id = session_data.get('patient_id', '')
                        if patient_id.startswith('P'):
                            try:
                                parkinson_level = int(patient_id[1:3])  # 提取P01_xxx中的01部分
                            except (ValueError, IndexError):
                                parkinson_level = 1  # 默认等级1
                        else:
                            parkinson_level = 1  # 默认等级1
                    
                    row = {
                        'timestamp': point['timestamp'],
                        'finger_pinky': point['fingers'][0],
                        'finger_ring': point['fingers'][1],
                        'finger_middle': point['fingers'][2],
                        'finger_index': point['fingers'][3],
                        'finger_thumb': point['fingers'][4],
                        'emg': point['emg'],
                        'imu_x': point['imu'][0],
                        'imu_y': point['imu'][1],
                        'imu_z': point['imu'][2],
                        'patient_id': session_data.get('patient_id'),
                        'parkinson_level': parkinson_level
                    }
                    all_data.append(row)
            
            except Exception as e:
                print(f"⚠️ 讀取文件 {filename} 失敗: {e}")
        
        if not all_data:
            raise ValueError("沒有找到有效的數據文件")
        
        df = pd.DataFrame(all_data)
        print(f"✅ 加載數據: {len(df)} 個數據點，{df['patient_id'].nunique()} 個患者")
        
        # 数据分布统计
        level_counts = df['parkinson_level'].value_counts().sort_index()
        print("📊 帕金森等级分布:")
        for level, count in level_counts.items():
            print(f"  等级 {level}: {count} 个数据点")
        
        return df
    
    def train_model_with_tensorboard(self, df, test_size=0.2, epochs=20, batch_size=16, experiment_name=None):
        """
        使用TensorBoard训练模型
        
        Args:
            df: 数据DataFrame
            test_size: 测试集比例
            epochs: 训练轮数
            batch_size: 批次大小
            experiment_name: 实验名称
        """
        print("🚀 开始TensorBoard增强训练...")
        
        # 设置TensorBoard
        self.setup_tensorboard(experiment_name)
        
        # 準備序列數據
        X, y = self.prepare_sequences(df)
        print(f"📊 序列數據準備完成: {X.shape}, 標籤: {y.shape}")
        
        # 标准化特征
        X_reshaped = X.reshape(-1, X.shape[-1])
        X_scaled = self.scaler.fit_transform(X_reshaped)
        X = X_scaled.reshape(X.shape)
        
        # 分割数据
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=42, stratify=y
        )
        
        print(f"📊 訓練集: {X_train.shape}, 測試集: {X_test.shape}")
        
        # 创建模型
        self.create_model(num_classes=5)
        print("🏗️ 模型架构:")
        self.model.summary()
        
        # 创建回调函数
        callbacks = [self.tensorboard_callback] + self.create_custom_callbacks()
        
        # 记录模型架构到TensorBoard
        self._log_model_architecture()
        
        # 记录数据统计到TensorBoard
        self._log_data_statistics(df, X_train, y_train)
        
        print("🎯 开始训练...")
        print(f"📊 TensorBoard: http://localhost:6006")
        
        # 训练模型
        self.history = self.model.fit(
            X_train, y_train,
            validation_data=(X_test, y_test),
            epochs=epochs,
            batch_size=batch_size,
            callbacks=callbacks,
            verbose=1
        )
        
        # 评估模型
        evaluation_results = self.model.evaluate(X_test, y_test, verbose=0)
        if len(evaluation_results) == 3:
            test_loss, test_accuracy, test_top2_accuracy = evaluation_results
            print(f"\n📊 最终测试结果:")
            print(f"  准确率: {test_accuracy:.4f}")
            print(f"  Top-2准确率: {test_top2_accuracy:.4f}")
            print(f"  损失: {test_loss:.4f}")
        else:
            test_loss, test_accuracy = evaluation_results
            print(f"\n📊 最终测试结果:")
            print(f"  准确率: {test_accuracy:.4f}")
            print(f"  损失: {test_loss:.4f}")
        
        # 详细评估报告
        self._generate_detailed_evaluation(X_test, y_test)
        
        return self.history
    
    def _log_model_architecture(self):
        """记录模型架构到TensorBoard"""
        try:
            # 方法1: 使用tf.summary.trace记录模型图
            tf.summary.trace_on(graph=True, profiler=False)
            
            # 创建虚拟输入来触发图构建
            dummy_input = tf.random.normal((1, self.sequence_length, self.feature_dim))
            _ = self.model(dummy_input, training=False)
            
            with tf.summary.create_file_writer(self.log_dir).as_default():
                tf.summary.trace_export(name="model_graph", step=0, profiler_outdir=self.log_dir)
            
            # 方法2: 记录模型参数总数
            with tf.summary.create_file_writer(self.log_dir).as_default():
                total_params = self.model.count_params()
                trainable_params = sum([tf.keras.backend.count_params(w) for w in self.model.trainable_weights])
                non_trainable_params = total_params - trainable_params
                
                tf.summary.scalar('model/total_parameters', total_params, step=0)
                tf.summary.scalar('model/trainable_parameters', trainable_params, step=0)
                tf.summary.scalar('model/non_trainable_parameters', non_trainable_params, step=0)
                
                # 记录每层参数数量
                for i, layer in enumerate(self.model.layers):
                    if hasattr(layer, 'count_params'):
                        layer_params = layer.count_params()
                        tf.summary.scalar(f'model/layer_{i}_{layer.name}_params', layer_params, step=0)
            
            print("✅ 模型架构已记录到TensorBoard")
            
        except Exception as e:
            print(f"⚠️ 模型架构记录失败: {e}")
            # 备用方法：简单记录模型信息
            try:
                with tf.summary.create_file_writer(self.log_dir).as_default():
                    tf.summary.scalar('model/total_parameters', self.model.count_params(), step=0)
                print("✅ 使用备用方法记录了模型参数信息")
            except Exception as e2:
                print(f"❌ 备用方法也失败: {e2}")
    
    def _log_data_statistics(self, df, X_train, y_train):
        """记录数据统计信息到TensorBoard"""
        with tf.summary.create_file_writer(self.log_dir).as_default():
            # 数据集统计
            tf.summary.scalar('dataset/total_samples', len(df), step=0)
            tf.summary.scalar('dataset/training_samples', len(X_train), step=0)
            tf.summary.scalar('dataset/num_patients', df['patient_id'].nunique(), step=0)
            
            # 类别分布
            for level in range(1, 6):
                count = np.sum(y_train == (level-1))
                tf.summary.scalar(f'dataset/level_{level}_count', count, step=0)
            
            # 特征统计
            feature_names = ['finger_pinky', 'finger_ring', 'finger_middle', 
                           'finger_index', 'finger_thumb', 'emg', 'imu_x', 'imu_y', 'imu_z']
            
            for i, name in enumerate(feature_names):
                feature_data = X_train[:, :, i].flatten()
                tf.summary.scalar(f'features/{name}_mean', np.mean(feature_data), step=0)
                tf.summary.scalar(f'features/{name}_std', np.std(feature_data), step=0)
    
    def _generate_detailed_evaluation(self, X_test, y_test):
        """生成详细评估报告"""
        y_pred = np.argmax(self.model.predict(X_test, verbose=0), axis=1)
        
        # 分类报告
        report = classification_report(y_test, y_pred, 
                                     target_names=[f"等级{i+1}" for i in range(5)],
                                     output_dict=True)
        
        print("\n📋 详细分类报告:")
        print(classification_report(y_test, y_pred, 
                                  target_names=[f"等级{i+1}" for i in range(5)]))
        
        # 混淆矩阵
        cm = confusion_matrix(y_test, y_pred)
        
        # 保存混淆矩阵图像到TensorBoard
        self._log_confusion_matrix(cm, y_test, y_pred)
        
        # 记录详细指标到TensorBoard
        with tf.summary.create_file_writer(self.log_dir).as_default():
            for class_name, metrics in report.items():
                if isinstance(metrics, dict):
                    for metric_name, value in metrics.items():
                        tf.summary.scalar(f'evaluation/{class_name}_{metric_name}', value, step=0)
    
    def _log_confusion_matrix(self, cm, y_true, y_pred):
        """记录混淆矩阵到TensorBoard"""
        figure = plt.figure(figsize=(8, 6))
        sns.heatmap(cm, annot=True, fmt='d', cmap='Blues',
                   xticklabels=[f'等级{i+1}' for i in range(5)],
                   yticklabels=[f'等级{i+1}' for i in range(5)])
        plt.title('混淆矩阵')
        plt.ylabel('真实标签')
        plt.xlabel('预测标签')
        
        # 转换为图像
        buf = io.BytesIO()
        plt.savefig(buf, format='png')
        buf.seek(0)
        
        # 记录到TensorBoard
        image = tf.image.decode_png(buf.getvalue(), channels=4)
        image = tf.expand_dims(image, 0)
        
        with tf.summary.create_file_writer(self.log_dir).as_default():
            tf.summary.image("Confusion Matrix", image, step=0)
        
        plt.close()
    
    def save_model_and_artifacts(self, model_path=None):
        """保存模型和相关文件"""
        if model_path is None:
            model_path = os.path.join(self.log_dir, "final_model.h5")
        
        if self.model is None:
            print("❌ 没有模型可保存")
            return False
        
        # 保存模型
        self.model.save(model_path)
        
        # 保存预处理器
        import joblib
        scaler_path = os.path.join(self.log_dir, "scaler.joblib")
        joblib.dump(self.scaler, scaler_path)
        
        # 保存训练配置
        config = {
            'sequence_length': self.sequence_length,
            'feature_dim': self.feature_dim,
            'model_path': model_path,
            'scaler_path': scaler_path,
            'log_dir': self.log_dir,
            'training_completed': datetime.now().isoformat()
        }
        
        config_path = os.path.join(self.log_dir, "training_config.json")
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        
        print(f"✅ 模型已保存: {model_path}")
        print(f"✅ 配置已保存: {config_path}")
        
        return True

class CustomMetricsCallback(keras.callbacks.Callback):
    """自定义指标回调"""
    
    def __init__(self, log_dir):
        super().__init__()
        self.log_dir = log_dir
        self.writer = tf.summary.create_file_writer(log_dir)
    
    def on_epoch_end(self, epoch, logs=None):
        logs = logs or {}
        
        with self.writer.as_default():
            # 记录学习率
            if hasattr(self.model.optimizer, 'learning_rate'):
                lr = float(self.model.optimizer.learning_rate)
                tf.summary.scalar('learning_rate', lr, step=epoch)
            
            # 记录梯度范数
            gradients = []
            for layer in self.model.layers:
                if hasattr(layer, 'kernel') and layer.kernel is not None:
                    gradients.append(tf.norm(layer.kernel))
            
            if gradients:
                avg_grad_norm = tf.reduce_mean(gradients)
                tf.summary.scalar('gradients/avg_norm', avg_grad_norm, step=epoch)
            
            # 记录模型复杂度指标
            total_params = self.model.count_params()
            tf.summary.scalar('model/total_parameters', total_params, step=epoch)
        
        self.writer.flush()

def main():
    """主程序 - TensorBoard增强训练"""
    print("🎯 帕金森症CNN-TCN模型 - TensorBoard增强版")
    print("=" * 60)
    
    # 创建模型
    model = ParkinsonCNNLSTMTensorBoardModel(sequence_length=50, feature_dim=9)
    
    try:
        # 加载或生成数据
        df = model.load_synthetic_data("data", generate_if_missing=True)
        
        # 训练模型
        experiment_name = f"parkinson_experiment_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        history = model.train_model_with_tensorboard(
            df, 
            epochs=30, 
            batch_size=16,
            experiment_name=experiment_name
        )
        
        # 保存模型
        model.save_model_and_artifacts()
        
        print("\n🎉 训练完成！")
        print(f"📊 TensorBoard: tensorboard --logdir={model.log_dir}")
        print("🌐 访问: http://localhost:6006")
        
    except Exception as e:
        print(f"❌ 训练过程出错: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
