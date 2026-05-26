// Target-recommendation math for the onboarding wizard.
// Standard fitness-app formulas — Mifflin-St Jeor for BMR, multipliers
// for TDEE, opinionated adjustments per goal/pace.

export type PrimaryGoal =
  | 'lose_weight'
  | 'gain_weight'
  | 'build_muscle'
  | 'maintain'
  | 'general_health';

export type Sex = 'male' | 'female' | 'other';

export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'active'
  | 'very_active';

export type Pace = 'slow' | 'moderate' | 'aggressive';

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

// kcal delta from TDEE based on goal × pace.
const KCAL_DELTA: Record<PrimaryGoal, Record<Pace, number>> = {
  lose_weight: { slow: -250, moderate: -500, aggressive: -750 },
  gain_weight: { slow: 250, moderate: 500, aggressive: 750 },
  build_muscle: { slow: 100, moderate: 250, aggressive: 400 },
  maintain: { slow: 0, moderate: 0, aggressive: 0 },
  general_health: { slow: 0, moderate: 0, aggressive: 0 },
};

// Protein target g/kg of body weight.
const PROTEIN_G_PER_KG: Record<PrimaryGoal, number> = {
  lose_weight: 2.0, // preserve muscle in a deficit
  gain_weight: 1.8,
  build_muscle: 2.2,
  maintain: 1.6,
  general_health: 1.6,
};

interface TargetInputs {
  sex: Sex;
  age: number;
  height_cm: number;
  weight_kg: number;
  activity_level: ActivityLevel;
  primary_goal: PrimaryGoal;
  pace: Pace;
}

export interface RecommendedTargets {
  bmr: number;
  tdee: number;
  kcal_target: number;
  protein_target_g: number;
  fibre_target_g: number;
  steps_target: number;
}

/** Mifflin-St Jeor basal metabolic rate. */
export function mifflinStJeor(input: {
  sex: Sex;
  age: number;
  height_cm: number;
  weight_kg: number;
}): number {
  const base =
    10 * input.weight_kg + 6.25 * input.height_cm - 5 * input.age;
  // Treat 'other' the same as the female offset — under-counts vs. over-counts.
  const sexOffset = input.sex === 'male' ? 5 : -161;
  return Math.round(base + sexOffset);
}

export function recommendTargets(input: TargetInputs): RecommendedTargets {
  const bmr = mifflinStJeor(input);
  const tdee = Math.round(bmr * ACTIVITY_MULTIPLIER[input.activity_level]);
  const kcalDelta = KCAL_DELTA[input.primary_goal][input.pace];
  const kcal_target = Math.max(1200, Math.round((tdee + kcalDelta) / 10) * 10);

  const protein_target_g = Math.round(
    PROTEIN_G_PER_KG[input.primary_goal] * input.weight_kg,
  );

  // Fibre: 14g per 1000 kcal (USDA), rounded to nearest 1g.
  const fibre_target_g = Math.round((kcal_target / 1000) * 14);

  // Steps: 8000 default, 10000 if the goal is weight-related or activity level is high.
  const stepsBase =
    input.primary_goal === 'lose_weight' ||
    input.activity_level === 'active' ||
    input.activity_level === 'very_active'
      ? 10000
      : 8000;

  return {
    bmr,
    tdee,
    kcal_target,
    protein_target_g,
    fibre_target_g,
    steps_target: stepsBase,
  };
}
