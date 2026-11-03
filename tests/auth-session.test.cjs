const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const projectRequire = createRequire(path.join(root, 'package.json'));
const authId = '11111111-1111-4111-8111-111111111111';
const profileId = '22222222-2222-4222-8222-222222222222';
const jwt = (id = authId, exp = Math.floor(Date.now() / 1000) + 3600) => [
  { alg: 'HS256', typ: 'JWT' }, { sub: id, exp, aud: 'authenticated', role: 'authenticated' },
].map(x => Buffer.from(JSON.stringify(x)).toString('base64url')).concat('test-signature').join('.');

// Run the real SSR client, session resolver, guards and handlers against an in-memory Auth/REST backend.
function fixture({ role = 'employee', token = true, inactive = false, authFailure = false, dbFailure = false,
  refresh = false, refreshFailure = false, permissions = {} } = {}) {
  const accessToken = jwt();
  const profile = {
    id: profileId, auth_user_id: authId, role, status: inactive ? 'inactive' : 'active',
    name: 'Test', callsign: 'Fixture', position: 'Специалист', can_manage_content: false,
    can_manage_news: false, can_manage_tests: false, can_manage_results: false,
    can_manage_uav: false, can_manage_counteraction: false, can_manage_tactical_medicine: false,
    can_manage_users: false, can_view_user_list: false, can_view_online: false,
    can_reset_test_results: false, can_moderate_personnel: false, unit_assignment: 'fpv', ...permissions,
  };
  const jar = new Map();
  const writes = [], calls = [];
  if (token) jar.set('sb-supabase-auth-token', 'base64-' + Buffer.from(JSON.stringify({
    access_token: refresh ? jwt(authId, 1) : accessToken,
    refresh_token: 'test-refresh', token_type: 'bearer', expires_in: refresh ? 0 : 3600,
    expires_at: refresh ? 1 : Math.floor(Date.now() / 1000) + 3600,
    user: { id: authId, aud: 'authenticated', role: 'authenticated' },
  })).toString('base64url'));
  function spoof(values = {}) {
    jar.set('ssp_session', Buffer.from(JSON.stringify({
      id: profileId, role: 'admin', canManageContent: true,
      permissions: { tests: true, users: true, online: true }, ...values,
    })).toString('base64url'));
  }
  spoof();
  const store = {
    get: name => jar.has(name) ? { name, value: jar.get(name) } : undefined,
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set(name, value, options) { jar.set(name, value); writes.push({ name, value, options }); },
  };
  const response = (body, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
  async function fetchDouble(input, init = {}) {
    const url = new URL(typeof input === 'string' ? input : input.url || input);
    assert.equal(url.hostname, 'supabase.test', 'No real network calls are permitted');
    const headers = new Headers(init.headers);
    calls.push({ pathname: url.pathname, method: init.method || 'GET', headers, url });
    if (url.pathname === '/auth/v1/user') {
      if (authFailure || headers.get('authorization') !== 'Bearer ' + accessToken) {
        return response({ msg: 'Invalid JWT', code: 'bad_jwt' }, 401);
      }
      return response({ id: authId, aud: 'authenticated', role: 'authenticated', email: 'test@example.invalid' });
    }
    if (url.pathname === '/auth/v1/token') {
      if (refreshFailure) return response({ msg: 'Invalid refresh token', code: 'refresh_token_not_found' }, 400);
      return response({ access_token: accessToken, refresh_token: 'test-refresh-rotated', token_type: 'bearer', expires_in: 3600,
        user: { id: authId, aud: 'authenticated', role: 'authenticated', email: 'test@example.invalid' } });
    }
    if (url.pathname === '/rest/v1/app_users') {
      if (dbFailure) return response({ message: 'database unavailable' }, 503);
      assert.equal(url.searchParams.get('auth_user_id'), 'eq.' + authId);
      return response(profile);
    }
    if (url.pathname === '/rest/v1/test_settings') {
      return response({ final_test_closed_from: null, final_test_closed_until: null, final_test_closure_message: null });
    }
    throw new Error('Unexpected backend request: ' + url.pathname);
  }
  const modules = new Map();
  function load(relative) {
    const filename = path.join(root, relative.endsWith('.ts') ? relative : relative + '.ts');
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} }; modules.set(filename, module);
    const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const localRequire = spec => {
      if (spec === 'next/headers') return { cookies: async () => store };
      if (spec.startsWith('@/')) return load(spec.slice(2));
      return projectRequire(spec);
    };
    const ctx = vm.createContext({
      exports: module.exports, module, require: localRequire, Buffer, console, URL, URLSearchParams,
      Request, Response, Headers, AbortSignal, AbortController, setTimeout, clearTimeout,
      process: { env: { NODE_ENV: 'test', NEXT_PUBLIC_SUPABASE_URL: 'http://supabase.test',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon', SUPABASE_SERVICE_ROLE_KEY: 'test-service-role' } },
      fetch: fetchDouble,
    });
    vm.runInContext(js, ctx, { filename }); return module.exports;
  }
  return { load, jar, writes, calls, profile, spoof, store };
}

test('forged legacy admin cookie without a Supabase session is unauthorized', async () => {
  const f = fixture({ token: false });
  assert.equal(await f.load('lib/server-auth').getServerSession(), null);
  const res = await f.load('app/api/admin/tests/final-closure/route').GET();
  assert.equal(res.status, 401);
  assert.equal(f.calls.length, 0);
});

test('verified employee stays forbidden after role, identity and permissions are forged', async () => {
  const f = fixture();
  const server = f.load('lib/server-auth');
  const first = await server.getServerSession();
  assert.equal(first.role, 'employee');
  f.spoof({ id: 'another-admin', role: 'admin', unitAssignment: 'company_4' });
  const session = await server.getServerSession();
  assert.equal(session.id, profileId);
  assert.equal(session.role, 'employee');
  assert.equal(session.permissions.users, false);
  assert.equal(session.unitAssignment, 'fpv');
  assert.equal((await f.load('app/api/admin/tests/final-closure/route').GET()).status, 403);
});

test('real administrator retains read access', async () => {
  const f = fixture({ role: 'admin' });
  f.spoof({ role: 'employee' });
  assert.equal((await f.load('lib/server-auth').getServerSession()).role, 'admin');
  const res = await f.load('app/api/admin/tests/final-closure/route').GET();
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
});

test('invalid token, inactive user and backend errors fail closed', async t => {
  for (const options of [{ authFailure: true }, { inactive: true }, { dbFailure: true }]) {
    await t.test(JSON.stringify(options), async () => {
      const f = fixture(options);
      assert.equal(await f.load('lib/server-auth').getServerSession(), null);
    });
  }
});

test('revoked roles and permissions apply on the next request without a user-ID cache', async () => {
  const f = fixture({ role: 'admin' }), server = f.load('lib/server-auth');
  assert.equal((await server.getServerSession()).role, 'admin');
  f.profile.role = 'employee';
  assert.equal((await server.getServerSession()).permissions.tests, false);
  assert.equal((await f.load('app/api/admin/tests/final-closure/route').GET()).status, 403);
});

test('individual tactical medicine permission stays valid without granting other sections', async () => {
  const f = fixture({ permissions: { can_manage_tactical_medicine: true } });
  const s = await f.load('lib/server-auth').getServerSession();
  assert.equal(s.permissions.tacticalMedicine, true);
  assert.equal(s.permissions.tests, false);
  assert.equal(s.canManageContent, true);
});

test('expired token refreshes and writes updated cookies before validation', async () => {
  const f = fixture({ refresh: true });
  assert.equal((await f.load('lib/server-auth').getServerSession()).role, 'employee');
  assert.ok(f.calls.some(c => c.pathname === '/auth/v1/token'));
  assert.ok(f.writes.some(c => c.name.startsWith('sb-supabase-auth-token')));
});

test('invalid refresh token never falls back to the legacy cookie', async () => {
  const f = fixture({ refresh: true, refreshFailure: true });
  assert.equal(await f.load('lib/server-auth').getServerSession(), null);
});

test('proxy denies forged admin UI access and repairs display cookie', async () => {
  const f = fixture();
  const { NextRequest } = projectRequire('next/server');
  const req = new NextRequest('https://site.test/admin', {
    headers: { cookie: [...f.jar].map(([n, v]) => n + '=' + v).join('; ') },
  });
  const res = await f.load('proxy').proxy(req);
  assert.equal(res.status, 307);
  assert.equal(new URL(res.headers.get('location')).pathname, '/dashboard');
  const display = res.headers.getSetCookie().find(c => c.startsWith('ssp_session='));
  assert.ok(display);
  const value = display.split(';')[0].slice('ssp_session='.length);
  assert.equal(JSON.parse(Buffer.from(value, 'base64url')).role, 'employee');
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
});

test('proxy preserves refreshed tokens on redirects and normal page requests', async t => {
  const { NextRequest } = projectRequire('next/server');
  for (const pathname of ['/admin', '/dashboard']) await t.test(pathname, async () => {
    const f = fixture({ refresh: true });
    const req = new NextRequest('https://site.test' + pathname, {
      headers: { cookie: [...f.jar].map(([n, v]) => n + '=' + v).join('; ') },
    });
    const res = await f.load('proxy').proxy(req);
    assert.ok(res.cookies.getAll().some(c => c.name.startsWith('sb-supabase-auth-token')));
    if (pathname === '/dashboard') assert.ok(res.headers.get('x-middleware-request-cookie')?.includes('sb-supabase-auth-token'));
  });
});

test('recovery page stays reachable without an ordinary authenticated session', async () => {
  const f = fixture({ token: false });
  const { NextRequest } = projectRequire('next/server');
  const res = await f.load('proxy').proxy(new NextRequest('https://site.test/reset-password?type=recovery'));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('location'), null);
});

test('password login persists SSR tokens and does not require email confirmation', async () => {
  const f = fixture({ token: false });
  const res = await f.load('app/api/auth/login/route').POST(new Request('https://site.test/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login: 'test@example.invalid', password: 'test-password' }),
  }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).session.role, 'employee');
  assert.ok(f.writes.some(c => c.name.startsWith('sb-supabase-auth-token')));
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.equal((await f.load('lib/server-auth').getServerSession()).role, 'employee');
});

test('forged Supabase cookie user metadata cannot change the verified identity', async () => {
  const f = fixture();
  const key = 'sb-supabase-auth-token';
  const session = JSON.parse(Buffer.from(f.jar.get(key).slice('base64-'.length), 'base64url'));
  session.user = { id: 'forged-admin-id', role: 'admin', user_metadata: { role: 'admin' } };
  f.jar.set(key, 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'));
  const verified = await f.load('lib/server-auth').getServerSession();
  assert.equal(verified.id, profileId);
  assert.equal(verified.role, 'employee');
  assert.ok(f.calls.some(c => c.pathname === '/auth/v1/user'));
});
