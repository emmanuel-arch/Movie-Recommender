// Server-side auth function for use in Server Components and API routes
export { auth } from "@/auth.config";

// Helper functions for server-side auth checks
export function hasEnterpriseAccess(session: any): boolean {
  return session?.user?.role === "ENTERPRISE";
}

export function hasAdminAccess(session: any): boolean {
  return session?.user?.role === "ADMIN";
}
