// Prints exact test counts as workflow annotations and fails the job when any
// test was skipped or failed. CI must run everything: a test that silently
// skips for lack of Supabase would otherwise look like a pass.
//
//   node test-summary.mjs vitest|playwright <label> <results.json>
import fs from "node:fs";

const [kind, label, file] = process.argv.slice(2);

if (!fs.existsSync(file)) {
  console.log(
    `::error title=${label} tests::no results file (${file}) — the run did not finish`,
  );
  process.exit(1);
}
const json = JSON.parse(fs.readFileSync(file, "utf8"));

let total;
let passed;
let failed;
let skipped;
if (kind === "vitest") {
  total = json.numTotalTests;
  passed = json.numPassedTests;
  failed = json.numFailedTests;
  skipped = (json.numPendingTests ?? 0) + (json.numTodoTests ?? 0);
} else {
  const s = json.stats;
  passed = s.expected;
  failed = s.unexpected + s.flaky;
  skipped = s.skipped;
  total = passed + failed + skipped;
}

const line = `total=${total} passed=${passed} failed=${failed} skipped=${skipped}`;
console.log(`::notice title=${label} tests::${line}`);
console.log(`${label}: ${line}`);
if (failed > 0 || skipped > 0 || total === 0) {
  console.log(
    `::error title=${label} tests::failed or skipped tests are not allowed in CI (${line})`,
  );
  process.exit(1);
}
