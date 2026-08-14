import { useContext, useMemo } from 'react';
import { SessionContext } from '../context';

/**
 * Names of gated features. Keep in sync with whatever BETA_FEATURES lists in
 * the backend environment -- a feature is hidden from normal users while its
 * name appears there, and visible to everyone once it is removed.
 */
export const BetaFeature = {
  AiField: 'aiField',
} as const;

export type IBetaFeature = (typeof BetaFeature)[keyof typeof BetaFeature];

/**
 * Whether the signed-in user may see a gated feature.
 *
 * The backend only ever puts a feature name in `betaFeatures` for instance
 * admins, so this is just a membership test -- the gating decision itself is
 * made server-side and cannot be flipped from the browser.
 */
export const useBetaFeature = (feature: IBetaFeature): boolean => {
  const { user } = useContext(SessionContext);
  return useMemo(() => {
    const features = (user as { betaFeatures?: string[] } | undefined)?.betaFeatures;
    return Array.isArray(features) && features.includes(feature);
  }, [user, feature]);
};
