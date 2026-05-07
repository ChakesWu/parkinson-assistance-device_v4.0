#include "CheezsEMG.h"

#define INPUT_PIN  A6        // ← 先用 A0 測試硬體是否正常，確認後再換腳位
#define DETECT_PIN   9        // 传感器检测输入(黄色) — D9

#define BAUD_RATE 115200       // 串口波特率 

CheezsEMG sEMG(INPUT_PIN, DETECT_PIN, 500);

void setup() 
{
  Serial.begin(BAUD_RATE);
  unsigned long t0 = millis();
  while (!Serial && millis() - t0 < 2000);  // 等待 Serial 最多 2 秒
  sEMG.begin();
  Serial.println("EMG Monitor Ready");
  Serial.println("RAW,FILTERED,ENVELOPE,DETECT");
}  

void loop() 
{   
  if(sEMG.checkSampleInterval()) // 500Hz定时器
  {
    sEMG.processSignal();  
    int rawValue = sEMG.getRawSignal();             // 原始数据
    float filteredValue = sEMG.getFilteredSignal(); // 滤波数据
    int envelopValue = sEMG.getEnvelopeSignal();    // 包络数据
    int detectValue = sEMG.getDetectSignal();       // 佩戴检测信号
 
    // Serial Plotter 帶標籤格式 (Arduino IDE 2.x)
    Serial.print("RAW:");        Serial.print(rawValue);
    Serial.print(",FILTERED:");  Serial.print((int)filteredValue);
    Serial.print(",ENVELOPE:");  Serial.print(envelopValue);
    Serial.print(",DETECT:");    Serial.println(detectValue * 500); // 放大讓波形可見
    
  }
}