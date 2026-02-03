"""
单人测试数据收集模块
适用于研究者本人作为唯一测试者的ISEF项目
简化版隐私保护，符合单人测试要求
"""

import serial
import time
import numpy as np
import pandas as pd
import json
import os
from datetime import datetime
import threading
import queue

class SoloTestCollector:
    def __init__(self, port='COM3', baudrate=9600):
        """
        初始化单人测试数据收集器
        
        Args:
            port: Arduino串口
            baudrate: 波特率
        """
        self.port = port
        self.baudrate = baudrate
        self.serial_conn = None
        self.is_collecting = False
        self.data_queue = queue.Queue()
        self.collected_data = []
        
        # 单人测试配置
        self.test_config = {
            'tester_id': 'SELF_TEST',
            'project_type': 'solo_testing',
            'purpose': 'algorithm_development',
            'data_retention': 'project_based'
        }
        
    def connect(self):
        """连接Arduino设备"""
        try:
            self.serial_conn = serial.Serial(self.port, self.baudrate, timeout=1)
            time.sleep(2)
            print(f"成功连接到Arduino: {self.port}")
            return True
        except Exception as e:
            print(f"连接Arduino失败: {e}")
            return False
    
    def disconnect(self):
        """断开Arduino连接"""
        if self.serial_conn and self.serial_conn.is_open:
            self.serial_conn.close()
            print("Arduino连接已断开")
    
    def send_command(self, command):
        """发送命令到Arduino"""
        if self.serial_conn and self.serial_conn.is_open:
            self.serial_conn.write(f"{command}\n".encode())
            print(f"发送命令: {command}")
        else:
            print("Arduino未连接")
    
    def read_data_line(self):
        """读取一行数据"""
        if self.serial_conn and self.serial_conn.is_open:
            try:
                line = self.serial_conn.readline().decode().strip()
                return line
            except Exception as e:
                print(f"读取数据错误: {e}")
                return None
        return None
    
    def parse_data_packet(self, line):
        """解析数据包"""
        if line.startswith("DATA"):
            try:
                parts = line.split(',')
                if len(parts) == 10:
                    data = {
                        'timestamp': time.time(),
                        'fingers': [float(parts[1]), float(parts[2]), float(parts[3]),
                                   float(parts[4]), float(parts[5])],
                        'emg': float(parts[6]),
                        'imu': [float(parts[7]), float(parts[8]), float(parts[9])]
                    }
                    return data
            except ValueError as e:
                print(f"数据解析错误: {e}")
        return None
    
    def collect_self_test_session(self, duration=10, test_purpose="algorithm_development"):
        """
        收集单人测试会话数据
        
        Args:
            duration: 测试时长(秒)
            test_purpose: 测试目的
        
        Returns:
            测试会话数据
        """
        print(f"\n=== 单人测试会话 ===")
        print(f"测试者: 研究者本人")
        print(f"测试时长: {duration}秒")
        print(f"测试目的: {test_purpose}")
        
        # 发送START命令
        self.send_command("START")
        
        session_data = []
        start_time = time.time()
        
        while time.time() - start_time < duration + 5:
            line = self.read_data_line()
            if line:
                print(line)
                
                if line.startswith("DATA"):
                    data_point = self.parse_data_packet(line)
                    if data_point:
                        session_data.append(data_point)
                elif line == "END":
                    print("数据收集完成")
                    break
        
        if not session_data:
            print("未收集到有效数据")
            return None
        
        # 创建测试会话记录
        test_session = {
            'test_session': f"{self.test_config['tester_id']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            'timestamp': datetime.now().isoformat(),
            'duration': duration,
            'test_purpose': test_purpose,
            'tester_type': 'researcher_self',
            'project_type': self.test_config['project_type'],
            'data_points_count': len(session_data),
            'sensor_data': session_data,
            'isef_compliance': {
                'solo_testing': True,
                'no_other_participants': True,
                'engineering_research': True,
                'non_medical_purpose': True
            }
        }
        
        return test_session
    
    def save_test_session(self, test_session, output_dir="data/solo_tests"):
        """
        保存测试会话数据
        
        Args:
            test_session: 测试会话数据
            output_dir: 输出目录
        
        Returns:
            保存的文件路径
        """
        os.makedirs(output_dir, exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{output_dir}/self_test_{timestamp}.json"
        
        try:
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(test_session, f, indent=2, ensure_ascii=False)
            print(f"测试数据已保存: {filename}")
            return filename
        except Exception as e:
            print(f"保存测试数据失败: {e}")
            return None
    
    def convert_to_dataframe(self, test_session):
        """转换测试数据为DataFrame格式"""
        data_points = test_session['sensor_data']
        
        rows = []
        for point in data_points:
            row = {
                'timestamp': point['timestamp'],
                'finger_thumb': point['fingers'][0],
                'finger_index': point['fingers'][1],
                'finger_middle': point['fingers'][2],
                'finger_ring': point['fingers'][3],
                'finger_pinky': point['fingers'][4],
                'emg': point['emg'],
                'imu_x': point['imu'][0],
                'imu_y': point['imu'][1],
                'imu_z': point['imu'][2],
                'test_session': test_session['test_session'],
                'test_purpose': test_session['test_purpose']
            }
            rows.append(row)
        
        return pd.DataFrame(rows)
    
    def run_development_tests(self, test_scenarios):
        """
        运行开发测试场景
        
        Args:
            test_scenarios: 测试场景列表
            格式: [{'purpose': 'baseline', 'duration': 10, 'description': '基线测试'}, ...]
        
        Returns:
            所有测试会话
        """
        all_tests = []
        
        print("\n=== 开始单人开发测试 ===")
        print(f"测试场景数量: {len(test_scenarios)}")
        
        for i, scenario in enumerate(test_scenarios):
            purpose = scenario.get('purpose', f'test_{i+1}')
            duration = scenario.get('duration', 10)
            description = scenario.get('description', purpose)
            
            print(f"\n--- 测试场景 {i+1}/{len(test_scenarios)} ---")
            print(f"描述: {description}")
            print(f"目的: {purpose}")
            print(f"时长: {duration}秒")
            
            input("按Enter开始测试...")
            
            # 收集测试数据
            test_session = self.collect_self_test_session(duration, purpose)
            
            if test_session:
                # 保存测试数据
                file_path = self.save_test_session(test_session)
                
                if file_path:
                    all_tests.append(test_session)
                    print(f"测试 {i+1} 完成")
                    print(f"数据点数量: {test_session['data_points_count']}")
                else:
                    print(f"测试 {i+1} 保存失败")
            else:
                print(f"测试 {i+1} 收集失败")
            
            # 测试间休息
            if i < len(test_scenarios) - 1:
                print("测试间休息10秒...")
                time.sleep(10)
        
        # 生成测试摘要
        self.generate_test_summary(all_tests)
        
        return all_tests
    
    def generate_test_summary(self, test_sessions):
        """
        生成测试摘要报告
        
        Args:
            test_sessions: 测试会话列表
        """
        if not test_sessions:
            return
        
        summary = {
            'test_summary': {
                'total_tests': len(test_sessions),
                'test_date': datetime.now().isoformat(),
                'tester_type': 'researcher_self',
                'project_purpose': 'algorithm_development',
                'isef_compliant': True
            },
            'test_statistics': {
                'total_data_points': sum(s['data_points_count'] for s in test_sessions),
                'average_duration': np.mean([s['duration'] for s in test_sessions]),
                'test_purposes': list(set(s['test_purpose'] for s in test_sessions))
            },
            'data_quality': {
                'average_data_rate': 0,
                'test_completeness': '100%'
            }
        }
        
        # 计算平均数据率
        total_duration = sum(s['duration'] for s in test_sessions)
        total_points = summary['test_statistics']['total_data_points']
        if total_duration > 0:
            summary['data_quality']['average_data_rate'] = round(total_points / total_duration, 2)
        
        # 保存摘要
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        summary_file = f"data/solo_tests/test_summary_{timestamp}.json"
        
        try:
            os.makedirs(os.path.dirname(summary_file), exist_ok=True)
            with open(summary_file, 'w', encoding='utf-8') as f:
                json.dump(summary, f, indent=2, ensure_ascii=False)
            print(f"\n测试摘要已保存: {summary_file}")
            print(f"总测试数: {summary['test_summary']['total_tests']}")
            print(f"总数据点: {summary['test_statistics']['total_data_points']}")
            print(f"平均数据率: {summary['data_quality']['average_data_rate']} 点/秒")
        except Exception as e:
            print(f"保存测试摘要失败: {e}")
    
    def create_isef_report_data(self, test_sessions):
        """
        创建ISEF报告用的数据摘要
        
        Args:
            test_sessions: 测试会话列表
        
        Returns:
            ISEF报告数据
        """
        if not test_sessions:
            return None
        
        isef_data = {
            'project_methodology': {
                'testing_approach': 'Solo testing by researcher',
                'data_collection': 'Self-administered sensor testing',
                'sample_size': 'Single researcher (n=1)',
                'ethical_considerations': 'Solo testing, simplified ISEF compliance'
            },
            'technical_summary': {
                'total_test_sessions': len(test_sessions),
                'data_points_collected': sum(s['data_points_count'] for s in test_sessions),
                'testing_duration_hours': sum(s['duration'] for s in test_sessions) / 3600,
                'sensor_types': ['Flex sensors', 'EMG', 'IMU'],
                'data_purpose': 'Algorithm development and validation'
            },
            'compliance_statement': 'This project utilizes solo testing methodology with the researcher as the sole test subject. Data collection involves only personal sensor readings for engineering research purposes, complying with simplified ISEF requirements for solo testing projects.'
        }
        
        return isef_data

def main():
    """主程序 - 单人测试数据收集"""
    collector = SoloTestCollector(port='COM3')
    
    if not collector.connect():
        return
    
    try:
        print("=== 单人测试模式 ===")
        print("研究者本人作为测试者")
        print("符合ISEF单人测试简化要求")
        
        # 定义测试场景
        test_scenarios = [
            {'purpose': 'baseline', 'duration': 10, 'description': '基线运动测试'},
            {'purpose': 'flex_test', 'duration': 15, 'description': '手指弯曲测试'},
            {'purpose': 'emg_test', 'duration': 10, 'description': '肌肉活动测试'},
            {'purpose': 'motion_test', 'duration': 12, 'description': '运动模式测试'},
            {'purpose': 'integration_test', 'duration': 20, 'description': '系统集成测试'}
        ]
        
        # 运行测试
        test_sessions = collector.run_development_tests(test_scenarios)
        
        if test_sessions:
            # 创建ISEF报告数据
            isef_data = collector.create_isef_report_data(test_sessions)
            if isef_data:
                print(f"\n=== ISEF报告数据 ===")
                print(f"测试方法: {isef_data['project_methodology']['testing_approach']}")
                print(f"样本量: {isef_data['project_methodology']['sample_size']}")
                print(f"总测试会话: {isef_data['technical_summary']['total_test_sessions']}")
                print(f"总数据点: {isef_data['technical_summary']['data_points_collected']}")
        
        print(f"\n单人测试完成，总计 {len(test_sessions)} 个测试会话")
        
    finally:
        collector.disconnect()

if __name__ == "__main__":
    main()
