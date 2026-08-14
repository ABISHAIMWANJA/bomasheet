import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { axios } from '../axios';
import { userNotifyMetaSchema } from '../user';
import { registerRoute } from '../utils';
import { z } from '../zod';

export const USER_ME = '/auth/user/me';

export const userMeVoSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: z.string().nullable().optional(),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  notifyMeta: userNotifyMetaSchema,
  hasPassword: z.boolean(),
  // Instance-level feature gating. Optional so any client reading an older
  // deployment's response still validates.
  isInstanceAdmin: z.boolean().optional().openapi({
    description: 'Whether this user is listed in INSTANCE_ADMIN_EMAILS.',
  }),
  betaFeatures: z.array(z.string()).optional().openapi({
    description:
      'Gated features this user may see. Empty for non-admins until a feature is removed from BETA_FEATURES.',
  }),
});

export type IUserMeVo = z.infer<typeof userMeVoSchema>;

export const userMeRoute: RouteConfig = registerRoute({
  method: 'get',
  path: USER_ME,
  description: 'Get user information',
  responses: {
    200: {
      description: 'Successfully retrieved user information',
      content: {
        'application/json': {
          schema: userMeVoSchema,
        },
      },
    },
  },
  tags: ['auth'],
});

export const userMe = async () => {
  return axios.get<IUserMeVo>(USER_ME);
};
