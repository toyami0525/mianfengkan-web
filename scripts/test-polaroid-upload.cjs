// Run: node scripts/test-polaroid-upload.cjs
// Real upload route and browser helpers; isolated Auth/DB/Storage, real HMAC, no network or production writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const STAFF_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_STAFF_ID = '44444444-4444-4444-8444-444444444444';
const PICKUP_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_PICKUP_ID = '66666666-6666-4666-8666-666666666666';
const OLD_PATH = STAFF_ID + '/existing-photo.png';
const LIMIT = 15 * 1024 * 1024;
const LARGE_SIZE = 6 * 1024 * 1024;
const owner = extra => ({user_id: OWNER_ID, role: 'owner', staff_id: null, active: true, ...extra});
const pickup = extra => ({id: PICKUP_ID, staff_id: STAFF_ID, pickup_code: 'MF-TEST22', image_path: OLD_PATH, item_type: 'polaroid', status: 'ready', completed_at: '2026-10-25T12:00:00.000Z', ...extra});
const metadata = extra => ({size: LARGE_SIZE, contentType: 'image/png', ...extra});

function environment(options = {}) {
  const env = {
    now: '2026-10-28T10:00:00.000Z', events: [], logs: [], counter: 0,
    tables: clone({staff_accounts: [owner()], polaroid_pickups: [pickup()], ...(options.tables || {})}),
    objects: new Map([[OLD_PATH, metadata({size: 1234})]]), signed: new Map(),
  };
  env.original = clone(env.tables);
  class ClockDate extends Date {
    constructor(...args) {super(...(args.length ? args : [env.now]));}
    static now() {return new Date(env.now).getTime();}
  }
  function matches(row, filters) {
    return filters.every(({op, name, value}) => {
      if (op === 'eq') return row[name] === value;
      if (op === 'is') return value === null ? row[name] == null : row[name] === value;
      if (op === 'neq') return row[name] !== value;
      if (op === 'in') return value.includes(row[name]);
      throw new Error('Unsupported filter: ' + op);
    });
  }
  function project(row, columns) {
    if (columns === '*') return clone(row);
    return Object.fromEntries(columns.split(',').map(column => column.trim()).filter(column => Object.hasOwn(row, column)).map(column => [column, clone(row[column])]));
  }
  class Query {
    constructor(table) {this.table = table; this.action = 'select'; this.columns = '*'; this.filters = []; this.one = null;}
    select(columns = '*') {this.columns = columns; return this;}
    eq(name, value) {this.filters.push({op: 'eq', name, value}); return this;}
    is(name, value) {this.filters.push({op: 'is', name, value}); return this;}
    neq(name, value) {this.filters.push({op: 'neq', name, value}); return this;}
    in(name, value) {this.filters.push({op: 'in', name, value}); return this;}
    update(values) {this.action = 'update'; this.values = clone(values); return this;}
    maybeSingle() {this.one = 'maybe'; return this;}
    single() {this.one = 'required'; return this;}
    then(resolve, reject) {return this.execute().then(resolve, reject);}
    async execute() {
      const event = {kind: 'query', table: this.table, action: this.action, columns: this.columns, filters: clone(this.filters), values: clone(this.values)};
      env.events.push(event);
      if (options.onQuery) {const result = await options.onQuery(event, env); if (result !== undefined) return clone(result);}
      assert.ok(Array.isArray(env.tables[this.table]), 'Unexpected database table: ' + this.table);
      // Evaluate filters and mutate together: this models an atomic database compare-and-set.
      const rows = env.tables[this.table].filter(row => matches(row, this.filters));
      if (this.action === 'update') rows.forEach(row => Object.assign(row, clone(this.values)));
      const data = rows.map(row => project(row, this.columns));
      event.affectedRows = rows.length;
      if (this.one) {
        if (data.length > 1 || (this.one === 'required' && !data.length)) return {data: null, error: {code: 'PGRST116', message: 'Expected one row'}};
        return {data: data[0] || null, error: null};
      }
      return {data, error: null};
    }
  }
  const storage = {from: bucket => {
    assert.equal(bucket, 'polaroids', 'The upload must stay within the private polaroids bucket');
    return {
      createSignedUploadUrl: async (objectPath, uploadOptions = {}) => {
        env.events.push({kind: 'sign', path: objectPath, options: clone(uploadOptions)});
        if (options.signError) return {data: null, error: {message: 'Storage unavailable'}};
        const token = 'isolated-upload-token-' + ++env.counter;
        env.signed.set(token, objectPath);
        return {data: {path: objectPath, token, signedUrl: 'https://storage.invalid/' + objectPath}, error: null};
      },
      uploadToSignedUrl: async (objectPath, token, file, uploadOptions = {}) => {
        assert.equal(env.signed.get(token), objectPath, 'Storage token must belong to this exact object');
        env.events.push({kind: 'direct-upload', path: objectPath, size: file.size, type: file.type, options: clone(uploadOptions)});
        if (options.uploadError) return {data: null, error: {message: 'Storage upload failed'}};
        assert.ok(!env.objects.has(objectPath), 'An upload must not overwrite an existing photo');
        env.objects.set(objectPath, metadata({size: file.size, contentType: uploadOptions.contentType || file.type}));
        return {data: {path: objectPath, fullPath: bucket + '/' + objectPath}, error: null};
      },
      upload: async (objectPath, bytes, uploadOptions = {}) => {
        env.events.push({kind: 'legacy-upload', path: objectPath, size: bytes.byteLength, options: clone(uploadOptions)});
        if (options.uploadError) return {data: null, error: {message: 'Storage upload failed'}};
        env.objects.set(objectPath, metadata({size: bytes.byteLength, contentType: uploadOptions.contentType}));
        return {data: {path: objectPath}, error: null};
      },
      info: async objectPath => {
        env.events.push({kind: 'info', path: objectPath});
        if (options.onInfo) {const result = await options.onInfo(objectPath, env); if (result !== undefined) return clone(result);}
        return env.objects.has(objectPath) ? {data: clone(env.objects.get(objectPath)), error: null} : {data: null, error: {message: 'Object not found'}};
      },
      remove: async paths => {
        env.events.push({kind: 'remove', paths: [...paths]});
        if (options.removeError) return {data: null, error: {message: 'Cleanup unavailable'}};
        paths.forEach(objectPath => env.objects.delete(objectPath));
        return {data: paths.map(name => ({name})), error: null};
      },
    };
  }};
  const client = {storage, from: table => new Query(table), auth: {getUser: async token => {
    env.events.push({kind: 'auth', token});
    const userId = token === 'owner-token' ? OWNER_ID : token === 'other-token' ? OTHER_USER_ID : null;
    return {data: {user: userId ? {id: userId} : null}, error: userId ? null : {message: 'Invalid token'}};
  }}};
  const modules = new Map();
  const mocks = {
    'next/server': {NextResponse: {json: (body, init = {}) => new Response(JSON.stringify(body), {...init, headers: {'content-type': 'application/json', ...(init.headers || {})}})}},
    '@/lib/supabase-admin': {adminSupabase: () => client},
    'server-only': {}, crypto, 'node:crypto': crypto,
  };
  env.load = relative => {
    if (modules.has(relative)) return modules.get(relative);
    const exports = {}; modules.set(relative, exports);
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    const js = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText;
    const requireLocal = name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith('@/lib/polaroid-upload')) return env.load(name.replace('@/', '') + '.ts');
      if (name.startsWith('./polaroid-upload')) return env.load(path.posix.join(path.posix.dirname(relative), name) + '.ts');
      throw new Error('Unmocked module: ' + name);
    };
    vm.runInNewContext(js, {
      exports, require: requireLocal, Date: ClockDate, Intl, URL, Headers, Request, Response, FormData, File, Blob,
      Error, TypeError, Uint8Array, Buffer, TextEncoder, TextDecoder, atob, btoa, crypto: crypto.webcrypto,
      process: {env: {SUPABASE_SERVICE_ROLE_KEY: 'isolated-tests-only-not-a-real-service-role-key'}},
      console: {error: (...args) => env.logs.push(args), warn: (...args) => env.logs.push(args)},
      fetch: () => {throw new Error('Network is prohibited in isolated tests');},
    }, {filename: relative});
    return exports;
  };
  env.request = (body, requestOptions = {}) => {
    const token = Object.hasOwn(requestOptions, 'token') ? requestOptions.token : 'owner-token';
    const headers = new Headers({'content-type': requestOptions.multipart ? 'multipart/form-data; boundary=isolated-test' : 'application/json'});
    if (token !== null) headers.set('authorization', 'Bearer ' + token);
    const url = 'https://isolated.local/api/staff/polaroids';
    const request = {
      url, nextUrl: new URL(url), headers,
      text: async () => requestOptions.badJson ? '{invalid' : JSON.stringify(body),
      json: async () => {if (requestOptions.badJson) throw new SyntaxError('Invalid JSON'); return clone(body);},
      formData: async () => {assert.ok(requestOptions.multipart, 'JSON requests must not be parsed as multipart'); return body;},
    };
    return env.load('app/api/staff/polaroids/route.ts').POST(request);
  };
  env.post = async (body, requestOptions) => {
    const response = await env.request(body, requestOptions);
    return {status: response.status, body: await response.json(), headers: response.headers};
  };
  env.fetcher = async (url, init = {}) => {
    assert.equal(url, '/api/staff/polaroids');
    assert.equal(init.method, 'POST');
    assert.equal(typeof init.body, 'string', 'The application API must receive control JSON, never the image file');
    assert.ok(Buffer.byteLength(init.body) < 4096, 'Control requests should remain small even for large photos');
    const body = JSON.parse(init.body);
    assert.ok(!('file' in body), 'Image bytes must go directly to Storage');
    env.events.push({kind: 'control', body: clone(body), bytes: Buffer.byteLength(init.body)});
    const headers = new Headers(init.headers);
    assert.match(headers.get('content-type') || '', /application\/json/);
    const token = (headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    return env.request(body, {token});
  };
  env.storage = storage;
  env.directUpload = async (prepared, fileMetadata = metadata()) => {
    const result = await storage.from(prepared.bucket).uploadToSignedUrl(prepared.path, prepared.token, {size: fileMetadata.size, type: fileMetadata.contentType}, {contentType: fileMetadata.contentType});
    assert.equal(result.error, null);
  };
  return env;
}

const writes = env => env.events.filter(event => event.kind === 'query' && event.action === 'update');
const removed = env => env.events.filter(event => event.kind === 'remove').flatMap(event => event.paths);
const unchanged = env => assert.deepEqual(env.tables.polaroid_pickups, env.original.polaroid_pickups, 'An unsuccessful request changed the pickup');
const oldPreserved = env => {assert.ok(env.objects.has(OLD_PATH), 'The existing photo must remain available'); assert.ok(!removed(env).includes(OLD_PATH), 'The existing photo was deleted before a successful replacement');};
const failed = result => assert.ok(result.status >= 400 && result.status < 600, JSON.stringify(result));
async function prepare(env, values = {}, requestOptions) {
  const response = await env.post({action: 'prepare', id: PICKUP_ID, ...metadata(), ...values}, requestOptions);
  assert.equal(response.status, 200, JSON.stringify(response));
  assert.equal(response.body.ok, true); assert.equal(response.body.bucket, 'polaroids');
  for (const key of ['path', 'token', 'receipt']) assert.ok(typeof response.body[key] === 'string' && response.body[key].length > 0, key + ' is required');
  assert.notEqual(response.body.path, OLD_PATH);
  return response.body;
}
const complete = (env, prepared, extra = {}, requestOptions) => env.post({action: 'complete', id: PICKUP_ID, receipt: prepared.receipt, ...extra}, requestOptions);
let passed = 0; const failures = [];
async function test(name, fn) {try {await fn(); passed++; console.log('PASS ' + name);} catch (error) {failures.push(name); console.error('FAIL ' + name + '\n' + error.stack);}}

(async () => {
  await test('A signed upload replaces a photo only after Storage confirms it', async () => {
    const env = environment(); const prepared = await prepare(env);
    unchanged(env); oldPreserved(env); assert.equal(writes(env).length, 0);
    await env.directUpload(prepared);
    unchanged(env); oldPreserved(env);
    const result = await complete(env, prepared);
    assert.equal(result.status, 200, JSON.stringify(result)); assert.equal(result.body.ok, true);
    assert.equal(env.tables.polaroid_pickups[0].image_path, prepared.path);
    assert.equal(env.tables.polaroid_pickups[0].status, 'ready');
    assert.ok(env.tables.polaroid_pickups[0].completed_at);
    assert.ok(env.objects.has(prepared.path)); assert.ok(!env.objects.has(OLD_PATH));
    const updateIndex = env.events.findIndex(event => event.kind === 'query' && event.action === 'update');
    const removeIndex = env.events.findIndex(event => event.kind === 'remove' && event.paths.includes(OLD_PATH));
    assert.ok(removeIndex > updateIndex, 'Delete the old photo only after the new path is committed');
  });
  for (const contentType of ['image/jpeg', 'image/png', 'image/webp']) {
    await test('Allow supported image at the 15MB boundary: ' + contentType, async () => {
      const env = environment(); const prepared = await prepare(env, {size: LIMIT, contentType});
      await env.directUpload(prepared, {size: LIMIT, contentType});
      assert.equal((await complete(env, prepared)).status, 200);
    });
  }
  for (const [label, values] of [['over 15MB', {size: LIMIT + 1}], ['empty file', {size: 0}], ['negative size', {size: -1}], ['invalid size', {size: '6000000'}], ['unsupported format', {contentType: 'image/gif'}], ['disguised non-image', {contentType: 'text/plain'}]]) {
    await test('Reject ' + label + ' before issuing a Storage token', async () => {
      const env = environment(); const response = await env.post({action: 'prepare', id: PICKUP_ID, ...metadata(), ...values});
      failed(response); assert.equal(env.events.filter(event => event.kind === 'sign').length, 0); unchanged(env); oldPreserved(env);
    });
  }
  for (const [label, account, token] of [['signed out', owner(), null], ['invalid session', owner(), 'invalid'], ['inactive account', owner({active: false}), 'owner-token'], ['frontdesk without an assigned staff id', owner({role: 'frontdesk', staff_id: null}), 'owner-token'], ['frontdesk acting for a different staff member', owner({role: 'frontdesk', staff_id: OTHER_STAFF_ID}), 'owner-token'], ['another staff member', owner({role: 'staff', staff_id: OTHER_STAFF_ID}), 'owner-token']]) {
    await test('Prepare and complete reject ' + label, async () => {
      const env = environment(); const prepared = await prepare(env); await env.directUpload(prepared);
      env.tables.staff_accounts = [account]; const start = env.events.length;
      const prep = await env.post({action: 'prepare', id: PICKUP_ID, ...metadata()}, {token});
      const done = await complete(env, prepared, {}, {token});
      assert.ok([401, 403].includes(prep.status), JSON.stringify(prep)); assert.ok([401, 403].includes(done.status), JSON.stringify(done));
      assert.equal(env.events.slice(start).filter(event => event.kind === 'sign').length, 0);
      unchanged(env); oldPreserved(env);
    });
  }
  for (const role of ['staff', 'frontdesk']) {
    await test('Preserve an active linked account\'s existing access to its own pickup: ' + role, async () => {
      const env = environment({tables: {staff_accounts: [owner({role, staff_id: STAFF_ID})]}});
      const prepared = await prepare(env); await env.directUpload(prepared); assert.equal((await complete(env, prepared)).status, 200);
    });
  }
  await test('Tampered receipt cannot change the pickup or delete the previous photo', async () => {
    const env = environment(); const prepared = await prepare(env); await env.directUpload(prepared);
    const receipt = (prepared.receipt[0] === 'a' ? 'b' : 'a') + prepared.receipt.slice(1);
    failed(await complete(env, prepared, {receipt})); unchanged(env); oldPreserved(env);
  });
  await test('Expired receipt cannot finalize an uploaded object', async () => {
    const env = environment(); const prepared = await prepare(env); await env.directUpload(prepared);
    env.now = '2026-10-30T10:00:00.000Z';
    failed(await complete(env, prepared)); unchanged(env); oldPreserved(env);
  });
  await test('Receipt cannot be reused for another pickup or another authenticated owner', async () => {
    const env = environment({tables: {staff_accounts: [owner(), owner({user_id: OTHER_USER_ID})], polaroid_pickups: [pickup(), pickup({id: OTHER_PICKUP_ID, pickup_code: 'MF-OTHER2'})]}});
    const prepared = await prepare(env); await env.directUpload(prepared);
    failed(await complete(env, prepared, {id: OTHER_PICKUP_ID}));
    failed(await complete(env, prepared, {}, {token: 'other-token'}));
    unchanged(env); oldPreserved(env);
  });
  for (const [label, stored] of [['missing upload', null], ['different byte size', metadata({size: LARGE_SIZE - 1})], ['different MIME type', metadata({contentType: 'image/jpeg'})], ['oversized stored object', metadata({size: LIMIT + 1})]]) {
    await test('Finalize rejects ' + label + ' using Storage metadata', async () => {
      const env = environment(); const prepared = await prepare(env);
      if (stored) env.objects.set(prepared.path, stored);
      failed(await complete(env, prepared)); unchanged(env); oldPreserved(env); assert.equal(writes(env).length, 0);
    });
  }
  await test('A failed database update keeps the previous photo and pickup usable', async () => {
    const env = environment({onQuery: event => event.action === 'update' ? {data: null, error: {message: 'Temporary database failure'}} : undefined});
    const prepared = await prepare(env); await env.directUpload(prepared);
    failed(await complete(env, prepared)); unchanged(env); oldPreserved(env);
  });
  await test('Competing replacements cannot overwrite the winning upload; retry is idempotent', async () => {
    const env = environment(); const first = await prepare(env); const second = await prepare(env);
    assert.notEqual(first.path, second.path, 'Each attempt needs a unique object path');
    await env.directUpload(first); await env.directUpload(second);
    const results = await Promise.all([complete(env, first), complete(env, second)]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409], JSON.stringify(results));
    const winner = results[0].status === 200 ? first : second;
    assert.equal(env.tables.polaroid_pickups[0].image_path, winner.path); assert.ok(env.objects.has(winner.path));
    assert.ok(!removed(env).includes(winner.path));
    const successfulWrites = writes(env).filter(event => event.affectedRows > 0).length;
    const retry = await complete(env, winner); assert.equal(retry.status, 200, JSON.stringify(retry)); assert.equal(retry.body.ok, true);
    assert.equal(env.tables.polaroid_pickups[0].image_path, winner.path);
    assert.equal(writes(env).filter(event => event.affectedRows > 0).length, successfulWrites, 'Retry must not apply the replacement twice');
  });
  await test('A pickup with no prior photo can be completed and retried', async () => {
    const env = environment({tables: {polaroid_pickups: [pickup({image_path: null, status: 'processing', completed_at: null})]}});
    const prepared = await prepare(env); await env.directUpload(prepared);
    assert.equal((await complete(env, prepared)).status, 200); assert.equal((await complete(env, prepared)).status, 200);
    assert.equal(env.tables.polaroid_pickups[0].image_path, prepared.path); assert.equal(removed(env).length, 0);
  });
  await test('Small multipart uploads remain compatible and commit before deleting the old photo', async () => {
    const env = environment(); const form = new FormData(); form.set('id', PICKUP_ID); form.set('file', new File([new Uint8Array(128)], 'small.png', {type: 'image/png'}));
    const result = await env.post(form, {multipart: true}); assert.equal(result.status, 200, JSON.stringify(result));
    assert.equal(env.tables.polaroid_pickups[0].status, 'ready'); assert.notEqual(env.tables.polaroid_pickups[0].image_path, OLD_PATH);
    assert.ok(env.events.findIndex(event => event.kind === 'remove' && event.paths.includes(OLD_PATH)) > env.events.findIndex(event => event.kind === 'query' && event.action === 'update'));
  });
  await test('A photo above the 4.5MB gateway limit goes directly to Storage using small JSON requests', async () => {
    const env = environment(); const {uploadPolaroidFile} = env.load('lib/polaroid-upload-client.ts');
    await uploadPolaroidFile({id: PICKUP_ID, file: new File([new Uint8Array(LARGE_SIZE)], 'large.png', {type: 'image/png'}), accessToken: 'owner-token', storage: env.storage, fetcher: env.fetcher});
    const controls = env.events.filter(event => event.kind === 'control');
    assert.deepEqual(controls.map(event => event.body.action), ['prepare', 'complete']);
    assert.equal(controls[0].body.size, LARGE_SIZE); assert.equal(controls[0].body.contentType, 'image/png');
    assert.equal(env.events.filter(event => event.kind === 'direct-upload').length, 1);
    assert.equal(env.events.filter(event => event.kind === 'legacy-upload').length, 0);
    assert.equal(env.tables.polaroid_pickups[0].status, 'ready'); assert.notEqual(env.tables.polaroid_pickups[0].image_path, OLD_PATH);
  });
  await test('Client rejects empty, oversized and unsupported files before any network or Storage request', async () => {
    for (const [size, type] of [[0, 'image/png'], [LIMIT + 1, 'image/png'], [100, 'image/gif']]) {
      const env = environment(); const {uploadPolaroidFile} = env.load('lib/polaroid-upload-client.ts');
      await assert.rejects(() => uploadPolaroidFile({id: PICKUP_ID, file: new File([new Uint8Array(size)], 'photo', {type}), accessToken: 'owner-token', storage: env.storage, fetcher: env.fetcher}));
      assert.equal(env.events.length, 0); unchanged(env); oldPreserved(env);
    }
  });
  await test('Storage upload failure never sends complete or deletes the old photo', async () => {
    const env = environment({uploadError: true}); const {uploadPolaroidFile} = env.load('lib/polaroid-upload-client.ts');
    await assert.rejects(() => uploadPolaroidFile({id: PICKUP_ID, file: new File([new Uint8Array(128)], 'photo.png', {type: 'image/png'}), accessToken: 'owner-token', storage: env.storage, fetcher: env.fetcher}));
    assert.deepEqual(env.events.filter(event => event.kind === 'control').map(event => event.body.action), ['prepare']); unchanged(env); oldPreserved(env);
  });
  await test('Plain-text gateway 413 produces a readable upload error rather than JSON SyntaxError', async () => {
    const env = environment(); const {uploadPolaroidFile} = env.load('lib/polaroid-upload-client.ts');
    await assert.rejects(() => uploadPolaroidFile({id: PICKUP_ID, file: new File([new Uint8Array(128)], 'photo.png', {type: 'image/png'}), accessToken: 'owner-token', storage: env.storage, fetcher: async () => new Response('Request Entity Too Large', {status: 413, headers: {'content-type': 'text/plain'}})}), error => {
      assert.ok(error instanceof Error); assert.notEqual(error.name, 'SyntaxError');
      assert.doesNotMatch(error.message, /Unexpected token|is not valid JSON|JSON\.parse/);
      assert.ok(error.message.length > 0); return true;
    });
    assert.equal(env.events.filter(event => event.kind === 'direct-upload').length, 0); unchanged(env); oldPreserved(env);
  });
  if (failures.length) {console.error(`${failures.length} failed, ${passed} passed.`); process.exitCode = 1;}
  else console.log(`${passed} polaroid upload checks passed. Authentication, database and Storage were isolated; no network writes occurred.`);
})().catch(error => {console.error(error); process.exitCode = 1;});
