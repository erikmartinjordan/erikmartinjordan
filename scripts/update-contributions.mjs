#!/usr/bin/env node

const login = process.env.GH_LOGIN;
const token = process.env.GH_TOKEN;
const profileToken = process.env.PROFILE_TOKEN;

if (!login || !token) {
  console.error("Missing GH_LOGIN or GH_TOKEN environment variables.");
  process.exit(1);
}

if (!profileToken) {
  console.error("Missing PROFILE_TOKEN environment variable.");
  process.exit(1);
}

const endpoint = "https://api.github.com/graphql";

async function gql(query, variables, attempts = 4) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "update-contributions",
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });

      const text = await res.text();

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      if (!text) {
        throw new Error("Empty response body");
      }

      const json = JSON.parse(text);
      if (json.errors) {
        throw new Error(JSON.stringify(json.errors));
      }
      return json.data;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
        console.warn(`GraphQL request failed (attempt ${attempt}/${attempts}): ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
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

const formatted = String(total).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const next = `${formatted} total contributions`;

const headers = {
  Authorization: `bearer ${profileToken}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "update-contributions",
};

const current = await fetch("https://api.github.com/user", { headers });
if (!current.ok) {
  throw new Error(`Failed to read profile: ${current.status} ${await current.text()}`);
}

const { bio } = await current.json();

if (bio === next) {
  console.log(`Bio already up to date: ${next}`);
} else {
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
