import type { Response } from 'express';
import { env } from '../../config/env';
import { AuditEntrySchema, buildEntityRouter } from '../../entity/buildEntityRouter';
import { ApiRouter } from '../../http/apiRouter';
import { unauthorized } from '../../lib/errors';
import { PageQuery, pageSchema } from '../../lib/pagination';
import { IdParam, z } from '../../lib/zod';
import { accountingEntityEntity, branchEntity, dealershipEntity, legalEntityEntity, roleEntity } from './entities';
import { CorePerm } from './permissions';
import {
  ActivityPageSchema,
  ActivityQuery,
  AssignableRoleSchema,
  AuditQuery,
  ChangePasswordBody,
  LoginBody,
  ProfileUpdate,
  MeSchema,
  PermissionSchema,
  RoleAssignmentInput,
  RolePermissionsBody,
  RolePermissionsSchema,
  TeamActivityQuery,
  TokenResponse,
  UserCreate,
  UserListQuery,
  UserSchema,
  UserUpdate,
} from './schemas';
import * as activity from './activity';
import * as notifications from './notifications';
import * as svc from './service';

const REFRESH_COOKIE = 'dms_rt';

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    path: '/api/auth',
    maxAge: env.REFRESH_TOKEN_TTL_SEC * 1000,
  });
}

// ---- Auth -------------------------------------------------------------------
export const authRouter = new ApiRouter('/auth', 'Auth')
  .publicRoute({
    method: 'post',
    path: '/login',
    operationId: 'login',
    summary: 'Sign in with email and password',
    body: LoginBody,
    response: TokenResponse,
    handler: async ({ req, res, tx, body }) => {
      const s = await svc.login(tx, body.email, body.password, { ip: req.ip, userAgent: req.get('user-agent'), requestId: req.requestId });
      setRefreshCookie(res, s.refreshToken);
      return { accessToken: s.accessToken, expiresIn: s.expiresIn, me: s.me };
    },
  })
  .publicRoute({
    method: 'post',
    path: '/refresh',
    operationId: 'refreshSession',
    summary: 'Rotate the refresh-token cookie and issue a new access token',
    response: TokenResponse,
    handler: async ({ req, res, tx }) => {
      const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
      if (!token) throw unauthorized('No refresh token');
      const s = await svc.refresh(tx, token, { ip: req.ip, userAgent: req.get('user-agent') });
      setRefreshCookie(res, s.refreshToken);
      return { accessToken: s.accessToken, expiresIn: s.expiresIn, me: s.me };
    },
  })
  .publicRoute({
    method: 'post',
    path: '/logout',
    operationId: 'logout',
    summary: 'Revoke the current refresh token',
    handler: async ({ req, res, tx }) => {
      await svc.logout(tx, req.cookies?.[REFRESH_COOKIE] as string | undefined, { ip: req.ip, userAgent: req.get('user-agent'), requestId: req.requestId });
      res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
      return undefined;
    },
  })
  .route({
    method: 'get',
    path: '/me',
    operationId: 'getMe',
    summary: 'Current user, effective permissions and reachable dealerships/branches',
    permission: 'authenticated',
    response: MeSchema,
    handler: ({ tx, access }) => svc.buildMe(tx, access),
  })
  .route({
    method: 'patch',
    path: '/me',
    operationId: 'updateProfile',
    summary: 'Update your own name and phone',
    permission: 'authenticated',
    body: ProfileUpdate,
    response: MeSchema,
    handler: ({ req, tx, access, body }) => svc.updateProfile(tx, access, body, { ip: req.ip, requestId: req.requestId }),
  })
  .route({
    method: 'post',
    path: '/change-password',
    operationId: 'changePassword',
    summary: 'Change your password (signs out your other sessions)',
    permission: 'authenticated',
    body: ChangePasswordBody,
    response: TokenResponse,
    handler: async ({ req, res, tx, access, body }) => {
      const s = await svc.changePassword(tx, access, body, { ip: req.ip, userAgent: req.get('user-agent'), requestId: req.requestId });
      setRefreshCookie(res, s.refreshToken);
      return { accessToken: s.accessToken, expiresIn: s.expiresIn, me: s.me };
    },
  });

// ---- Development-only sign-in (never registered outside NODE_ENV=development) -----
export const DEV_LOGIN_ENABLED = env.NODE_ENV === 'development' && env.DEV_AUTO_LOGIN;
export const DEFAULT_DEV_USER = 'admin@dms.local';

if (DEV_LOGIN_ENABLED) {
  authRouter
    .publicRoute({
      method: 'post',
      path: '/dev-login',
      operationId: 'devLogin',
      summary: 'DEVELOPMENT ONLY: sign in as a user by email without a password',
      body: z.object({ email: z.email().trim().toLowerCase().default(DEFAULT_DEV_USER) }).openapi('DevLoginRequest'),
      response: TokenResponse,
      handler: async ({ req, res, tx, body }) => {
        const s = await svc.devLogin(tx, body.email, { ip: req.ip, userAgent: req.get('user-agent'), requestId: req.requestId });
        setRefreshCookie(res, s.refreshToken);
        return { accessToken: s.accessToken, expiresIn: s.expiresIn, me: s.me };
      },
    })
    .publicRoute({
      method: 'get',
      path: '/dev-accounts',
      operationId: 'listDevAccounts',
      summary: 'DEVELOPMENT ONLY: accounts for the "Switch user" menu',
      response: z.array(z.object({ email: z.string(), fullName: z.string() })),
      handler: ({ tx }) => svc.devAccounts(tx),
    });
}

// ---- Users --------------------------------------------------------------------
export const usersRouter = new ApiRouter('/core/users', 'User')
  .route({
    method: 'get',
    path: '/',
    operationId: 'listUsers',
    summary: 'List users holding roles within your scope',
    permission: CorePerm.usersView,
    query: PageQuery.extend(UserListQuery.shape),
    response: pageSchema(UserSchema, 'UserPage'),
    handler: (ctx) => {
      const { page, pageSize, sort, q, ...filters } = ctx.query;
      return svc.listUsers(ctx, { page, pageSize, sort, q }, filters);
    },
  })
  .route({
    method: 'get',
    path: '/:id',
    operationId: 'getUser',
    summary: 'Get a user with role assignments',
    permission: CorePerm.usersView,
    params: IdParam,
    response: UserSchema,
    handler: (ctx) => svc.getUser(ctx, ctx.params.id),
  })
  .route({
    method: 'post',
    path: '/',
    operationId: 'createUser',
    summary: 'Create a user (with initial role assignments)',
    permission: CorePerm.usersCreate,
    body: UserCreate,
    response: UserSchema,
    status: 201,
    handler: (ctx) => svc.createUser(ctx, ctx.body),
  })
  .route({
    method: 'patch',
    path: '/:id',
    operationId: 'updateUser',
    summary: 'Update a user; password reset or deactivation signs them out everywhere',
    permission: CorePerm.usersUpdate,
    params: IdParam,
    body: UserUpdate,
    response: UserSchema,
    handler: (ctx) => svc.updateUser(ctx, ctx.params.id, ctx.body),
  })
  .route({
    method: 'post',
    path: '/:id/roles',
    operationId: 'assignUserRole',
    summary: 'Assign a role to a user in a global/dealership/branch scope',
    permission: CorePerm.usersAssignRoles,
    params: IdParam,
    body: RoleAssignmentInput,
    response: UserSchema,
    status: 201,
    handler: (ctx) => svc.addUserRole(ctx, ctx.params.id, ctx.body),
  })
  .route({
    method: 'delete',
    path: '/:id/roles/:assignmentId',
    operationId: 'revokeUserRole',
    summary: 'Revoke a role assignment',
    permission: CorePerm.usersAssignRoles,
    params: IdParam.extend({ assignmentId: z.coerce.number().int().positive() }),
    response: UserSchema,
    handler: (ctx) => svc.removeUserRole(ctx, ctx.params.id, ctx.params.assignmentId),
  });

// ---- Roles' permissions & permission catalog -----------------------------------
export const rolePermissionsRouter = new ApiRouter('/core/roles', 'Role')
  .route({
    method: 'get',
    path: '/assignable',
    operationId: 'listAssignableRoles',
    summary: 'Roles you may assign at a dealership (or globally when omitted), e.g. a Sales Manager: the sales staff roles',
    permission: CorePerm.usersAssignRoles,
    query: z.object({ dealershipId: z.coerce.number().int().positive().optional() }),
    response: z.array(AssignableRoleSchema),
    handler: (ctx) => svc.assignableRoles(ctx, ctx.query.dealershipId),
  })
  .route({
    method: 'get',
    path: '/:id/permissions',
    operationId: 'getRolePermissions',
    summary: "List a role's permission codes",
    permission: CorePerm.rolesView,
    params: IdParam,
    response: RolePermissionsSchema,
    handler: (ctx) => svc.getRolePermissions(ctx, ctx.params.id),
  })
  .route({
    method: 'put',
    path: '/:id/permissions',
    operationId: 'setRolePermissions',
    summary: "Replace a role's permissions (global grant required)",
    permission: CorePerm.rolesManage,
    params: IdParam,
    body: RolePermissionsBody,
    response: RolePermissionsSchema,
    handler: (ctx) => svc.setRolePermissions(ctx, ctx.params.id, ctx.body.permissionCodes),
  });

export const permissionsRouter = new ApiRouter('/core/permissions', 'Permission').route({
  method: 'get',
  path: '/',
  operationId: 'listPermissions',
  // The catalog is defined in code and bounded (one row per module action), so it is returned whole.
  summary: 'Permission catalog (bounded, code-defined)',
  permission: CorePerm.rolesView,
  query: z.object({ module: z.string().max(40).optional() }),
  response: z.array(PermissionSchema),
  handler: (ctx) => svc.listPermissions(ctx, ctx.query.module),
});

// ---- Audit log ------------------------------------------------------------------
export const auditRouter = new ApiRouter('/core/audit', 'Audit').route({
  method: 'get',
  path: '/',
  operationId: 'listAuditLog',
  summary: 'Audit log within your scope',
  permission: CorePerm.auditView,
  query: PageQuery.extend(AuditQuery.shape),
  response: pageSchema(AuditEntrySchema, 'AuditEntryPage'),
  handler: (ctx) => {
    const { page, pageSize, sort, q, ...filters } = ctx.query;
    return svc.listAudit(ctx, { page, pageSize, sort, q }, filters);
  },
});

// ---- Config-driven entities ----------------------------------------------------------
export const coreEntityRouters = [
  // rolePermissionsRouter paths (/core/roles/:id/permissions) are more specific than the entity's /:id.
  buildEntityRouter(dealershipEntity).router,
  buildEntityRouter(branchEntity).router,
  buildEntityRouter(legalEntityEntity).router,
  buildEntityRouter(accountingEntityEntity).router,
  buildEntityRouter(roleEntity).router,
];

// ---- Activity log -------------------------------------------------------------------
export const activityRouter = new ApiRouter('/core/activity', 'Activity')
  .route({
    method: 'get',
    path: '/mine',
    operationId: 'listMyActivity',
    summary: 'Your own activity: sign-ins and sign-outs, and everything you changed',
    permission: 'authenticated',
    query: ActivityQuery,
    response: ActivityPageSchema,
    handler: (ctx) => activity.myActivity(ctx, ctx.query),
  })
  .route({
    method: 'get',
    path: '/team',
    operationId: 'listTeamActivity',
    summary: "Everyone's activity in your scope, filterable by person, type and date",
    permission: CorePerm.activityViewTeam,
    query: TeamActivityQuery,
    response: ActivityPageSchema,
    handler: (ctx) => activity.teamActivity(ctx, ctx.query),
  });

// ---- Notifications (the signed-in person's own; pushed live over the socket as they happen) ----
const NotificationSchema = z
  .object({
    id: z.number().int(),
    /** The task, e.g. "New lead added". */
    title: z.string(),
    detail: z.string().nullable(),
    href: z.string().nullable(),
    /** Who did it, e.g. "Hyundai Salesperson 1". */
    actorName: z.string().nullable(),
    entityType: z.string(),
    action: z.string(),
    createdAt: z.string(),
    readAt: z.string().nullable(),
  })
  .openapi('Notification');
const NotificationPageSchema = z
  .object({ items: z.array(NotificationSchema), total: z.number().int(), page: z.number().int(), pageSize: z.number().int(), unread: z.number().int() })
  .openapi('NotificationPage');
const UnreadSchema = z.object({ unread: z.number().int() }).openapi('NotificationUnread');
const NotificationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  unread: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

export const notificationsRouter = new ApiRouter('/notifications', 'Notification')
  .route({
    method: 'get',
    path: '/',
    operationId: 'listNotifications',
    summary: 'Your notifications, newest first (paged), with your unread count',
    permission: 'authenticated',
    query: NotificationQuery,
    response: NotificationPageSchema,
    handler: (ctx) => notifications.listNotifications(ctx, ctx.query),
  })
  .route({
    method: 'get',
    path: '/unread-count',
    operationId: 'getUnreadNotificationCount',
    summary: 'How many of your notifications are unread (the bell badge)',
    permission: 'authenticated',
    response: UnreadSchema,
    handler: async (ctx) => ({ unread: await notifications.unreadCount(ctx) }),
  })
  .route({
    method: 'post',
    path: '/read-all',
    operationId: 'markAllNotificationsRead',
    summary: 'Mark all your notifications as read',
    permission: 'authenticated',
    response: UnreadSchema,
    handler: (ctx) => notifications.markRead(ctx, 'all'),
  })
  .route({
    method: 'post',
    path: '/:id/read',
    operationId: 'markNotificationRead',
    summary: 'Mark one of your notifications as read',
    permission: 'authenticated',
    params: IdParam,
    response: UnreadSchema,
    handler: (ctx) => notifications.markRead(ctx, [ctx.params.id]),
  })
  .route({
    method: 'delete',
    path: '/:id',
    operationId: 'deleteNotification',
    summary: 'Delete one of your notifications',
    permission: 'authenticated',
    params: IdParam,
    response: UnreadSchema,
    handler: (ctx) => notifications.deleteNotification(ctx, ctx.params.id),
  });

export const coreRouters = [authRouter, usersRouter, rolePermissionsRouter, permissionsRouter, auditRouter, activityRouter, notificationsRouter, ...coreEntityRouters];
