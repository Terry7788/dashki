declare module './seed-foods' {
  export const SEED_FOODS: Array<{
    name: string;
    baseAmount: number;
    baseUnit: string;
    calories: number;
    protein: number | null;
  }>;
}