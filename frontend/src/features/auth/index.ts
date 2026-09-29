// Public surface of the auth feature (pages are lazy-loaded by the router, so not exported here).
export { DevUserSwitcher } from './components/DevUserSwitcher';
export { Forbidden } from './components/Forbidden';
export { RequireAuth } from './components/RequireAuth';
export { RequirePermission } from './components/RequirePermission';
export { SessionBootstrap } from './components/SessionBootstrap';
export { DEV_AUTO_LOGIN, DEV_DEFAULT_USER } from './devAuth';
export { meRefreshed, sessionCleared, sessionReceived, type AuthState } from './authSlice';
