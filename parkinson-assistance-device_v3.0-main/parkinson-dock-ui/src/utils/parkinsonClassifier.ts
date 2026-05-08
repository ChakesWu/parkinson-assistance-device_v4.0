/**
 * Parkinson 等級 → 訓練模式分類器
 *
 * 根據 Hoehn & Yahr 量表與 MDS 帕金森治療指南，將檢測等級對應到合適的訓練模式。
 *
 * 重要設計約束：避免使用同時驅動全部 5 個舵機的模式 (TRAIN_A / TRAIN_B / TRAIN_D)，
 *               以降低瞬間電流峰值，防止電源不足造成舵機異常。
 *               全部對應只使用 1 個或最多 2 個舵機同時動作的模式。
 */

export type TrainingMode =
  | 'TRAIN_A'  // Tapping (5 servos) - 不使用
  | 'TRAIN_B'  // Amplitude (5 servos) - 不使用
  | 'TRAIN_C'  // Sequential (1 servo)
  | 'TRAIN_D'  // Grip (5 servos) - 不使用
  | 'TRAIN_E'  // Opposition (2 servos: thumb + 1)
  | 'TRAIN_F'  // Sustained Hold (1 servo)
  | 'TRAIN_G'; // Progressive Ramp (1 servo)

export interface TrainingRecommendation {
  mode: TrainingMode;
  modeLabel: string;        // e.g. "TRAIN_C — Sequential"
  modeNameZh: string;       // 中文名
  rationale: string;        // 科學依據說明
  durationSec: number;      // 建議訓練秒數
  activeServos: number;     // 同時動作的舵機數量
  references: string[];     // 文獻引用
}

const MODE_TABLE: Record<1 | 2 | 3 | 4 | 5, TrainingRecommendation> = {
  1: {
    mode: 'TRAIN_C',
    modeLabel: 'TRAIN_C — Sequential',
    modeNameZh: '順序單指訓練',
    rationale:
      '等級 1 (Normal/早期)：症狀輕微，採用順序單指 REST→FULL→REST 動作，作為協調性熱身與動作維持訓練，鞏固既有運動功能。',
    durationSec: 60,
    activeServos: 1,
    references: ['Goetz 2008 MDS-UPDRS Part III'],
  },
  2: {
    mode: 'TRAIN_E',
    modeLabel: 'TRAIN_E — Opposition',
    modeNameZh: '拇指對指訓練',
    rationale:
      '等級 2 (Mild)：拇指依次對食指/中指/無名指/小指敲擊，是改善精細運動協調最有效的早期介入手段，可延緩動作協調退化。',
    durationSec: 90,
    activeServos: 2,
    references: ['Sage & Almeida 2009 Symptom-specific PT for PD'],
  },
  3: {
    mode: 'TRAIN_F',
    modeLabel: 'TRAIN_F — Sustained Hold',
    modeNameZh: '持續伸展保持',
    rationale:
      '等級 3 (Moderate)：單指緩慢伸展至最大角度並保持 3 秒，針對中度患者的 rigidity (僵硬) 與關節活動範圍 (ROM) 改善效果顯著。',
    durationSec: 120,
    activeServos: 1,
    references: ['Schenkman 1998 ROM training in PD'],
  },
  4: {
    mode: 'TRAIN_F',
    modeLabel: 'TRAIN_F — Sustained Hold',
    modeNameZh: '持續伸展保持 (低強度)',
    rationale:
      '等級 4 (Severe)：症狀顯著影響功能，採用單指持續伸展保持 (較低強度) 維持殘餘功能與關節活動度，避免過度疲勞。',
    durationSec: 150,
    activeServos: 1,
    references: ['Schenkman 1998', 'Keus 2014 European PT Guidelines for PD'],
  },
  5: {
    mode: 'TRAIN_G',
    modeLabel: 'TRAIN_G — Progressive Ramp',
    modeNameZh: '漸進阻力斜坡',
    rationale:
      '等級 5 (Very Severe)：嚴重失能，使用單指 5 秒緩升 + 2 秒持 + 3 秒回的漸進斜坡，是負荷最輕的安全訓練選項，避免疲勞與跌倒風險。',
    durationSec: 180,
    activeServos: 1,
    references: ['Corcos 2013 Resistance training in PD'],
  },
};

/**
 * 根據 Parkinson 等級回傳訓練建議
 * @param level 1~5
 */
export function getRecommendedTraining(level: number): TrainingRecommendation {
  const lv = Math.max(1, Math.min(5, Math.round(level || 2))) as 1 | 2 | 3 | 4 | 5;
  return MODE_TABLE[lv];
}

/**
 * 等級 → 中文描述
 */
export function getLevelLabelZh(level: number): string {
  switch (Math.round(level)) {
    case 1: return 'Normal (正常 / 早期)';
    case 2: return 'Mild (輕度)';
    case 3: return 'Moderate (中度)';
    case 4: return 'Severe (重度)';
    case 5: return 'Very Severe (極重度)';
    default: return 'Unknown';
  }
}
