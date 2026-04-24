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

(Optionally also `https://birgenai.com/auth/callback` if you fan out to other apps — Supabase itself only needs the `supabase.co/auth/v1/callback` one.)

Copy the **Client ID** and **Client Secret** from this page. Treat them like passwords.

### 1b. Supabase → Authentication → Providers → Google

1. Open `https://supabase.com/dashboard/project/<your-project-ref>/auth/providers`
2. Expand **Google** → toggle **Enabled**.
3. Paste the Client ID and Client Secret you copied above.
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
