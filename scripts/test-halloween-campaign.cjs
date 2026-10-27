// Run: node scripts/test-halloween-campaign.cjs
// Real route handlers + local Supabase/Auth/clock/crypto doubles; no network or production writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const CAMPAIGN_ID = 'airi-halloween-2026';
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const DATE = '2026-10-31';
const PUBLIC_ROUTE = 'halloween-campaign';
const OWNER_ROUTE = 'staff/halloween-campaign';
const ISSUE_ROUTE = OWNER_ROUTE + '/issue';
const settings = extra => ({id: CAMPAIGN_ID, enabled: false, published: false, starts_on: '2026-10-30', ends_on: '2026-11-02', updated_at: '2026-10-27T12:00:00.000Z', ...extra});
const enabledSettings = extra => settings({enabled: true, published: true, ...extra});
const spend = (name, total, extra = {}) => ({guest_name: name, guest_server: '伊弗利特', guest_key: name.toLowerCase(), server_key: '伊弗利特', reservation_total: total, dining_total: 0, game_total: 0, total, ...extra});
const claim = (name, extra = {}) => ({id: 'claim-' + name, campaign_id: CAMPAIGN_ID, spend_date: DATE, guest_name: name, guest_server: '伊弗利特', guest_key: name.toLowerCase(), server_key: '伊弗利特', qualifying_total: 400000, pickup_id: 'pickup-' + name, issued_by: OWNER_ID, issued_at: '2026-10-31T12:00:00.000Z', ...extra});
const validPatch = extra => ({enabled: false, published: false, starts_on: '2026-10-30', ends_on: '2026-11-02', expected_updated_at: settings().updated_at, ...extra});
const validIssue = extra => ({guest_name: '測試旅人', guest_server: '伊弗利特', spend_date: DATE, ...extra});

function splitColumns(value) {
  const parts = []; let depth = 0, start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++;
    if (value[i] === ')') depth--;
    if (value[i] === ',' && depth === 0) {parts.push(value.slice(start, i).trim()); start = i + 1;}
  }
  parts.push(value.slice(start).trim()); return parts;
}
function environment(options = {}) {
  const env = {now: options.now || '2026-10-31T13:00:00.000Z', events: [], logs: [], counter: 0,
    tables: clone({staff_accounts: [{user_id: OWNER_ID, role: 'owner', active: true}], halloween_campaigns: [settings()], halloween_reward_claims: [], polaroid_pickups: [], ...(options.tables || {})}),
  };
  env.original = clone(env.tables);
  class ClockDate extends Date {constructor(...args) {super(...(args.length ? args : [env.now]));} static now() {return new Date(env.now).getTime();}}
  function project(row, columns) {
    if (!columns || columns === '*') return clone(row);
    const result = {};
    for (const column of splitColumns(columns)) {
      const relation = column.match(/^(?:(\w+):)?(\w+)(?:![\w_]+)?\((.*)\)$/);
      if (relation) {
        const [, alias, table, nested] = relation;
        assert.equal(table, 'polaroid_pickups', 'Unexpected relation in isolated mock');
        const related = env.tables.polaroid_pickups.find(pickup => pickup.id === row.pickup_id);
        result[alias || table] = related ? project(related, nested) : null;
      } else if (column === '*') Object.assign(result, clone(row));
      else if (row[column] !== undefined) result[column] = clone(row[column]);
    }
    return result;
  }
  function matches(row, filters) {
    return filters.every(({op, name, value}) => {
      if (op === 'eq') return row[name] === value;
      if (op === 'in') return value.includes(row[name]);
      if (op === 'gte') return row[name] >= value;
      if (op === 'lte') return row[name] <= value;
      throw new Error('Unsupported isolated filter: ' + op);
    });
  }
  class Query {
    constructor(table, rpcArgs) {this.table = table; this.rpcArgs = rpcArgs; this.action = 'select'; this.columns = '*'; this.filters = []; this.orders = []; this.first = 0; this.last = Infinity; this.one = null;}
    select(columns = '*') {this.columns = columns; return this;}
    eq(name, value) {this.filters.push({op: 'eq', name, value}); return this;}
    in(name, value) {this.filters.push({op: 'in', name, value}); return this;}
    gte(name, value) {this.filters.push({op: 'gte', name, value}); return this;}
    lte(name, value) {this.filters.push({op: 'lte', name, value}); return this;}
    range(first, last) {this.first = first; this.last = last; return this;}
    order(name, opts = {}) {this.orders.push({name, ascending: opts.ascending !== false}); return this;}
    limit(value) {this.last = value - 1; return this;}
    update(values) {this.action = 'update'; this.values = clone(values); return this;}
    insert(values) {this.action = 'insert'; this.values = clone(values); return this;}
    maybeSingle() {this.one = 'maybe'; return this;}
    single() {this.one = 'required'; return this;}
    then(resolve, reject) {return this.execute().then(resolve, reject);}
    async execute() {
      if (this.rpcArgs !== undefined) {
        const event = {kind: 'rpc', name: this.table, args: clone(this.rpcArgs), range: [this.first, this.last]}; env.events.push(event);
        const result = options.onRPC ? await options.onRPC(this.table, clone(this.rpcArgs), env) : {data: this.table === 'halloween_daily_spend' ? clone(options.spendRows || []) : null, error: null};
        if (Array.isArray(result.data)) return {...clone(result), data: clone(result.data.slice(this.first, this.last + 1))};
        return clone(result);
      }
      const event = {kind: 'query', table: this.table, action: this.action, columns: this.columns, filters: clone(this.filters), values: clone(this.values), range: [this.first, this.last]}; env.events.push(event);
      if (options.onQuery) {const override = await options.onQuery(event, env); if (override !== undefined) return clone(override);}
      assert.ok(Array.isArray(env.tables[this.table]), 'Unexpected table: ' + this.table);
      let rows = env.tables[this.table].filter(row => matches(row, this.filters));
      for (const {name, ascending} of [...this.orders].reverse()) rows.sort((a, b) => (a[name] < b[name] ? -1 : a[name] > b[name] ? 1 : 0) * (ascending ? 1 : -1));
      rows = rows.slice(this.first, this.last + 1);
      if (this.action === 'update') rows.forEach(row => Object.assign(row, clone(this.values)));
      if (this.action === 'insert') {rows = (Array.isArray(this.values) ? this.values : [this.values]).map(value => ({id: 'unexpected-test-insert', ...value})); env.tables[this.table].push(...rows);}
      const data = rows.map(row => project(row, this.columns));
      if (this.one) {if (data.length > 1 || (this.one === 'required' && !data.length)) return {data: null, error: {code: 'PGRST116', message: 'Expected one row'}}; return {data: data[0] || null, error: null};}
      return {data, error: null};
    }
  }
  const client = {from: name => new Query(name), rpc: (name, args) => new Query(name, args), auth: {getUser: async token => {
    env.events.push({kind: 'auth', token});
    if (options.authError) return {data: {user: null}, error: {message: 'Invalid token'}};
    return {data: {user: token === 'local-owner-token' ? {id: OWNER_ID} : null}, error: null};
  }}};
  const modules = new Map();
  const crypto = {randomBytes: size => {env.events.push({kind: 'random', size}); return Buffer.alloc(size, ++env.counter);}};
  const mocks = {'next/server': {NextResponse: {json: (body, opts = {}) => ({status: opts.status || 200, body: clone(body), headers: clone(opts.headers || {})})}}, '@/lib/supabase-admin': {adminSupabase: () => {if (options.clientError) throw new Error('Missing private server key'); return client;}}, crypto, 'node:crypto': crypto};
  function load(relative) {
    if (modules.has(relative)) return modules.get(relative);
    const exports = {}; modules.set(relative, exports);
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    const js = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText;
    const requireLocal = name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      let resolved;
      if (name.startsWith('@/lib/halloween-')) resolved = name.replace('@/', '') + '.ts';
      else if (name.startsWith('./halloween-')) resolved = path.posix.join(path.posix.dirname(relative), name) + '.ts';
      else throw new Error('Unmocked module: ' + name);
      return load(resolved);
    };
    vm.runInNewContext(js, {exports, require: requireLocal, Date: ClockDate, Intl, URL, Headers, Request, Error, Uint8Array, Buffer, console: {error: (...args) => env.logs.push(args), warn: (...args) => env.logs.push(args)}, fetch: () => {throw new Error('Network is prohibited in isolated tests');}}, {filename: relative});
    return exports;
  }
  env.call = async (route, method = 'GET', body = {}, requestOptions = {}) => {
    const token = Object.hasOwn(requestOptions, 'token') ? requestOptions.token : 'local-owner-token';
    const url = 'https://isolated.local/api/' + route + (requestOptions.query || '');
    const request = {url, nextUrl: new URL(url), headers: new Headers(token === null ? {} : {authorization: 'Bearer ' + token}), json: async () => {if (requestOptions.badJson) throw new Error('Invalid JSON'); return clone(body);}};
    return load('app/api/' + route + '/route.ts')[method](request);
  };
  return env;
}
const queries = env => env.events.filter(event => event.kind === 'query');
const rpcs = env => env.events.filter(event => event.kind === 'rpc');
const writes = env => queries(env).filter(event => event.action !== 'select');
const sameTables = env => assert.deepEqual(env.tables, env.original, 'Database tables were modified');
const noCampaignAccess = env => {assert.equal(rpcs(env).length, 0); assert.ok(queries(env).every(event => event.table === 'staff_accounts')); sameTables(env);};
const noCache = result => assert.match(result.headers['Cache-Control'] || result.headers['cache-control'] || '', /no-store/);
const inactive = result => {assert.equal(result.status, 200); assert.deepEqual(result.body, {active: false}); noCache(result);};
const issuedResult = (args, extra = {}) => ({id: 'issued-claim', spend_date: args.p_spend_date, guest_name: args.p_guest_name, guest_server: args.p_guest_server, total: 400000, pickup_code: args.p_pickup_code, pickup_id: 'issued-pickup', issued_at: '2026-10-31T13:00:00.000Z', already_issued: false, ...extra});
let passed = 0; const failures = [];
async function test(name, fn) {try {await fn(); passed++; console.log('PASS ' + name);} catch (error) {failures.push(name); console.error('FAIL ' + name + '\n' + error.stack);}}

(async () => {
  for (const [label, config] of [['disabled', settings()], ['unpublished', enabledSettings({published: false})], ['future', enabledSettings({starts_on: '2026-11-01'})], ['expired', enabledSettings({ends_on: '2026-10-30'})], ['unconfigured', enabledSettings({starts_on: null, ends_on: null})], ['invalid calendar day', enabledSettings({starts_on: '2026-02-30'})], ['malformed range', enabledSettings({starts_on: '2026-11-02', ends_on: '2026-10-30'})]]) {
    await test('Public API reveals no draft data: ' + label, async () => {const env = environment({tables: {halloween_campaigns: [config]}}); inactive(await env.call(PUBLIC_ROUTE)); assert.equal(rpcs(env).length, 0); assert.ok(queries(env).every(q => q.table === 'halloween_campaigns')); sameTables(env);});
  }
  await test('Missing campaign is publicly inactive', async () => {const env = environment({tables: {halloween_campaigns: []}}); inactive(await env.call(PUBLIC_ROUTE));});
  for (const [label, options] of [['database error', {onQuery: () => ({data: null, error: {message: 'private database details'}})}], ['configuration error', {clientError: true}]]) {
    await test('Public API fails closed on ' + label, async () => inactive(await environment(options).call(PUBLIC_ROUTE)));
  }
  await test('Active public response contains only approved announcement fields', async () => {
    const env = environment({tables: {halloween_campaigns: [enabledSettings({secret_note: 'private'})]}}); const result = await env.call(PUBLIC_ROUTE);
    assert.equal(result.status, 200); assert.equal(result.body.active, true); noCache(result);
    assert.equal(result.body.threshold, 400000); assert.equal(result.body.per_day_limit, 1); assert.equal(result.body.timezone, 'Asia/Taipei');
    assert.deepEqual(Object.keys(result.body).sort(), ['active', 'title', 'reward_name', 'threshold', 'per_day_limit', 'timezone', 'starts_on', 'ends_on'].sort());
    assert.equal(rpcs(env).length, 0); sameTables(env);
  });
  await test('Public activation uses Taipei calendar date at UTC boundary', async () => {
    const env = environment({now: '2026-10-30T16:00:01.000Z', tables: {halloween_campaigns: [enabledSettings({starts_on: DATE, ends_on: DATE})]}}); assert.equal((await env.call(PUBLIC_ROUTE)).body.active, true);
  });
  for (const [label, options, token] of [['signed out', {}, null], ['invalid token', {}, 'invalid-token'], ['staff', {tables: {staff_accounts: [{user_id: OWNER_ID, role: 'staff', active: true}]}}, 'local-owner-token'], ['frontdesk', {tables: {staff_accounts: [{user_id: OWNER_ID, role: 'frontdesk', active: true}]}}, 'local-owner-token'], ['inactive owner', {tables: {staff_accounts: [{user_id: OWNER_ID, role: 'owner', active: false}]}}, 'local-owner-token']]) {
    await test('All private operations reject ' + label + ' before campaign access', async () => {
      for (const [route, method, body] of [[OWNER_ROUTE, 'GET', {}], [OWNER_ROUTE, 'PATCH', validPatch()], [ISSUE_ROUTE, 'POST', validIssue()]]) {
        const env = environment(options); const result = await env.call(route, method, body, {token}); assert.ok([401, 403].includes(result.status), JSON.stringify(result)); noCampaignAccess(env);
      }
    });
  }
  for (const date of ['2026-02-30', '2026-13-01', '2026-00-10', 'not-a-date']) {
    await test('Reject invalid calendar date ' + date, async () => {
      let env = environment(); let result = await env.call(OWNER_ROUTE, 'GET', {}, {query: '?date=' + date}); assert.equal(result.status, 400); assert.equal(rpcs(env).length, 0); sameTables(env);
      env = environment(); result = await env.call(ISSUE_ROUTE, 'POST', validIssue({spend_date: date})); assert.equal(result.status, 400); assert.equal(rpcs(env).length, 0); sameTables(env);
    });
  }
  await test('Dashboard independently marks threshold, server, and claimed states', async () => {
    const existing = claim('Already'); const removed = claim('Refunded');
    const env = environment({tables: {halloween_campaigns: [enabledSettings()], halloween_reward_claims: [existing, removed], polaroid_pickups: [{id: existing.pickup_id, pickup_code: 'MF-AAAAAA', status: 'processing'}, {id: removed.pickup_id, pickup_code: 'MF-BBBBBB', status: 'ready'}]}, spendRows: [spend('Below', 399999), spend('Exact', '400000', {reservation_total: '300000', dining_total: '100000'}), spend('NoServer', 900000, {guest_server: '', server_key: ''}), spend('Already', 800000)]});
    const result = await env.call(OWNER_ROUTE, 'GET', {}, {query: '?date=' + DATE}); assert.equal(result.status, 200, JSON.stringify(result)); noCache(result);
    const byName = Object.fromEntries(result.body.guests.map(row => [row.guest_name, row]));
    assert.equal(byName.Below.eligible, false); assert.equal(byName.Below.can_issue, false);
    assert.equal(byName.Exact.total, 400000); assert.equal(byName.Exact.eligible, true); assert.equal(byName.Exact.can_issue, true);
    assert.equal(byName.NoServer.eligible, false); assert.equal(byName.NoServer.can_issue, false);
    assert.equal(byName.Already.can_issue, false); assert.equal(byName.Already.claim.pickup_code, 'MF-AAAAAA');
    assert.equal(byName.Refunded.total, 0); assert.equal(byName.Refunded.can_issue, false); assert.equal(byName.Refunded.claim.pickup_status, 'ready');
    assert.equal(result.body.summary.total_guests, 5); assert.equal(result.body.summary.qualified_guests, 2); assert.equal(result.body.summary.issued_count, 2);
    assert.ok(rpcs(env).every(call => call.name === 'halloween_daily_spend')); sameTables(env);
  });
  for (const [label, config, day] of [['disabled draft', settings(), DATE], ['outside event', enabledSettings(), '2026-10-29'], ['future spending day', enabledSettings(), '2026-11-01']]) {
    await test('Eligible preview cannot issue for ' + label, async () => {
      const env = environment({tables: {halloween_campaigns: [config]}, spendRows: [spend('Guest', 400000)]}); const result = await env.call(OWNER_ROUTE, 'GET', {}, {query: '?date=' + day}); assert.equal(result.status, 200, JSON.stringify(result)); assert.equal(result.body.guests[0].eligible, true); assert.equal(result.body.guests[0].can_issue, false); sameTables(env);
    });
  }
  await test('Dashboard date defaults to Taipei day', async () => {
    const env = environment({now: '2026-10-30T16:00:01.000Z'}); const result = await env.call(OWNER_ROUTE); assert.equal(result.body.spend_date, DATE); assert.equal(rpcs(env)[0].args.p_spend_date, DATE);
  });
  await test('Dashboard fetches beyond the first thousand spending records', async () => {
    const rows = Array.from({length: 1001}, (_, i) => spend('Guest' + String(i).padStart(4, '0'), 400000));
    const env = environment({spendRows: rows}); const result = await env.call(OWNER_ROUTE);
    assert.equal(result.status, 200, JSON.stringify(result)); assert.equal(result.body.guests.length, 1001); assert.equal(result.body.summary.qualified_guests, 1001);
    assert.equal(rpcs(env).filter(call => call.name === 'halloween_daily_spend').length, 2); sameTables(env);
  });
  await test('Unavailable claim history fails dashboard instead of showing everyone as unissued', async () => {
    const env = environment({spendRows: [spend('Guest', 400000)], onQuery: event => event.table === 'halloween_reward_claims' ? {data: null, error: {message: 'Claims unavailable'}} : undefined});
    const result = await env.call(OWNER_ROUTE); assert.equal(result.status, 500); assert.equal(result.body.guests, undefined); sameTables(env);
  });
  for (const [label, body] of [['missing CAS', validPatch({expected_updated_at: undefined})], ['invalid boolean', validPatch({enabled: 'false'})], ['published without enabled', validPatch({published: true})], ['enabled without dates', validPatch({enabled: true, starts_on: null, ends_on: null})], ['invalid calendar date', validPatch({starts_on: '2026-02-30'})], ['reversed dates', validPatch({starts_on: '2026-11-02', ends_on: '2026-10-31'})]]) {
    await test('Settings reject ' + label + ' without modification', async () => {const env = environment(); const result = await env.call(OWNER_ROUTE, 'PATCH', body); assert.equal(result.status, 400, JSON.stringify(result)); sameTables(env); assert.equal(rpcs(env).length, 0);});
  }
  await test('Stale settings version returns conflict and preserves current settings', async () => {const env = environment(); const result = await env.call(OWNER_ROUTE, 'PATCH', validPatch({expected_updated_at: '2026-10-26T12:00:00.000Z'})); assert.equal(result.status, 409, JSON.stringify(result)); sameTables(env);});
  await test('Saving draft uses guarded update and never implicitly enables or publishes', async () => {
    const env = environment(); const result = await env.call(OWNER_ROUTE, 'PATCH', validPatch({starts_on: '2026-10-31', ends_on: '2026-10-31'})); assert.equal(result.status, 200, JSON.stringify(result));
    const saved = env.tables.halloween_campaigns[0]; assert.equal(saved.enabled, false); assert.equal(saved.published, false); assert.equal(saved.starts_on, DATE); assert.notEqual(saved.updated_at, env.original.halloween_campaigns[0].updated_at);
    assert.equal(writes(env).length, 1); assert.ok(writes(env)[0].filters.some(filter => filter.name === 'id' && filter.value === CAMPAIGN_ID)); assert.ok(writes(env)[0].filters.some(filter => filter.name === 'updated_at' && filter.value === validPatch().expected_updated_at));
  });
  await test('Client cannot change campaign id, threshold, or owner through settings', async () => {
    const env = environment(); const result = await env.call(OWNER_ROUTE, 'PATCH', validPatch({id: 'other-campaign', threshold: 1, updated_by: 'attacker', role: 'owner'})); assert.ok([200, 400].includes(result.status)); const saved = env.tables.halloween_campaigns[0]; assert.equal(saved.id, CAMPAIGN_ID); assert.equal(saved.threshold, undefined); assert.equal(saved.updated_by, undefined); assert.equal(saved.role, undefined);
  });
  for (const [label, body] of [['missing name', validIssue({guest_name: ''})], ['blank server', validIssue({guest_server: '  '})], ['oversized name', validIssue({guest_name: 'x'.repeat(1000)})], ['oversized server', validIssue({guest_server: 'x'.repeat(1000)})], ['missing day', validIssue({spend_date: undefined})]]) {
    await test('Issue rejects ' + label + ' before RPC', async () => {const env = environment(); const result = await env.call(ISSUE_ROUTE, 'POST', body); assert.equal(result.status, 400, JSON.stringify(result)); assert.equal(rpcs(env).length, 0); sameTables(env);});
  }
  await test('Issue uses atomic RPC, authenticated issuer, and fresh random code', async () => {
    const env = environment({onRPC: (name, args) => {assert.equal(name, 'issue_halloween_reward'); assert.equal(args.p_issued_by, OWNER_ID); assert.equal(args.p_guest_name, '測試旅人'); assert.equal(args.p_guest_server, '伊弗利特'); assert.equal(args.p_spend_date, DATE); assert.match(args.p_pickup_code, /^MF-[A-HJ-NP-Z2-9]{6}$/); assert.ok(!('p_price' in args)); assert.ok(!('p_total' in args)); return {data: issuedResult(args), error: null};}});
    const result = await env.call(ISSUE_ROUTE, 'POST', validIssue({total: 1, price: 1, issued_by: 'attacker', staff_id: 'other-staff'})); assert.equal(result.status, 200, JSON.stringify(result)); assert.equal(rpcs(env).length, 1); assert.ok(env.events.some(event => event.kind === 'random')); assert.equal(writes(env).length, 0); sameTables(env);
  });
  await test('Idempotent duplicate returns original pickup without extra inserts', async () => {
    const env = environment({onRPC: (_name, args) => ({data: issuedResult(args, {already_issued: true, pickup_code: 'MF-ORIG22'}), error: null})}); const result = await env.call(ISSUE_ROUTE, 'POST', validIssue()); assert.equal(result.status, 200, JSON.stringify(result)); assert.match(JSON.stringify(result.body), /MF-ORIG22/); assert.match(JSON.stringify(result.body), /already_issued":true/); assert.equal(rpcs(env).length, 1); assert.equal(writes(env).length, 0);
  });
  await test('Pickup-code collision retries with a new code only', async () => {
    const codes = []; const env = environment({onRPC: (_name, args) => {codes.push(args.p_pickup_code); return codes.length === 1 ? {data: null, error: {code: '23505', message: 'duplicate key violates unique constraint polaroid_pickups_pickup_code_key'}} : {data: issuedResult(args), error: null};}});
    const result = await env.call(ISSUE_ROUTE, 'POST', validIssue()); assert.equal(result.status, 200, JSON.stringify(result)); assert.equal(codes.length, 2); assert.notEqual(codes[0], codes[1]); assert.equal(writes(env).length, 0);
  });
  for (const [label, error, status] of [['disabled event', {code: 'P0001', message: '活動尚未啟用'}, 409], ['insufficient spend', {code: 'P0001', message: '當日累計消費未達 400,000 Gil'}, 409], ['unrelated unique violation', {code: '23505', message: 'duplicate key violates constraint other_key'}, 500], ['database failure', {code: 'XX000', message: 'Database error'}, 500]]) {
    await test('Issue handles ' + label + ' without fallback writes or retries', async () => {const env = environment({onRPC: () => ({data: null, error})}); const result = await env.call(ISSUE_ROUTE, 'POST', validIssue()); assert.equal(result.status, status, JSON.stringify(result)); assert.equal(rpcs(env).length, 1); assert.equal(writes(env).length, 0); sameTables(env);});
  }
  await test('An empty issuance response cannot be reported as success', async () => {
    const env = environment({onRPC: () => ({data: null, error: null})}); const result = await env.call(ISSUE_ROUTE, 'POST', validIssue()); assert.equal(result.status, 500, JSON.stringify(result)); assert.equal(writes(env).length, 0);
  });
  if (failures.length) {console.error(`${failures.length} failed, ${passed} passed.`); process.exitCode = 1;} else console.log(`${passed} campaign API checks passed. All data, authentication and issuance were isolated mocks.`);
})().catch(error => {console.error(error); process.exitCode = 1;});
