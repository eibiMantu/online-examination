const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const blueprint = fs.readFileSync(path.join(root, 'render.yaml'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'supabase', 'migrations', '202611170001_app_collections.sql'), 'utf8');
const storage = fs.readFileSync(path.join(root, 'js', 'storage.js'), 'utf8');

assert.match(blueprint, /healthCheckPath:\s*\/api\/health/);
assert.match(blueprint, /SUPABASE_SERVICE_ROLE_KEY[\s\S]*sync:\s*false/);
assert.match(blueprint, /numInstances:\s*1/);
assert.doesNotMatch(blueprint, /SUPABASE_SERVICE_ROLE_KEY:\s*\S+/);
assert.match(schema, /enable row level security/i);
assert.match(schema, /revoke all[^;]+anon, authenticated/i);
assert.match(storage, /\^https\?:\$\/\.test\(location\.protocol\)/);
console.log('✅ Render Blueprint and server-only Supabase schema are configured safely');
