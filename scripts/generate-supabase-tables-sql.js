'use strict';
// Writes the Supabase migrations generated from server/supabase-tables.js:
//   202611190001_relational_tables.sql — one table per app collection
//   202611190002_sync_versions.sql     — change versions for multi-instance sync
const fs = require('fs'), path = require('path');
const { createTableSql, createSyncSql } = require('../server/supabase-tables');
const dir = path.join(__dirname, '..', 'supabase', 'migrations');
for (const [name, sql] of [['202611190001_relational_tables.sql', createTableSql()], ['202611190002_sync_versions.sql', createSyncSql()]]) {
  fs.writeFileSync(path.join(dir, name), sql);
  console.log(`wrote supabase/migrations/${name}`);
}
