// Run with: node scripts/test-airi-queue.cjs.
// Loads the actual API routes and service/queue helpers. Supabase, authentication,
// time, random bytes and Storage are local mocks; network access is prohibited.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const iso = value => new Date(value).toISOString();
const AIRI_ID = 'airi-test-id';
const SAI_ID = 'sai-test-id';
const airi = {id: AIRI_ID, slug: 'airi', name: '愛梨', role: '館員', services: ['簽繪拍立得'], active: true, accepting_reservations: true, sort_order: 1};
const sai = {id: SAI_ID, slug: 'sai', name: '賽伊', role: '館員', services: ['耳語陪伴', '拍立得(無簽繪)'], active: true, accepting_reservations: true, sort_order: 2};
const defaultOrder = {guest_name: '本地排隊測試', guest_server: '伊弗利特', staff_id: AIRI_ID, services: ['簽繪拍立得'], note: 'local contract test', items: []};

function reservation(id, staffId = AIRI_ID, status = 'acknowledged', bookingMode = 'queue') {
  return {id, staff_id: staffId, staff_name: staffId === AIRI_ID ? '愛梨' : '賽伊', guest_name: '本地測試', service_name: staffId === AIRI_ID ? '簽繪拍立得' : '耳語陪伴', price: staffId === AIRI_ID ? 300000 : 100000, status, booking_mode: bookingMode, starts_at: iso('2026-10-13T22:00:00+08:00'), ends_at: iso('2026-10-13T22:15:00+08:00'), note: 'original note'};
}

function splitColumns(value) {
  const columns = [];
  let depth = 0, start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++;
    if (value[i] === ')') depth--;
    if (value[i] === ',' && depth === 0) {columns.push(value.slice(start, i).trim()); start = i + 1;}
  }
  columns.push(value.slice(start).trim());
  return columns;
}

function environment(options = {}) {
  const env = {
    now: options.now || '2026-10-13T22:00:00+08:00',
    events: [], logs: [], randomCounter: 0,
    tables: clone({
      staff: [airi, sai], reservations: [],
      staff_accounts: [{user_id: 'local-user', staff_id: AIRI_ID, role: 'staff', active: true}],
      site_settings: [{key: 'booking_test_mode', value: false}],
      venue_closures: [], staff_work_calendar: [], staff_service_availability: [], polaroid_pickups: [],
      ...(options.tables || {}),
    }),
    onQuery: options.onQuery,
    onRPC: options.onRPC,
    onStorage: options.onStorage,
  };
  class ClockDate extends Date {
    constructor(...args) {super(...(args.length ? args : [env.now]));}
    static now() {return new Date(env.now).getTime();}
  }
  function joinedStaff(row) {
    return row.staff === undefined ? env.tables.staff.find(profile => profile.id === row.staff_id) || null : row.staff;
  }
  function field(row, name) {
    if (name.startsWith('staff.')) {
      const related = joinedStaff(row);
      return (Array.isArray(related) ? related[0] : related)?.[name.slice(6)];
    }
    return row[name];
  }
  function project(row, columns) {
    if (!columns || columns === '*') return clone(row);
    const result = {};
    for (const column of splitColumns(columns)) {
      const relation = column.match(/^(\w+):[\w!]+\((.*)\)$/);
      if (relation) {
        assert.equal(relation[1], 'staff', 'Unexpected relation in Supabase mock');
        const related = joinedStaff(row);
        result[relation[1]] = Array.isArray(related) ? related.map(value => project(value, relation[2])) : related ? project(related, relation[2]) : null;
      } else if (column === '*') Object.assign(result, clone(row));
      else if (row[column] !== undefined) result[column] = clone(row[column]);
    }
    return result;
  }
  function matches(row, filters) {
    return filters.every(({op, column, value, operator}) => {
      const actual = field(row, column);
      if (op === 'eq') return actual === value;
      // SQL <> does not match NULL.
      if (op === 'neq') return actual != null && actual !== value;
      if (op === 'gte') return actual != null && actual >= value;
      if (op === 'in') return value.includes(actual);
      if (op === 'not' && operator === 'in') return actual != null && !value.replace(/^\(|\)$/g, '').split(',').includes(String(actual));
      throw new Error('Unsupported Supabase filter: ' + op);
    });
  }
  class Query {
    constructor(client, table) {this.client = client; this.table = table; this.action = 'select'; this.columns = '*'; this.filters = []; this.orders = []; this.maxRows = Infinity; this.singleMode = null;}
    select(columns = '*') {this.columns = columns; return this;}
    eq(column, value) {this.filters.push({op: 'eq', column, value}); return this;}
    neq(column, value) {this.filters.push({op: 'neq', column, value}); return this;}
    gte(column, value) {this.filters.push({op: 'gte', column, value}); return this;}
    in(column, value) {this.filters.push({op: 'in', column, value}); return this;}
    not(column, operator, value) {this.filters.push({op: 'not', column, operator, value}); return this;}
    order(column, options = {}) {this.orders.push({column, ascending: options.ascending !== false}); return this;}
    limit(value) {this.maxRows = value; return this;}
    update(value) {this.action = 'update'; this.values = clone(value); return this;}
    insert(value) {this.action = 'insert'; this.values = clone(value); return this;}
    delete() {this.action = 'delete'; return this;}
    maybeSingle() {this.singleMode = 'maybe'; return this;}
    single() {this.singleMode = 'required'; return this;}
    then(resolve, reject) {return this.execute().then(resolve, reject);}
    async execute() {
      const event = {kind: 'query', client: this.client, table: this.table, action: this.action, columns: this.columns, values: this.values, filters: clone(this.filters)};
      env.events.push(event);
      if (env.onQuery) {
        const override = await env.onQuery(event, env);
        if (override !== undefined) return clone(override);
      }
      assert.ok(Array.isArray(env.tables[this.table]), 'Unexpected table: ' + this.table);
      let rows = env.tables[this.table].filter(row => matches(row, this.filters));
      for (const {column, ascending} of [...this.orders].reverse()) rows.sort((a, b) => (field(a, column) < field(b, column) ? -1 : field(a, column) > field(b, column) ? 1 : 0) * (ascending ? 1 : -1));
      rows = rows.slice(0, this.maxRows);
      if (this.action === 'update') for (const row of rows) Object.assign(row, clone(this.values));
      if (this.action === 'insert') {
        rows = (Array.isArray(this.values) ? this.values : [this.values]).map((row, index) => ({id: 'mock-insert-' + index, ...clone(row)}));
        env.tables[this.table].push(...rows);
      }
      if (this.action === 'delete') env.tables[this.table] = env.tables[this.table].filter(row => !rows.includes(row));
      const data = rows.map(row => project(row, this.columns));
      if (this.singleMode) {
        if (data.length > 1 || (this.singleMode === 'required' && data.length === 0)) return {data: null, error: {code: 'PGRST116', message: 'Expected one row'}};
        return {data: data[0] || null, error: null};
      }
      return {data, error: null};
    }
  }
  function client(name) {
    return {
      from: table => new Query(name, table),
      auth: {getUser: async token => ({data: {user: token === 'local-test-token' ? {id: 'local-user'} : null}, error: null})},
      rpc: async (rpcName, args) => {
        env.events.push({kind: 'rpc', phase: 'call', client: name, name: rpcName, args: clone(args)});
        assert.equal(typeof env.onRPC, 'function', 'Unexpected RPC: ' + rpcName);
        const result = await env.onRPC(rpcName, clone(args), env);
        env.events.push({kind: 'rpc', phase: result.error ? 'rejected' : 'resolved', name: rpcName});
        return clone(result);
      },
      storage: {from: bucket => ({remove: async paths => {
        env.events.push({kind: 'storage-remove', bucket, paths: clone(paths)});
        if (env.onStorage) await env.onStorage(bucket, clone(paths), env);
        return {data: [], error: null};
      }})},
    };
  }
  const admin = client('admin'), publicClient = client('public'), modules = new Map();
  const mocks = {
    'next/server': {NextResponse: {json: (body, options = {}) => ({status: options.status || 200, body: clone(body), headers: clone(options.headers || {})})}},
    '@/lib/supabase-admin': {adminSupabase: () => admin},
    '@/lib/supabase-server': {publicSupabase: () => publicClient},
    crypto: {randomBytes: size => Buffer.alloc(size, ++env.randomCounter)},
  };
  function load(relative) {
    if (modules.has(relative)) return modules.get(relative);
    const exports = {};
    modules.set(relative, exports);
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    const js = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText;
    const localRequire = name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === '@/lib/staff-services') return load('lib/staff-services.ts');
      if (name === '@/lib/staff-queue') return load('lib/staff-queue.ts');
      if (name === '@/lib/airi-services'||name === './airi-services') return load('lib/airi-services.ts');
      if (name === '@/lib/dining-items') return load('lib/dining-items.ts');
      throw new Error('Unmocked module import: ' + name);
    };
    vm.runInNewContext(js, {exports, require: localRequire, Date: ClockDate, Intl, Error, Uint8Array, console: {error: (...args) => env.logs.push(args)}, fetch: () => {throw new Error('Network access prohibited in local contract tests');}}, {filename: relative});
    return exports;
  }
  env.call = async (route, method = 'POST', body = {}, authorized = true) => {
    const request = {text: async () => JSON.stringify(body), json: async () => clone(body), headers: {get: name => name.toLowerCase() === 'authorization' && authorized ? 'Bearer local-test-token' : null}};
    return load('app/api/' + route + '/route.ts')[method](request);
  };
  return env;
}

const tableWrites = env => env.events.filter(event => event.kind === 'query' && event.action !== 'select');
const rpcCalls = env => env.events.filter(event => event.kind === 'rpc' && event.phase === 'call');
const storageRemovals = env => env.events.filter(event => event.kind === 'storage-remove');
function assertNoWrites(env, message = '') {assert.equal(tableWrites(env).length, 0, message); assert.equal(rpcCalls(env).length, 0, message); assert.equal(storageRemovals(env).length, 0, message);}
function assertQueueRPCOnly(env, count) {assert.equal(rpcCalls(env).length, count); assert.ok(rpcCalls(env).every(event => event.name === 'enqueue_airi_service' && event.client === 'admin')); assert.equal(tableWrites(env).length, 0); assert.equal(storageRemovals(env).length, 0);}
function queuedSuccess(args, position = 5) {return {data: {reservation_id: 'new-queue-id', pickup_code: args.p_pickup_code, queue_count: position, queue_position: position}, error: null};}
const errorResult = (code, message) => ({data: null, error: {code, message}});

let passed = 0;
const failures = [];
async function test(name, fn) {
  try {await fn(); passed++; console.log('PASS ' + name);}
  catch (error) {failures.push(name); console.error('FAIL ' + name + '\n' + error.stack);}
}

module.exports={environment,tableWrites,rpcCalls,assertNoWrites,queuedSuccess,defaultOrder,AIRI_ID,SAI_ID,airi,sai};
if(require.main===module)(async () => {
  await test('Public count includes pending/acknowledged only and strips every Airi time block, including legacy rows', async () => {
    const legacy = {...reservation('legacy-airi', AIRI_ID, 'pending', 'timed'), staff: [{slug: 'airi'}]};
    const ordinary = reservation('sai-active', SAI_ID, 'confirmed', 'timed');
    const env = environment({tables: {reservations: [reservation('waiting', AIRI_ID, 'pending'), reservation('acknowledged'), reservation('serving', AIRI_ID, 'confirmed'), reservation('finished', AIRI_ID, 'completed'), reservation('cancelled', AIRI_ID, 'cancelled'), legacy, ordinary]}});
    const response = await env.call('booking-data', 'GET');
    assert.equal(response.status, 200);
    const profile = response.body.staff.find(row => row.id === AIRI_ID);
    assert.equal(profile.booking_mode, 'queue');
    assert.equal(profile.queue_count, 3, 'Serving and terminal rows must not consume waiting capacity');
    assert.equal(profile.queue_limit, 5);
    assert.ok(response.body.blocks.every(row => row.staff_id !== AIRI_ID));
    assert.deepEqual(response.body.blocks, [{staff_id: SAI_ID, start_at: ordinary.starts_at, end_at: ordinary.ends_at, status: ordinary.status, block_type: 'reservation'}]);
    assert.ok(!('queue_count' in response.body.staff.find(row => row.id === SAI_ID)));
    assert.doesNotMatch(JSON.stringify(profile), /"(?:starts_at|ends_at|start_at|end_at|duration_minutes|estimated_end)"/);
    assertNoWrites(env);
  });

  await test('Public API respects staff availability and fails closed when the queue count query fails', async () => {
    const inactive = {...sai, id: 'inactive', active: false};
    const stopped = {...sai, id: 'stopped', accepting_reservations: false};
    const off = {...sai, id: 'off-calendar'};
    const env = environment({tables: {staff: [airi, sai, inactive, stopped, off], staff_work_calendar: [{staff_id: 'off-calendar', work_date: '2026-10-13', status: 'off'}], staff_service_availability: [{staff_id: AIRI_ID, service_name: '簽繪拍立得', enabled: false}]}});
    const response = await env.call('booking-data', 'GET');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.staff.map(row => row.id), [AIRI_ID, SAI_ID]);
    assert.deepEqual(response.body.staff.find(row => row.id === AIRI_ID).available_services, ['談天說地']);
    assertNoWrites(env);
    const failed = environment({onQuery: query => query.table === 'reservations' && query.filters.some(filter => filter.column === 'staff.slug') ? errorResult('XX000', 'queue read failed') : undefined});
    const rejected = await failed.call('booking-data', 'GET');
    assert.equal(rejected.status, 500);
    assert.ok(!('staff' in rejected.body), 'Unknown count must not be published as an empty queue');
    assertNoWrites(failed);
  });

  await test('Airi can enqueue at 23:59 using the atomic RPC, preserving pickup code and queue position without querying busy times', async () => {
    const env = environment({now: '2026-10-13T23:59:59+08:00', tables: {reservations: [reservation('already-serving', AIRI_ID, 'confirmed')]}, onRPC: (name, args) => queuedSuccess(args)});
    const response = await env.call('combined-order', 'POST', defaultOrder);
    assert.equal(response.status, 200);
    assert.equal(response.body.booking_mode, 'queue');
    assert.equal(response.body.queue_position, 5);
    assert.equal(response.body.queue_count, 5);
    assert.equal(response.body.queue_limit, 5);
    assert.equal(response.body.reservation_id, 'new-queue-id');
    assert.match(response.body.pickup_code, /^MF-/);
    assert.deepEqual(response.body.pickup_codes, [response.body.pickup_code]);
    assert.deepEqual(response.body.pickup_items, [{code: response.body.pickup_code, type: 'airi_signed_polaroid', label: '愛梨 簽繪拍立得'}]);
    assertQueueRPCOnly(env, 1);
    assert.deepEqual(rpcCalls(env)[0].args, {p_staff_id: AIRI_ID, p_guest_name: defaultOrder.guest_name, p_guest_server: defaultOrder.guest_server, p_note: defaultOrder.note, p_service_name:'簽繪拍立得', p_pickup_code: response.body.pickup_code});
    assert.equal(env.events.filter(event => event.kind === 'query' && event.table === 'reservations').length, 0, 'Airi must branch before the timed busy query');
  });

  await test('Atomic queue capacity P0001 becomes 409 without retries or separate pickup/reservation writes', async () => {
    const env = environment({onRPC: () => errorResult('P0001', '愛梨排隊已額滿')});
    const response = await env.call('combined-order', 'POST', defaultOrder);
    assert.equal(response.status, 409);
    assert.equal(response.body.error, '愛梨排隊已額滿');
    assertQueueRPCOnly(env, 1);
  });

  await test('Only pickup-code uniqueness collisions are retried with a fresh code, and repeated collisions are bounded', async () => {
    let attempts = 0;
    const collision = () => errorResult('23505', 'duplicate key value violates unique constraint "polaroid_pickups_pickup_code_key"');
    const env = environment({onRPC: (name, args) => ++attempts === 1 ? collision() : queuedSuccess(args, 2)});
    const response = await env.call('combined-order', 'POST', defaultOrder);
    assert.equal(response.status, 200);
    assert.equal(response.body.queue_position, 2);
    assertQueueRPCOnly(env, 2);
    assert.notEqual(rpcCalls(env)[0].args.p_pickup_code, rpcCalls(env)[1].args.p_pickup_code);
    const exhausted = environment({onRPC: collision});
    assert.equal((await exhausted.call('combined-order', 'POST', defaultOrder)).status, 503);
    assert.ok(rpcCalls(exhausted).length > 1 && rpcCalls(exhausted).length <= 8, 'Retry loop must have a finite bound');
    assertQueueRPCOnly(exhausted, rpcCalls(exhausted).length);
  });

  await test('Other uniqueness conflicts stop after one queue RPC and return 409', async () => {
    const env = environment({onRPC: () => errorResult('23505', 'duplicate key value violates unique constraint "one_active_queue_customer"')});
    const response = await env.call('combined-order', 'POST', defaultOrder);
    assert.equal(response.status, 409);
    assertQueueRPCOnly(env, 1);
  });

  await test('Invalid/unoffered services, paused service, add-on bypass and staff calendar leave cannot enqueue', async () => {
    const cases = [
      {body: {...defaultOrder, services: ['不存在的服務']}, status: 400},
      {body: {...defaultOrder, services: ['耳語陪伴']}, status: 400},
      {body: {...defaultOrder, polaroid: true}, status: 400},
      {body: defaultOrder, status: 409, tables: {staff_service_availability: [{staff_id: AIRI_ID, service_name: '簽繪拍立得', enabled: false}]}},
      {body: defaultOrder, status: 409, tables: {staff_work_calendar: [{staff_id: AIRI_ID, work_date: '2026-10-13', status: 'off'}]}},
    ];
    for (const scenario of cases) {
      const env = environment({tables: scenario.tables});
      const response = await env.call('combined-order', 'POST', scenario.body);
      assert.equal(response.status, scenario.status, JSON.stringify(scenario));
      assertNoWrites(env, JSON.stringify(scenario));
    }
  });

  await test('Monday, a scheduled closure, opening time and Taipei midnight still reject new queue joins', async () => {
    const cases = [
      {now: '2026-10-12T22:00:00+08:00', tables: {site_settings: [{key: 'booking_test_mode', value: true}]}},
      {now: '2026-10-13T22:00:00+08:00', tables: {venue_closures: [{work_date: '2026-10-13', reason: '臨時休館'}], site_settings: [{key: 'booking_test_mode', value: true}]}},
      {now: '2026-10-13T20:59:59+08:00'},
      {now: '2026-10-14T00:00:00+08:00'},
    ];
    for (const scenario of cases) {
      const env = environment(scenario);
      const response = await env.call('combined-order', 'POST', defaultOrder);
      assert.equal(response.status, 400, scenario.now);
      assertNoWrites(env, scenario.now);
    }
  });

  await test('Ordinary staff still reject an active booking and a service that cannot finish before midnight', async () => {
    const body = {...defaultOrder, staff_id: SAI_ID, services: ['耳語陪伴']};
    const busy = environment({tables: {reservations: [reservation('sai-busy', SAI_ID, 'confirmed', 'timed')]}});
    const busyResponse = await busy.call('combined-order', 'POST', body);
    assert.equal(busyResponse.status, 409);
    assert.match(busyResponse.body.error, /服務中/);
    assertNoWrites(busy);
    const late = environment({now: '2026-10-13T23:50:00+08:00'});
    const lateResponse = await late.call('combined-order', 'POST', body);
    assert.equal(lateResponse.status, 400);
    assert.match(lateResponse.body.error, /24:00/);
    assertNoWrites(late);
  });

  await test('Starting an acknowledged queue updates only status, including before and after midnight', async () => {
    for (const now of ['2026-10-13T23:59:00+08:00', '2026-10-14T00:05:00+08:00']) {
      const original = reservation('start-queue');
      const env = environment({now, tables: {reservations: [original]}});
      const response = await env.call('staff/reservations/confirm', 'POST', {reservation_id: original.id});
      assert.equal(response.status, 200, now);
      assert.equal(response.body.booking_mode, 'queue');
      assert.equal(response.body.reservation.status, 'confirmed');
      assert.equal(response.body.reservation.starts_at, original.starts_at);
      assert.equal(response.body.reservation.ends_at, original.ends_at);
      assert.equal(response.body.reservation.note, original.note);
      assert.deepEqual(tableWrites(env).map(event => event.values), [{status: 'confirmed'}]);
      assert.equal(env.events.filter(event => event.kind === 'query' && event.table === 'site_settings').length, 0);
      assert.equal(rpcCalls(env).length, 0);
      assert.equal(storageRemovals(env).length, 0);
    }
  });

  await test('Frontdesk, another staff member and an unauthenticated caller cannot start Airi queue entries', async () => {
    for (const scenario of [{role: 'frontdesk', staff_id: AIRI_ID, expected: 403}, {role: 'staff', staff_id: SAI_ID, expected: 403}, {role: 'staff', staff_id: AIRI_ID, authorized: false, expected: 401}]) {
      const env = environment({tables: {reservations: [reservation('protected-queue')], staff_accounts: [{user_id: 'local-user', role: scenario.role, staff_id: scenario.staff_id, active: true}]}});
      const response = await env.call('staff/reservations/confirm', 'POST', {reservation_id: 'protected-queue'}, scenario.authorized !== false);
      assert.equal(response.status, scenario.expected, scenario.role);
      assertNoWrites(env, scenario.role);
    }
  });

  await test('FIFO trigger rejection and an already-serving uniqueness conflict become 409 without changing the queue entry', async () => {
    for (const [code, message] of [['P0001', '請依排隊順序開始服務'], ['23505', 'one queue serving constraint']]) {
      const original = reservation('not-first');
      const env = environment({tables: {reservations: [original]}, onQuery: query => query.table === 'reservations' && query.action === 'update' ? errorResult(code, message) : undefined});
      const response = await env.call('staff/reservations/confirm', 'POST', {reservation_id: original.id});
      assert.equal(response.status, 409, code);
      if (code === 'P0001') assert.equal(response.body.error, message);
      assert.equal(env.tables.reservations[0].status, 'acknowledged');
      assert.deepEqual(tableWrites(env).map(event => event.values), [{status: 'confirmed'}]);
      assert.equal(rpcCalls(env).length, 0);
      assert.equal(storageRemovals(env).length, 0);
    }
  });

  await test('Queue cancellation uses the atomic RPC and removes returned Storage paths only after it succeeds', async () => {
    const original = reservation('cancel-queue');
    let rpcFinished = false;
    const env = environment({tables: {reservations: [original], polaroid_pickups: [{id: 'pickup', reservation_id: original.id, image_path: 'airi/test.png'}]}, onRPC: async (name, args) => {
      assert.equal(name, 'cancel_queued_reservation');
      assert.deepEqual(args, {p_reservation_id: original.id});
      await Promise.resolve();
      rpcFinished = true;
      return {data: {reservation: {...original, status: 'cancelled'}, removed_pickups: 1, image_paths: ['airi/test.png']}, error: null};
    }, onStorage: (bucket, paths) => {assert.equal(rpcFinished, true, 'Storage must follow successful atomic cancellation'); assert.equal(bucket, 'polaroids'); assert.deepEqual(paths, ['airi/test.png']);}});
    const response = await env.call('staff/reservations/cancel', 'POST', {reservation_id: original.id});
    assert.equal(response.status, 200);
    assert.equal(response.body.reservation.status, 'cancelled');
    assert.equal(response.body.removed_pickups, 1);
    assert.equal(rpcCalls(env).length, 1);
    assert.equal(rpcCalls(env)[0].client, 'admin');
    assert.equal(tableWrites(env).length, 0, 'Route must not delete pickups or separately update a queue reservation');
    assert.equal(env.events.filter(event => event.kind === 'query' && event.table === 'polaroid_pickups').length, 0);
    assert.equal(storageRemovals(env).length, 1);
    const resolvedAt = env.events.findIndex(event => event.kind === 'rpc' && event.phase === 'resolved');
    assert.ok(env.events.findIndex(event => event.kind === 'storage-remove') > resolvedAt);
  });

  await test('Rejected queue cancellation leaves pickups and images untouched', async () => {
    const original = reservation('cancel-race');
    const pickup = {id: 'pickup', reservation_id: original.id, image_path: 'airi/keep.png'};
    const env = environment({tables: {reservations: [original], polaroid_pickups: [pickup]}, onRPC: () => errorResult('P0001', '這筆排隊已經結束，無法取消')});
    const response = await env.call('staff/reservations/cancel', 'POST', {reservation_id: original.id});
    assert.equal(response.status, 409);
    assert.deepEqual(env.tables.reservations, [original]);
    assert.deepEqual(env.tables.polaroid_pickups, [pickup]);
    assert.equal(rpcCalls(env).length, 1);
    assert.equal(rpcCalls(env)[0].name, 'cancel_queued_reservation');
    assert.equal(tableWrites(env).length, 0);
    assert.equal(storageRemovals(env).length, 0);
    assert.equal(env.events.filter(event => event.kind === 'query' && event.table === 'polaroid_pickups').length, 0);
  });

  await test('Queue entries reject timed extension with 409 and create no charges, pickup records or time changes', async () => {
    const original = reservation('cannot-extend', AIRI_ID, 'confirmed');
    const env = environment({tables: {reservations: [original]}});
    const response = await env.call('staff/reservations/extend', 'POST', {reservation_id: original.id, service_name: '耳語陪伴'});
    assert.equal(response.status, 409);
    assert.match(response.body.error, /排隊制/);
    assert.deepEqual(env.tables.reservations, [original]);
    assertNoWrites(env);
  });

  console.log(`\n${passed} tests passed; ${failures.length} failed. No production data or network was accessed.`);
  if (failures.length) process.exitCode = 1;
})().catch(error => {console.error(error); process.exitCode = 1;});
