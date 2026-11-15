import assert from "node:assert/strict";
import { test } from "node:test";
import { reportIssueUrl } from "../src/report.ts";

test("the report opens a new issue in the plugin's own repository with its name and version filled in", () => {
  const url = new URL(
    reportIssueUrl({ repo: "Owner/Plugin", name: "My Plugin", version: "1.2.3", deckyhubVersion: "3.4.0" })!,
  );
  assert.equal(url.origin + url.pathname, "https://github.com/Owner/Plugin/issues/new");
  assert.equal(url.searchParams.get("title"), "My Plugin: ");
  const body = url.searchParams.get("body")!;
  assert.match(body, /\*\*Plugin:\*\* My Plugin 1\.2\.3/);
  assert.match(body, /Reported from DeckyHub 3\.4\.0/);
  assert.match(body, /### What happened/);
});

test("without a version the line has only the name, and a repository that is not owner/name gives no address", () => {
  const body = new URL(reportIssueUrl({ repo: "o/p", name: "P" })!).searchParams.get("body")!;
  assert.match(body, /\*\*Plugin:\*\* P\n/);
  assert.match(body, /\*\*Reported from DeckyHub\*\*/);
  for (const repo of ["x", "../x", "a/b/c", "a/b?c=d", "https://evil.example/a/b"])
    assert.equal(reportIssueUrl({ repo, name: "P" }), null, repo);
});
