/* eslint-disable @typescript-eslint/naming-convention */
import { Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';

/**
 * Instance-level feature gating.
 *
 * This codebase has no instance-wide admin role -- the User model has no
 * `role` column, and collaborator roles are per-space only. Rather than add a
 * database migration for it, admins are named by email in an environment
 * variable. That keeps the whole mechanism config-only, so turning a feature
 * on for everyone is an env change and a redeploy rather than a schema change.
 *
 * BETA_FEATURES lists features that are visible ONLY to instance admins.
 * Removing a name from that list makes the feature visible to every user.
 */
export const featureConfig = registerAs('feature', () => ({
  instanceAdminEmails: (process.env.INSTANCE_ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),

  betaFeatures: (process.env.BETA_FEATURES ?? '')
    .split(',')
    .map((feature) => feature.trim())
    .filter(Boolean),
}));

export const FeatureConfig = () => Inject(featureConfig.KEY);

export type IFeatureConfig = ConfigType<typeof featureConfig>;

/**
 * Which gated features this user may see.
 *
 * An instance admin sees everything, including anything listed as beta. A
 * normal user sees a feature only once it has been removed from BETA_FEATURES.
 */
export const resolveFeatureAccess = (
  email: string | undefined,
  config: IFeatureConfig
): { isInstanceAdmin: boolean; betaFeatures: string[] } => {
  const isInstanceAdmin = Boolean(
    email && config.instanceAdminEmails.includes(email.toLowerCase())
  );
  return {
    isInstanceAdmin,
    betaFeatures: isInstanceAdmin ? config.betaFeatures : [],
  };
};
