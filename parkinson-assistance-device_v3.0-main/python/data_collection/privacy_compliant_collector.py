"""
符合隐私保护要求的Arduino数据收集模块
整合数据匿名化功能，符合ISEF和IRB要求
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
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'privacy'))
from data_anonymizer import DataAnonymizer

class PrivacyCompliantArduinoCollector:
    def __init__(self, port='COM3', baudrate=9600):
        """
        初始化符合隐私保护的Arduino数据收集器
        
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
        
        # 初始化数据匿名化器
        self.anonymizer = DataAnonymizer()
        
        # 隐私保护配置
        self.privacy_config = {
            'anonymization_enabled': True,
            'encryption_enabled': True,
            'noise_injection': True,
            'temporal_anonymization': True,
            'max_session_duration': 600,  # 10分钟最大会话时间
            'data_retention_days': 730,   # 2年数据保留期
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
    
    def obtain_informed_consent(self, participant_info):
        """
        获取知情同意
        
        Args:
            participant_info: 参与者信息字典
        
        Returns:
            同意状态和匿名化的参与者ID
        """
        print("\n=== 知情同意确认 ===")
        print("本研究收集非侵入性传感器数据用于工程研究目的")
        print("数据将被匿名化处理，不会用于临床诊断")
        print("您有权随时退出研究并要求删除数据")
        print("数据将安全存储并仅用于研究目的")
        
        consent = input("\n您是否同意参与本研究并允许数据收集? (yes/no): ").lower()
        
        if consent in ['yes', 'y', '是', '同意']:
            # 生成匿名化的参与者信息
            anonymized_info = self.anonymizer.anonymize_patient_data(
                participant_info.get('participant_id', 'UNKNOWN'),
                participant_info.get('severity_level', 1)
            )
            
            print(f"同意确认完成，会话ID: {anonymized_info['session_id']}")
            return True, anonymized_info
        else:
            print("未获得同意，数据收集取消")
            return False, None
    
    def collect_privacy_compliant_session(self, participant_info, duration=10):
        """
        收集符合隐私保护的数据会话
        
        Args:
            participant_info: 参与者信息 {'participant_id': 'P001', 'severity_level': 2}
            duration: 收集时长(秒)
        
        Returns:
            匿名化的会话数据
        """
        # 检查会话时长限制
        if duration > self.privacy_config['max_session_duration']:
            print(f"会话时长超过限制({self.privacy_config['max_session_duration']}秒)")
            return None
        
        # 获取知情同意
        consent_granted, anonymized_info = self.obtain_informed_consent(participant_info)
        if not consent_granted:
            return None
        
        print(f"\n开始收集匿名化数据会话 (时长: {duration}秒)")
        print(f"会话ID: {anonymized_info['session_id']}")
        
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
        
        # 创建匿名化会话
        anonymized_session = self.anonymizer.create_anonymized_session(
            participant_info.get('participant_id', 'UNKNOWN'),
            participant_info.get('severity_level', 1),
            session_data,
            duration
        )
        
        # 添加收集元数据
        anonymized_session['collection_metadata'] = {
            'device_port': self.port,
            'collection_duration_actual': time.time() - start_time,
            'data_quality_score': self.calculate_data_quality(session_data),
            'privacy_compliance': self.privacy_config
        }
        
        return anonymized_session
    
    def calculate_data_quality(self, session_data):
        """
        计算数据质量分数
        
        Args:
            session_data: 会话数据
        
        Returns:
            数据质量分数 (0-1)
        """
        if not session_data:
            return 0.0
        
        # 检查数据完整性
        complete_points = 0
        for point in session_data:
            if all(key in point for key in ['fingers', 'emg', 'imu']):
                if len(point['fingers']) == 5 and len(point['imu']) == 3:
                    complete_points += 1
        
        completeness_score = complete_points / len(session_data)
        
        # 检查数据变化性（避免静态数据）
        finger_data = np.array([point['fingers'] for point in session_data if 'fingers' in point])
        if len(finger_data) > 1:
            variance_score = min(1.0, np.mean(np.var(finger_data, axis=0)))
        else:
            variance_score = 0.0
        
        # 综合质量分数
        quality_score = (completeness_score * 0.7 + variance_score * 0.3)
        return round(quality_score, 3)
    
    def save_privacy_compliant_session(self, anonymized_session, output_dir="data/privacy_compliant"):
        """
        保存符合隐私保护的会话数据
        
        Args:
            anonymized_session: 匿名化会话数据
            output_dir: 输出目录
        
        Returns:
            保存的文件路径
        """
        os.makedirs(output_dir, exist_ok=True)
        
        # 使用匿名化器保存加密数据
        file_path = self.anonymizer.save_anonymized_session(anonymized_session, output_dir)
        
        if file_path:
            # 生成隐私报告
            privacy_report = self.anonymizer.generate_privacy_report(anonymized_session)
            
            # 保存隐私报告
            session_id = anonymized_session['session_id']
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            report_file = f"{output_dir}/privacy_report_{session_id}_{timestamp}.json"
            
            try:
                with open(report_file, 'w', encoding='utf-8') as f:
                    json.dump(privacy_report, f, indent=2, ensure_ascii=False)
                print(f"隐私报告已保存: {report_file}")
            except Exception as e:
                print(f"保存隐私报告失败: {e}")
        
        return file_path
    
    def collect_research_dataset(self, participants_config, output_dir="data/privacy_compliant"):
        """
        收集符合隐私保护的研究数据集
        
        Args:
            participants_config: 参与者配置列表
            output_dir: 输出目录
        
        Returns:
            收集的会话列表
        """
        all_sessions = []
        
        print("\n=== 开始收集符合隐私保护的研究数据集 ===")
        print(f"参与者数量: {len(participants_config)}")
        print(f"数据将保存到: {output_dir}")
        
        for i, participant in enumerate(participants_config):
            participant_id = participant.get('participant_id', f'P{i+1:03d}')
            severity_level = participant.get('severity_level', 1)
            sessions_count = participant.get('sessions', 1)
            
            print(f"\n=== 参与者 {i+1}/{len(participants_config)} ===")
            print(f"严重程度等级: {severity_level}")
            print(f"计划会话数: {sessions_count}")
            
            participant_info = {
                'participant_id': participant_id,
                'severity_level': severity_level
            }
            
            for session_num in range(sessions_count):
                print(f"\n--- 会话 {session_num + 1}/{sessions_count} ---")
                input("按Enter开始收集数据...")
                
                # 收集匿名化会话
                anonymized_session = self.collect_privacy_compliant_session(
                    participant_info, duration=10
                )
                
                if anonymized_session:
                    # 保存会话数据
                    file_path = self.save_privacy_compliant_session(
                        anonymized_session, output_dir
                    )
                    
                    if file_path:
                        all_sessions.append(anonymized_session)
                        print(f"会话 {session_num + 1} 收集完成")
                        print(f"数据质量分数: {anonymized_session['collection_metadata']['data_quality_score']}")
                    else:
                        print(f"会话 {session_num + 1} 保存失败")
                else:
                    print(f"会话 {session_num + 1} 收集失败")
                
                # 会话间休息
                if session_num < sessions_count - 1:
                    print("会话间休息30秒...")
                    time.sleep(30)
        
        # 生成数据集摘要
        self.generate_dataset_summary(all_sessions, output_dir)
        
        return all_sessions
    
    def generate_dataset_summary(self, sessions, output_dir):
        """
        生成数据集摘要报告
        
        Args:
            sessions: 会话列表
            output_dir: 输出目录
        """
        if not sessions:
            return
        
        summary = {
            'dataset_info': {
                'total_sessions': len(sessions),
                'collection_date': datetime.now().isoformat(),
                'privacy_compliant': True,
                'anonymization_applied': True
            },
            'severity_distribution': {},
            'data_quality': {
                'average_quality_score': 0,
                'total_data_points': 0,
                'average_session_duration': 0
            },
            'privacy_measures': {
                'anonymization': 'Applied',
                'encryption': 'Applied',
                'noise_injection': 'Applied',
                'temporal_anonymization': 'Applied'
            }
        }
        
        # 统计严重程度分布
        for session in sessions:
            level = session.get('severity_level', 'unknown')
            summary['severity_distribution'][level] = summary['severity_distribution'].get(level, 0) + 1
        
        # 计算数据质量统计
        quality_scores = [s['collection_metadata']['data_quality_score'] for s in sessions]
        data_points = [s['data_points_count'] for s in sessions]
        durations = [s['session_duration'] for s in sessions]
        
        summary['data_quality']['average_quality_score'] = round(np.mean(quality_scores), 3)
        summary['data_quality']['total_data_points'] = sum(data_points)
        summary['data_quality']['average_session_duration'] = round(np.mean(durations), 1)
        
        # 保存摘要
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        summary_file = f"{output_dir}/dataset_summary_{timestamp}.json"
        
        try:
            with open(summary_file, 'w', encoding='utf-8') as f:
                json.dump(summary, f, indent=2, ensure_ascii=False)
            print(f"\n数据集摘要已保存: {summary_file}")
            print(f"总会话数: {summary['dataset_info']['total_sessions']}")
            print(f"平均数据质量: {summary['data_quality']['average_quality_score']}")
        except Exception as e:
            print(f"保存数据集摘要失败: {e}")

def main():
    """主程序 - 符合隐私保护的数据收集"""
    collector = PrivacyCompliantArduinoCollector(port='COM3')
    
    if not collector.connect():
        return
    
    try:
        print("=== 符合隐私保护的帕金森设备数据收集 ===")
        print("本系统符合ISEF和IRB隐私保护要求")
        
        # 示例参与者配置
        participants_config = [
            {'participant_id': 'DEMO001', 'severity_level': 1, 'sessions': 2},
            {'participant_id': 'DEMO002', 'severity_level': 2, 'sessions': 2},
            {'participant_id': 'DEMO003', 'severity_level': 3, 'sessions': 2},
        ]
        
        # 收集数据集
        sessions = collector.collect_research_dataset(participants_config)
        
        print(f"\n数据收集完成，总计 {len(sessions)} 个符合隐私保护的会话")
        
    finally:
        collector.disconnect()

if __name__ == "__main__":
    main()
