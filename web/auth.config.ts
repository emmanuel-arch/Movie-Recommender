import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import { prisma } from "@/lib/prisma";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import bcrypt from "bcryptjs";
import type { NextAuthConfig } from "next-auth";
import type { JWT } from "next-auth/jwt";

export const authConfig: NextAuthConfig = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        birgenAiId: { label: "BirgenAI ID", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        const password = credentials?.password as string | undefined;
        const email = (credentials?.email as string | undefined)?.trim().toLowerCase();
        const birgenAiId = (credentials?.birgenAiId as string | undefined)?.trim();

        if (!password || (!email && !birgenAiId)) {
          throw new Error("Please provide your password and your email or BirgenAI ID");
        }

        try {
          // Sign in by BirgenAI ID when provided, otherwise by email.
          const user = await prisma.user.findUnique({
            where: birgenAiId ? { birgenAiId } : { email: email! },
            include: {
              organization: true
            }
          });

          if (!user) {
            throw new Error(
              birgenAiId
                ? "No account found with this BirgenAI ID"
                : "No account found with this email address"
            );
          }

          if (!user.hashedPassword) {
            throw new Error("Account exists but password not set. Please use Google sign-in or reset your password");
          }

          // Check password
          const isPasswordValid = await bcrypt.compare(
            password,
            user.hashedPassword
          );
          
          if (!isPasswordValid) {
            throw new Error("Incorrect password. Please try again");
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name || "",
            role: user.role,
            tier: user.tier,
            organizationId: user.organizationId || undefined,
            birgenAiId: user.birgenAiId ?? null,
          };
        } catch (error) {
          // Log the original error for server-side debugging
          console.error("Auth error:", error);

          // Normalize common Prisma initialization / DB connection errors
          try {
            const msg = String((error as any)?.message || error);
            if (msg.includes("Can't reach database server") || msg.includes('PrismaClientInitializationError')) {
              // Throw a concise, user-facing error. NextAuth will surface this
              // as a CredentialsSignin error which the login page maps to a friendly message.
              throw new Error('Database connection failed. Please try again later.');
            }
          } catch (e) {
            // Swallow inspection errors and rethrow original below
          }

          throw error;
        }
      }
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? [
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      })
    ] : []),
    ...(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET ? [
      AppleProvider({
        clientId: process.env.APPLE_CLIENT_ID,
        clientSecret: process.env.APPLE_CLIENT_SECRET,
      })
    ] : []),
  ],
  callbacks: {
    async jwt({ token, user, account, profile }) {
      // Include user details in the token
      if (user) {
        // Ensure subject is set so session callback receives the user id
        token.sub = (user as any).id || token.sub;
        token.role = (user as any).role;
        token.tier = (user as any).tier;
        token.organizationId = (user as any).organizationId;
        token.birgenAiId = (user as any).birgenAiId ?? null;
      }
      
      // For OAuth (Google/Apple), ensure we get the database user ID
      if ((account?.provider === "google" || account?.provider === "apple") && profile?.email && !token.sub) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { email: profile.email }
          });
          
          if (dbUser) {
            token.sub = dbUser.id;
            token.role = dbUser.role;
            token.tier = dbUser.tier;
            token.organizationId = dbUser.organizationId || undefined;
            token.birgenAiId = dbUser.birgenAiId ?? null;
          }
        } catch (error) {
          console.error("Error fetching user ID in JWT callback:", error);
        }
      }
      
      return token;
    },
    async session({ session, token }) {
      // Include user details in the session
      if (token && session.user) {
        (session.user as any).id = token.sub;
        (session.user as any).role = token.role as string;
        (session.user as any).tier = token.tier as string;
        (session.user as any).organizationId = token.organizationId as string;
        (session.user as any).birgenAiId = (token as any).birgenAiId ?? null;
        
        // Log for debugging Google sign-in issues
        console.log('Session callback - User ID:', token.sub, 'Email:', session.user.email);
      }
      return session;
    },
    async signIn({ user, account, profile }) {
      // For OAuth (Google/Apple), create or update user
      if ((account?.provider === "google" || account?.provider === "apple") && profile?.email) {
        try {
          const existingUser = await prisma.user.findUnique({
            where: { email: profile.email }
          });

          if (!existingUser) {
            // Mirror /api/auth/register's dual-write (and the hub's auth.config.ts) so
            // OAuth users are provisioned identically to email/password users: create the
            // Supabase auth.users row FIRST so the user gets a real UUID id
            // (watching_profiles.user_id / watch_sessions.user_id are uuid columns / FKs
            // to auth.users) and so the handle_new_user() trigger mints
            // profiles.birgenai_id. Without this the Prisma @default(cuid()) id
            // (e.g. "cmq27v6u5...") is rejected by Postgres with "invalid input syntax
            // for type uuid" the moment they create a watching profile.
            const supabase = getSupabaseServiceClient();
            if (!supabase) {
              console.error("OAuth sign-in blocked: Supabase service client not configured; cannot provision account");
              return false;
            }

            let supabaseUserId: string | null = null;
            const { data: authData, error: authError } = await supabase.auth.admin.createUser({
              email: profile.email,
              email_confirm: true,
              user_metadata: { display_name: profile.name || "" },
            });

            if (authError || !authData?.user?.id) {
              // The email may already have a Supabase auth account (e.g. an earlier
              // credentials signup whose Prisma row is missing). Recover its id so the
              // Prisma id stays aligned with the existing auth.users UUID.
              const msg = authError?.message?.toLowerCase() ?? "";
              if (
                msg.includes("already") ||
                msg.includes("registered") ||
                msg.includes("exists") ||
                authError?.status === 422
              ) {
                const { data: list } = await supabase.auth.admin.listUsers();
                const match = list?.users?.find(
                  (u) => u.email?.toLowerCase() === profile.email!.toLowerCase()
                );
                supabaseUserId = match?.id ?? null;
              }
              if (!supabaseUserId) {
                console.error("OAuth sign-in blocked: could not provision Supabase auth user:", authError);
                return false;
              }
            } else {
              supabaseUserId = authData.user.id;
            }

            // Wait for the handle_new_user() trigger to mint profiles.birgenai_id.
            let birgenAiId: string | null = null;
            for (let i = 0; i < 10; i++) {
              const { data: profileRow } = await supabase
                .from("profiles")
                .select("birgenai_id")
                .eq("id", supabaseUserId)
                .maybeSingle();
              const row = profileRow as { birgenai_id?: string } | null;
              if (row?.birgenai_id) {
                birgenAiId = row.birgenai_id;
                break;
              }
              await new Promise((r) => setTimeout(r, 120));
            }

            // Create the Prisma user with id === Supabase auth UUID.
            const newUser = await prisma.user.create({
              data: {
                id: supabaseUserId,
                email: profile.email,
                name: profile.name || "",
                role: "INDIVIDUAL", // Using uppercase to match enum
                tier: "FREE",
                birgenAiId,
              }
            });

            // Update user object with database values
            user.id = newUser.id;
            (user as any).role = newUser.role;
            (user as any).tier = newUser.tier;
            (user as any).organizationId = newUser.organizationId || undefined;
            (user as any).birgenAiId = newUser.birgenAiId ?? null;
          } else {
            // Update user object with existing values
            user.id = existingUser.id;
            (user as any).role = existingUser.role;
            (user as any).tier = existingUser.tier;
            (user as any).organizationId = existingUser.organizationId || undefined;
            (user as any).birgenAiId = existingUser.birgenAiId ?? null;
          }
        } catch (error) {
          console.error("Error handling Google sign in:", error);
          return false;
        }
      }
      return true;
    },
    async redirect({ url, baseUrl }) {
      // Honor explicit same-origin callbackUrls passed by the client (login/post-google
      // pages drive role-based routing themselves via /auth/post-login).
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      // Fallback: route through the post-login dispatcher which picks the right
      // dashboard based on the user's tier/role.
      return `${baseUrl}/auth/post-login`;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt" as const,
  },
  // Single sign-on across the BirgenAI suite. Must mirror the hub
  // (birgen-ai-frontend) EXACTLY: same AUTH_SECRET, same session-cookie name, and
  // the same parent-domain pin (set AUTH_COOKIE_DOMAIN=.birgenai.com in prod) so a
  // session minted on www.birgenai.com is sent to — and decryptable on —
  // movies.birgenai.com, including when Movies is loaded in the hub's iframe.
  // Unset in local dev so localhost cookies keep working.
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-authjs.session-token"
          : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: process.env.NODE_ENV === "production",
        ...(process.env.AUTH_COOKIE_DOMAIN
          ? { domain: process.env.AUTH_COOKIE_DOMAIN }
          : {}),
      },
    },
  },
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
};

// Export authOptions for server helpers that call getServerSession
export const authOptions = authConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
