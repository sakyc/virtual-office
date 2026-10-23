export function authenticationMode(env = process.env) {
  const mode = env.AUTH_PROVIDER || 'native';
  if (!['native', 'auth0'].includes(mode)) throw new Error('AUTH_PROVIDER must be native or auth0.');
  return mode;
}

export function authenticationEnabled(env = process.env) {
  return authenticationMode(env) === 'native' || env.AUTH0_ENABLED === '1';
}
