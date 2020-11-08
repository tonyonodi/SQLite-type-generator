#!/usr/bin/env node
import fs from "fs";
import prettier from "prettier";
import Database from "better-sqlite3";

const getArg = (args: string[], re: RegExp) => {
  const dbPathArg = args.find((arg) => re.test(arg));
  return dbPathArg && re.exec(dbPathArg)?.[1];
};

const dbPath = getArg(process.argv, /--db=(.+)/);
const outputPath = getArg(process.argv, /--output=(.+)/);

if (!dbPath) {
  throw new Error(
    `Error: You did not specifiy a database path. E.g. --db=/path/to/database.db`
  );
}
if (!outputPath) {
  throw new Error(
    `Error: You did not specifiy an output path. E.g. --output=/path/to/output.d.ts`
  );
}

const db = new Database(dbPath, {});

const createPeopleTable = db.prepare(`
  CREATE TABLE IF NOT EXISTS people (
    id integer PRIMARY KEY AUTOINCREMENT,
    first_name text NOT NULL,
    last_name text NOT NULL,
    is_child  integer 
  )
`);
const createItemsTable = db.prepare(`
  CREATE TABLE IF NOT EXISTS items (
    id integer PRIMARY KEY AUTOINCREMENT,
    name text NOT NULL,
    owner integer,
    FOREIGN KEY(owner) REFERENCES people(id)
    );
`);

createPeopleTable.run();
createItemsTable.run();

const insertPeople = db.prepare(`
    INSERT INTO people(first_name, last_name, is_child) 
    VALUES ('Bart', 'Simpson', 1);
`);

const selectPeople = db.prepare(`
    SELECT * FROM people;
`);

const selectTables = db.prepare(`
  SELECT 
    name
  FROM 
    sqlite_master
  WHERE
    type ='table' AND 
    name NOT LIKE 'sqlite_%';
`);

type ColumnType = "text" | "float" | "integer" | "blob";

type ForeignKey = {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
};

type ColumnInfo = {
  cid: number;
  name: string;
  type: ColumnType;
  notnull: 0 | 1;
  dflt_value: unknown;
  pk: 0 | 1;
  foreignKey?: ForeignKey;
};

const tableNames: { name: string }[] = selectTables.all();

const tables = tableNames.map(({ name }) => {
  const rawColumns: ColumnInfo[] = db.pragma(`table_info(${name});`);
  const foreignKeys: ForeignKey[] = db.pragma(`foreign_key_list(${name})`);
  const columns = rawColumns.map((column) => {
    const foreignKey = foreignKeys.find((fk) => fk.from === column.name);
    return { ...column, foreignKey };
  });

  const table = {
    name,
    columns,
  };
  return table;
});

const sqlTypeToTSType = (type: string) => {
  switch (type) {
    case "text":
      return "string";
    case "integer":
      return "BigInt";
    case "float":
      return "number";
    case "blob":
      return "Blob";
    default:
      throw new Error(`Unknown type: ${type}`);
  }
};

const generateTypeAssignment = (name: string, value: string) =>
  `type ${name} = ${value};`;

const objectPropAssignment = (
  [name, value]: [string, string],
  optional: boolean = false
) => `${name}${optional ? "?" : ""}: ${value}`;

const generateObjectLiteral = (properties: string) => `{ ${properties} }`;

console.log("table", tables[0]);
const tableDefs = tables
  .map((table) => {
    const props = table.columns.map((col) => {
      return objectPropAssignment(
        [
          col.name,
          col.foreignKey ? col.foreignKey.table : sqlTypeToTSType(col.type),
        ],
        col.notnull ? false : true
      );
    });
    const objectLiteral = generateObjectLiteral(props.join());
    const assignment = generateTypeAssignment(table.name, objectLiteral);
    return assignment;
  })
  .join("\n\n");

const dbDef = generateTypeAssignment(
  "Tables",
  generateObjectLiteral(
    tables
      .map((table) => objectPropAssignment([table.name, table.name]))
      .join(",")
  )
);

const format = (code: string) =>
  prettier.format(code, {
    parser: "typescript",
  });

const body = `${tableDefs}\n\n${dbDef}`;

const output = format(body);
fs.writeFileSync(outputPath, output);
