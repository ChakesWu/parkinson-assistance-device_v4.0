"""
合成帕金森症传感器数据生成器
用于模拟真实设备数据，支持TensorBoard训练可视化
"""

import numpy as np
import json
import os
from datetime import datetime, timedelta

class ParkinsonSyntheticDataGenerator:
    def __init__(self, sequence_length=50, feature_dim=9):
        """
        初始化合成数据生成器
        
        Args:
            sequence_length: 时间序列长度
            feature_dim: 特征维度 (5个手指 + 1个EMG + 3个IMU = 9)
        """
        self.sequence_length = sequence_length
        self.feature_dim = feature_dim
        
        # 帕金森症状参数配置
        self.parkinson_params = {
            1: {  # 轻度
                'tremor_amplitude': 0.05,
                'tremor_frequency': 4.5,
                'stiffness': 0.1,
                'coordination_loss': 0.05,
                'fatigue_rate': 0.02
            },
            2: {  # 轻中度
                'tremor_amplitude': 0.12,
                'tremor_frequency': 5.0,
                'stiffness': 0.2,
                'coordination_loss': 0.15,
                'fatigue_rate': 0.05
            },
            3: {  # 中度
                'tremor_amplitude': 0.25,
                'tremor_frequency': 5.5,
                'stiffness': 0.35,
                'coordination_loss': 0.3,
                'fatigue_rate': 0.08
            },
            4: {  # 中重度
                'tremor_amplitude': 0.4,
                'tremor_frequency': 6.0,
                'stiffness': 0.5,
                'coordination_loss': 0.5,
                'fatigue_rate': 0.12
            },
            5: {  # 重度
                'tremor_amplitude': 0.6,
                'tremor_frequency': 6.5,
                'stiffness': 0.7,
                'coordination_loss': 0.7,
                'fatigue_rate': 0.15
            }
        }
    
    def generate_finger_data(self, level, time_points, patient_id):
        """生成手指弯曲传感器数据"""
        params = self.parkinson_params[level]
        finger_data = []
        
        # 每根手指的基础特性
        finger_base = [0.3, 0.4, 0.5, 0.6, 0.2]  # 小指到拇指的基础弯曲度
        
        # 添加患者个体差异
        patient_variation = np.random.normal(0, 0.1, 5)  # 每根手指的个体差异
        
        for t_idx, t in enumerate(time_points):
            fingers = []
            
            for f_idx in range(5):
                # 基础弯曲度 + 个体差异
                base_flex = finger_base[f_idx] + patient_variation[f_idx]
                
                # 震颤成分 (4-7Hz典型帕金森震颤) - 增加变化性
                tremor_freq = params['tremor_frequency'] + np.random.normal(0, 0.2)  # 频率变化
                tremor = params['tremor_amplitude'] * (
                    np.sin(2 * np.pi * tremor_freq * t / 100 + f_idx * np.pi / 3) +
                    0.3 * np.sin(2 * np.pi * tremor_freq * 1.5 * t / 100)  # 添加谐波
                )
                
                # 僵直成分 - 增加时间变化
                stiffness_base = params['stiffness'] * (1 - np.exp(-t / 20))
                stiffness_variation = 0.1 * np.sin(2 * np.pi * t / 50)  # 周期性变化
                stiffness_factor = stiffness_base + stiffness_variation
                
                # 协调性损失 (手指间不同步) - 增强
                coordination_noise = params['coordination_loss'] * np.random.normal(0, 0.15)
                
                # 疲劳效应 (随时间增加) - 非线性
                fatigue = params['fatigue_rate'] * (t / 100) * (1 + 0.5 * np.sin(t / 30))
                
                # 运动任务模拟 (握拳-松开循环)
                task_cycle = 0.2 * np.sin(2 * np.pi * t / 25) * (level / 5)  # 根据等级调整幅度
                
                # 合成最终值
                finger_value = (base_flex + tremor + stiffness_factor + 
                              coordination_noise + fatigue + task_cycle)
                
                # 添加测量噪声 - 根据等级调整
                noise_level = 0.02 + (level - 1) * 0.01
                finger_value += np.random.normal(0, noise_level)
                
                # 限制在合理范围 [0, 1]
                finger_value = np.clip(finger_value, 0, 1)
                fingers.append(finger_value)
            
            finger_data.append(fingers)
        
        return np.array(finger_data)
    
    def generate_emg_data(self, level, time_points, finger_data):
        """生成EMG肌电信号数据"""
        params = self.parkinson_params[level]
        emg_data = []
        
        # EMG基线变化
        baseline_drift = np.random.normal(0.3, 0.05)
        
        for t_idx, t in enumerate(time_points):
            # EMG与手指运动相关 - 增强相关性
            finger_activity = np.mean(finger_data[t_idx])
            finger_velocity = 0 if t_idx == 0 else np.mean(np.abs(finger_data[t_idx] - finger_data[t_idx-1]))
            
            # 基础肌肉激活 - 增加变化性
            base_emg = baseline_drift + finger_activity * 0.4 + finger_velocity * 2.0
            
            # 肌肉震颤 (与手指震颤相关但有延迟)
            muscle_tremor = params['tremor_amplitude'] * 0.8 * (
                np.sin(2 * np.pi * params['tremor_frequency'] * t / 100 + np.pi / 4) +
                0.2 * np.sin(2 * np.pi * params['tremor_frequency'] * 2.1 * t / 100)  # 谐波
            )
            
            # 肌肉疲劳 - 非线性增长
            muscle_fatigue = params['fatigue_rate'] * 1.5 * (t / 100) ** 1.2
            
            # 肌肉僵直 - 时变
            muscle_stiffness = params['stiffness'] * 0.6 * (1 + 0.3 * np.sin(t / 40))
            
            # 协同收缩 (帕金森症特征)
            co_contraction = params['stiffness'] * 0.2 * np.abs(np.sin(t / 15))
            
            # 合成EMG信号
            emg_value = (base_emg + muscle_tremor + muscle_fatigue + 
                        muscle_stiffness + co_contraction)
            
            # 添加EMG特有的高频噪声和基线漂移
            emg_noise = np.random.normal(0, 0.05) + 0.01 * np.sin(t / 5)
            emg_value += emg_noise
            
            # 限制范围
            emg_value = np.clip(emg_value, 0, 1)
            emg_data.append(emg_value)
        
        return np.array(emg_data)
    
    def generate_imu_data(self, level, time_points, finger_data):
        """生成IMU惯性测量数据 (加速度计)"""
        params = self.parkinson_params[level]
        imu_data = []
        
        for t_idx, t in enumerate(time_points):
            imu_xyz = []
            
            # 手部运动强度
            movement_intensity = np.std(finger_data[max(0, t_idx-5):t_idx+1])
            
            for axis in range(3):  # X, Y, Z轴
                # 基础运动
                base_movement = movement_intensity * 0.5
                
                # 震颤成分 (在IMU中表现为高频振动)
                tremor_imu = params['tremor_amplitude'] * 1.2 * np.sin(
                    2 * np.pi * params['tremor_frequency'] * t / 100 + 
                    axis * np.pi / 2
                )
                
                # 运动不协调 (表现为不规则加速度变化)
                coordination_loss = params['coordination_loss'] * np.random.normal(0, 0.15)
                
                # 重力影响 (Z轴)
                gravity_effect = 0.1 if axis == 2 else 0
                
                # 合成IMU值
                imu_value = base_movement + tremor_imu + coordination_loss + gravity_effect
                
                # 添加传感器噪声
                imu_value += np.random.normal(0, 0.03)
                
                # IMU范围通常是 [-2g, 2g]，这里标准化到 [-1, 1]
                imu_value = np.clip(imu_value, -1, 1)
                imu_xyz.append(imu_value)
            
            imu_data.append(imu_xyz)
        
        return np.array(imu_data)
    
    def generate_patient_session(self, patient_id, parkinson_level, session_duration=300):
        """
        生成单个患者的完整会话数据
        
        Args:
            patient_id: 患者ID
            parkinson_level: 帕金森等级 (1-5)
            session_duration: 会话持续时间 (秒)
        """
        # 生成时间点 (10Hz采样率)
        time_points = np.arange(0, session_duration, 0.1)
        
        # 生成各传感器数据
        finger_data = self.generate_finger_data(parkinson_level, time_points, patient_id)
        emg_data = self.generate_emg_data(parkinson_level, time_points, finger_data)
        imu_data = self.generate_imu_data(parkinson_level, time_points, finger_data)
        
        # 组合数据
        session_data = []
        start_time = datetime.now()
        
        for i, t in enumerate(time_points):
            data_point = {
                'timestamp': (start_time + timedelta(seconds=t)).isoformat(),
                'fingers': finger_data[i].tolist(),
                'emg': float(emg_data[i]),
                'imu': imu_data[i].tolist()
            }
            session_data.append(data_point)
        
        # 会话元数据
        session_info = {
            'patient_id': patient_id,
            'parkinson_level': parkinson_level,
            'session_start': start_time.isoformat(),
            'session_duration': session_duration,
            'sampling_rate': 10,  # Hz
            'data_points': len(session_data),
            'data': session_data
        }
        
        return session_info
    
    def generate_dataset(self, num_patients_per_level=5, output_dir="data"):
        """
        生成完整的合成数据集
        
        Args:
            num_patients_per_level: 每个等级的患者数量
            output_dir: 输出目录
        """
        print(f"🔄 开始生成合成帕金森症数据集...")
        print(f"📊 每个等级 {num_patients_per_level} 个患者，共 {num_patients_per_level * 5} 个患者")
        
        os.makedirs(output_dir, exist_ok=True)
        
        total_sessions = 0
        
        for level in range(1, 6):  # 帕金森等级 1-5
            print(f"\n📋 生成等级 {level} 数据...")
            
            for patient_idx in range(num_patients_per_level):
                patient_id = f"P{level:02d}_{patient_idx+1:03d}"
                
                # 生成多个会话 (每个患者2-4个会话)
                num_sessions = np.random.randint(2, 5)
                
                for session_idx in range(num_sessions):
                    # 会话时长变化 (180-420秒)
                    session_duration = np.random.randint(180, 421)
                    
                    session_data = self.generate_patient_session(
                        patient_id, level, session_duration
                    )
                    
                    # 保存会话数据
                    filename = f"{patient_id}_session_{session_idx+1}.json"
                    filepath = os.path.join(output_dir, filename)
                    
                    with open(filepath, 'w', encoding='utf-8') as f:
                        json.dump(session_data, f, indent=2, ensure_ascii=False)
                    
                    total_sessions += 1
                    
                    if total_sessions % 10 == 0:
                        print(f"  ✅ 已生成 {total_sessions} 个会话...")
        
        print(f"\n🎉 数据集生成完成！")
        print(f"📁 输出目录: {output_dir}")
        print(f"📊 总会话数: {total_sessions}")
        print(f"📈 预估数据点: {total_sessions * 2500} 个")
        
        # 生成数据集摘要
        self._generate_dataset_summary(output_dir, total_sessions)
        
        return output_dir
    
    def _generate_dataset_summary(self, output_dir, total_sessions):
        """生成数据集摘要报告"""
        summary = {
            'dataset_info': {
                'generation_time': datetime.now().isoformat(),
                'total_sessions': total_sessions,
                'parkinson_levels': 5,
                'features': {
                    'fingers': 5,
                    'emg': 1,
                    'imu': 3
                },
                'sequence_length': self.sequence_length,
                'sampling_rate': 10
            },
            'data_characteristics': {
                'tremor_frequencies': '4.5-6.5 Hz',
                'measurement_noise': 'Gaussian (σ=0.02-0.05)',
                'session_duration': '180-420 seconds',
                'realistic_symptoms': True
            }
        }
        
        summary_path = os.path.join(output_dir, 'dataset_summary.json')
        with open(summary_path, 'w', encoding='utf-8') as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)
        
        print(f"📋 数据集摘要已保存: {summary_path}")
    
    def visualize_sample_data(self, data_dir="data", save_plots=True):
        """可视化样本数据"""
        print("📊 Generating data visualization...")

        try:
            import matplotlib.pyplot as plt
        except Exception as e:
            print(f"⚠️ Visualization skipped because matplotlib could not be imported: {e}")
            return False

        plt.rcParams['font.family'] = ['DejaVu Sans', 'Arial', 'sans-serif']
        plt.rcParams['axes.unicode_minus'] = False
        
        # 读取每个等级的一个样本
        fig, axes = plt.subplots(5, 3, figsize=(15, 20))
        for level in range(1, 6):
            # 找到该等级的第一个文件
            for filename in os.listdir(data_dir):
                if filename.startswith(f"P{level:02d}_") and filename.endswith('.json'):
                    filepath = os.path.join(data_dir, filename)
                    
                    with open(filepath, 'r', encoding='utf-8') as f:
                        session_data = json.load(f)
                    
                    # 提取前500个数据点用于可视化
                    data_points = session_data['data'][:500]
                    
                    # 提取时间序列
                    fingers = np.array([point['fingers'] for point in data_points])
                    emg = np.array([point['emg'] for point in data_points])
                    imu = np.array([point['imu'] for point in data_points])
                    
                    time_axis = np.arange(len(data_points)) * 0.1  # 10Hz
                    
                    # 绘制手指数据
                    ax1 = axes[level-1, 0]
                    for i in range(5):
                        ax1.plot(time_axis, fingers[:, i], label=f'Finger {i+1}', alpha=0.7)
                    ax1.set_title(f'Level {level} - Finger Flexion')
                    ax1.set_ylabel('Flexion')
                    ax1.legend(fontsize=8)
                    ax1.grid(True, alpha=0.3)
                    
                    # 绘制EMG数据
                    ax2 = axes[level-1, 1]
                    ax2.plot(time_axis, emg, 'r-', linewidth=1)
                    ax2.set_title(f'Level {level} - EMG Signal')
                    ax2.set_ylabel('EMG Amplitude')
                    ax2.grid(True, alpha=0.3)
                    
                    # 绘制IMU数据
                    ax3 = axes[level-1, 2]
                    ax3.plot(time_axis, imu[:, 0], 'b-', label='X-axis', alpha=0.7)
                    ax3.plot(time_axis, imu[:, 1], 'g-', label='Y-axis', alpha=0.7)
                    ax3.plot(time_axis, imu[:, 2], 'r-', label='Z-axis', alpha=0.7)
                    ax3.set_title(f'Level {level} - IMU Acceleration')
                    ax3.set_ylabel('Acceleration (g)')
                    ax3.legend(fontsize=8)
                    ax3.grid(True, alpha=0.3)
                    
                    if level == 5:  # 最后一行添加x轴标签
                        ax1.set_xlabel('Time (s)')
                        ax2.set_xlabel('Time (s)')
                        ax3.set_xlabel('Time (s)')
                    
                    break
        
        plt.tight_layout()
        
        if save_plots:
            plot_path = os.path.join(data_dir, 'sample_data_visualization.png')
            plt.savefig(plot_path, dpi=300, bbox_inches='tight')
            print(f"📊 Visualization chart saved: {plot_path}")
        
        plt.show()

def main():
    """主程序 - 生成合成数据集"""
    print("🎯 帕金森症合成数据生成器")
    print("=" * 50)
    
    # 创建生成器
    generator = ParkinsonSyntheticDataGenerator()
    
    # 生成数据集
    output_dir = generator.generate_dataset(
        num_patients_per_level=15,  # 每个等级15个患者
        output_dir="data"
    )
    
    # 可视化样本数据
    generator.visualize_sample_data(output_dir)
    
    print("\n✅ 合成数据集生成完成！")
    print("📋 下一步: 运行带TensorBoard的模型训练")

if __name__ == "__main__":
    main()
