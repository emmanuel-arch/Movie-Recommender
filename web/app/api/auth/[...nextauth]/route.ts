import { handlers } from "@/auth.config";

// Extend the built-in session types
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      tier: string;
      organizationId?: string;
      birgenAiId?: string | null;
    };
  }

  interface User {
    role: string;
    tier: string;
    organizationId?: string;
    birgenAiId?: string | null;
  }
}

export const { GET, POST } = handlers;
