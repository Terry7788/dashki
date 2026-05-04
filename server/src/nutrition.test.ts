// server/src/nutrition.test.ts
//
// Run via the npm test script (in package.json) which builds with tsc first
// then runs `node --test dist/*.test.js`. Node's built-in test runner (Node
// 20+) is used so we avoid adding vitest/jest as dependencies.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRatio, nutritionFor, convertQuantity, FoodForNutrition } from './nutrition';

const chicken: FoodForNutrition = {
  base_amount: 100, base_unit: 'g', serving_size_g: null,
  calories: 165, protein: 31,
};

const bread: FoodForNutrition = {
  base_amount: 100, base_unit: 'g', serving_size_g: 35,
  calories: 250, protein: 9,
};

const cookiePack: FoodForNutrition = {
  base_amount: 2, base_unit: 'serving', serving_size_g: 30,
  calories: 160, protein: 2,  // 160 kcal per pack of 2 cookies (each 30g)
};

const coffee: FoodForNutrition = {
  base_amount: 250, base_unit: 'ml', serving_size_g: null,
  calories: 5, protein: 0,
};

// ─── computeRatio ─────────────────────────────────────────────────────────────

test('g→g: 150g of chicken (base 100g) = ratio 1.5', () => {
  assert.equal(computeRatio(chicken, 150, 'g'), 1.5);
});

test('g→serving: 2 servings of bread (35g each, base 100g) = ratio 0.7', () => {
  assert.equal(computeRatio(bread, 2, 'serving'), 0.7);
});

test('g→serving falls back to base_amount when serving_size_g is null', () => {
  // chicken: base_amount=100g, no serving_size_g → 1 serving defaults to 100g
  // ratio = (1 × 100) / 100 = 1.0
  assert.equal(computeRatio(chicken, 1, 'serving'), 1.0);
});

test('ml→ml: 500ml coffee (base 250ml) = ratio 2', () => {
  assert.equal(computeRatio(coffee, 500, 'ml'), 2);
});

test('serving→serving: 1 cookie pack (base 2) = ratio 0.5', () => {
  assert.equal(computeRatio(cookiePack, 1, 'serving'), 0.5);
});

test('serving→g: 60g of cookiePack (30g/cookie, base 2) = ratio 1.0', () => {
  // 60g / 30g per cookie = 2 cookies = 1.0 of base "2 cookies"
  assert.equal(computeRatio(cookiePack, 60, 'g'), 1.0);
});

test('unsupported combo throws (ml + g)', () => {
  // ml ↔ g requires density data we don't have; still unsupported.
  assert.throws(() => computeRatio(coffee, 100, 'g'), /Unsupported/);
});

test('ml→serving falls back to base_amount (1 serving = 250ml for coffee)', () => {
  // coffee: base_amount=250ml, no serving_size_g → 1 serving = 250ml
  // ratio = (1 × 250) / 250 = 1.0
  assert.equal(computeRatio(coffee, 1, 'serving'), 1.0);
  assert.equal(computeRatio(coffee, 2, 'serving'), 2.0);
});

// ─── nutritionFor ─────────────────────────────────────────────────────────────

test('nutritionFor: 150g chicken = 248 kcal, 46.5g protein', () => {
  const r = nutritionFor(chicken, 150, 'g');
  assert.equal(r.calories, 248);   // round(165 * 1.5) = 247.5 → 248
  assert.equal(r.protein, 46.5);
});

test('nutritionFor: 1 slice bread (35g) = 88 kcal, 3.2g protein', () => {
  const r = nutritionFor(bread, 1, 'serving');
  assert.equal(r.calories, 88);    // round(250 * 0.35) = 87.5 → 88
  assert.equal(r.protein, 3.2);    // round(9 * 0.35 * 10)/10 = 3.2 (3.15 → 3.2)
});

test('nutritionFor: 60g of cookie pack = 160 kcal', () => {
  // 60g / 30g per cookie = 2 cookies = exactly the base pack
  const r = nutritionFor(cookiePack, 60, 'g');
  assert.equal(r.calories, 160);
  assert.equal(r.protein, 2);
});

test('nutritionFor handles null protein (returns 0)', () => {
  const f: FoodForNutrition = { ...chicken, protein: null };
  const r = nutritionFor(f, 100, 'g');
  assert.equal(r.protein, 0);
});

// ─── convertQuantity ──────────────────────────────────────────────────────────

test('convertQuantity g→serving: 70g of bread → 2 slices', () => {
  // 70g / 35g per slice = 2 slices
  assert.equal(convertQuantity(bread, 70, 'g', 'serving'), 2);
});

test('convertQuantity serving→g: 2 slices of bread → 70g', () => {
  assert.equal(convertQuantity(bread, 2, 'serving', 'g'), 70);
});

test('convertQuantity serving→g for cookie pack: 1 serving (half pack) → 30g', () => {
  // cookiePack base_amount is 2 (servings), so 1 serving = 1/2 of base
  // 0.5 * base_amount * serving_size_g = 0.5 * 2 * 30 = 30g
  assert.equal(convertQuantity(cookiePack, 1, 'serving', 'g'), 30);
});

test('convertQuantity is identity when units match', () => {
  assert.equal(convertQuantity(chicken, 137, 'g', 'g'), 137);
});

// ─── Property tests (DSHKI-15) ────────────────────────────────────────────────
// These pin contracts the happy-path tests don't: round-trip preservation,
// kcal preservation across unit toggle, and zero-quantity behaviour. Closes
// gaps flagged in the PR 1 code review.

test('round-trip: convert → convert back returns ~original (bread g↔serving)', () => {
  const original = 137;
  const there = convertQuantity(bread, original, 'g', 'serving');
  const back = convertQuantity(bread, there, 'serving', 'g');
  // Within 1e-9 — cumulative float error only
  assert.ok(Math.abs(back - original) < 1e-9, `round-trip drift: ${original} → ${there} → ${back}`);
});

test('round-trip: serving → g → serving for cookie pack (base_amount > 1)', () => {
  const original = 1.5;
  const there = convertQuantity(cookiePack, original, 'serving', 'g');
  const back = convertQuantity(cookiePack, there, 'g', 'serving');
  assert.ok(Math.abs(back - original) < 1e-9, `round-trip drift: ${original} → ${there} → ${back}`);
});

test('kcal preservation across g↔serving conversion (bread)', () => {
  const a = nutritionFor(bread, 70, 'g').calories;
  const equivalent = convertQuantity(bread, 70, 'g', 'serving');
  const b = nutritionFor(bread, equivalent, 'serving').calories;
  assert.equal(a, b, 'kcal must be invariant under unit conversion');
});

test('kcal preservation across serving↔g for cookie pack', () => {
  const a = nutritionFor(cookiePack, 1.5, 'serving').calories;
  const equivalent = convertQuantity(cookiePack, 1.5, 'serving', 'g');
  const b = nutritionFor(cookiePack, equivalent, 'g').calories;
  assert.equal(a, b, 'kcal must be invariant under unit conversion');
});

test('zero quantity returns zero nutrition', () => {
  const r = nutritionFor(chicken, 0, 'g');
  assert.equal(r.calories, 0);
  assert.equal(r.protein, 0);
});

test('zero quantity returns zero for serving-base food too', () => {
  const r = nutritionFor(cookiePack, 0, 'serving');
  assert.equal(r.calories, 0);
  assert.equal(r.protein, 0);
});
