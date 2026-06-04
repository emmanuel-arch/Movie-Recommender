import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import { prisma } from "@/lib/prisma";
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
            // Create new user with default values
            const newUser = await prisma.user.create({
              data: {
                email: profile.email,
                name: profile.name || "",
                role: "INDIVIDUAL", // Using uppercase to match enum
                tier: "FREE"
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
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
};

// Export authOptions for server helpers that call getServerSession
export const authOptions = authConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
