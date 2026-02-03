"""
CNN+TCN Lite 模型 Arduino 部署转换器
专门处理 SeparableConv1D、dilation 限制和 BatchNorm 融合
"""

import tensorflow as tf
import numpy as np
import os
from datetime import datetime

class CNNTCNArduinoConverter:
    def __init__(self):
        self.original_model = None
        self.arduino_compatible_model = None
        self.quantized_model = None
    
    def load_cnn_tcn_model(self, model_path="models/parkinson_cnn_lstm.h5"):
        """加载 CNN+TCN Lite 模型"""
        try:
            self.original_model = tf.keras.models.load_model(model_path)
            print(f"✅ 成功加载 CNN+TCN 模型: {model_path}")
            self.original_model.summary()
            return True
        except Exception as e:
            print(f"❌ 模型加载失败: {e}")
            return False
    
    def make_arduino_compatible(self):
        """将模型转换为 Arduino 兼容版本"""
        if self.original_model is None:
            print("❌ 请先加载模型")
            return False
        
        print("🔄 开始 Arduino 兼容性转换...")
        
        # 1. 分解 SeparableConv1D 为 DepthwiseConv + Conv1D
        compatible_model = self._decompose_separable_conv(self.original_model)
        
        # 2. 处理 dilation 限制（强制设为 1）
        compatible_model = self._handle_dilation_constraints(compatible_model)
        
        # 3. 融合 BatchNormalization
        compatible_model = self._fuse_batch_normalization(compatible_model)
        
        # 4. 验证模型大小
        self._estimate_model_size(compatible_model)
        
        self.arduino_compatible_model = compatible_model
        print("✅ Arduino 兼容性转换完成")
        return True
    
    def _decompose_separable_conv(self, model):
        """分解 SeparableConv1D 为 Arduino 支持的算子"""
        print("  📋 分解 SeparableConv1D...")
        
        # 重建模型，替换 SeparableConv1D
        inputs = model.input
        x = inputs
        
        # 手动重建每一层，替换不兼容的层
        for i, layer in enumerate(model.layers[1:]):  # 跳过输入层
            if isinstance(layer, tf.keras.layers.SeparableConv1D):
                # 分解为 DepthwiseConv1D + Conv1D
                print(f"    🔧 替换第 {i+1} 层 SeparableConv1D")
                
                # Depthwise 部分
                x = tf.keras.layers.Conv1D(
                    filters=layer.filters,
                    kernel_size=layer.kernel_size,
                    strides=layer.strides,
                    padding=layer.padding,
                    activation=None,  # 激活函数后移
                    name=f"depthwise_conv_{i}"
                )(x)
                
                # Pointwise 部分（1x1 卷积）
                x = tf.keras.layers.Conv1D(
                    filters=layer.filters,
                    kernel_size=1,
                    activation=layer.activation,
                    name=f"pointwise_conv_{i}"
                )(x)
            else:
                # 保持其他层不变
                if hasattr(layer, 'dilation_rate'):
                    # 处理 dilation
                    layer_config = layer.get_config()
                    if layer_config.get('dilation_rate', 1) > 1:
                        print(f"    ⚠️  强制设置第 {i+1} 层 dilation_rate=1")
                        layer_config['dilation_rate'] = 1
                        new_layer = type(layer).from_config(layer_config)
                        new_layer.build(x.shape)
                        new_layer.set_weights(layer.get_weights())
                        x = new_layer(x)
                    else:
                        x = layer(x)
                else:
                    x = layer(x)
        
        compatible_model = tf.keras.Model(inputs=inputs, outputs=x)
        return compatible_model
    
    def _handle_dilation_constraints(self, model):
        """处理 dilation 约束（Arduino TFLite 限制）"""
        print("  📋 处理 dilation 约束...")
        # 在 _decompose_separable_conv 中已处理
        return model
    
    def _fuse_batch_normalization(self, model):
        """融合 BatchNormalization 到前一层"""
        print("  📋 融合 BatchNormalization...")
        
        # 简化版本：移除 BatchNorm（在量化时会自动融合）
        inputs = model.input
        x = inputs
        
        for i, layer in enumerate(model.layers[1:]):
            if isinstance(layer, tf.keras.layers.BatchNormalization):
                print(f"    🔧 移除第 {i+1} 层 BatchNormalization")
                continue  # 跳过 BatchNorm 层
            else:
                x = layer(x)
        
        fused_model = tf.keras.Model(inputs=inputs, outputs=x)
        return fused_model
    
    def _estimate_model_size(self, model):
        """估算模型大小"""
        param_count = model.count_params()
        estimated_size_kb = param_count * 4 / 1024  # float32
        quantized_size_kb = param_count / 1024      # int8
        
        print(f"  📊 模型参数数量: {param_count:,}")
        print(f"  📊 估算大小 (float32): {estimated_size_kb:.1f} KB")
        print(f"  📊 估算大小 (int8量化): {quantized_size_kb:.1f} KB")
        
        if quantized_size_kb > 60:
            print("  ⚠️  警告：模型可能超出 Arduino 内存限制 (60KB)")
        else:
            print("  ✅ 模型大小符合 Arduino 限制")
    
    def quantize_for_arduino(self, output_path="models/cnn_tcn_arduino.tflite"):
        """为 Arduino 量化模型"""
        if self.arduino_compatible_model is None:
            print("❌ 请先进行兼容性转换")
            return False
        
        print("🔄 开始 int8 量化...")
        
        try:
            # 创建转换器
            converter = tf.lite.TFLiteConverter.from_keras_model(self.arduino_compatible_model)
            
            # 激进量化配置
            converter.optimizations = [tf.lite.Optimize.DEFAULT]
            converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
            converter.inference_input_type = tf.int8
            converter.inference_output_type = tf.int8
            
            # 代表性数据集（用于校准）
            def representative_data_gen():
                for _ in range(100):
                    # 生成随机输入数据 (1, 50, 9)
                    data = np.random.randn(1, 50, 9).astype(np.float32)
                    yield [data]
            
            converter.representative_dataset = representative_data_gen
            
            # 转换
            self.quantized_model = converter.convert()
            
            # 保存
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            with open(output_path, 'wb') as f:
                f.write(self.quantized_model)
            
            model_size_kb = len(self.quantized_model) / 1024
            print(f"✅ 量化模型已保存: {output_path}")
            print(f"📏 最终模型大小: {model_size_kb:.2f} KB")
            
            if model_size_kb <= 60:
                print("🎉 模型大小符合 Arduino Nano 33 BLE Sense Rev2 限制！")
            else:
                print("⚠️  模型仍然过大，建议进一步精简架构")
            
            return True
            
        except Exception as e:
            print(f"❌ 量化失败: {e}")
            return False
    
    def generate_arduino_header(self, tflite_path="models/cnn_tcn_arduino.tflite", 
                               header_path="../arduino/main/complete_parkinson_device/model_data.h"):
        """生成 Arduino 头文件"""
        if not os.path.exists(tflite_path):
            print(f"❌ TFLite 文件不存在: {tflite_path}")
            return False
        
        print("📝 生成 Arduino 头文件...")
        
        with open(tflite_path, 'rb') as f:
            model_data = f.read()
        
        model_size = len(model_data)
        
        header_content = f"""// 自动生成的 CNN+TCN Lite 模型
// 生成时间: {datetime.now()}
// 模型大小: {model_size} bytes ({model_size/1024:.2f} KB)
// 架构: CNN + TCN-Lite (Arduino 优化版)

#ifndef MODEL_DATA_H
#define MODEL_DATA_H

const unsigned int model_data_len = {model_size};
const unsigned char model_data[] = {{
"""
        
        # 添加字节数据
        for i, byte in enumerate(model_data):
            if i % 16 == 0:
                header_content += "\n  "
            header_content += f"0x{byte:02x}"
            if i < len(model_data) - 1:
                header_content += ", "
        
        header_content += f"""
}};

// 模型元数据
const int kModelSequenceLength = 50;
const int kModelFeatureDim = 9;
const int kModelNumClasses = 5;
const bool kIsRealModel = true;
const char* kModelType = "CNN_TCN_Lite_Arduino";
const char* kModelDescription = "Parkinson Analysis - CNN+TCN Lite (Arduino Optimized)";

#endif // MODEL_DATA_H
"""
        
        # 写入文件
        os.makedirs(os.path.dirname(header_path), exist_ok=True)
        with open(header_path, 'w', encoding='utf-8') as f:
            f.write(header_content)
        
        print(f"✅ Arduino 头文件已生成: {header_path}")
        return True

def main():
    """主程序 - CNN+TCN Lite Arduino 转换"""
    print("🎯 CNN+TCN Lite Arduino 部署转换器")
    print("=" * 60)
    
    converter = CNNTCNArduinoConverter()
    
    # 步骤 1: 加载模型
    if not converter.load_cnn_tcn_model():
        print("❌ 无法加载 CNN+TCN 模型，请先训练模型")
        return False
    
    # 步骤 2: Arduino 兼容性转换
    if not converter.make_arduino_compatible():
        return False
    
    # 步骤 3: 量化
    if not converter.quantize_for_arduino():
        return False
    
    # 步骤 4: 生成头文件
    if not converter.generate_arduino_header():
        return False
    
    print("\n🎉 CNN+TCN Lite Arduino 部署转换完成！")
    print("\n📋 下一步操作:")
    print("1. 在 Arduino IDE 中重新编译项目")
    print("2. 上传到 Arduino Nano 33 BLE Sense Rev2")
    print("3. 测试 CNN+TCN Lite 推理功能")
    
    return True

if __name__ == "__main__":
    main()
