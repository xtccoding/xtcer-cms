// Admin path configuration
// Set ADMIN_PATH in environment variables to customize admin URL
// Default: /admin

export function getAdminPath(env?: any): string {
  const path = env?.ADMIN_PATH || import.meta.env.ADMIN_PATH || '/admin'
  // Ensure path starts with / and doesn't end with /
  return path.startsWith('/') ? path : `/${path}`
}

export function getAdminFullPath(subPath: string, env?: any): string {
  const basePath = getAdminPath(env)
  // Remove leading / from subPath if exists
  const cleanSubPath = subPath.startsWith('/') ? subPath.slice(1) : subPath
  return `${basePath}/${cleanSubPath}`
}
