// Legacy aliases are navigation only; they never establish identity or permissions.
export function canonicalCustomerPath(path) {
  return path.replace(/^\/app(?=\/|\?|#|$)/, '/dashboard');
}
