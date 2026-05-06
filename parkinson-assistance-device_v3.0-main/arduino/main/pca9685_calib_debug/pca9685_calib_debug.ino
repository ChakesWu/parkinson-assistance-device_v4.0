/*
 * PCA9685 手指動作記錄 + 舵機校準工具 v2
 * Arduino Nano 33 BLE Sense Rev2
 *
 * 引腳對應 (FIXED_FIXED.ino 更新後):
 *   CH0 拇指   PCA9685 ch0 | A0  (I2C 使用 A4/A5，無衝突)
 *   CH1 食指   PCA9685 ch1 | A1
 *   CH2 中指   PCA9685 ch2 | A2
 *   CH3 無名指 PCA9685 ch3 | A3
 *   CH4 小指   PCA9685 ch4 | A7
 *   PCA9685 SDA -> A4, SCL -> A5 (與電位器無衝突)
 *
 * 工作流程:
 *   Step 1: RECORD - 引導式記錄手指位置 (不需要舵機)
 *   Step 2: REPORT - 查看記錄結果 + 下一步指示
 *   Step 3: 用 S,<ch>,<angle> + MARK_SR/MARK_SM 校準舵機阻力位置
 *   Step 4: CALC   - 計算每個訓練模式的舵機目標角度
 *
 * 串口命令 (115200 baud):
 *   RECORD    - 開始引導式手指位置記錄 (12步)
 *   OK        - 確認當前記錄步驟
 *   SKIP      - 跳過當前步驟
 *   REPORT    - 顯示記錄結果 + 下一步說明
 *   CALC      - 計算訓練模式舵機目標角度
 *   LIVE      - 即時監控 (電位器 + 舵機)
 *   POTS      - 讀取所有電位器一次
 *   S,<ch>,<angle>  - 移動單個舵機
 *   ALL,<angle>     - 所有舵機
 *   CENTER          - 所有舵機 90deg
 *   MARK_SR,<ch>    - 記錄舵機「無阻力」角度
 *   MARK_SM,<ch>    - 記錄舵機「最大阻力」角度
 *   SCAN      - I2C 掃描
 *   HELP      - 命令列表
 */

#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

// ===== 硬體設定 =====
Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver(0x40);

#define SERVO_MIN  150
#define SERVO_MAX  600
#define SERVO_FREQ  50

// 引腳對應 (與更新後的 FIXED_FIXED.ino 一致)
const int POT_PIN[5] = {A0, A1, A2, A3, A7};  // 拇指, 食指, 中指, 無名指, 小指
const int PCA_CH[5]  = {0,  1,  2,  3,  4};   // PCA9685 通道
const char* FN[5]    = {"Thumb ", "Index ", "Middle", "Ring  ", "Pinky "};

// ===== 記錄的手指位置資料 =====
// 每根手指記錄 3 個位置: REST(伸直), HALF(一半彎曲), FULL(最大彎曲)
// 另外記錄 GRIP(全部握拳)
int potRest[5] = {-1,-1,-1,-1,-1};
int potHalf[5] = {-1,-1,-1,-1,-1};
int potFull[5] = {-1,-1,-1,-1,-1};
int potGrip[5] = {-1,-1,-1,-1,-1};

// ===== 舵機校準資料 =====
int servoRestAngle[5] = {90,90,90,90,90};  // 無阻力位置
int servoMaxAngle[5]  = {90,90,90,90,90};  // 最大阻力位置
int servoAngle[5]     = {90,90,90,90,90};  // 當前角度

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

// ===== 工具函數 =====

int angleToPulse(int angle) {
  return map(constrain(angle, 0, 180), 0, 180, SERVO_MIN, SERVO_MAX);
}

void setServo(int ch, int angle) {
  if (ch < 0 || ch >= 5) return;
  angle = constrain(angle, 0, 180);
  pwm.setPWM(PCA_CH[ch], 0, angleToPulse(angle));
  servoAngle[ch] = angle;
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
    char rpbuf[6]; dtostrf(v / 1023.0 * 100.0, 4, 1, rpbuf); Serial.print(rpbuf);
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
  Serial.println("-- Recording --");
  Serial.println("  RECORD          Start guided 12-step recording");
  Serial.println("  OK              Confirm current recording step");
  Serial.println("  SKIP            Skip current step");
  Serial.println("  REPORT          Show recorded data + next step guide");
  Serial.println("-- Servo Calibration --");
  Serial.println("  S,<ch>,<angle>  Move one servo (ch=0-4, angle=0-180)");
  Serial.println("  ALL,<angle>     All servos to same angle");
  Serial.println("  CENTER          All servos to 90deg");
  Serial.println("  MARK_SR,<ch>    Save current servo angle as REST (no resistance)");
  Serial.println("  MARK_SM,<ch>    Save current servo angle as MAX resistance");
  Serial.println("  CALC            Calculate training mode servo targets");
  Serial.println("-- Monitor --");
  Serial.println("  LIVE            Toggle live monitor (pot + servo)");
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

  } else if (cmd == "REPORT") {
    showReport();

  } else if (cmd == "CALC") {
    calcServoTargets();

  } else if (cmd == "LIVE") {
    liveMode = !liveMode;
    Serial.println(liveMode ? "[Live ON]  type LIVE to stop" : "[Live OFF]");

  } else if (cmd == "POTS") {
    readAllPots();

  } else if (cmd == "SCAN") {
    scanI2C();

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
      } else {
        Serial.println("[ERR] ch must be 0-4");
      }
    } else {
      Serial.println("[ERR] Format: S,<ch>,<angle>");
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

  if (liveMode && millis() - lastLive > LIVE_MS) {
    lastLive = millis();
    printLiveStatus();
  }

  delay(10);
}
