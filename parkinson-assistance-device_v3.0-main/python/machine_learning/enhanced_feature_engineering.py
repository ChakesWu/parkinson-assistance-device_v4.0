#!/usr/bin/env python3
"""
增强特征工程模块
为帕金森症检测提供多域特征提取
包含时域、频域、统计域和医学特征
"""

import numpy as np
import pandas as pd
from scipy import signal, stats
from scipy.fft import fft, fftfreq
from sklearn.preprocessing import StandardScaler
import warnings
warnings.filterwarnings('ignore')

class EnhancedFeatureEngineer:
    """
    增强特征工程器
    从原始传感器数据提取多维度特征
    """
    
    def __init__(self, sampling_rate=100):
        """
        初始化特征工程器
        
        Args:
            sampling_rate: 采样率 (Hz)
        """
        self.sampling_rate = sampling_rate
        self.feature_names = []
        self._build_feature_names()
    
    def _build_feature_names(self):
        """构建特征名称列表"""
        sensors = ['finger_pinky', 'finger_ring', 'finger_middle', 
                  'finger_index', 'finger_thumb', 'emg', 'imu_x', 'imu_y', 'imu_z']
        
        # 时域统计特征
        time_features = ['mean', 'std', 'var', 'min', 'max', 'range', 
                        'skewness', 'kurtosis', 'rms', 'energy']
        
        # 频域特征
        freq_features = ['dominant_freq', 'spectral_centroid', 'spectral_spread',
                        'spectral_rolloff', 'spectral_flux', 'power_ratio_low',
                        'power_ratio_tremor', 'power_ratio_high']
        
        # 医学特征
        medical_features = ['tremor_intensity', 'bradykinesia_index', 
                           'rigidity_measure', 'coordination_score']
        
        # 组合特征名称
        for sensor in sensors:
            for feature in time_features:
                self.feature_names.append(f"{sensor}_{feature}")
            for feature in freq_features:
                self.feature_names.append(f"{sensor}_{feature}")
        
        # 添加跨传感器特征
        cross_features = ['finger_coordination', 'hand_tremor_coherence', 
                         'emg_finger_correlation', 'imu_stability_index',
                         'overall_tremor_score', 'movement_fluidity']
        self.feature_names.extend(cross_features)
        
        # 添加医学特征
        self.feature_names.extend(medical_features)
    
    def extract_time_domain_features(self, signal_data):
        """
        提取时域特征
        
        Args:
            signal_data: 时间序列数据 (1D array)
            
        Returns:
            features: 时域特征向量
        """
        if len(signal_data) == 0:
            return np.zeros(10)
        
        features = []
        
        # 基础统计特征
        features.append(np.mean(signal_data))           # 均值
        features.append(np.std(signal_data))            # 标准差
        features.append(np.var(signal_data))            # 方差
        features.append(np.min(signal_data))            # 最小值
        features.append(np.max(signal_data))            # 最大值
        features.append(np.max(signal_data) - np.min(signal_data))  # 范围
        
        # 高阶统计特征
        features.append(stats.skew(signal_data))        # 偏度
        features.append(stats.kurtosis(signal_data))    # 峰度
        
        # 能量特征
        rms = np.sqrt(np.mean(signal_data**2))          # 均方根
        energy = np.sum(signal_data**2)                 # 总能量
        features.extend([rms, energy])
        
        return np.array(features)
    
    def extract_frequency_domain_features(self, signal_data):
        """
        提取频域特征
        
        Args:
            signal_data: 时间序列数据
            
        Returns:
            features: 频域特征向量
        """
        if len(signal_data) < 8:
            return np.zeros(8)
        
        # 计算FFT
        fft_values = fft(signal_data)
        fft_magnitude = np.abs(fft_values[:len(fft_values)//2])
        frequencies = fftfreq(len(signal_data), 1/self.sampling_rate)[:len(fft_values)//2]
        
        if len(fft_magnitude) == 0:
            return np.zeros(8)
        
        features = []
        
        # 主频率
        dominant_freq_idx = np.argmax(fft_magnitude)
        dominant_freq = frequencies[dominant_freq_idx] if dominant_freq_idx < len(frequencies) else 0
        features.append(dominant_freq)
        
        # 频谱质心
        spectral_centroid = np.sum(frequencies * fft_magnitude) / (np.sum(fft_magnitude) + 1e-8)
        features.append(spectral_centroid)
        
        # 频谱扩散
        spectral_spread = np.sqrt(np.sum(((frequencies - spectral_centroid) ** 2) * fft_magnitude) / (np.sum(fft_magnitude) + 1e-8))
        features.append(spectral_spread)
        
        # 频谱滚降点 (85%能量点)
        cumsum_magnitude = np.cumsum(fft_magnitude)
        total_energy = cumsum_magnitude[-1]
        rolloff_idx = np.where(cumsum_magnitude >= 0.85 * total_energy)[0]
        spectral_rolloff = frequencies[rolloff_idx[0]] if len(rolloff_idx) > 0 else frequencies[-1]
        features.append(spectral_rolloff)
        
        # 频谱通量 (相邻帧间的频谱变化)
        if len(fft_magnitude) > 1:
            spectral_flux = np.sum(np.diff(fft_magnitude)**2)
        else:
            spectral_flux = 0
        features.append(spectral_flux)
        
        # 功率比特征
        total_power = np.sum(fft_magnitude**2) + 1e-8
        
        # 低频功率比 (0-2 Hz)
        low_freq_mask = frequencies <= 2.0
        power_ratio_low = np.sum(fft_magnitude[low_freq_mask]**2) / total_power
        features.append(power_ratio_low)
        
        # 震颤频率功率比 (3-8 Hz，帕金森典型震颤频率)
        tremor_freq_mask = (frequencies >= 3.0) & (frequencies <= 8.0)
        power_ratio_tremor = np.sum(fft_magnitude[tremor_freq_mask]**2) / total_power
        features.append(power_ratio_tremor)
        
        # 高频功率比 (>10 Hz)
        high_freq_mask = frequencies > 10.0
        power_ratio_high = np.sum(fft_magnitude[high_freq_mask]**2) / total_power
        features.append(power_ratio_high)
        
        return np.array(features)
    
    def extract_medical_features(self, finger_data, emg_data, imu_data):
        """
        提取医学相关特征
        
        Args:
            finger_data: 手指数据 (5, sequence_length)
            emg_data: EMG数据 (sequence_length,)
            imu_data: IMU数据 (3, sequence_length)
            
        Returns:
            features: 医学特征向量
        """
        features = []
        
        # 1. 震颤强度 (基于所有传感器的高频成分)
        tremor_intensity = 0
        all_signals = [*finger_data, emg_data, *imu_data]
        
        for signal_data in all_signals:
            if len(signal_data) > 0:
                # 计算3-8Hz频段的功率
                fft_vals = fft(signal_data)
                fft_mag = np.abs(fft_vals[:len(fft_vals)//2])
                freqs = fftfreq(len(signal_data), 1/self.sampling_rate)[:len(fft_vals)//2]
                
                tremor_mask = (freqs >= 3.0) & (freqs <= 8.0)
                tremor_power = np.sum(fft_mag[tremor_mask]**2)
                tremor_intensity += tremor_power
        
        features.append(tremor_intensity / len(all_signals))
        
        # 2. 运动迟缓指数 (基于运动速度和幅度)
        bradykinesia_index = 0
        for finger_signal in finger_data:
            if len(finger_signal) > 1:
                # 计算运动速度 (一阶差分)
                velocity = np.abs(np.diff(finger_signal))
                # 计算运动幅度
                amplitude = np.max(finger_signal) - np.min(finger_signal)
                # 运动迟缓 = 低速度 + 小幅度
                bradykinesia_index += 1.0 / (np.mean(velocity) + amplitude + 1e-8)
        
        features.append(bradykinesia_index / len(finger_data))
        
        # 3. 肌肉僵直度量 (基于EMG信号的基线水平)
        if len(emg_data) > 0:
            # 使用EMG信号的低频成分作为僵直指标
            emg_baseline = np.percentile(emg_data, 75)  # 75%分位数
            rigidity_measure = emg_baseline
        else:
            rigidity_measure = 0
        features.append(rigidity_measure)
        
        # 4. 协调性评分 (基于手指间的同步性)
        coordination_score = 0
        if len(finger_data) >= 2:
            correlations = []
            for i in range(len(finger_data)):
                for j in range(i+1, len(finger_data)):
                    if len(finger_data[i]) > 1 and len(finger_data[j]) > 1:
                        corr = np.corrcoef(finger_data[i], finger_data[j])[0, 1]
                        if not np.isnan(corr):
                            correlations.append(abs(corr))
            
            if correlations:
                coordination_score = np.mean(correlations)
        
        features.append(coordination_score)
        
        return np.array(features)
    
    def extract_cross_sensor_features(self, finger_data, emg_data, imu_data):
        """
        提取跨传感器特征
        
        Args:
            finger_data: 手指数据列表
            emg_data: EMG数据
            imu_data: IMU数据列表
            
        Returns:
            features: 跨传感器特征向量
        """
        features = []
        
        # 1. 手指协调性 (手指间运动的一致性)
        if len(finger_data) >= 2:
            finger_coords = []
            for i in range(len(finger_data)):
                for j in range(i+1, len(finger_data)):
                    if len(finger_data[i]) > 1 and len(finger_data[j]) > 1:
                        # 计算相位差
                        cross_corr = np.correlate(finger_data[i], finger_data[j], mode='full')
                        max_corr = np.max(np.abs(cross_corr))
                        finger_coords.append(max_corr)
            
            finger_coordination = np.mean(finger_coords) if finger_coords else 0
        else:
            finger_coordination = 0
        features.append(finger_coordination)
        
        # 2. 手部震颤一致性
        tremor_coherence = 0
        if len(finger_data) > 0 and len(imu_data) > 0:
            # 计算手指和IMU在震颤频段的相干性
            finger_tremor = 0
            for finger_signal in finger_data:
                if len(finger_signal) > 0:
                    fft_vals = fft(finger_signal)
                    fft_mag = np.abs(fft_vals)
                    freqs = fftfreq(len(finger_signal), 1/self.sampling_rate)
                    tremor_mask = (np.abs(freqs) >= 3.0) & (np.abs(freqs) <= 8.0)
                    finger_tremor += np.sum(fft_mag[tremor_mask]**2)
            
            imu_tremor = 0
            for imu_signal in imu_data:
                if len(imu_signal) > 0:
                    fft_vals = fft(imu_signal)
                    fft_mag = np.abs(fft_vals)
                    freqs = fftfreq(len(imu_signal), 1/self.sampling_rate)
                    tremor_mask = (np.abs(freqs) >= 3.0) & (np.abs(freqs) <= 8.0)
                    imu_tremor += np.sum(fft_mag[tremor_mask]**2)
            
            if finger_tremor > 0 and imu_tremor > 0:
                tremor_coherence = min(finger_tremor, imu_tremor) / max(finger_tremor, imu_tremor)
        
        features.append(tremor_coherence)
        
        # 3. EMG-手指相关性
        emg_finger_corr = 0
        if len(emg_data) > 0 and len(finger_data) > 0:
            correlations = []
            for finger_signal in finger_data:
                if len(finger_signal) == len(emg_data) and len(finger_signal) > 1:
                    corr = np.corrcoef(finger_signal, emg_data)[0, 1]
                    if not np.isnan(corr):
                        correlations.append(abs(corr))
            
            emg_finger_corr = np.mean(correlations) if correlations else 0
        
        features.append(emg_finger_corr)
        
        # 4. IMU稳定性指数
        imu_stability = 0
        if len(imu_data) > 0:
            stabilities = []
            for imu_signal in imu_data:
                if len(imu_signal) > 1:
                    # 计算信号的变异系数
                    cv = np.std(imu_signal) / (np.mean(np.abs(imu_signal)) + 1e-8)
                    stabilities.append(1.0 / (cv + 1e-8))  # 稳定性 = 1/变异性
            
            imu_stability = np.mean(stabilities) if stabilities else 0
        
        features.append(imu_stability)
        
        # 5. 整体震颤评分
        overall_tremor = 0
        all_signals = [*finger_data, emg_data, *imu_data]
        tremor_powers = []
        
        for signal_data in all_signals:
            if len(signal_data) > 4:
                # 使用带通滤波器提取震颤频段
                try:
                    sos = signal.butter(4, [3.0, 8.0], btype='band', fs=self.sampling_rate, output='sos')
                    tremor_signal = signal.sosfilt(sos, signal_data)
                    tremor_power = np.var(tremor_signal)
                    tremor_powers.append(tremor_power)
                except:
                    tremor_powers.append(0)
        
        overall_tremor = np.mean(tremor_powers) if tremor_powers else 0
        features.append(overall_tremor)
        
        # 6. 运动流畅性
        movement_fluidity = 0
        if len(finger_data) > 0:
            fluidities = []
            for finger_signal in finger_data:
                if len(finger_signal) > 2:
                    # 计算二阶差分 (加速度)
                    acceleration = np.diff(finger_signal, n=2)
                    # 流畅性 = 低加速度变化
                    fluidity = 1.0 / (np.std(acceleration) + 1e-8)
                    fluidities.append(fluidity)
            
            movement_fluidity = np.mean(fluidities) if fluidities else 0
        
        features.append(movement_fluidity)
        
        return np.array(features)
    
    def extract_all_features(self, sequence_data):
        """
        提取完整特征向量
        
        Args:
            sequence_data: 序列数据 (sequence_length, 9)
                          [finger1, finger2, finger3, finger4, finger5, emg, imu_x, imu_y, imu_z]
        
        Returns:
            features: 完整特征向量
        """
        if len(sequence_data) == 0:
            return np.zeros(len(self.feature_names))
        
        # 分离不同类型的传感器数据
        finger_data = [sequence_data[:, i] for i in range(5)]  # 5个手指
        emg_data = sequence_data[:, 5]                         # EMG
        imu_data = [sequence_data[:, i] for i in range(6, 9)]  # 3轴IMU
        
        all_features = []
        
        # 为每个传感器提取时域和频域特征
        for i in range(9):
            signal_data = sequence_data[:, i]
            
            # 时域特征
            time_features = self.extract_time_domain_features(signal_data)
            all_features.extend(time_features)
            
            # 频域特征
            freq_features = self.extract_frequency_domain_features(signal_data)
            all_features.extend(freq_features)
        
        # 跨传感器特征
        cross_features = self.extract_cross_sensor_features(finger_data, emg_data, imu_data)
        all_features.extend(cross_features)
        
        # 医学特征
        medical_features = self.extract_medical_features(finger_data, emg_data, imu_data)
        all_features.extend(medical_features)
        
        # 处理NaN和无穷值
        features = np.array(all_features, dtype=np.float32)
        features = np.nan_to_num(features, nan=0.0, posinf=1e6, neginf=-1e6)
        
        return features
    
    def get_feature_names(self):
        """获取特征名称列表"""
        return self.feature_names.copy()
    
    def get_feature_count(self):
        """获取特征数量"""
        return len(self.feature_names)

def main():
    """测试特征工程器"""
    print("🔧 增强特征工程器测试")
    print("=" * 50)
    
    # 创建特征工程器
    engineer = EnhancedFeatureEngineer(sampling_rate=100)
    
    # 生成测试数据
    sequence_length = 50
    test_data = np.random.randn(sequence_length, 9)
    
    # 提取特征
    features = engineer.extract_all_features(test_data)
    
    print(f"✅ 输入数据形状: {test_data.shape}")
    print(f"✅ 输出特征数量: {len(features)}")
    print(f"✅ 预期特征数量: {engineer.get_feature_count()}")
    
    # 显示特征名称
    feature_names = engineer.get_feature_names()
    print(f"\n📊 特征类别统计:")
    print(f"  • 时域特征: {sum(1 for name in feature_names if any(stat in name for stat in ['mean', 'std', 'var', 'skew', 'kurt', 'rms', 'energy']))}")
    print(f"  • 频域特征: {sum(1 for name in feature_names if any(freq in name for freq in ['freq', 'spectral', 'power']))}")
    print(f"  • 跨传感器特征: {sum(1 for name in feature_names if any(cross in name for cross in ['coordination', 'coherence', 'correlation', 'stability', 'tremor_score', 'fluidity']))}")
    print(f"  • 医学特征: {sum(1 for name in feature_names if any(med in name for med in ['tremor_intensity', 'bradykinesia', 'rigidity', 'coordination_score']))}")
    
    print(f"\n🎉 特征工程器测试完成！")

if __name__ == "__main__":
    main()
