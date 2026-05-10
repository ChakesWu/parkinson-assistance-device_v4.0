/**
 * Parkinson Level -> Training Mode Classifier
 *
 * Maps detection levels to appropriate training modes based on the
 * Hoehn & Yahr scale and MDS Parkinson's Disease treatment guidelines.
 *
 * Design constraint: Modes that drive all 5 servos simultaneously
 * (TRAIN_A / TRAIN_B / TRAIN_D) are intentionally excluded to prevent
 * peak current overload on the power supply.
 * All mappings use at most 2 servos active at the same time.
 */

export type TrainingMode =
  | 'TRAIN_A'  // Tapping (5 servos) - excluded
  | 'TRAIN_B'  // Amplitude (5 servos) - excluded
  | 'TRAIN_C'  // Sequential (1 servo)
  | 'TRAIN_D'  // Grip (5 servos) - excluded
  | 'TRAIN_E'  // Opposition (2 servos: thumb + 1)
  | 'TRAIN_F'  // Sustained Hold (1 servo)
  | 'TRAIN_G'; // Progressive Ramp (1 servo)

export interface TrainingRecommendation {
  mode: TrainingMode;
  modeLabel: string;        // e.g. "TRAIN_C — Sequential"
  modeNameZh: string;
  rationale: string;
  durationSec: number;
  activeServos: number;
  references: string[];
}

const MODE_TABLE: Record<1 | 2 | 3 | 4 | 5, TrainingRecommendation> = {
  1: {
    mode: 'TRAIN_C',
    modeLabel: 'TRAIN_C — Sequential',
    modeNameZh: 'Sequential Single-Finger',
    rationale:
      'Level 1 (Normal / Early): Mild symptoms. Sequential REST→FULL→REST movement per finger provides coordination warm-up and motor maintenance training.',
    durationSec: 60,
    activeServos: 1,
    references: ['Goetz 2008 MDS-UPDRS Part III'],
  },
  2: {
    mode: 'TRAIN_E',
    modeLabel: 'TRAIN_E — Opposition',
    modeNameZh: 'Thumb Opposition',
    rationale:
      'Level 2 (Mild): Thumb sequentially taps each finger (index→pinky). Most effective early intervention for fine motor coordination; delays dexterity decline.',
    durationSec: 90,
    activeServos: 2,
    references: ['Sage & Almeida 2009 Symptom-specific PT for PD'],
  },
  3: {
    mode: 'TRAIN_F',
    modeLabel: 'TRAIN_F — Sustained Hold',
    modeNameZh: 'Sustained Hold',
    rationale:
      'Level 3 (Moderate): Single finger extends to maximum angle and holds for 3 s. Significant improvement in rigidity and range of motion (ROM) in moderate PD.',
    durationSec: 120,
    activeServos: 1,
    references: ['Schenkman 1998 ROM training in PD'],
  },
  4: {
    mode: 'TRAIN_F',
    modeLabel: 'TRAIN_F — Sustained Hold',
    modeNameZh: 'Sustained Hold (Low Intensity)',
    rationale:
      'Level 4 (Severe): Significant functional impairment. Low-intensity sustained hold preserves residual ROM and function while avoiding excessive fatigue.',
    durationSec: 150,
    activeServos: 1,
    references: ['Schenkman 1998', 'Keus 2014 European PT Guidelines for PD'],
  },
  5: {
    mode: 'TRAIN_G',
    modeLabel: 'TRAIN_G — Progressive Ramp',
    modeNameZh: 'Progressive Ramp',
    rationale:
      'Level 5 (Very Severe): Severe disability. Single-finger 5 s slow-rise + 2 s hold + 3 s return ramp is the lightest safe training option, minimising fatigue and fall risk.',
    durationSec: 180,
    activeServos: 1,
    references: ['Corcos 2013 Resistance training in PD'],
  },
};

/**
 * Returns the training recommendation for a given Parkinson level (1–5).
 */
export function getRecommendedTraining(level: number): TrainingRecommendation {
  const lv = Math.max(1, Math.min(5, Math.round(level || 2))) as 1 | 2 | 3 | 4 | 5;
  return MODE_TABLE[lv];
}

/** Returns a human-readable level label. */
export function getLevelLabelZh(level: number): string {
  switch (Math.round(level)) {
    case 1: return 'Normal (Early Stage)';
    case 2: return 'Mild';
    case 3: return 'Moderate';
    case 4: return 'Severe';
    case 5: return 'Very Severe';
    default: return 'Unknown';
  }
}
