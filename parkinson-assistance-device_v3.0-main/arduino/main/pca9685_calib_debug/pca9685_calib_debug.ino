/*
 * PCA9685 手指動作記錄 + 舵機校準工具 v2
 * Arduino Nano 33 BLE Sense Rev2
 *
 * 引腳對應 (FIXED_FIXED.ino 更新後):
 *   CH0 小指   PCA9685 ch0 | A0  (I2C 使用 A4/A5，無衝突)
 *   CH1 無名指 PCA9685 ch1 | A1
 *   CH2 中指   PCA9685 ch3 | A2
 *   CH3 食指   PCA9685 ch4 | A3
 *   CH4 拇指   PCA9685 ch6 | A7
 *   PCA9685 SDA -> A4, SCL -> A5 (與電位器無衝突)
 *
 * 工作流程:
 *   Step 1: RECORD - 引導式記錄手指位置 (不需要舵機)
 *   Step 2: REPORT - 查看記錄結果 + 下一步指示
 *   Step 3: 用 S,<ch>,<angle> + MARK_SR/MARK_SM 校準舵機阻力位置
 *   Step 4: CALC   - 計算每個訓練模式的舵機目標角度
 *
 * 串口命令 (115200 baud):
 *   INIT            - 所有啟用舵機回到 REST 位置
 *   TRAIN_A         - 模式A: 手指敲擊 2Hz，同時 REST<->HALF
 *   TRAIN_B         - 模式B: 大幅度訓練 0.25Hz，同時 REST<->FULL
 *   TRAIN_C         - 模式C: 順序訓練，單指依次 REST->FULL->REST
 *   TRAIN_D         - 模式D: 握拳/放鬆 0.5Hz，同時 REST<->FULL
 *   TRAIN_E         - 模式E: 拇指對指敲擊 (Opposition, 細動作協調)
 *   TRAIN_F         - 模式F: 持續伸展保持 (單指 MAX 持 3 秒，改善 rigidity)
 *   TRAIN_G         - 模式G: 漸進阻力斜坡 (5s緩升+2s持+3s回，力量訓練)
 *   STOP            - 停止訓練並回到 REST
 *   SETREST,<ch>,<a>- 即時設定指定舵機 REST 角度
 *   SETMAX,<ch>,<a> - 即時設定指定舵機 MAX 角度
 *   DISABLE,<ch>    - 訓練時跳過指定舵機
 *   ENABLE,<ch>     - 重新啟用指定舵機
 *   DIAG,<ch>       - 單一舵機隔離掃描 + 電位器交叉檢查
 *   RECORD          - 開始引導式手指位置記錄 (12步)
 *   OK              - 確認當前記錄步驟
 *   SKIP            - 跳過當前步驟
 *   REPORT          - 顯示記錄結果 + 下一步說明
 *   CALC            - 計算訓練模式舵機目標角度
 *   LIVE            - 即時監控 (電位器 + 舵機)
 *   POTS            - 讀取所有電位器一次
 *   SERVOS          - 顯示目前所有舵機狀態
 *   S,<ch>,<angle>  - 移動單個舵機
 *   ALL,<angle>     - 所有舵機移動到同一角度
 *   CENTER          - 所有舵機 90deg
 *   REV,<ch>,<0|1>  - 反轉指定舵機方向
 *   PULSE,<ch>,<p>  - PCA9685 原始 PWM pulse 測試
 *   CR,<ch>,<speed> - 連續旋轉舵機速度測試 (-100..100)
 *   MARK_SR,<ch>    - 記錄舵機「無阻力」角度
 *   MARK_SM,<ch>    - 記錄舵機「最大阻力」角度
 *   SCAN            - I2C 掃描
 *   HELP            - 命令列表
 */

#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

// ===== 硬體設定 =====
Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver(0x40);

#define SERVO_MIN  150
#define SERVO_MAX  600
#define SERVO_FREQ  50

// 引腳對應 (與更新後的 FIXED_FIXED.ino 一致)
const int POT_PIN[5] = {A0, A1, A2, A3, A7};  // 小指, 無名指, 中指, 食指, 拇指
const int PCA_CH[5]  = {0,  1,  3,  4,  6};   // PCA9685 通道 (PTEST 實測確認)
const char* FN[5]    = {"Pinky ", "Ring  ", "Middle", "Index ", "Thumb "};

// ===== 記錄的手指位置資料 =====
// 每根手指記錄 3 個位置: REST(伸直), HALF(一半彎曲), FULL(最大彎曲)
// 另外記錄 GRIP(全部握拳)
int potRest[5] = {-1,-1,-1,-1,-1};
int potHalf[5] = {-1,-1,-1,-1,-1};
int potFull[5] = {-1,-1,-1,-1,-1};
int potGrip[5] = {-1,-1,-1,-1,-1};

// ===== 舵機校準資料 (已標定) =====
int servoRestAngle[5] = {30,  10,  50,  10,  60};   // 無阻力位置 (手指伸直)
int servoMaxAngle[5]  = {100, 130, 130,  60, 140};  // 最大阻力位置 (最大彎曲)
int servoAngle[5]     = {90,  90,  90,  90,  90};   // 當前角度
bool servoReverse[5]  = {false,false,false,false,false};
bool servoDisabled[5] = {false,false,false,false,false}; // true=跳過訓練(機械卡位)

// ===== 訓練模式 =====
#define TRAIN_NONE  0
#define TRAIN_A     1   // 手指敲擊: 2Hz  同時  REST<->HALF  [改善 bradykinesia]
#define TRAIN_B     2   // 大幅度:  0.25Hz 同時  REST<->FULL  [LSVT BIG]
#define TRAIN_C     3   // 順序移動: 依次每根 REST->FULL->REST [改善協調性]
#define TRAIN_D     4   // 握拳循環: 0.5Hz 同時  REST<->FULL  [改善 rigidity]
#define TRAIN_E     5   // 拇指對指: 拇指依次與其他指敲擊 [MDS-UPDRS opposition, fine motor]
#define TRAIN_F     6   // 持續伸展: 單指緩慢到 MAX 保持 3 秒 [改善 rigidity]
#define TRAIN_G     7   // 漸進阻力: 單指 5 秒緩升 + 2 秒峰持 + 3 秒受控回 [力量訓練]

const int HC_A = 250;    // Mode A 半周期 ms (2Hz)(太快可改 400-500)
const int HC_B = 2000;   // Mode B 半周期 ms (0.25Hz)(太慢可改 1000)
const int HC_C = 800;    // Mode C 每根手指每半段 ms (太快可改 1200)
const int HC_D = 1000;   // Mode D 半周期 ms (0.5Hz)
const int HC_E = 300;    // Mode E 每對 (出/收) 各 300ms
const int HC_F_EXT  = 1500;  // Mode F 緩慢伸出
const int HC_F_HOLD = 3000;  // Mode F 持續保持
const int HC_F_RET  = 1500;  // Mode F 緩慢回收
const int HC_F_REST = 1000;  // Mode F 兩指間休息
const int HC_G_UP   = 5000;  // Mode G 緩升
const int HC_G_PEAK = 2000;  // Mode G 峰值持
const int HC_G_DOWN = 3000;  // Mode G 受控下降

int  trainMode     = TRAIN_NONE;
bool trainRunning  = false;
unsigned long phaseStartMs = 0;
int  trainPhaseDir = 0;   // 0=向目標移動  1=返回REST
int  trainPhaseStep = 0;  // F/G 子階段 (0=ext/up, 1=hold/peak, 2=ret/down, 3=rest)
int  seqFinger     = 0;   // Mode C/F/G: 當前手指
int  pairFinger    = 3;   // Mode E: 當前與拇指配對的手指 (3=Index, 2=Middle, 1=Ring, 0=Pinky)
int  trainReps     = 0;   // 完成完整循環次數
unsigned long lastTrainPrintMs = 0;
const int IDX_THUMB = 4;  // 邏輯索引: 拇指在 index 4

// ===== 引導記錄狀態機 =====
// 步驟: 0=REST_ALL, 1-10=每根手指FULL/HALF, 11=GRIP_ALL, -1=未啟動
int recStep = -1;

// 步驟說明
const char* STEP_INST[] = {
  // step 0
  ">>> 請讓所有手指完全伸直放鬆，就像手平放在桌上一樣。確認穩定後輸入 OK",
  // step 1: thumb full
  ">>> 【拇指】最大彎曲: 將拇指彎到最舒適的最大位置。其他手指保持伸直。輸入 OK 記錄",
  // step 2: thumb half
  ">>> 【拇指】輕輕敲擊: 拇指彎到大約一半位置，就像輕輕敲桌子一樣。輸入 OK 記錄",
  // step 3: index full
  ">>> 【食指】最大彎曲: 食指彎到最舒適的最大位置。其他手指保持伸直。輸入 OK 記錄",
  // step 4: index half
  ">>> 【食指】輕輕敲擊: 食指彎到大約一半位置。輸入 OK 記錄",
  // step 5: middle full
  ">>> 【中指】最大彎曲: 中指彎到最舒適的最大位置。輸入 OK 記錄",
  // step 6: middle half
  ">>> 【中指】輕輕敲擊: 中指彎到大約一半位置。輸入 OK 記錄",
  // step 7: ring full
  ">>> 【無名指】最大彎曲: 無名指彎到最舒適的最大位置。輸入 OK 記錄",
  // step 8: ring half
  ">>> 【無名指】輕輕敲擊: 無名指彎到大約一半位置。輸入 OK 記錄",
  // step 9: pinky full
  ">>> 【小指】最大彎曲: 小指彎到最舒適的最大位置。輸入 OK 記錄",
  // step 10: pinky half
  ">>> 【小指】輕輕敲擊: 小指彎到大約一半位置。輸入 OK 記錄",
  // step 11: grip
  ">>> 【握拳】所有手指同時握拳，舒適程度即可。輸入 OK 記錄"
};

bool liveMode = false;
unsigned long lastLive = 0;
const int LIVE_MS = 350;
unsigned long lastTrainUpdateMs = 0;
const int TRAIN_UPDATE_MS = 40;  // trainUpdate 最小間隔 ms — 40ms 使每步 ≥8° 克服舵機死區

// ===== 工具函數 =====

int angleToPulse(int angle) {
  return map(constrain(angle, 0, 180), 0, 180, SERVO_MIN, SERVO_MAX);
}

void setServo(int ch, int angle) {
  if (ch < 0 || ch >= 5) return;
  angle = constrain(angle, 0, 180);
  int physicalAngle = servoReverse[ch] ? 180 - angle : angle;
  pwm.setPWM(PCA_CH[ch], 0, angleToPulse(physicalAngle));
  servoAngle[ch] = angle;
}

void setServoStaggered(int ch, int angle) {
  if (servoDisabled[ch]) return;  // 跳過機械卡位通道
  setServo(ch, angle);
  delayMicroseconds(2000);  // 2ms 間隔分散相鄰 PCA 通道電流衝擊
}

void setServoPulse(int ch, int pulse) {
  if (ch < 0 || ch >= 5) return;
  pulse = constrain(pulse, 100, 650);
  pwm.setPWM(PCA_CH[ch], 0, pulse);
}

void setContinuousServoSpeed(int ch, int speedPct) {
  if (ch < 0 || ch >= 5) return;
  speedPct = constrain(speedPct, -100, 100);
  if (servoReverse[ch]) speedPct = -speedPct;
  int stopPulse = (SERVO_MIN + SERVO_MAX) / 2;
  int span = (SERVO_MAX - SERVO_MIN) / 2;
  int pulse = stopPulse + (span * speedPct / 100);
  setServoPulse(ch, pulse);
}

// 取平均值 (5次採樣)
int readPotAvg(int ch) {
  long sum = 0;
  for (int i = 0; i < 5; i++) {
    sum += analogRead(POT_PIN[ch]);
    delay(5);
  }
  return (int)(sum / 5);
}

// 顯示一行電位器資訊
void printPotLine(int ch) {
  int v = readPotAvg(ch);
  Serial.print("  CH"); Serial.print(ch);
  Serial.print(" "); Serial.print(FN[ch]);
  Serial.print(" A"); Serial.print(ch == 4 ? 7 : ch);
  Serial.print(": ");
  char buf[5]; sprintf(buf, "%4d", v); Serial.print(buf);
  Serial.print("  ("); Serial.print(v / 1023.0 * 100.0, 1); Serial.println("%)");
}

// ===== I2C 掃描 =====
void scanI2C() {
  Serial.println("\n=== I2C Scan ===");
  int found = 0;
  for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.print("  Found: 0x");
      if (addr < 16) Serial.print("0");
      Serial.print(addr, HEX);
      if (addr == 0x40) Serial.print("  <-- PCA9685 OK");
      Serial.println();
      found++;
    }
  }
  if (found == 0) {
    Serial.println("  [ERROR] No device! Check SDA->A4 SCL->A5 VCC->3.3V GND->GND");
  } else {
    Serial.print("  Total: "); Serial.print(found); Serial.println(" device(s)");
  }
  Serial.println();
}

// ===== 即時監控 =====
void printLiveStatus() {
  Serial.println("\n-- Live --");
  Serial.println("CH  Finger   Servo  | Pot    Raw%   REST  HALF  FULL");
  Serial.println("-------------------------------------------------------");
  for (int i = 0; i < 5; i++) {
    Serial.print(" "); Serial.print(i);
    Serial.print("  "); Serial.print(FN[i]);
    Serial.print("  ");
    char abuf[4]; sprintf(abuf, "%3d", servoAngle[i]); Serial.print(abuf);
    Serial.print("deg | ");
    int v = readPotAvg(i);
    char pbuf[5]; sprintf(pbuf, "%4d", v); Serial.print(pbuf);
    Serial.print("  ");
    Serial.print(v / 1023.0 * 100.0, 1);
    Serial.print("%  ");
    // show distance from recorded positions
    if (potRest[i] >= 0) { char b[5]; sprintf(b, "%4d", potRest[i]); Serial.print(b); } else Serial.print("  --");
    Serial.print("  ");
    if (potHalf[i] >= 0) { char b[5]; sprintf(b, "%4d", potHalf[i]); Serial.print(b); } else Serial.print("  --");
    Serial.print("  ");
    if (potFull[i] >= 0) { char b[5]; sprintf(b, "%4d", potFull[i]); Serial.print(b); } else Serial.print("  --");
    Serial.println();
  }
  Serial.println();
}

// ===== 舵機狀態 =====
void showServoStatus() {
  Serial.println("\n=== Servo Output Status ===");
  Serial.println("CH  Finger   PCA  Target  Reverse  Physical  Pulse");
  Serial.println("-----------------------------------------------------");
  for (int i = 0; i < 5; i++) {
    int physicalAngle = servoReverse[i] ? 180 - servoAngle[i] : servoAngle[i];
    int pulse = angleToPulse(physicalAngle);
    Serial.print(" ");
    Serial.print(i);
    Serial.print("  ");
    Serial.print(FN[i]);
    Serial.print("  ");
    char buf[8];
    sprintf(buf, "%2d", PCA_CH[i]);
    Serial.print(buf);
    Serial.print("   ");
    sprintf(buf, "%3d", servoAngle[i]);
    Serial.print(buf);
    Serial.print("deg   ");
    Serial.print(servoReverse[i] ? "ON " : "OFF");
    Serial.print("      ");
    sprintf(buf, "%3d", physicalAngle);
    Serial.print(buf);
    Serial.print("deg    ");
    Serial.println(pulse);
  }
  Serial.println();
}

void printAllServoAngles() {
  Serial.print("  All angles: ");
  for (int i = 0; i < 5; i++) {
    Serial.print(FN[i]);
    Serial.print("=");
    Serial.print(servoAngle[i]);
    Serial.print("deg");
    if (i < 4) Serial.print(" | ");
  }
  Serial.println();
}

// ===== 訓練模式核心 (非阻塞) =====
void initServosToRest() {
  Serial.println("[INIT] Moving all servos to REST positions...");
  for (int i = 0; i < 5; i++) {
    if (servoDisabled[i]) { Serial.print("  "); Serial.print(FN[i]); Serial.println(" DISABLED (skipped)"); continue; }
    setServo(i, servoRestAngle[i]); delay(60);
  }
  printAllServoAngles();
}

void startTrain(int mode) {
  initServosToRest();
  delay(400);
  trainMode     = mode;
  trainRunning  = true;
  trainPhaseDir = 0;
  trainPhaseStep = 0;
  seqFinger     = 0;
  pairFinger    = 3;         // E mode: 從食指開始
  trainReps     = 0;
  lastTrainUpdateMs = 0;     // 確保第一次 update 立即執行
  phaseStartMs  = millis();
  lastTrainPrintMs = 0;
  const char* names[] = {"","A-Tapping","B-Amplitude","C-Sequential","D-Grip",
                         "E-Opposition","F-SustainedHold","G-ProgressiveRamp"};
  Serial.print("\n[TRAIN "); Serial.print(names[mode]);
  Serial.println("] Started  |  type STOP to stop");
  Serial.println("  REST/MAX/HALF per finger:");
  for (int i = 0; i < 5; i++) {
    int half = servoRestAngle[i] + (servoMaxAngle[i] - servoRestAngle[i]) / 2;
    int swing = (mode == TRAIN_A) ? (half - servoRestAngle[i]) : (servoMaxAngle[i] - servoRestAngle[i]);
    Serial.print("  "); Serial.print(FN[i]);
    Serial.print(" REST="); Serial.print(servoRestAngle[i]);
    Serial.print(" MAX=");  Serial.print(servoMaxAngle[i]);
    Serial.print(" swing="); Serial.print(swing); Serial.print("deg");
    if (servoDisabled[i])         Serial.print("  ** DISABLED **");
    else if (swing < 15)          Serial.print("  [WARN: swing<15deg, may not move]");
    Serial.println();
  }
  Serial.println();
}

void trainUpdate() {
  if (!trainRunning) return;
  unsigned long now = millis();

  // TRAIN_B 用較長間隔讓每步角度夠大 (≥6°) 才能驅動舵機
  int updateInterval = (trainMode == TRAIN_B) ? 200 : TRAIN_UPDATE_MS;
  if (now - lastTrainUpdateMs < (unsigned long)updateInterval) return;
  lastTrainUpdateMs = now;
  unsigned long elapsed = now - phaseStartMs;

  if (trainMode == TRAIN_A) {
    // 直接跳到目標 + 啟動相位錯開: 避免 5 舵機同時啟動造成電源崩
    const int START_OFFSET_MS = 30;  // 每個通道啟動時間錯開 30ms
    for (int i = 0; i < 5; i++) {
      long servoElapsed = (long)elapsed - (long)i * START_OFFSET_MS;
      if (servoElapsed < 0) continue;  // 這個舵機還沒輪到啟動
      int half   = servoRestAngle[i] + (servoMaxAngle[i] - servoRestAngle[i]) / 2;
      int target = (trainPhaseDir == 0) ? half : servoRestAngle[i];
      setServoStaggered(i, target);
    }
    if (elapsed >= (unsigned long)HC_A) {
      trainPhaseDir ^= 1;
      if (trainPhaseDir == 0) trainReps++;
      phaseStartMs = now;
      if (trainReps > 0 && now - lastTrainPrintMs > 2000) {
        Serial.print("[A] Tapping reps="); Serial.println(trainReps);
        lastTrainPrintMs = now;
      }
    }

  } else if (trainMode == TRAIN_B) {
    // 插值 + 200ms 間隔 → 每步 ≥6°, 視覺上流暢
    float t = min(1.0f, (float)elapsed / HC_B);
    for (int i = 0; i < 5; i++) {
      int from = (trainPhaseDir == 0) ? servoRestAngle[i] : servoMaxAngle[i];
      int to   = (trainPhaseDir == 0) ? servoMaxAngle[i] : servoRestAngle[i];
      setServoStaggered(i, from + (int)((to - from) * t));
    }
    if (elapsed >= (unsigned long)HC_B) {
      trainPhaseDir ^= 1;
      if (trainPhaseDir == 0) {
        trainReps++;
        Serial.print("[B] Amplitude reps="); Serial.println(trainReps);
      }
      phaseStartMs = now;
    }

  } else if (trainMode == TRAIN_C) {
    // 順序單指插值 (已驗證正常)
    float t = min(1.0f, (float)elapsed / HC_C);
    int from = (trainPhaseDir == 0) ? servoRestAngle[seqFinger] : servoMaxAngle[seqFinger];
    int to   = (trainPhaseDir == 0) ? servoMaxAngle[seqFinger]  : servoRestAngle[seqFinger];
    for (int i = 0; i < 5; i++) {
      if (i == seqFinger) setServoStaggered(i, from + (int)((to - from) * t));
      else                setServoStaggered(i, servoRestAngle[i]);
    }
    if (elapsed >= (unsigned long)HC_C) {
      trainPhaseDir ^= 1;
      phaseStartMs = now;
      if (trainPhaseDir == 0) {
        Serial.print("[C] "); Serial.print(FN[seqFinger]); Serial.println(" done");
        seqFinger = (seqFinger + 1) % 5;
        if (seqFinger == 0) {
          trainReps++;
          Serial.print("[C] Full cycle reps="); Serial.println(trainReps);
        }
      }
    }

  } else if (trainMode == TRAIN_D) {
    // 直接跳到目標: 握拳/放鬆無需平滑插值
    for (int i = 0; i < 5; i++) {
      int target = (trainPhaseDir == 0) ? servoMaxAngle[i] : servoRestAngle[i];
      setServoStaggered(i, target);
    }
    if (elapsed >= (unsigned long)HC_D) {
      trainPhaseDir ^= 1;
      if (trainPhaseDir == 0) {
        trainReps++;
        Serial.print("[D] Grip reps="); Serial.println(trainReps);
      }
      phaseStartMs = now;
    }

  } else if (trainMode == TRAIN_E) {
    // 拇指對指敲擊: 拇指 + 1 個手指同時做 REST<->HALF (僅 2 個舵機)
    // pairFinger 依次 = 3(Index)→2(Middle)→1(Ring)→0(Pinky), 然後反向
    // 每根: trainPhaseDir=0 出, trainPhaseDir=1 收
    int t_half = servoRestAngle[IDX_THUMB] + (servoMaxAngle[IDX_THUMB] - servoRestAngle[IDX_THUMB]) / 2;
    int p_half = servoRestAngle[pairFinger] + (servoMaxAngle[pairFinger] - servoRestAngle[pairFinger]) / 2;
    int t_target = (trainPhaseDir == 0) ? t_half : servoRestAngle[IDX_THUMB];
    int p_target = (trainPhaseDir == 0) ? p_half : servoRestAngle[pairFinger];
    // 其他 3 指保持 REST (不重複寫入,只在進入新配對時設一次,已由 phase 切換時的下一輪覆蓋)
    for (int i = 0; i < 5; i++) {
      if (i == IDX_THUMB)        setServoStaggered(i, t_target);
      else if (i == pairFinger)  setServoStaggered(i, p_target);
      else                       setServoStaggered(i, servoRestAngle[i]);
    }
    if (elapsed >= (unsigned long)HC_E) {
      trainPhaseDir ^= 1;
      phaseStartMs = now;
      if (trainPhaseDir == 0) {
        // 一對完成 (出+收), 切到下一對
        Serial.print("[E] Thumb+"); Serial.print(FN[pairFinger]); Serial.println(" done");
        pairFinger--;
        if (pairFinger < 0) {
          pairFinger = 3;
          trainReps++;
          Serial.print("[E] Full cycle reps="); Serial.println(trainReps);
        }
      }
    }

  } else if (trainMode == TRAIN_F) {
    // 持續伸展保持: 單指 ext(1.5s)→hold(3s)→ret(1.5s)→rest(1s), 然後下一指
    // 其他指保持 REST
    int target = servoRestAngle[seqFinger];
    unsigned long stepDur = HC_F_REST;
    if (trainPhaseStep == 0) {
      // 緩慢伸出 (插值)
      float t = min(1.0f, (float)elapsed / HC_F_EXT);
      target = servoRestAngle[seqFinger] + (int)((servoMaxAngle[seqFinger] - servoRestAngle[seqFinger]) * t);
      stepDur = HC_F_EXT;
    } else if (trainPhaseStep == 1) {
      // 持 MAX
      target = servoMaxAngle[seqFinger];
      stepDur = HC_F_HOLD;
    } else if (trainPhaseStep == 2) {
      // 緩慢回收 (插值)
      float t = min(1.0f, (float)elapsed / HC_F_RET);
      target = servoMaxAngle[seqFinger] + (int)((servoRestAngle[seqFinger] - servoMaxAngle[seqFinger]) * t);
      stepDur = HC_F_RET;
    } else {
      // rest
      target = servoRestAngle[seqFinger];
      stepDur = HC_F_REST;
    }
    for (int i = 0; i < 5; i++) {
      if (i == seqFinger) setServoStaggered(i, target);
      else                setServoStaggered(i, servoRestAngle[i]);
    }
    if (elapsed >= stepDur) {
      trainPhaseStep++;
      phaseStartMs = now;
      if (trainPhaseStep > 3) {
        trainPhaseStep = 0;
        Serial.print("[F] "); Serial.print(FN[seqFinger]); Serial.println(" cycle done");
        seqFinger = (seqFinger + 1) % 5;
        if (seqFinger == 0) {
          trainReps++;
          Serial.print("[F] Full cycle reps="); Serial.println(trainReps);
        }
      }
    }

  } else if (trainMode == TRAIN_G) {
    // 漸進阻力斜坡: 單指 ramp_up(5s)→peak(2s)→ramp_down(3s), 然後下一指
    int target = servoRestAngle[seqFinger];
    unsigned long stepDur = HC_G_UP;
    if (trainPhaseStep == 0) {
      // 線性緩升 (插值)
      float t = min(1.0f, (float)elapsed / HC_G_UP);
      target = servoRestAngle[seqFinger] + (int)((servoMaxAngle[seqFinger] - servoRestAngle[seqFinger]) * t);
      stepDur = HC_G_UP;
    } else if (trainPhaseStep == 1) {
      target = servoMaxAngle[seqFinger];
      stepDur = HC_G_PEAK;
    } else {
      // 受控下降 (插值)
      float t = min(1.0f, (float)elapsed / HC_G_DOWN);
      target = servoMaxAngle[seqFinger] + (int)((servoRestAngle[seqFinger] - servoMaxAngle[seqFinger]) * t);
      stepDur = HC_G_DOWN;
    }
    for (int i = 0; i < 5; i++) {
      if (i == seqFinger) setServoStaggered(i, target);
      else                setServoStaggered(i, servoRestAngle[i]);
    }
    if (elapsed >= stepDur) {
      trainPhaseStep++;
      phaseStartMs = now;
      if (trainPhaseStep > 2) {
        trainPhaseStep = 0;
        Serial.print("[G] "); Serial.print(FN[seqFinger]); Serial.println(" cycle done");
        seqFinger = (seqFinger + 1) % 5;
        if (seqFinger == 0) {
          trainReps++;
          Serial.print("[G] Full cycle reps="); Serial.println(trainReps);
        }
      }
    }
  }
}

// ===== 讀取所有電位器 =====
void readAllPots() {
  Serial.println("\n=== Potentiometer Readings ===");
  for (int i = 0; i < 5; i++) printPotLine(i);
  Serial.println();
}

// ===== 引導記錄 =====
void showRecordPrompt(int step) {
  Serial.println();
  Serial.print("[Step "); Serial.print(step + 1); Serial.print("/12] ");
  Serial.println(STEP_INST[step]);
  Serial.println("  Current pot values:");
  if (step == 0 || step == 11) {
    for (int i = 0; i < 5; i++) printPotLine(i);
  } else {
    int finger = (step <= 10) ? (step - 1) / 2 : -1;
    if (finger >= 0) printPotLine(finger);
  }
}

void doRecord(int step) {
  if (step == 0) {
    for (int i = 0; i < 5; i++) potRest[i] = readPotAvg(i);
    Serial.println("  [OK] REST recorded:");
    for (int i = 0; i < 5; i++) {
      Serial.print("    "); Serial.print(FN[i]); Serial.print(" = "); Serial.println(potRest[i]);
    }
  } else if (step >= 1 && step <= 10) {
    int finger = (step - 1) / 2;
    bool isFull = (step % 2 == 1);
    int val = readPotAvg(finger);
    if (isFull) potFull[finger] = val;
    else        potHalf[finger] = val;
    Serial.print("  [OK] "); Serial.print(FN[finger]);
    Serial.print(isFull ? " FULL=" : " HALF="); Serial.println(val);
  } else if (step == 11) {
    for (int i = 0; i < 5; i++) potGrip[i] = readPotAvg(i);
    Serial.println("  [OK] GRIP recorded:");
    for (int i = 0; i < 5; i++) {
      Serial.print("    "); Serial.print(FN[i]); Serial.print(" = "); Serial.println(potGrip[i]);
    }
  }
}

void advanceRecord() {
  recStep++;
  if (recStep > 11) {
    recStep = -1;
    Serial.println("\n========================================");
    Serial.println("  Recording complete! Type REPORT to see");
    Serial.println("  results and next-step instructions.");
    Serial.println("========================================\n");
  } else {
    showRecordPrompt(recStep);
  }
}

// ===== REPORT: 記錄結果 + 下一步說明 =====
void showReport() {
  Serial.println("\n========================================");
  Serial.println("  FINGER POSITION RECORDING REPORT");
  Serial.println("========================================");
  Serial.println("Finger   REST   HALF   FULL   GRIP");
  Serial.println("--------------------------------------");
  for (int i = 0; i < 5; i++) {
    Serial.print(FN[i]); Serial.print(" ");
    char r[5],h[5],f[5],g[5];
    sprintf(r, "%4d", potRest[i] >= 0 ? potRest[i] : -1);
    sprintf(h, "%4d", potHalf[i] >= 0 ? potHalf[i] : -1);
    sprintf(f, "%4d", potFull[i] >= 0 ? potFull[i] : -1);
    sprintf(g, "%4d", potGrip[i] >= 0 ? potGrip[i] : -1);
    Serial.print(r); Serial.print("   ");
    Serial.print(h); Serial.print("   ");
    Serial.print(f); Serial.print("   ");
    Serial.println(g);
  }

  Serial.println("\n--- Training Mode Definitions (based on recorded data) ---");
  Serial.println("Mode A TAPPING  : REST <-> HALF  rapid (2-3Hz)  [targets bradykinesia]");
  Serial.println("Mode B AMPLITUDE: REST <-> FULL  slow  (0.3Hz)  [targets hypokinesia, LSVT BIG]");
  Serial.println("Mode C SEQUENCE : each finger REST->FULL in order [targets coordination]");
  Serial.println("Mode D GRIP     : all fingers REST <-> GRIP      [targets rigidity]");

  Serial.println("\n--- NEXT STEP: Servo Calibration ---");
  Serial.println("For each finger (ch 0-4):");
  Serial.println("  1. Use S,<ch>,<angle> to move servo");
  Serial.println("  2. Find angle where servo JUST TOUCHES pot knob at REST position");
  Serial.println("     -> Send: MARK_SR,<ch>");
  Serial.println("  3. Move servo until it blocks pot at FULL BEND position");
  Serial.println("     -> Send: MARK_SM,<ch>");
  Serial.println("  4. After all 5 fingers: type CALC to compute training targets");
  Serial.println();
  Serial.println("POT target values for each finger:");
  for (int i = 0; i < 5; i++) {
    Serial.print("  CH"); Serial.print(i); Serial.print(" "); Serial.print(FN[i]); Serial.print(":");
    Serial.print("  TAPPING-target="); Serial.print(potHalf[i]);
    Serial.print("  FULL-target="); Serial.println(potFull[i]);
  }
  Serial.println("==========================================\n");
}

// ===== CALC: 計算訓練舵機目標角度 =====
void calcServoTargets() {
  Serial.println("\n========================================");
  Serial.println("  SERVO TARGET CALCULATOR");
  Serial.println("========================================");

  bool anyMissing = false;
  for (int i = 0; i < 5; i++) {
    if (servoRestAngle[i] == servoMaxAngle[i]) { anyMissing = true; break; }
  }
  if (anyMissing) {
    Serial.println("[!] Some servo calibration missing (MARK_SR / MARK_SM not all set)");
    Serial.println("    Showing formula only:");
    Serial.println("    Target = REST_angle + (MAX_angle - REST_angle) * intensity%");
    Serial.println();
  }

  Serial.println("Finger   SR(rest)  SM(max)  Range  TAPPING(50%)  AMPLITUDE(80%)  GRIP(100%)");
  Serial.println("------------------------------------------------------------------------------");
  for (int i = 0; i < 5; i++) {
    int sr = servoRestAngle[i];
    int sm = servoMaxAngle[i];
    int range = sm - sr;
    int tap  = sr + range * 50 / 100;
    int amp  = sr + range * 80 / 100;
    int grip = sm;

    Serial.print(FN[i]); Serial.print("  ");
    char buf[60];
    sprintf(buf, "  %3ddeg    %3ddeg   %4d     %3ddeg         %3ddeg          %3ddeg",
            sr, sm, range, tap, amp, grip);
    Serial.println(buf);
  }

  Serial.println("\n--- Configuration to paste into main program ---");
  Serial.println("// Servo REST angles (no resistance):");
  Serial.print("int servoRest[5] = {");
  for (int i = 0; i < 5; i++) {
    Serial.print(servoRestAngle[i]);
    if (i < 4) Serial.print(", ");
  }
  Serial.println("};");

  Serial.println("// Servo MAX angles (full resistance):");
  Serial.print("int servoMax[5]  = {");
  for (int i = 0; i < 5; i++) {
    Serial.print(servoMaxAngle[i]);
    if (i < 4) Serial.print(", ");
  }
  Serial.println("};");

  Serial.println("// Pot REST values:");
  Serial.print("int potRestVal[5] = {");
  for (int i = 0; i < 5; i++) {
    Serial.print(potRest[i]);
    if (i < 4) Serial.print(", ");
  }
  Serial.println("};");

  Serial.println("// Pot FULL values (max bend target):");
  Serial.print("int potFullVal[5] = {");
  for (int i = 0; i < 5; i++) {
    Serial.print(potFull[i]);
    if (i < 4) Serial.print(", ");
  }
  Serial.println("};");
  Serial.println("==========================================\n");
}

// ===== 說明 =====
void showHelp() {
  Serial.println("\n=== Commands ===");
  Serial.println("-- Training --");
  Serial.println("  INIT            Move all servos to REST position");
  Serial.println("  TRAIN_A         Start Mode A: Tapping 2Hz  all-fingers simultaneous");
  Serial.println("  TRAIN_B         Start Mode B: Amplitude 0.25Hz  all-fingers simultaneous");
  Serial.println("  TRAIN_C         Start Mode C: Sequential  one finger at a time");
  Serial.println("  TRAIN_D         Start Mode D: Grip/Release 0.5Hz  all-fingers simultaneous");
  Serial.println("  TRAIN_E         Start Mode E: Opposition Tap (thumb pairs each finger)");
  Serial.println("  TRAIN_F         Start Mode F: Sustained Hold (slow ext + 3s hold per finger)");
  Serial.println("  TRAIN_G         Start Mode G: Progressive Ramp (5s up + 2s peak + 3s down)");
  Serial.println("  STOP            Stop training, return to REST");
  Serial.println("  SETREST,<ch>,<a> Update REST angle live (no recompile)");
  Serial.println("  SETMAX,<ch>,<a>  Update MAX  angle live (no recompile)");
  Serial.println("  DISABLE,<ch>     Exclude a mechanically stuck servo from training");
  Serial.println("  ENABLE,<ch>      Re-include a previously disabled servo");
  Serial.println("  DIAG,<ch>        Isolated sweep of one servo + pot cross-check");
  Serial.println("-- Recording --");
  Serial.println("  RECORD          Start guided 12-step recording");
  Serial.println("  OK              Confirm current recording step");
  Serial.println("  SKIP            Skip current step");
  Serial.println("  REPORT          Show recorded data + next step guide");
  Serial.println("-- Servo Calibration --");
  Serial.println("  S,<ch>,<angle>  Move one servo (ch=0-4, angle=0-180)");
  Serial.println("  REV,<ch>,<0|1>  Reverse normal angle direction for one servo");
  Serial.println("  PULSE,<ch>,<p>  Raw PCA9685 pulse test (safe clamp 100-650)");
  Serial.println("  CR,<ch>,<speed> Continuous-rotation servo speed (-100..100)");
  Serial.println("  ALL,<angle>     All servos to same angle");
  Serial.println("  CENTER          All servos to 90deg");
  Serial.println("  MARK_SR,<ch>    Save current servo angle as REST (no resistance)");
  Serial.println("  MARK_SM,<ch>    Save current servo angle as MAX resistance");
  Serial.println("  CALC            Calculate training mode servo targets");
  Serial.println("-- Monitor --");
  Serial.println("  LIVE            Toggle live monitor (pot + servo)");
  Serial.println("  SERVOS          Show current servo target/pulse values");
  Serial.println("  POTS            Read all pots once");
  Serial.println("  SCAN            I2C scan");
  Serial.println("  HELP            This list");
  Serial.println("================\n");
}

// ===== 命令處理 =====
void handleCommand(String cmd) {
  cmd.trim();
  cmd.toUpperCase();

  if (cmd == "RECORD") {
    recStep = -1;
    Serial.println("\n=== Guided Recording Started ===");
    Serial.println("You will be guided through 12 steps.");
    Serial.println("Follow each instruction, then type OK to record.");
    Serial.println("Type SKIP to skip a step, LIVE to see live values.\n");
    advanceRecord();

  } else if (cmd == "OK") {
    if (recStep < 0) {
      Serial.println("[!] No recording in progress. Type RECORD to start.");
    } else {
      doRecord(recStep);
      delay(200);
      advanceRecord();
    }

  } else if (cmd == "SKIP") {
    if (recStep < 0) {
      Serial.println("[!] No recording in progress.");
    } else {
      Serial.print("  [SKIP] Step "); Serial.println(recStep);
      advanceRecord();
    }

  } else if (cmd.startsWith("SETREST,")) {
    int comma = cmd.indexOf(',', 8);
    if (comma > 0) {
      int ch  = cmd.substring(8, comma).toInt();
      int ang = cmd.substring(comma + 1).toInt();
      if (ch >= 0 && ch < 5) {
        servoRestAngle[ch] = constrain(ang, 0, 180);
        Serial.print("[SETREST] CH"); Serial.print(ch); Serial.print(" ("); Serial.print(FN[ch]);
        Serial.print(") REST="); Serial.println(servoRestAngle[ch]);
      } else { Serial.println("[ERR] ch must be 0-4"); }
    } else { Serial.println("[ERR] Format: SETREST,<ch>,<angle>"); }

  } else if (cmd.startsWith("SETMAX,")) {
    int comma = cmd.indexOf(',', 7);
    if (comma > 0) {
      int ch  = cmd.substring(7, comma).toInt();
      int ang = cmd.substring(comma + 1).toInt();
      if (ch >= 0 && ch < 5) {
        servoMaxAngle[ch] = constrain(ang, 0, 180);
        Serial.print("[SETMAX] CH"); Serial.print(ch); Serial.print(" ("); Serial.print(FN[ch]);
        Serial.print(") MAX="); Serial.println(servoMaxAngle[ch]);
      } else { Serial.println("[ERR] ch must be 0-4"); }
    } else { Serial.println("[ERR] Format: SETMAX,<ch>,<angle>"); }

  } else if (cmd.startsWith("DISABLE,")) {
    int ch = cmd.substring(8).toInt();
    if (ch >= 0 && ch < 5) {
      servoDisabled[ch] = true;
      Serial.print("[DISABLE] CH"); Serial.print(ch); Serial.print(" ("); Serial.print(FN[ch]);
      Serial.println(") excluded from training. Use ENABLE,<ch> to re-enable.");
    } else { Serial.println("[ERR] ch must be 0-4"); }

  } else if (cmd.startsWith("ENABLE,")) {
    int ch = cmd.substring(7).toInt();
    if (ch >= 0 && ch < 5) {
      servoDisabled[ch] = false;
      Serial.print("[ENABLE] CH"); Serial.print(ch); Serial.print(" ("); Serial.print(FN[ch]);
      Serial.println(") re-enabled.");
    } else { Serial.println("[ERR] ch must be 0-4"); }

  } else if (cmd == "INIT") {
    trainRunning = false;
    trainMode = TRAIN_NONE;
    initServosToRest();

  } else if (cmd == "TRAIN_A") {
    startTrain(TRAIN_A);

  } else if (cmd == "TRAIN_B") {
    startTrain(TRAIN_B);

  } else if (cmd == "TRAIN_C") {
    startTrain(TRAIN_C);

  } else if (cmd == "TRAIN_D") {
    startTrain(TRAIN_D);

  } else if (cmd == "TRAIN_E") {
    startTrain(TRAIN_E);

  } else if (cmd == "TRAIN_F") {
    startTrain(TRAIN_F);

  } else if (cmd == "TRAIN_G") {
    startTrain(TRAIN_G);

  } else if (cmd == "STOP") {
    if (trainRunning) {
      trainRunning = false;
      trainMode = TRAIN_NONE;
      Serial.print("[STOP] Training stopped. Reps completed: "); Serial.println(trainReps);
      initServosToRest();
    } else {
      Serial.println("[STOP] No training running.");
    }

  } else if (cmd == "REPORT") {
    showReport();

  } else if (cmd == "CALC") {
    calcServoTargets();

  } else if (cmd == "LIVE") {
    liveMode = !liveMode;
    Serial.println(liveMode ? "[Live ON]  type LIVE to stop" : "[Live OFF]");

  } else if (cmd == "POTS") {
    readAllPots();

  } else if (cmd == "SERVOS") {
    showServoStatus();

  } else if (cmd == "SCAN") {
    scanI2C();

  } else if (cmd.startsWith("DIAG,")) {
    int ch = cmd.substring(5).toInt();
    if (ch >= 0 && ch < 5) {
      Serial.println("[DIAG] Isolated servo sweep + pot monitor");
      Serial.print("  Testing CH"); Serial.print(ch); Serial.print(" ("); Serial.print(FN[ch]); Serial.println(") ONLY");
      Serial.println("  Other servos held at REST. Watch for unexpected pot changes.\n");
      int angles[] = {servoRestAngle[ch], servoMaxAngle[ch], servoRestAngle[ch]};
      const char* labels[] = {"REST", "MAX", "REST"};
      for (int s = 0; s < 3; s++) {
        setServo(ch, angles[s]);
        delay(600);
        Serial.print("  ["); Serial.print(labels[s]); Serial.print("] CH");
        Serial.print(ch); Serial.print("="); Serial.print(angles[s]); Serial.println("deg");
        Serial.print("  Pots: ");
        for (int i = 0; i < 5; i++) {
          Serial.print(FN[i]); Serial.print("="); Serial.print(readPotAvg(i));
          if (i < 4) Serial.print("  ");
        }
        Serial.println();
      }
      Serial.println("  [DIAG done] If another finger's pot changed, check wiring/power.");
    } else {
      Serial.println("[ERR] Format: DIAG,<ch>  (ch=0-4)");
    }

  } else if (cmd.startsWith("PTEST,")) {
    int comma = cmd.indexOf(',', 6);
    if (comma > 0) {
      int pca_ch = cmd.substring(6, comma).toInt();
      int angle  = cmd.substring(comma + 1).toInt();
      pca_ch = constrain(pca_ch, 0, 15);
      angle  = constrain(angle,  0, 180);
      int pulse = map(angle, 0, 180, SERVO_MIN, SERVO_MAX);
      pwm.setPWM(pca_ch, 0, pulse);
      Serial.print("[PTEST] PCA ch"); Serial.print(pca_ch);
      Serial.print(" -> "); Serial.print(angle); Serial.print("deg (pulse=");
      Serial.print(pulse); Serial.println(")");
    } else { Serial.println("[ERR] Format: PTEST,<pca_ch>,<angle>  (pca_ch=0-15)"); }

  } else if (cmd == "CENTER") {
    Serial.println("All servos -> 90deg");
    for (int i = 0; i < 5; i++) { setServo(i, 90); delay(80); }

  } else if (cmd == "HELP") {
    showHelp();

  } else if (cmd.startsWith("ALL,")) {
    int angle = cmd.substring(4).toInt();
    Serial.print("All -> "); Serial.print(angle); Serial.println("deg");
    for (int i = 0; i < 5; i++) { setServo(i, angle); delay(50); }

  } else if (cmd.startsWith("S,")) {
    int c1 = cmd.indexOf(',');
    int c2 = cmd.indexOf(',', c1 + 1);
    if (c2 > c1) {
      int ch  = cmd.substring(c1 + 1, c2).toInt();
      int ang = cmd.substring(c2 + 1).toInt();
      if (ch >= 0 && ch < 5) {
        setServo(ch, ang);
        Serial.print("[CH"); Serial.print(ch); Serial.print(" "); Serial.print(FN[ch]);
        Serial.print("] -> "); Serial.print(ang); Serial.println("deg");
        int pv = readPotAvg(ch);
        Serial.print("  Pot now: "); Serial.print(pv);
        Serial.print("  REST="); Serial.print(potRest[ch]);
        Serial.print("  HALF="); Serial.print(potHalf[ch]);
        Serial.print("  FULL="); Serial.println(potFull[ch]);
        printAllServoAngles();
      } else {
        Serial.println("[ERR] ch must be 0-4");
      }
    } else {
      Serial.println("[ERR] Format: S,<ch>,<angle>");
    }

  } else if (cmd.startsWith("REV,")) {
    int c1 = cmd.indexOf(',');
    int c2 = cmd.indexOf(',', c1 + 1);
    if (c2 > c1) {
      int ch = cmd.substring(c1 + 1, c2).toInt();
      int rev = cmd.substring(c2 + 1).toInt();
      if (ch >= 0 && ch < 5) {
        servoReverse[ch] = (rev != 0);
        Serial.print("[REV] CH"); Serial.print(ch); Serial.print(" ");
        Serial.print(FN[ch]); Serial.print(" reverse=");
        Serial.println(servoReverse[ch] ? "ON" : "OFF");
      } else {
        Serial.println("[ERR] ch must be 0-4");
      }
    } else {
      Serial.println("[ERR] Format: REV,<ch>,<0|1>");
    }

  } else if (cmd.startsWith("PULSE,")) {
    int c1 = cmd.indexOf(',');
    int c2 = cmd.indexOf(',', c1 + 1);
    if (c2 > c1) {
      int ch = cmd.substring(c1 + 1, c2).toInt();
      int pulse = cmd.substring(c2 + 1).toInt();
      if (ch >= 0 && ch < 5) {
        setServoPulse(ch, pulse);
        Serial.print("[PULSE] CH"); Serial.print(ch); Serial.print(" ");
        Serial.print(FN[ch]); Serial.print(" pulse=");
        Serial.println(constrain(pulse, 100, 650));
      } else {
        Serial.println("[ERR] ch must be 0-4");
      }
    } else {
      Serial.println("[ERR] Format: PULSE,<ch>,<pulse>");
    }

  } else if (cmd.startsWith("CR,")) {
    int c1 = cmd.indexOf(',');
    int c2 = cmd.indexOf(',', c1 + 1);
    if (c2 > c1) {
      int ch = cmd.substring(c1 + 1, c2).toInt();
      int speedPct = cmd.substring(c2 + 1).toInt();
      if (ch >= 0 && ch < 5) {
        setContinuousServoSpeed(ch, speedPct);
        Serial.print("[CR] CH"); Serial.print(ch); Serial.print(" ");
        Serial.print(FN[ch]); Serial.print(" speed=");
        Serial.print(constrain(speedPct, -100, 100)); Serial.println("%");
        Serial.println("  Use CR,<ch>,0 to stop continuous-rotation servo.");
      } else {
        Serial.println("[ERR] ch must be 0-4");
      }
    } else {
      Serial.println("[ERR] Format: CR,<ch>,<speed -100..100>");
    }

  } else if (cmd.startsWith("MARK_SR,")) {
    int ch = cmd.substring(8).toInt();
    if (ch >= 0 && ch < 5) {
      servoRestAngle[ch] = servoAngle[ch];
      Serial.print("[MARK_SR] CH"); Serial.print(ch); Serial.print(" ");
      Serial.print(FN[ch]); Serial.print(" -> REST=");
      Serial.print(servoAngle[ch]); Serial.println("deg");
    }

  } else if (cmd.startsWith("MARK_SM,")) {
    int ch = cmd.substring(8).toInt();
    if (ch >= 0 && ch < 5) {
      servoMaxAngle[ch] = servoAngle[ch];
      Serial.print("[MARK_SM] CH"); Serial.print(ch); Serial.print(" ");
      Serial.print(FN[ch]); Serial.print(" -> MAX=");
      Serial.print(servoAngle[ch]); Serial.println("deg");
    }

  } else {
    Serial.print("[?] Unknown: "); Serial.println(cmd);
    Serial.println("Type HELP");
  }
}

// ===== Setup / Loop =====
void setup() {
  Serial.begin(115200);
  while (!Serial);

  Serial.println("==========================================");
  Serial.println("  Finger Recording + Servo Calib Tool v2");
  Serial.println("  Arduino Nano 33 BLE Sense Rev2");
  Serial.println("==========================================");
  Serial.println("Pins: Thumb=A0 Index=A1 Middle=A2 Ring=A3 Pinky=A7");
  Serial.println("I2C:  SDA=A4  SCL=A5  (no conflict with pots)");
  Serial.println();

  Wire.begin();
  scanI2C();

  Serial.print("Init PCA9685... ");
  pwm.begin();
  pwm.setOscillatorFrequency(27000000);
  pwm.setPWMFreq(SERVO_FREQ);
  delay(10);
  Serial.println("OK  (servos not moved)");
  Serial.println("\nType RECORD to start  |  HELP for all commands\n");
}

void loop() {
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    handleCommand(cmd);
  }

  trainUpdate();

  if (liveMode && millis() - lastLive > LIVE_MS) {
    lastLive = millis();
    printLiveStatus();
  }

  delay(10);
}
