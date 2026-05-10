export type AISeverityResult = {
  severityPercent: number; // 0..100
  stage: 'mild' | 'moderate' | 'severe';
  confidencePercent: number; // 0..100
};

export type RecommendationGroup = {
  category: string;
  items: string[];
};

export function classifySeverity(severityPercent: number): AISeverityResult {
  const clamped = Math.max(0, Math.min(100, severityPercent));
  let stage: AISeverityResult['stage'] = 'mild';
  if (clamped >= 70) stage = 'severe';
  else if (clamped >= 40) stage = 'moderate';
  return {
    severityPercent: clamped,
    stage,
    confidencePercent: 80,
  };
}

export function getRecommendations(severityPercent: number): RecommendationGroup[] {
  const { stage } = classifySeverity(severityPercent);

  const core: RecommendationGroup[] = [
    {
      category: 'Aerobic Exercise (3-5 days/week)',
      items: [
        'Brisk walking 30–45 minutes (RPE 11–13, able to talk but slightly breathless)',
        'Indoor cycling 20–30 minutes (intervals: 2 min easy / 1 min moderate effort, repeat 8–10 times)',
        'Swimming or water aerobics 30 minutes, focus on relaxing stiffness and improving endurance'
      ]
    },
    {
      category: 'Resistance Training (2–3 days/week)',
      items: [
        'Large muscle group training (squats, glute bridges, rows, chest press): 2–3 sets × 8–12 reps per exercise',
        'Resistance band shoulder abduction/external rotation strengthening to improve posture and trunk stability',
        'Ankle weighted leg raises and step-ups to strengthen lower limb response and standing ability'
      ]
    },
    {
      category: 'Flexibility & Joint Mobility (Daily)',
      items: [
        'Gentle stretching of neck, shoulder, hip, ankle joints for 20–30 seconds × 2–3 repetitions each',
        'Thoracic spine rotation and chest muscle relaxation to improve hunched posture and forward shoulder position',
        'LSVT BIG movements: exaggerated upper limb stretches and stride length'
      ]
    },
    {
      category: 'Balance & Gait (3 days/week)',
      items: [
        'Landmark gait training (stepping over lines, box stepping), add metronome or rhythmic cues (100–120 BPM)',
        'Turning and sit-to-stand practice: 10 repetitions × 2 sets, emphasize symmetry and stability',
        'Lateral stepping and backward walking to improve stability during directional changes'
      ]
    },
    {
      category: 'Fine Motor Skills & Upper Limb Coordination (3 days/week)',
      items: [
        'Finger tapping, knob turning, bead pinching exercises, alternating single and both hands for 10–15 minutes',
        'Wrist and forearm stretches with rubber band opening/closing to relieve stiffness and improve dexterity',
        'Metronome-assisted finger-to-thumb opposition training (variable speed 80→100 BPM)'
      ]
    }
  ];

  const advanced: RecommendationGroup[] = [
    {
      category: 'Rhythmic & Music Therapy (Rhythmic Auditory Stimulation)',
      items: [
        'Walking training synchronized with music beats, gradually increase cadence by 5–10%',
        'Use metronome to maintain stable stride length and cadence, improve freezing of gait'
      ]
    },
    {
      category: 'Tai Chi / Qigong (2–3 days/week)',
      items: [
        '24-form Tai Chi (first 8–12 forms), focus on weight shifting and upper limb extension',
        'Baduanjin or Yijinjing, coordinate with breathing rhythm to relax stiffness'
      ]
    },
    {
      category: 'Boxing/Dance (Functional Integration)',
      items: [
        'Non-contact boxing classes (Rock Steady Boxing type) 45–60 minutes per session',
        'Tango or waltz dance training to strengthen directional changes, stride length, and posture control'
      ]
    },
    {
      category: 'Voice & Breathing Training (LSVT/Respiratory Muscles)',
      items: [
        'Loud reading and sustained phonation (LSVT LOUD concept), 10–15 minutes daily',
        'Respiratory muscle trainer 30 repetitions/day (based on device resistance level)'
      ]
    },
    {
      category: 'Dual-Task Training',
      items: [
        'Walk while counting multiples of 7 or naming fruits/cities to improve attention shifting',
        'Backward walking with metronome (ensure safe environment)'
      ]
    }
  ];

  if (stage === 'mild') return core;
  if (stage === 'moderate') return [...core, ...advanced.slice(0, 3)];
  return [...core, ...advanced];
}