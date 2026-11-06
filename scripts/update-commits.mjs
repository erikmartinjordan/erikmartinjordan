#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const login = process.env.GH_LOGIN;
const token = process.env.GH_TOKEN;

if (!login || !token) {
  console.error("Missing GH_LOGIN or GH_TOKEN environment variables.");
  process.exit(1);
}

const endpoint = "https://api.github.com/graphql";

async function gql(query, variables) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "update-commits",
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(JSON.stringify(json.errors ?? json));
  }
  return json.data;
}

const YEARS_QUERY = `
  query ($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionYears
      }
    }
  }
`;

const YEAR_QUERY = `
  query ($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        totalCommitContributions
      }
    }
  }
`;

const { user } = await gql(YEARS_QUERY, { login });
const years = user.contributionsCollection.contributionYears ?? [];

let total = 0;
for (const year of years) {
  const data = await gql(YEAR_QUERY, {
    login,
    from: `${year}-01-01T00:00:00Z`,
    to: `${year}-12-31T23:59:59Z`,
  });
  total += data.user.contributionsCollection.totalCommitContributions;
}

const formatted = total.toLocaleString("en-US");
const readmePath = fileURLToPath(new URL("../README.md", import.meta.url));

const START = "<!-- commits:start -->";
const END = "<!-- commits:end -->";
const block = `${START}\n**Total commits:** ${formatted}\n${END}`;

const readme = await readFile(readmePath, "utf8");
const pattern = new RegExp(`${START}[\\s\\S]*?${END}`);

if (!pattern.test(readme)) {
  console.error("Could not find the commits markers in README.md");
  process.exit(1);
}

await writeFile(readmePath, readme.replace(pattern, block));
console.log(`Total commits: ${formatted}`);
