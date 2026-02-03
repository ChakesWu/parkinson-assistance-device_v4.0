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

def setup_chinese_font():
    """设置中文字体"""
    try:
        # 尝试使用系统中文字体
        chinese_fonts = [
            'SimHei',  # 黑体
            'Microsoft YaHei',  # 微软雅黑
            'SimSun',  # 宋体
            'KaiTi',  # 楷体
            'FangSong',  # 仿宋
        ]
        
        available_fonts = [f.name for f in fm.fontManager.ttflist]
        
        for font in chinese_fonts:
            if font in available_fonts:
                plt.rcParams['font.sans-serif'] = [font]
                plt.rcParams['axes.unicode_minus'] = False
                print(f"✅ 使用中文字体: {font}")
                return True
        
        # 如果没有找到中文字体，使用英文
        print("⚠️ 未找到中文字体，使用英文标题")
        return False
        
    except Exception as e:
        print(f"⚠️ 字体设置失败: {e}")
        return False

def regenerate_visualization(data_dir="medical_data"):
    """重新生成可视化图片，修复中文乱码"""
    
    print("🎨 重新生成可视化图片...")
    
    # 设置中文字体
    has_chinese_font = setup_chinese_font()
    
    # 创建图表
    fig, axes = plt.subplots(5, 3, figsize=(15, 20))
    
    # 设置主标题
    if has_chinese_font:
        fig.suptitle('基于医学文献的帕金森症合成数据可视化', fontsize=16, fontweight='bold')
    else:
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
        finger_names = ['Pinky', 'Ring', 'Middle', 'Index', 'Thumb'] if not has_chinese_font else ['小指', '无名指', '中指', '食指', '拇指']
        colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd']
        
        for i in range(5):
            ax1.plot(time_axis, fingers[:, i], label=finger_names[i], alpha=0.8, color=colors[i], linewidth=1.2)
        
        if has_chinese_font:
            ax1.set_title(f'UPDRS等级 {level} - 手指弯曲度', fontsize=12, fontweight='bold')
            ax1.set_ylabel('弯曲度', fontsize=10)
        else:
            ax1.set_title(f'UPDRS Level {level} - Finger Flexion', fontsize=12, fontweight='bold')
            ax1.set_ylabel('Flexion', fontsize=10)
        
        ax1.legend(fontsize=8, loc='upper right')
        ax1.grid(True, alpha=0.3)
        ax1.set_xlim(0, time_axis[-1])

        # EMG信号图表
        ax2 = axes[level-1, 1]
        ax2.plot(time_axis, emg, 'r-', linewidth=1.2, alpha=0.8)
        
        if has_chinese_font:
            ax2.set_title(f'UPDRS等级 {level} - 肌电信号', fontsize=12, fontweight='bold')
            ax2.set_ylabel('肌电幅值', fontsize=10)
        else:
            ax2.set_title(f'UPDRS Level {level} - EMG Signal', fontsize=12, fontweight='bold')
            ax2.set_ylabel('EMG Amplitude', fontsize=10)
        
        ax2.grid(True, alpha=0.3)
        ax2.set_xlim(0, time_axis[-1])

        # IMU加速度图表
        ax3 = axes[level-1, 2]
        imu_labels = ['X-axis', 'Y-axis', 'Z-axis'] if not has_chinese_font else ['X轴', 'Y轴', 'Z轴']
        imu_colors = ['#1f77b4', '#2ca02c', '#d62728']
        
        for i in range(3):
            ax3.plot(time_axis, imu[:, i], label=imu_labels[i], alpha=0.8, color=imu_colors[i], linewidth=1.2)
        
        if has_chinese_font:
            ax3.set_title(f'UPDRS等级 {level} - 惯性测量单元', fontsize=12, fontweight='bold')
            ax3.set_ylabel('加速度 (g)', fontsize=10)
        else:
            ax3.set_title(f'UPDRS Level {level} - IMU Acceleration', fontsize=12, fontweight='bold')
            ax3.set_ylabel('Acceleration (g)', fontsize=10)
        
        ax3.legend(fontsize=8, loc='upper right')
        ax3.grid(True, alpha=0.3)
        ax3.set_xlim(0, time_axis[-1])

        # 只在最后一行添加x轴标签
        if level == 5:
            time_label = '时间 (秒)' if has_chinese_font else 'Time (s)'
            ax1.set_xlabel(time_label, fontsize=10)
            ax2.set_xlabel(time_label, fontsize=10)
            ax3.set_xlabel(time_label, fontsize=10)

    # 调整布局
    plt.tight_layout()
    plt.subplots_adjust(top=0.95)  # 为主标题留出空间

    # 保存图片
    plot_path = os.path.join(data_dir, 'sample_data_visualization.png')
    plt.savefig(plot_path, dpi=300, bbox_inches='tight', facecolor='white', edgecolor='none')
    print(f"✅ 可视化图表已保存: {plot_path}")
    
    plt.close()  # 关闭图表释放内存
    return True

def main():
    """主程序"""
    print("🎨 修复可视化图片中的中文乱码")
    print("=" * 50)
    
    try:
        success = regenerate_visualization()
        if success:
            print("🎉 可视化图片修复完成！")
            print("📊 图片路径: medical_data/sample_data_visualization.png")
        else:
            print("❌ 可视化图片修复失败")
    except Exception as e:
        print(f"❌ 程序执行失败: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
