// Imported first by exportOpenapi.ts: the schema always documents the development-only sign-in
// endpoints, so the frontend client stays typed whether or not auto sign-in is switched on.
process.env.NODE_ENV = 'development';
process.env.DEV_AUTO_LOGIN = 'true';
