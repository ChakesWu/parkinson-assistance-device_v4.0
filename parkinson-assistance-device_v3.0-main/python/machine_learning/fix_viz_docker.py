#!/usr/bin/env python3
"""
在Docker环境中修复可视化图片的字体问题
"""

import os
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')  # 使用非交互式后端
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm

def setup_font():
    """设置字体以避免中文乱码"""
    # 设置字体为英文，避免中文乱码
    plt.rcParams['font.family'] = ['DejaVu Sans', 'Arial', 'sans-serif']
    plt.rcParams['axes.unicode_minus'] = False
    plt.rcParams['font.size'] = 10

def regenerate_clean_visualization(data_dir="medical_data"):
    """重新生成清晰的可视化图片"""
    
    print("🎨 重新生成可视化图片...")
    setup_font()
    
    # 创建图表
    fig, axes = plt.subplots(5, 3, figsize=(16, 20))
    fig.suptitle('Parkinson Disease Synthetic Data - Medical Literature Based', 
                 fontsize=18, fontweight='bold', y=0.98)

    if not os.path.exists(data_dir):
        print(f"❌ Data directory {data_dir} does not exist")
        return False

    json_files = [f for f in os.listdir(data_dir) if f.endswith('.json') and f != 'medical_dataset_summary.json']
    if len(json_files) == 0:
        print(f"❌ No session data files found in {data_dir}")
        return False

    print(f"📁 Found {len(json_files)} data files")

    # 定义颜色方案
    finger_colors = ['#e74c3c', '#f39c12', '#f1c40f', '#27ae60', '#3498db']
    finger_names = ['Pinky', 'Ring', 'Middle', 'Index', 'Thumb']
    imu_colors = ['#3498db', '#27ae60', '#e74c3c']
    imu_labels = ['X-axis', 'Y-axis', 'Z-axis']

    # 为每个UPDRS等级生成图表
    for level in range(1, 6):
        chosen = None
        for filename in sorted(json_files):
            filepath = os.path.join(data_dir, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    session_data = json.load(f)
                if int(session_data.get('updrs_level', -1)) == level:
                    chosen = session_data
                    break
            except Exception as e:
                continue

        if chosen is None:
            print(f"⚠️ No data found for UPDRS level {level}")
            # 创建空白图表
            for col in range(3):
                ax = axes[level-1, col]
                ax.text(0.5, 0.5, f'No Data\nUPDRS Level {level}', 
                       ha='center', va='center', transform=ax.transAxes,
                       fontsize=12, alpha=0.5)
                ax.set_xlim(0, 1)
                ax.set_ylim(0, 1)
            continue

        data_points = chosen.get('data', [])[:500]
        if len(data_points) == 0:
            continue

        # 提取数据
        fingers = np.array([point['fingers'] for point in data_points])
        emg = np.array([point['emg'] for point in data_points])
        imu = np.array([point['imu'] for point in data_points])

        sampling_rate = float(chosen.get('sampling_rate', 10))
        time_axis = np.arange(len(data_points)) / sampling_rate

        # 手指弯曲度图表
        ax1 = axes[level-1, 0]
        for i in range(5):
            ax1.plot(time_axis, fingers[:, i], 
                    label=finger_names[i], 
                    color=finger_colors[i], 
                    alpha=0.8, 
                    linewidth=1.5)
        
        ax1.set_title(f'UPDRS Level {level} - Finger Flexion', 
                     fontsize=13, fontweight='bold', pad=10)
        ax1.set_ylabel('Flexion Angle', fontsize=11)
        ax1.legend(fontsize=9, loc='upper right', framealpha=0.9)
        ax1.grid(True, alpha=0.3, linestyle='--')
        ax1.set_xlim(0, time_axis[-1])

        # EMG信号图表
        ax2 = axes[level-1, 1]
        ax2.plot(time_axis, emg, color='#e74c3c', linewidth=1.5, alpha=0.8)
        ax2.set_title(f'UPDRS Level {level} - EMG Signal', 
                     fontsize=13, fontweight='bold', pad=10)
        ax2.set_ylabel('EMG Amplitude (mV)', fontsize=11)
        ax2.grid(True, alpha=0.3, linestyle='--')
        ax2.set_xlim(0, time_axis[-1])

        # IMU加速度图表
        ax3 = axes[level-1, 2]
        for i in range(3):
            ax3.plot(time_axis, imu[:, i], 
                    label=imu_labels[i], 
                    color=imu_colors[i], 
                    alpha=0.8, 
                    linewidth=1.5)
        
        ax3.set_title(f'UPDRS Level {level} - IMU Acceleration', 
                     fontsize=13, fontweight='bold', pad=10)
        ax3.set_ylabel('Acceleration (g)', fontsize=11)
        ax3.legend(fontsize=9, loc='upper right', framealpha=0.9)
        ax3.grid(True, alpha=0.3, linestyle='--')
        ax3.set_xlim(0, time_axis[-1])

        # 只在最后一行添加x轴标签
        if level == 5:
            ax1.set_xlabel('Time (seconds)', fontsize=11)
            ax2.set_xlabel('Time (seconds)', fontsize=11)
            ax3.set_xlabel('Time (seconds)', fontsize=11)

    # 调整布局
    plt.tight_layout()
    plt.subplots_adjust(top=0.96, hspace=0.3, wspace=0.3)

    # 保存图片
    plot_path = os.path.join(data_dir, 'sample_data_visualization.png')
    plt.savefig(plot_path, dpi=300, bbox_inches='tight', 
                facecolor='white', edgecolor='none', 
                format='png', transparent=False)
    
    print(f"✅ Clean visualization chart saved: {plot_path}")
    plt.close()
    return True

if __name__ == "__main__":
    print("🎨 Fixing visualization image in Docker environment")
    print("=" * 60)
    
    try:
        success = regenerate_clean_visualization()
        if success:
            print("🎉 Visualization image fixed successfully!")
            print("📊 Image path: medical_data/sample_data_visualization.png")
        else:
            print("❌ Failed to fix visualization image")
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
