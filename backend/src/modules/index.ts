import { env } from '../config/env';
import { API_MODULES } from '../config/modules';
import type { ApiRouter } from '../http/apiRouter';
import { accountsRouters } from './accounts/router';
import { coreRouters } from './core/router';
import { masterRouters } from './master/router';
import { salesRouters } from './sales/router';
import { partsRouters } from './parts/router';
import { reportsRouters } from './reports/router';
import { serviceRouters } from './service/router';

/** Every module's routers. Importing this also registers every module's permissions and event subscribers. */
export const allRouters: ApiRouter[] = [...coreRouters, ...masterRouters, ...salesRouters, ...serviceRouters, ...partsRouters, ...accountsRouters, ...reportsRouters];

const served = (on: boolean, routers: ApiRouter[]) => (on || env.NODE_ENV === 'test' ? routers : []);

/** The routers the API mounts: the optional modules only when switched on (config/modules.ts). */
export const servedRouters: ApiRouter[] = [
  ...coreRouters,
  ...masterRouters,
  ...salesRouters,
  ...served(API_MODULES.service, serviceRouters),
  ...served(API_MODULES.parts, partsRouters),
  ...served(API_MODULES.accounts, accountsRouters),
  ...reportsRouters,
];
