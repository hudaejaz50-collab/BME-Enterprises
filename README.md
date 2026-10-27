# BME Enterprises – Surgical Products Catalog

Node.js + Express backend, PostgreSQL database, password-protected admin dashboard.
Visitors browse without logging in. Each product has a **Message for Pricing** button that opens WhatsApp
with a prefilled message. No prices are shown.

## Structure
- `server.js` – API, authentication, database setup (tables and starter categories are created automatically)
- `public/` – website (`index.html`, `app.js`), admin (`admin.html`, `admin.js`), `style.css`, `logo.png`
- `render.yaml` – one-click deploy blueprint for Render
- `.env.example` – required settings

## Deploy (free): Neon database + Render web service
1. **Database** – create a free project at https://neon.tech and copy the connection string
   (`postgresql://...`). This is your `DATABASE_URL`.
2. **Code** – create a GitHub repository and upload this whole folder (do not upload `.env`).
3. **Hosting** – at https://render.com choose New → Blueprint (or New → Web Service), connect the repository.
   Build command `npm install`, start command `npm start`.
4. **Environment variables** on Render:
   - `DATABASE_URL` – from Neon
   - `ADMIN_USER` – e.g. `admin`
   - `ADMIN_PASSWORD` – a long, unique password
   - `JWT_SECRET` – any long random string (the blueprint generates one)
   - `WHATSAPP_NUMBER` – `923707652218` (first-run default; later change it in the admin Settings tab)
   - `NODE_ENV` – `production`
5. Open your Render URL. Admin is at `/admin.html`.

## Run locally
```
npm install
cp .env.example .env   # fill in values, then export them (or use: node --env-file=.env server.js)
node --env-file=.env server.js
```
Needs a PostgreSQL database (local or Neon). Site: http://localhost:3000, admin: http://localhost:3000/admin.html

## Admin
Sign in at `/admin.html`. Manage products (name, category, description, specifications, image), categories and
settings (business name, tagline, WhatsApp number). Everything is saved to PostgreSQL. Product images are stored
in the database (max 3 MB each).

## Security built in
bcrypt password check, signed httpOnly SameSite=Strict session cookie (12 h), login rate limit (10 per 15 min),
Helmet security headers with a strict Content-Security-Policy, parameterised SQL, upload type and size limits.

## Limits and future costs
- Render free web service sleeps after ~15 min idle; the first visit then takes ~30–60 s. Paid (about $7/month) keeps it always on.
- Neon free tier has a small storage cap (about 0.5 GB). Images live in the database, so many large photos
  will fill it; compress photos or move to object storage (e.g. Cloudflare R2) later.
- Custom domain: about $10–15/year from any registrar; Render adds HTTPS free.
- Change `ADMIN_PASSWORD` on the host to rotate the admin password.

## Deploy on Netlify (alternative to Render)
The backend also runs as a Netlify Function (`netlify/functions/api.js`); `netlify.toml` is already configured.
1. Push this folder to GitHub (include `netlify.toml` and the `netlify` folder).
2. Netlify → Add new site → Import an existing project → choose the repository. Leave build settings as detected.
3. Site configuration → Environment variables, add: `DATABASE_URL`, `ADMIN_PASSWORD`, `ADMIN_USER`, `JWT_SECRET`, `WHATSAPP_NUMBER`, `NODE_ENV=production`.
4. Deploy. Admin is at `/admin.html`.
Notes: function requests/responses are limited to about 6 MB, so keep product images small (under 3 MB, ideally under 1 MB).
The login rate limit is per function instance on Netlify, so use a strong admin password.
