"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs_1 = __importDefault(require("fs"));
var prettier_1 = __importDefault(require("prettier"));
var better_sqlite3_1 = __importDefault(require("better-sqlite3"));
var getArg = function (args, re) {
    var _a;
    var dbPathArg = args.find(function (arg) { return re.test(arg); });
    return dbPathArg && ((_a = re.exec(dbPathArg)) === null || _a === void 0 ? void 0 : _a[1]);
};
var dbPath = getArg(process.argv, /--db=(.+)/);
var outputPath = getArg(process.argv, /--output=(.+)/);
if (!dbPath) {
    throw new Error("Error: You did not specifiy a database path. E.g. --db=/path/to/database.db");
}
if (!outputPath) {
    throw new Error("Error: You did not specifiy an output path. E.g. --output=/path/to/output.d.ts");
}
var db = new better_sqlite3_1.default(dbPath, {});
var createPeopleTable = db.prepare("\n  CREATE TABLE IF NOT EXISTS people (\n    id integer PRIMARY KEY AUTOINCREMENT,\n    first_name text NOT NULL,\n    last_name text NOT NULL,\n    is_child  integer \n  )\n");
var createItemsTable = db.prepare("\n  CREATE TABLE IF NOT EXISTS items (\n    id integer PRIMARY KEY AUTOINCREMENT,\n    name text NOT NULL,\n    owner integer,\n    FOREIGN KEY(owner) REFERENCES people(id)\n    );\n");
createPeopleTable.run();
createItemsTable.run();
var insertPeople = db.prepare("\n    INSERT INTO people(first_name, last_name, is_child) \n    VALUES ('Bart', 'Simpson', 1);\n");
var selectPeople = db.prepare("\n    SELECT * FROM people;\n");
var selectTables = db.prepare("\n  SELECT \n    name\n  FROM \n    sqlite_master\n  WHERE\n    type ='table' AND \n    name NOT LIKE 'sqlite_%';\n");
var tableNames = selectTables.all();
var tables = tableNames.map(function (_a) {
    var name = _a.name;
    var rawColumns = db.pragma("table_info(" + name + ");");
    var foreignKeys = db.pragma("foreign_key_list(" + name + ")");
    var columns = rawColumns.map(function (column) {
        var foreignKey = foreignKeys.find(function (fk) { return fk.from === column.name; });
        return __assign(__assign({}, column), { foreignKey: foreignKey });
    });
    var table = {
        name: name,
        columns: columns,
    };
    return table;
});
var sqlTypeToTSType = function (type) {
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
            throw new Error("Unknown type: " + type);
    }
};
var generateTypeAssignment = function (name, value) {
    return "type " + name + " = " + value + ";";
};
var objectPropAssignment = function (_a, optional) {
    var name = _a[0], value = _a[1];
    if (optional === void 0) { optional = false; }
    return "" + name + (optional ? "?" : "") + ": " + value;
};
var generateObjectLiteral = function (properties) { return "{ " + properties + " }"; };
console.log("table", tables[0]);
var tableDefs = tables
    .map(function (table) {
    var props = table.columns.map(function (col) {
        return objectPropAssignment([
            col.name,
            col.foreignKey ? col.foreignKey.table : sqlTypeToTSType(col.type),
        ], col.notnull ? false : true);
    });
    var objectLiteral = generateObjectLiteral(props.join());
    var assignment = generateTypeAssignment(table.name, objectLiteral);
    return assignment;
})
    .join("\n\n");
var dbDef = generateTypeAssignment("Tables", generateObjectLiteral(tables
    .map(function (table) { return objectPropAssignment([table.name, table.name]); })
    .join(",")));
var format = function (code) {
    return prettier_1.default.format(code, {
        parser: "typescript",
    });
};
var body = tableDefs + "\n\n" + dbDef;
var output = format(body);
fs_1.default.writeFileSync(outputPath, output);
