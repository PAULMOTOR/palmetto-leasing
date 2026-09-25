import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const src = readFileSync(new URL("../src/lib/crm/vin.ts", import.meta.url), "utf8");
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = await import(`data:text/javascript,${encodeURIComponent(js)}`);

test("a corrected Lamborghini VIN still yields year, make, and the suggested Urus", () => {
  const primary = mod.vehicleFromNhtsa({
    ErrorCode: "2,14",
    Make: "LAMBORGHINI",
    Model: "",
    ModelYear: "2023",
    Trim: "",
    Series: "",
    SuggestedVIN: "ZPBUB3ZL1PLA26128",
  });
  const suggested = mod.vehicleFromNhtsa({
    ErrorCode: "1",
    Make: "LAMBORGHINI",
    Model: "URUS",
    ModelYear: "2023",
    Series: "S",
    Trim: "",
  });
  const decoded = mod.mergeNhtsa(primary, suggested);
  assert.equal(decoded.ok, true);
  assert.equal(decoded.year, 2023);
  assert.equal(decoded.make, "LAMBORGHINI");
  assert.equal(decoded.model, "URUS");
  assert.equal(decoded.trim, "S");
  assert.match(decoded.note, /not changed/);
});

test("year and make alone are a successful decode", () => {
  const decoded = mod.mergeNhtsa(
    mod.vehicleFromNhtsa({ Make: "LAMBORGHINI", ModelYear: "2023", Model: "" }),
    null,
  );
  assert.equal(decoded.ok, true);
  assert.equal(decoded.model, undefined);
});
