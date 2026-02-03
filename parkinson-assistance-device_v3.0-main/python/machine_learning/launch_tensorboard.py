#!/usr/bin/env python3
"""
简单的TensorBoard启动器 - 绕过Python 3.13兼容性问题
"""

import os
import sys
import subprocess
import webbrowser
import time
from pathlib import Path

def find_latest_log_dir():
    """查找最新的日志目录"""
    logs_base = "logs"
    if not os.path.exists(logs_base):
        print(f"❌ 日志目录 {logs_base} 不存在")
        return None
    
    subdirs = [d for d in os.listdir(logs_base) if os.path.isdir(os.path.join(logs_base, d))]
    if not subdirs:
        print("❌ 没有找到日志子目录")
        return None
    
    # 按时间排序，选择最新的
    subdirs.sort(reverse=True)
    latest_dir = os.path.join(logs_base, subdirs[0])
    
    # 检查是否有事件文件
    has_events = any(f.startswith('events.out.tfevents') for f in os.listdir(latest_dir))
    
    if has_events:
        print(f"📁 找到最新日志目录: {latest_dir}")
        return latest_dir
    else:
        print(f"⚠️ 目录 {latest_dir} 没有TensorBoard事件文件")
        return latest_dir

def start_tensorboard_server(log_dir, port=6006):
    """启动TensorBoard服务器"""
    
    print(f"🚀 启动TensorBoard服务器...")
    print(f"📊 日志目录: {log_dir}")
    print(f"🌐 端口: {port}")
    
    try:
        # 方法1: 直接使用tensorboard命令
        cmd = [
            sys.executable, "-c",
            f"""
import sys
import os
sys.path.insert(0, r'{os.path.dirname(sys.executable)}')

# 绕过pkg_resources问题
import importlib.util
import importlib.metadata

# 模拟pkg_resources.iter_entry_points
class MockEntryPoint:
    def __init__(self, name, module_name, attrs):
        self.name = name
        self.module_name = module_name
        self.attrs = attrs
    
    def load(self):
        module = importlib.import_module(self.module_name)
        for attr in self.attrs:
            module = getattr(module, attr)
        return module

def mock_iter_entry_points(group_name):
    return []

# 替换有问题的函数
import pkg_resources
pkg_resources.iter_entry_points = mock_iter_entry_points

# 启动TensorBoard
from tensorboard import program
from tensorboard import default

tb = program.TensorBoard(plugins=default.get_static_plugins())
tb.configure(argv=[
    '--logdir', r'{log_dir}',
    '--port', '{port}',
    '--host', '0.0.0.0',
    '--reload_interval', '30'
])
tb.main()
"""
        ]
        
        print("🔧 启动TensorBoard进程...")
        
        # 启动进程
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=os.getcwd()
        )
        
        # 等待几秒让服务器启动
        time.sleep(3)
        
        # 检查进程是否还在运行
        if process.poll() is None:
            print("✅ TensorBoard服务器已启动")
            print(f"🌐 访问地址: http://localhost:{port}")
            
            # 自动打开浏览器
            try:
                webbrowser.open(f"http://localhost:{port}")
                print("🔗 浏览器已自动打开")
            except Exception as e:
                print(f"⚠️ 无法自动打开浏览器: {e}")
                print(f"📋 请手动访问: http://localhost:{port}")
            
            return process
        else:
            stdout, stderr = process.communicate()
            print("❌ TensorBoard启动失败")
            if stderr:
                print(f"错误信息: {stderr}")
            return None
            
    except Exception as e:
        print(f"❌ 启动TensorBoard时出错: {e}")
        return None

def main():
    """主程序"""
    print("🎯 TensorBoard启动器 - 兼容版")
    print("=" * 50)
    
    # 查找日志目录
    log_dir = find_latest_log_dir()
    if not log_dir:
        print("💡 提示: 请先运行训练或生成可视化数据")
        return False
    
    # 启动TensorBoard
    process = start_tensorboard_server(log_dir)
    
    if process:
        print("\n" + "=" * 50)
        print("🎉 TensorBoard已成功启动！")
        print("📊 现在可以查看以下可视化:")
        print("  ✅ Scalars - 训练指标和学习率")
        print("  ✅ Graphs - 模型结构图")
        print("  ✅ Histograms - 权重分布")
        print("  ✅ Images - 模型层可视化")
        print("\n💡 按 Ctrl+C 停止TensorBoard服务器")
        
        try:
            # 保持进程运行
            process.wait()
        except KeyboardInterrupt:
            print("\n🛑 正在停止TensorBoard...")
            process.terminate()
            print("✅ TensorBoard已停止")
        
        return True
    else:
        print("\n❌ TensorBoard启动失败")
        print("💡 备用方案:")
        print(f"   1. 手动运行: python -m http.server 8000")
        print(f"   2. 或使用Docker: docker run -p 6006:6006 -v {os.path.abspath(log_dir)}:/logs tensorflow/tensorflow:latest tensorboard --logdir=/logs --host=0.0.0.0")
        return False

if __name__ == "__main__":
    try:
        success = main()
        if not success:
            input("\n按回车键退出...")
    except Exception as e:
        print(f"\n❌ 程序执行失败: {e}")
        input("按回车键退出...")
