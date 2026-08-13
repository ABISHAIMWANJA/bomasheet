/**
 * Single source of truth for the product name in non-translated contexts
 * (document titles, AI system prompts, and other places where the i18n
 * `common:brand` key is not reachable).
 *
 * Prefer `t('common:brand')` inside React components that already have a
 * translation hook available.
 */
export const BRAND_NAME = 'BomaSheet';

/**
 * Builds a document title, e.g. `buildTitle('Settings') -> 'Settings - BomaSheet'`.
 * Called with no argument it returns the bare brand name.
 */
export const buildTitle = (prefix?: string) =>
  prefix ? `${prefix} - ${BRAND_NAME}` : BRAND_NAME;

/**
 * Where the source for THIS deployment is published.
 *
 * BomaSheet is AGPL-3.0. Section 13 requires that users interacting with a hosted
 * instance can obtain the complete corresponding source of that instance. Surfacing
 * this link in the UI is how we discharge that obligation, so if you deploy a
 * modified build, point this at a repository that actually reflects what you run.
 */
export const SOURCE_CODE_URL = 'https://github.com/ABISHAIMWANJA/bomasheet';
