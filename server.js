const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { DATABASE_URL, ADMIN_PASSWORD, JWT_SECRET, NODE_ENV } = process.env;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const PORT = process.env.PORT || 3000;
const envOk = !!(DATABASE_URL && ADMIN_PASSWORD && JWT_SECRET);
const prod = NODE_ENV === 'production' || !!process.env.NETLIFY;
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: process.env.NETLIFY ? 1 : 10,
  ssl: /localhost|127\.0\.0\.1/.test(DATABASE_URL) ? false : { rejectUnauthorized: false },
});
const adminHash = envOk ? bcrypt.hashSync(ADMIN_PASSWORD, 10) : '';

async function init() {
  if (!envOk) throw new Error('Missing DATABASE_URL, ADMIN_PASSWORD or JWT_SECRET environment variable.');
  await pool.query(`
    create table if not exists categories(id serial primary key, name text not null unique);
    create table if not exists products(
      id serial primary key, name text not null,
      category_id int references categories(id) on delete set null,
      description text not null default '', specs text not null default '',
      image bytea, image_type text, updated_at timestamptz not null default now());
    create table if not exists settings(key text primary key, value text not null);`);
  const defaults = {
    name: 'BME Enterprises',
    tagline: 'Medical equipment, engineering & healthcare solutions',
    phone: process.env.WHATSAPP_NUMBER || '923707652218',
  };
  for (const [k, v] of Object.entries(defaults))
    await pool.query('insert into settings(key,value) values($1,$2) on conflict do nothing', [k, v]);
  const { rows } = await pool.query('select count(*)::int n from categories');
  if (!rows[0].n)
    for (const c of ['Surgical Instruments', 'Diagnostic Equipment', 'Disposables & Consumables', 'Orthopedic Supports'])
      await pool.query('insert into categories(name) values($1)', [c]);
}

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:'], scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'"], connectSrc: ["'self'"], objectSrc: ["'none'"],
  frameAncestors: ["'none'"], formAction: ["'self'"] } } }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
if (require.main === module) app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
let ready = null;
const ensure = () => ready || (ready = init().catch(e => { ready = null; throw e; }));
app.use((req, res, next) => ensure().then(() => next(), next));

const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);
const upload = multer({
  storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, f, cb) => cb(null, /^image\/(png|jpe?g|webp|gif)$/.test(f.mimetype)),
});
function auth(req, res, next) {
  try { jwt.verify(req.cookies.session, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Not signed in' }); }
}
const intOrNull = v => (v && /^\d+$/.test(String(v)) ? parseInt(v, 10) : null);

app.get('/healthz', (req, res) => res.send('ok'));

// ---------- public ----------
app.get('/api/public', wrap(async (req, res) => {
  const [s, c, p] = await Promise.all([
    pool.query('select key,value from settings'),
    pool.query('select id,name from categories order by name'),
    pool.query(`select id,name,category_id,description,specs,(image is not null) has_image,
                extract(epoch from updated_at)::bigint v from products order by id desc`),
  ]);
  res.set('Cache-Control', 'no-cache');
  res.json({ settings: Object.fromEntries(s.rows.map(r => [r.key, r.value])), categories: c.rows, products: p.rows });
}));
app.get('/img/:id', wrap(async (req, res) => {
  const { rows } = await pool.query('select image,image_type from products where id=$1', [intOrNull(req.params.id)]);
  if (!rows[0] || !rows[0].image) return res.sendStatus(404);
  res.set({ 'Content-Type': rows[0].image_type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
  res.send(rows[0].image);
}));

// ---------- auth ----------
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in 15 minutes.' } });
app.post('/api/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  const ok = username === ADMIN_USER && typeof password === 'string' && bcrypt.compareSync(password, adminHash);
  if (!ok) return res.status(401).json({ error: 'Invalid username or password' });
  const token = jwt.sign({ u: ADMIN_USER }, JWT_SECRET, { expiresIn: '12h' });
  res.cookie('session', token, { httpOnly: true, sameSite: 'strict', secure: prod, maxAge: 12 * 3600 * 1000 });
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => { res.clearCookie('session'); res.json({ ok: true }); });
app.get('/api/me', auth, (req, res) => res.json({ ok: true }));

// ---------- admin: products ----------
app.post('/api/products', auth, upload.single('image'), wrap(async (req, res) => {
  const b = req.body, f = req.file;
  if (!b.name || !b.name.trim()) return res.status(400).json({ error: 'Name is required' });
  const r = await pool.query(
    'insert into products(name,category_id,description,specs,image,image_type) values($1,$2,$3,$4,$5,$6) returning id',
    [b.name.trim(), intOrNull(b.category_id), b.description || '', b.specs || '', f ? f.buffer : null, f ? f.mimetype : null]);
  res.json({ id: r.rows[0].id });
}));
app.put('/api/products/:id', auth, upload.single('image'), wrap(async (req, res) => {
  const b = req.body, f = req.file;
  if (!b.name || !b.name.trim()) return res.status(400).json({ error: 'Name is required' });
  const rm = b.remove_image === '1' && !f;
  await pool.query(
    `update products set name=$1,category_id=$2,description=$3,specs=$4,
       image=case when $7 then null else coalesce($5,image) end,
       image_type=case when $7 then null else coalesce($6,image_type) end, updated_at=now() where id=$8`,
    [b.name.trim(), intOrNull(b.category_id), b.description || '', b.specs || '', f ? f.buffer : null, f ? f.mimetype : null, rm, intOrNull(req.params.id)]);
  res.json({ ok: true });
}));
app.delete('/api/products/:id', auth, wrap(async (req, res) => {
  await pool.query('delete from products where id=$1', [intOrNull(req.params.id)]);
  res.json({ ok: true });
}));

// ---------- admin: categories ----------
app.post('/api/categories', auth, wrap(async (req, res) => {
  const n = (req.body.name || '').trim();
  if (!n) return res.status(400).json({ error: 'Name is required' });
  await pool.query('insert into categories(name) values($1) on conflict do nothing', [n]);
  res.json({ ok: true });
}));
app.put('/api/categories/:id', auth, wrap(async (req, res) => {
  const n = (req.body.name || '').trim();
  if (!n) return res.status(400).json({ error: 'Name is required' });
  await pool.query('update categories set name=$1 where id=$2', [n, intOrNull(req.params.id)]);
  res.json({ ok: true });
}));
app.delete('/api/categories/:id', auth, wrap(async (req, res) => {
  await pool.query('delete from categories where id=$1', [intOrNull(req.params.id)]);
  res.json({ ok: true });
}));

// ---------- admin: settings ----------
app.put('/api/settings', auth, wrap(async (req, res) => {
  const phone = String(req.body.phone || '').replace(/\D/g, '');
  if (phone.length < 8) return res.status(400).json({ error: 'Enter a valid WhatsApp number with country code' });
  const vals = { name: (req.body.name || '').trim() || 'BME Enterprises', tagline: (req.body.tagline || '').trim(), phone };
  for (const [k, v] of Object.entries(vals))
    await pool.query('insert into settings(key,value) values($1,$2) on conflict(key) do update set value=excluded.value', [k, v]);
  res.json({ ok: true });
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 500).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Image must be under 3 MB' : 'Server error' });
});

if (require.main === module) {
  ensure().then(() => app.listen(PORT, () => console.log('BME store running on port ' + PORT)))
    .catch(e => { console.error('Startup failed:', e.message); process.exit(1); });
}
module.exports = app;
