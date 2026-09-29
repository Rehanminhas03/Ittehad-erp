/**
 * Development auto sign-in (opt-in). The app normally opens on the login page. Set
 * VITE_DEV_AUTO_LOGIN=true in frontend/.env.local (and DEV_AUTO_LOGIN=true in backend/.env) to open
 * already signed in as DEV_DEFAULT_USER. Production builds never do this, and the backend only
 * exposes /api/auth/dev-login when NODE_ENV=development.
 */
export const DEV_AUTO_LOGIN = import.meta.env.DEV && import.meta.env.VITE_DEV_AUTO_LOGIN === 'true';

export const DEV_DEFAULT_USER = 'admin@dms.local';
