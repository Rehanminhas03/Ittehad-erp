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
