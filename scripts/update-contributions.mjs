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
      "User-Agent": "update-contributions",
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(JSON.stringify(json.errors ?? json));
  }
  return json.data;
}

const QUERY = `
  query ($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
        }
      }
    }
  }
`;

const { user } = await gql(QUERY, { login });
const total = user.contributionsCollection.contributionCalendar.totalContributions;

const formatted = total.toLocaleString("en-US");
const readmePath = fileURLToPath(new URL("../README.md", import.meta.url));

const START = "<!-- contributions:start -->";
const END = "<!-- contributions:end -->";
const block = `${START}\n**${formatted}** contributions in the last year\n${END}`;

const readme = await readFile(readmePath, "utf8");
const pattern = new RegExp(`${START}[\\s\\S]*?${END}`);

if (!pattern.test(readme)) {
  console.error("Could not find the contributions markers in README.md");
  process.exit(1);
}

await writeFile(readmePath, readme.replace(pattern, block));
console.log(`Contributions in the last year: ${formatted}`);
