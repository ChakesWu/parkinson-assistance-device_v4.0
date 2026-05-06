/*
 * PCA9685 舵機驅動板測試程式
 * 用於 Arduino Nano 33 BLE Sense Rev2 + Adafruit 16-Channel Servo Driver
 *
 * 接線:
 *   PCA9685 SDA -> A4
 *   PCA9685 SCL -> A5
 *   PCA9685 VCC -> 3.3V
 *   PCA9685 GND -> GND
 *   PCA9685 V+  -> 外接5~6V電源 (舵機供電)
 *   舵機接在 PCA9685 channel 0~4
 *
 * 測試流程:
 *   1. 上傳後自動掃描 I2C 設備，確認 PCA9685 被偵測到 (地址 0x40)
 *   2. 初始化 PCA9685（舵機不會自動轉動）
 *   3. 透過串口命令手動控制舵機
 *
 * 串口命令 (115200 baud):
 *   SCAN        - 掃描 I2C 設備
 *   SWEEP       - 所有舵機依序擺動測試
 *   ALL,<angle> - 所有舵機同時到指定角度 (0~180)
 *   S,<ch>,<angle> - 指定通道舵機到指定角度, 例如 S,0,90
 *   CENTER      - 所有舵機回中 (90°)
 *   HELP        - 顯示命令列表
 */

#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

// PCA9685 預設 I2C 地址 0x40
Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver(0x40);

// 舵機脈衝寬度範圍 (根據你的舵機規格調整)
// 一般 SG90 舵機: ~150 (0°) ~ ~600 (180°)
// MG996R: ~102 (0°) ~ ~512 (180°)
#define SERVO_MIN  150   // 對應 0°   的脈衝計數 (4096 分之)
#define SERVO_MAX  600   // 對應 180° 的脈衝計數
#define SERVO_FREQ 50    // 舵機 PWM 頻率 50Hz

// 使用的舵機通道 (PCA9685 channel 0~15)
const int SERVO_CHANNELS[5] = {0, 2, 4, 6, 8};
const char* FINGER_NAMES[5] = {"拇指", "食指", "中指", "無名指", "小指"};
const int NUM_SERVOS = 5;

// 當前角度記錄
int currentAngle[5] = {90, 90, 90, 90, 90};

// 將角度 (0~180) 轉換為 PCA9685 脈衝計數
int angleToPulse(int angle) {
  angle = constrain(angle, 0, 180);
  return map(angle, 0, 180, SERVO_MIN, SERVO_MAX);
}

// 設定指定通道舵機角度
void setServoAngle(int channel, int angle) {
  if (channel < 0 || channel >= NUM_SERVOS) {
    Serial.print("錯誤: 無效通道 ");
    Serial.println(channel);
    return;
  }
  angle = constrain(angle, 0, 180);
  int pulse = angleToPulse(angle);
  pwm.setPWM(SERVO_CHANNELS[channel], 0, pulse);
  currentAngle[channel] = angle;

  Serial.print("[");
  Serial.print(FINGER_NAMES[channel]);
  Serial.print("] CH");
  Serial.print(SERVO_CHANNELS[channel]);
  Serial.print(" -> ");
  Serial.print(angle);
  Serial.print("° (pulse=");
  Serial.print(pulse);
  Serial.println(")");
}

// I2C 掃描
void scanI2C() {
  Serial.println("\n=== I2C 設備掃描 ===");
  int found = 0;
  for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    byte error = Wire.endTransmission();
    if (error == 0) {
      Serial.print("找到設備: 0x");
      if (addr < 16) Serial.print("0");
      Serial.print(addr, HEX);
      if (addr == 0x40) Serial.print("  <-- PCA9685 (預設地址)");
      Serial.println();
      found++;
    }
  }
  if (found == 0) {
    Serial.println("未找到任何 I2C 設備!");
    Serial.println("請檢查:");
    Serial.println("  1. SDA 接到 A4, SCL 接到 A5");
    Serial.println("  2. PCA9685 VCC 和 GND 已連接");
    Serial.println("  3. 焊接和接線是否牢固");
  } else {
    Serial.print("共找到 ");
    Serial.print(found);
    Serial.println(" 個設備");
  }
  Serial.println("====================\n");
}

// 依序擺動所有舵機
void sweepAllServos() {
  Serial.println("\n=== 開始逐個舵機擺動測試 ===");

  for (int s = 0; s < NUM_SERVOS; s++) {
    Serial.print("\n測試 ");
    Serial.print(FINGER_NAMES[s]);
    Serial.println("...");

    // 0° -> 90° -> 180° -> 90°
    int positions[] = {0, 90, 180, 90};
    for (int p = 0; p < 4; p++) {
      setServoAngle(s, positions[p]);
      delay(500);
    }
  }

  Serial.println("\n=== 全部舵機同時擺動 ===");
  int positions[] = {0, 90, 180, 90};
  for (int p = 0; p < 4; p++) {
    Serial.print("全部 -> ");
    Serial.print(positions[p]);
    Serial.println("°");
    for (int s = 0; s < NUM_SERVOS; s++) {
      int pulse = angleToPulse(positions[p]);
      pwm.setPWM(SERVO_CHANNELS[s], 0, pulse);
      currentAngle[s] = positions[p];
    }
    delay(600);
  }

  Serial.println("\n=== 擺動測試完成 ===\n");
}

// 顯示當前狀態
void printStatus() {
  Serial.println("\n--- 舵機狀態 ---");
  for (int i = 0; i < NUM_SERVOS; i++) {
    Serial.print(FINGER_NAMES[i]);
    Serial.print(" (CH");
    Serial.print(SERVO_CHANNELS[i]);
    Serial.print("): ");
    Serial.print(currentAngle[i]);
    Serial.println("°");
  }
  Serial.println("----------------\n");
}

// 處理串口命令
void handleCommand(String cmd) {
  cmd.trim();
  cmd.toUpperCase();

  if (cmd == "SCAN") {
    scanI2C();
  }
  else if (cmd == "SWEEP") {
    sweepAllServos();
  }
  else if (cmd == "CENTER") {
    Serial.println("所有舵機回中 (90°)");
    for (int i = 0; i < NUM_SERVOS; i++) {
      setServoAngle(i, 90);
      delay(100);
    }
  }
  else if (cmd == "STATUS") {
    printStatus();
  }
  else if (cmd.startsWith("ALL,")) {
    int angle = cmd.substring(4).toInt();
    Serial.print("所有舵機 -> ");
    Serial.print(angle);
    Serial.println("°");
    for (int i = 0; i < NUM_SERVOS; i++) {
      setServoAngle(i, angle);
      delay(50);
    }
  }
  else if (cmd.startsWith("S,")) {
    // S,<channel>,<angle>
    int comma1 = cmd.indexOf(',');
    int comma2 = cmd.indexOf(',', comma1 + 1);
    if (comma2 > comma1) {
      int ch = cmd.substring(comma1 + 1, comma2).toInt();
      int angle = cmd.substring(comma2 + 1).toInt();
      setServoAngle(ch, angle);
    } else {
      Serial.println("格式錯誤, 正確: S,<通道0-4>,<角度0-180>");
    }
  }
  else if (cmd == "HELP") {
    Serial.println("\n=== 命令列表 ===");
    Serial.println("SCAN          - 掃描 I2C 設備");
    Serial.println("SWEEP         - 所有舵機依序擺動測試");
    Serial.println("ALL,<angle>   - 所有舵機到指定角度");
    Serial.println("S,<ch>,<angle> - 單個舵機控制 (ch=0~4)");
    Serial.println("CENTER        - 所有舵機回中 (90°)");
    Serial.println("STATUS        - 顯示當前狀態");
    Serial.println("HELP          - 顯示此說明");
    Serial.println("================\n");
  }
  else {
    Serial.print("未知命令: ");
    Serial.println(cmd);
    Serial.println("輸入 HELP 查看命令列表");
  }
}

void setup() {
  Serial.begin(115200);
  while (!Serial);

  Serial.println("========================================");
  Serial.println("  PCA9685 舵機驅動板測試程式");
  Serial.println("  Arduino Nano 33 BLE Sense Rev2");
  Serial.println("========================================");

  // 初始化 I2C
  Wire.begin();

  // 掃描 I2C 確認 PCA9685 存在
  scanI2C();

  // 初始化 PCA9685
  Serial.print("初始化 PCA9685...");
  pwm.begin();
  pwm.setOscillatorFrequency(27000000);  // 內部振盪器校準
  pwm.setPWMFreq(SERVO_FREQ);
  delay(10);
  Serial.println(" 完成!");

  Serial.println("\n準備就緒! 舵機尚未轉動，輸入 HELP 查看命令列表\n");
}

void loop() {
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    handleCommand(cmd);
  }
  delay(10);
}
