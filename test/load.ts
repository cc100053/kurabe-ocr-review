import { readFileSync } from "node:fs";
import ts from "typescript";

export function load(file: string, mocks: Record<string, unknown> = {}): any {
  const code = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function("require", "exports", code)((name: string) => {
    if (name in mocks) return mocks[name];
    throw new Error(`Unmocked dependency: ${name}`);
  }, exports);
  return exports;
}

export const selectAll = load("lib/supabase.ts", {
  "server-only": {}, "@supabase/supabase-js": {},
}).selectAll;

export function dbRows(tables: Record<string, object[]>, calls: string[] = []) {
  return { from(table: string) {
    calls.push(table);
    let rows = tables[table] ?? [];
    const query = {
      select() { return query; }, gt() { return query; }, order() { return query; },
      range(from: number, to: number) { rows = rows.slice(from, to + 1); return query; },
      then(resolve: (r: object) => unknown) { return Promise.resolve(resolve({ data: rows, error: null })); },
    };
    return query;
  } };
}
