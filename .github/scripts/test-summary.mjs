// Prints exact test counts as workflow annotations and fails the job when any
// test was skipped or failed. CI must run everything: a test that silently
// skips for lack of Supabase would otherwise look like a pass. Failing tests
// are listed as annotations too, because job logs are not readable without
// authentication.
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

const failures = [];
const clean = (text) =>
  String(text ?? "")
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/\r?\n/g, " ⏎ ")
    .slice(0, 900);

let total;
let passed;
let failed;
let skipped;
if (kind === "vitest") {
  total = json.numTotalTests;
  passed = json.numPassedTests;
  failed = json.numFailedTests;
  skipped = (json.numPendingTests ?? 0) + (json.numTodoTests ?? 0);
  for (const suite of json.testResults ?? []) {
    const name = String(suite.name ?? "")
      .split(/[\\/]/)
      .slice(-2)
      .join("/");
    for (const t of suite.assertionResults ?? []) {
      if (t.status === "failed") {
        failures.push(
          `${name} › ${t.fullName} :: ${clean(t.failureMessages?.[0])}`,
        );
      }
    }
    if (
      suite.status === "failed" &&
      (suite.assertionResults ?? []).length === 0
    ) {
      failures.push(
        `${name} :: suite failed to run :: ${clean(suite.message)}`,
      );
    }
  }
} else {
  const s = json.stats;
  passed = s.expected;
  failed = s.unexpected + s.flaky;
  skipped = s.skipped;
  total = passed + failed + skipped;
  const walk = (suite, trail) => {
    const here = suite.title ? [...trail, suite.title] : trail;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const last = test.results?.[test.results.length - 1];
        if (test.status === "unexpected" || test.status === "flaky") {
          failures.push(
            `${[...here, spec.title].join(" › ")} [${test.projectName}] :: ${clean(last?.error?.message)}`,
          );
        }
      }
    }
    for (const child of suite.suites ?? []) walk(child, here);
  };
  for (const suite of json.suites ?? []) walk(suite, []);
}

for (const f of failures.slice(0, 25)) {
  console.log(`::error title=${label} failing test::${f}`);
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
