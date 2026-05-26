// Subscription / paywall logic.
//
// Phase 5 (DSHKI-63) scope: ship the gating infrastructure without
// hard-locking any features yet. Once Terry decides his pricing and
// has a RevenueCat account (DSHKI-50 follow-up), wire the actual
// purchase + receipt validation here.
//
// Current behavior: server's User.subscription_status is the source of
// truth. 'lifetime' (Terry / user_id=1) and 'premium' get full access.
// 'free' users today still get full access — we ship the paywall UI but
// don't trigger it on any feature yet, so launch isn't gated by pricing
// decisions.

import type { User } from './types';

export type FeatureKey =
  | 'label_scan'
  | 'fibre_tracking'
  | 'custom_macros'
  | 'unlimited_history'
  | 'saved_meals'
  | 'calendar'
  | 'customisable_dashboard'
  | 'healthkit'
  | 'ai_insights';

export interface PremiumFeature {
  key: FeatureKey;
  title: string;
  description: string;
}

export const PREMIUM_FEATURES: PremiumFeature[] = [
  {
    key: 'label_scan',
    title: 'Unlimited camera label scanning',
    description: 'Snap any nutrition panel and Dashki fills the food for you.',
  },
  {
    key: 'fibre_tracking',
    title: 'Fibre & custom macros',
    description: 'Track fibre, sugar, sodium, or anything else you care about.',
  },
  {
    key: 'unlimited_history',
    title: 'Unlimited history',
    description: 'See every meal, weight, and step log going back as far as you want.',
  },
  {
    key: 'saved_meals',
    title: 'Saved meals & recipes',
    description: 'Build reusable meal templates for things you eat often.',
  },
  {
    key: 'calendar',
    title: 'Calendar view',
    description: 'Day-by-day overview across weeks and months at a glance.',
  },
  {
    key: 'customisable_dashboard',
    title: 'Customisable home dashboard',
    description: 'Pick exactly which tiles show on your home screen.',
  },
  {
    key: 'healthkit',
    title: 'HealthKit / Google Fit sync',
    description: 'Steps and weight pulled automatically from your wearables.',
  },
  {
    key: 'ai_insights',
    title: 'AI insights & trends',
    description: 'Weekly summaries, anomaly detection, smart suggestions.',
  },
];

// ─── Gating ───────────────────────────────────────────────────────────────

export function hasPremium(user: User | null): boolean {
  if (!user) return false;
  return user.subscription_status === 'premium' || user.subscription_status === 'lifetime';
}

/**
 * Should this feature be locked behind the paywall for the current user?
 *
 * For Phase 5 launch this always returns false — we ship the infrastructure
 * but don't lock anything yet. When ready to monetise, change this to
 * `return !hasPremium(user)` to enable gating across the app.
 */
export function isLocked(_feature: FeatureKey, _user: User | null): boolean {
  return false;
  // Activation path (uncomment when launching paid tier):
  // const FREE_FEATURES: FeatureKey[] = [];
  // if (FREE_FEATURES.includes(feature)) return false;
  // return !hasPremium(user);
}

// ─── Purchase (RevenueCat) ────────────────────────────────────────────────

/**
 * Trigger an upgrade purchase. Currently a no-op stub.
 *
 * TODO_CREDENTIALS:
 *   1. Set up RevenueCat account, create offerings + products
 *   2. Add iOS bundle ID + Android package name to RevenueCat dashboard
 *   3. Install purchases-capacitor: `npm install @revenuecat/purchases-capacitor`
 *   4. Set RevenueCat API key in an env var or capacitor.config.ts
 *   5. Replace this stub with:
 *        await Purchases.configure({ apiKey: ... });
 *        const offering = await Purchases.getOfferings();
 *        await Purchases.purchasePackage({ package: offering.current.availablePackages[0] });
 *   6. Server-side: validate receipts via RevenueCat webhook → update
 *      Users.subscription_status to 'premium' on confirmed purchase
 */
export async function startPurchase(): Promise<{ ok: boolean; reason?: string }> {
  // eslint-disable-next-line no-console
  console.info('[subscription] purchase flow not yet wired — see DSHKI-63');
  return {
    ok: false,
    reason: 'Paid subscriptions launch after Apple/Google dev account setup.',
  };
}

/**
 * Restore previously-purchased subscription (App Store / Play Store).
 * Apple Guideline 3.1.1 requires this be reachable from a "Restore purchases"
 * button in the app — typically in Settings.
 */
export async function restorePurchases(): Promise<{ ok: boolean; reason?: string }> {
  // eslint-disable-next-line no-console
  console.info('[subscription] restore not yet wired — see DSHKI-63');
  return {
    ok: false,
    reason: 'Restore not yet available.',
  };
}
