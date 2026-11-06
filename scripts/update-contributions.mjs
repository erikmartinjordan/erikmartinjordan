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
        contributionCalendar {
          totalContributions
        }
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
  total += data.user.contributionsCollection.contributionCalendar.totalContributions;
}

const formatted = total.toLocaleString("en-US");
const readmePath = fileURLToPath(new URL("../README.md", import.meta.url));

const START = "<!-- contributions:start -->";
const END = "<!-- contributions:end -->";
const block = `${START}\n**${formatted}** total contributions\n${END}`;

const readme = await readFile(readmePath, "utf8");
const pattern = new RegExp(`${START}[\\s\\S]*?${END}`);

if (!pattern.test(readme)) {
  console.error("Could not find the contributions markers in README.md");
  process.exit(1);
}

await writeFile(readmePath, readme.replace(pattern, block));
console.log(`Total contributions: ${formatted}`);

const profileToken = process.env.PROFILE_TOKEN;
if (profileToken) {
  const headers = {
    Authorization: `bearer ${profileToken}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "update-contributions",
  };

  const res = await fetch("https://api.github.com/user", { headers });
  if (!res.ok) {
    throw new Error(`Failed to read profile: ${res.status} ${await res.text()}`);
  }

  const { bio } = await res.json();
  const base = (bio ?? "").replace(/\s*·\s*[\d,]+\s+contributions$/, "").trim();
  let next = base ? `${base} · ${formatted} contributions` : `${formatted} contributions`;
  if (next.length > 160) next = next.slice(0, 160);

  if (next !== bio) {
    const patch = await fetch("https://api.github.com/user", {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ bio: next }),
    });
    if (!patch.ok) {
      throw new Error(`Failed to update bio: ${patch.status} ${await patch.text()}`);
    }
    console.log(`Bio updated: ${next}`);
  }
}
