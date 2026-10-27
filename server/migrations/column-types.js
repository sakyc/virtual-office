// MariaDB reports integer display widths; MySQL 8 normally omits them.
// MariaDB JSON is LONGTEXT plus JSON_VALID, not arbitrary unvalidated text.
export function normalizeIntegerType(type) {
  return type.replace(/^(tinyint|smallint|mediumint|int|bigint)\(\d+\)(?= unsigned$|$)/, '$1');
}

export async function portableColumns(connection, table, columns) {
  let checks = [];
  if (columns.some(column => column.type === 'longtext')) {
    [checks] = await connection.execute(`SELECT cc.check_clause AS clause
      FROM information_schema.table_constraints tc
      JOIN information_schema.check_constraints cc
        ON cc.constraint_schema = tc.constraint_schema AND cc.constraint_name = tc.constraint_name
      WHERE tc.table_schema = DATABASE() AND tc.table_name = ? AND tc.constraint_type = 'CHECK'`, [table]);
  }
  return columns.map(column => {
    let type = normalizeIntegerType(column.type);
    if (type === 'longtext' && /^[a-zA-Z0-9_]+$/.test(column.name)) {
      const jsonCheck = new RegExp('^\\(*json_valid\\(`?' + column.name + '`?\\)\\)*$', 'i');
      if (checks.some(check => jsonCheck.test(String(check.clause).replace(/\s+/g, '')))) type = 'json';
    }
    return { ...column, type };
  });
}
