import assert from "node:assert/strict";
import test from "node:test";
import { parseGithubRepositories, githubRepositoryMetadata } from "./githubRepositories";

test("unknown and no-repository answers allow checkout without links", () => {
  assert.deepEqual(parseGithubRepositories(undefined, undefined), { status: "unknown", urls: [] });
  assert.deepEqual(parseGithubRepositories("no", []), { status: "no", urls: [] });
});

test("yes requires a link, while blank extra rows are ignored", () => {
  assert.throws(() => parseGithubRepositories("yes", [" "]), /at least one/);
  assert.deepEqual(parseGithubRepositories("yes", [" https://github.com/example/project.git/ ", ""]), {
    status: "yes", urls: ["https://github.com/example/project"],
  });
  assert.equal(parseGithubRepositories("unknown", ["https://github.com/example/project"]).status, "yes");
});

test("only GitHub repository URLs without credentials or query strings are accepted", () => {
  for (const url of [
    "https://example.com/team/repo", "https://github.com/team",
    "https://github.com/team/repo/issues", "http://github.com/team/repo",
    "https://github.com.evil.com/team/repo", "https://token@github.com/team/repo",
    "https://github.com/team/repo?token=private", "javascript:alert(1)",
  ]) assert.throws(() => parseGithubRepositories("yes", [url]), /GitHub repository/);
  assert.throws(() => parseGithubRepositories("no", ["https://github.com/team/repo"]), /Yes/);
});

test("100 links fit Stripe metadata limits and are retained in full", () => {
  const urls = Array.from({ length: 100 }, (_, i) =>
    `https://github.com/${"a".repeat(39)}/${String(i).padStart(3, "0")}${"b".repeat(97)}`);
  const parsed = parseGithubRepositories("yes", urls);
  const metadata = githubRepositoryMetadata(parsed);
  assert.ok(Object.keys(metadata).length + 9 <= 50);
  assert.ok(Object.values(metadata).every((value) => value.length <= 500));
  assert.deepEqual(Object.entries(metadata).filter(([key]) => key.startsWith("github_repos_"))
    .flatMap(([, value]) => value.split("\n")), urls);
  assert.throws(() => parseGithubRepositories("yes", [...urls, urls[0]]), /100/);
});