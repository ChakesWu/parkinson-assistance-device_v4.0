#!/usr/bin/env python3
"""
修复可视化图片中的中文乱码问题
只重新生成图片，不改变数据或训练
"""

import os
import json
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm

def setup_english_font():
    """Set an English-safe font"""
    try:
        plt.rcParams['font.sans-serif'] = ['DejaVu Sans', 'Arial', 'sans-serif']
        plt.rcParams['axes.unicode_minus'] = False
        return True
        
    except Exception as e:
        print(f"⚠️ Font setup failed: {e}")
        return False

def regenerate_visualization(data_dir="medical_data"):
    """Regenerate the visualization image with English labels"""
    
    print("🎨 Regenerating visualization image...")
    
    # Set an English-safe font
    setup_english_font()
    
    # 创建图表
    fig, axes = plt.subplots(5, 3, figsize=(15, 20))
    
    # Set the main title
    fig.suptitle('Medical Literature-Based Parkinson Synthetic Data Visualization', fontsize=16, fontweight='bold')

    if not os.path.exists(data_dir):
        print(f"❌ 数据目录 {data_dir} 不存在")
        return False

    json_files = [f for f in os.listdir(data_dir) if f.endswith('.json') and f != 'medical_dataset_summary.json']
    if len(json_files) == 0:
        print(f"❌ 数据目录 {data_dir} 中没有找到会话数据文件")
        return False

    print(f"📁 找到 {len(json_files)} 个数据文件")

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
            except Exception:
                continue

        if chosen is None:
            print(f"⚠️ 未找到UPDRS等级 {level} 的数据")
            continue

        data_points = chosen.get('data', [])[:500]  # 只取前500个点
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
        finger_names = ['Pinky', 'Ring', 'Middle', 'Index', 'Thumb']
        colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd']
        
        for i in range(5):
            ax1.plot(time_axis, fingers[:, i], label=finger_names[i], alpha=0.8, color=colors[i], linewidth=1.2)
        
        ax1.set_title(f'UPDRS Level {level} - Finger Flexion', fontsize=12, fontweight='bold')
        ax1.set_ylabel('Flexion', fontsize=10)
        
        ax1.legend(fontsize=8, loc='upper right')
        ax1.grid(True, alpha=0.3)
        ax1.set_xlim(0, time_axis[-1])

        # EMG信号图表
        ax2 = axes[level-1, 1]
        ax2.plot(time_axis, emg, 'r-', linewidth=1.2, alpha=0.8)
        
        ax2.set_title(f'UPDRS Level {level} - EMG Signal', fontsize=12, fontweight='bold')
        ax2.set_ylabel('EMG Amplitude', fontsize=10)
        
        ax2.grid(True, alpha=0.3)
        ax2.set_xlim(0, time_axis[-1])

        # IMU加速度图表
        ax3 = axes[level-1, 2]
        imu_labels = ['X-axis', 'Y-axis', 'Z-axis']
        imu_colors = ['#1f77b4', '#2ca02c', '#d62728']
        
        for i in range(3):
            ax3.plot(time_axis, imu[:, i], label=imu_labels[i], alpha=0.8, color=imu_colors[i], linewidth=1.2)
        
        ax3.set_title(f'UPDRS Level {level} - IMU Acceleration', fontsize=12, fontweight='bold')
        ax3.set_ylabel('Acceleration (g)', fontsize=10)
        
        ax3.legend(fontsize=8, loc='upper right')
        ax3.grid(True, alpha=0.3)
        ax3.set_xlim(0, time_axis[-1])

        # 只在最后一行添加x轴标签
        if level == 5:
            time_label = 'Time (s)'
            ax1.set_xlabel(time_label, fontsize=10)
            ax2.set_xlabel(time_label, fontsize=10)
            ax3.set_xlabel(time_label, fontsize=10)

    # 调整布局
    plt.tight_layout()
    plt.subplots_adjust(top=0.95)

    # 保存图片
    plot_path = os.path.join(data_dir, 'sample_data_visualization.png')
    plt.savefig(plot_path, dpi=300, bbox_inches='tight', facecolor='white', edgecolor='none')
    print(f"✅ Visualization chart saved: {plot_path}")
    
    plt.close()  # 关闭图表释放内存
    return True

def main():
    """主程序"""
    print("🎨 Fixing visualization image encoding issues")
    print("=" * 50)
    
    try:
        success = regenerate_visualization()
        if success:
            print("🎉 Visualization image repair completed!")
            print("📊 Image path: medical_data/sample_data_visualization.png")
        else:
            print("❌ Failed to repair visualization image")
    except Exception as e:
        print(f"❌ Program failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
