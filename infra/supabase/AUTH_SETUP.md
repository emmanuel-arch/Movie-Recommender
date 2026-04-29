# BirgenAI — Supabase Auth setup

Everything schema-side is already migrated (see `schema.sql` + `02_birgenai_ids_and_profiles.sql`). What's left are the things that have to be clicked in the Supabase dashboard because they involve provider secrets.

Project ref is read from `NEXT_PUBLIC_SUPABASE_URL` (the subdomain before `.supabase.co`). Open
`https://supabase.com/dashboard/project/<your-project-ref>` to follow along.

> **Never commit live secrets to this repo.** All secrets below live in
> `web/.env.local` (local dev), Vercel project env vars (prod), and the
> Supabase / Google Cloud dashboards. They are git-ignored on purpose.

---

## 1. Google OAuth 2.0

### 1a. Google Cloud Console

In **APIs & Services → Credentials → OAuth 2.0 Client IDs → your client**, add **Authorized redirect URIs**:

```
https://<your-project-ref>.supabase.co/auth/v1/callback
```

**Do not rely on extra redirect URIs** such as `https://www.movies.birgenai.co.ke/api/auth/callback/google` for this app: “Sign in with Google” uses **`supabase.auth.signInWithOAuth`**, so Google always receives **`redirect_uri=https://<ref>.supabase.co/auth/v1/callback`**. Only that URI participates in the flow. Entries meant for NextAuth (`/api/auth/callback/google`) or other stacks are **ignored** unless you change the architecture.

(Optionally you may still list your own `https://…/auth/callback` elsewhere for non-Supabase OAuth — it does **not** replace the Supabase line above for Google + Supabase.)

Copy the **Client ID** and **Client Secret** from this page. Treat them like passwords.

### 1b. Google — “Choose an account to continue to …supabase.co”

Google builds the account chooser from the **`redirect_uri`** you send (and related parameters). In your URL you can see:

- `redirect_uri=https://wqsfuiqaaajrpwgviehl.supabase.co/auth/v1/callback`
- `app_domain=https://wqsfuiqaaajrpwgviehl.supabase.co`

So the **hostname users see is the Supabase callback host**, not Cloud Run and not `movies.birgenai.co.ke`. Adding `https://www.movies.birgenai.co.ke/...` under **Authorized redirect URIs** does not change that, because **this app never tells Google to redirect there** for Supabase Google login.

**Ways to show your brand instead of `*.supabase.co`:**

1. **Supabase custom auth domain** (Supabase dashboard — paid / plan-dependent): serve auth under something like `https://auth.birgenai.co.ke` so the **Google `redirect_uri`** uses **your** domain. Then Google’s UI can say “continue to” your hostname.
2. **Google Cloud → Auth Platform → Branding** (or **OAuth consent screen**): set **App name**, logo, and home page. This improves the product name in some places but **may not replace** the “continue to &lt;host&gt;” line when Google decides to show the **redirect target** domain for clarity.

There is no setting in Cloud Run or in your Next.js app that overrides `redirect_uri`; it is defined by **Supabase Auth** until you use a custom Supabase auth URL or a different OAuth stack.

### 1c. Supabase → Authentication → Providers → Google

1. Open `https://supabase.com/dashboard/project/<your-project-ref>/auth/providers`
2. Expand **Google** → toggle **Enabled**.
3. Paste the Client ID and Client Secret from **§1a** (the same Google Cloud project as **§1b**).
4. Save.

After this the "Continue with Google" button on `/login` and `/signup` works end-to-end.

---

## 2. Apple OAuth (optional — add later)

The web's `/login` and `/signup` pages already render the Apple button. Until you paste an Apple Services ID + key in **Auth → Providers → Apple**, clicks will be a no-op / show an "Unsupported provider" error. Enabling is the same flow as Google.

---

## 3. Email/password redirect URLs

Supabase → **Authentication → URL Configuration**:

- **Site URL**: `https://movies.birgenai.com` (or `http://localhost:3000` for local dev)
- **Redirect URLs** (add all that apply):
  - `http://localhost:3000/auth/callback`
  - `https://movies.birgenai.com/auth/callback`
  - `https://birgenai.com/auth/callback`
  - your Vercel preview pattern, e.g. `https://*.vercel.app/auth/callback`

Without these, confirmation links end up on a bare Supabase URL instead of coming home to the web app.

---

## 3b. “Check your inbox” but no email (signup stuck)

You have **two different emails** in this product:

| When | Who sends it | Purpose |
|------|----------------|---------|
| Right after **email/password signup** | **Supabase Auth** (not Zoho) | “Confirm your signup” link — only if **Confirm email** is ON |
| On **`/auth/otp`** after the user has a session | **Your app** via Zoho (`SMTP_*`) | 6-digit OTP |

The Movies app only calls Zoho **after** the user is logged in. If **Confirm email** is enabled and **Supabase never delivers** that first message (rate limits, spam, or no SMTP configured on the Supabase project), the user will sit on “Check your inbox” with nothing to open.

**Fix (pick one):**

1. **OTP-only flow (recommended if you already use Zoho for codes)**  
   Supabase dashboard → **Authentication** → **Providers** → **Email** → disable **Confirm email** / “Require email confirmation” (exact label varies by dashboard version).  
   Then `signUp` returns a **session immediately**, `OtpGate` sends the user to **`/auth/otp`**, and **only** your Zoho SMTP sends mail. One pipeline, fewer surprises.

2. **Keep Supabase confirmation**  
   Configure **Custom SMTP** under Supabase **Authentication** → **SMTP Settings** (you can use the same Zoho mailbox as in `SMTP_*`, with an app password Supabase is allowed to use).  
   Then check **Logs → Auth** for send errors, and ask the user to check **Spam** for the sender Supabase uses.

---

## 4. How the "Sign in with BirgenAI ID" path works

1. The user types `BIR-XXXXXXXX` + password into the login form.
2. The browser calls the SECURITY DEFINER RPC `public.email_for_birgenai_id(p_birgenai_id)` which returns the `auth.users.email` for that ID (or null).
3. The web app then calls `supabase.auth.signInWithPassword({ email, password })` as normal.

That's it — the BIR-ID is just a friendly alias. Since `handle_new_user()` auto-mints a BIR-ID for every new auth row (email/password, Google, Apple, everything), it's always available.

## 5. How to give an existing user a friendly profile

Every `profiles` row gets a BirgenAI ID on insert. If a user was created before migration 02, the migration backfilled them. If you need to inspect:

```sql
select id, display_name, birgenai_id from public.profiles order by created_at desc limit 10;
```

## 6. watching_profiles — Netflix-style sub-profiles

Each account can have up to 5 `watching_profiles` (enforced by trigger). RLS only allows the owning auth user to read/write their own rows.

Keys:

- `avatar_key` — stable reference to the set in `web/lib/avatars.ts` (never rename keys there once a user picks them).
- `is_default` — the profile auto-selected when opening BirgenAI on a new device. A partial unique index enforces "at most one default per account".
- `is_kids` — toggled on the new/edit form; restricts the catalogue client-side.

---

## 7. Where the secrets actually live

| Secret                          | Local dev                                    | Production                                              |
| ------------------------------- | -------------------------------------------- | ------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `web/.env.local`                             | Vercel → Project → Settings → Environment Variables    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `web/.env.local`                             | Vercel env vars                                         |
| `SUPABASE_SERVICE_ROLE_KEY`     | `web/.env.local` + `src/api/.env`            | Vercel env vars (server-only) + Cloud Run + Worker secret |
| Google Client ID / Secret       | Supabase Auth dashboard (provider config)    | Same — Supabase stores them encrypted                   |
| `TMDB_READ_ACCESS_TOKEN`        | `web/.env.local`                             | Vercel env vars                                         |
| Cloudflare Worker secrets       | `infra/cloudflare/*/.dev.vars` (git-ignored) | `npx wrangler secret put SUPABASE_SERVICE_KEY` etc.     |

If any of these ever leak into a commit, **rotate them in their dashboard immediately** — git history is forever.
