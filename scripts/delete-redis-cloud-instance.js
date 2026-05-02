const API_BASE_URL = "https://api.redislabs.com/v1";
const DEFAULT_SUBSCRIPTION_ID = "3246065";
const DEFAULT_DATABASE_ID = "14263116";

function readArgs(argv) {
  const args = {
    subscriptionId: process.env.REDIS_CLOUD_SUBSCRIPTION_ID ?? DEFAULT_SUBSCRIPTION_ID,
    databaseId: process.env.REDIS_CLOUD_DATABASE_ID ?? DEFAULT_DATABASE_ID,
    target: process.env.REDIS_CLOUD_DELETE_TARGET ?? "database",
    execute: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--execute") args.execute = true;
    if (arg === "--target") args.target = argv[index + 1];
    if (arg === "--subscription-id") args.subscriptionId = argv[index + 1];
    if (arg === "--database-id") args.databaseId = argv[index + 1];
  }

  return args;
}

function usage() {
  return [
    "Usage:",
    "  npm run redis-cloud:delete -- --target database --execute",
    "  npm run redis-cloud:delete -- --target subscription --execute",
    "",
    "Required env vars:",
    "  REDIS_CLOUD_API_KEY",
    "  REDIS_CLOUD_API_SECRET",
    "",
    "Optional overrides:",
    "  REDIS_CLOUD_SUBSCRIPTION_ID",
    "  REDIS_CLOUD_DATABASE_ID",
    "  REDIS_CLOUD_DELETE_TARGET=database|subscription",
    "",
    "Defaults target this demo:",
    `  subscription ${DEFAULT_SUBSCRIPTION_ID}`,
    `  database ${DEFAULT_DATABASE_ID}`,
    "",
    "Safety:",
    "  Omit --execute for a dry run."
  ].join("\n");
}

function requireCredentials() {
  const apiKey = process.env.REDIS_CLOUD_API_KEY;
  const apiSecret = process.env.REDIS_CLOUD_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error(`Missing Redis Cloud API credentials.\n\n${usage()}`);
  }

  return { apiKey, apiSecret };
}

async function redisCloudRequest(path, { apiKey, apiSecret, method = "GET" }) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "x-api-key": apiKey,
      "x-api-secret-key": apiSecret
    }
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(`Redis Cloud API ${method} ${path} failed (${response.status}): ${JSON.stringify(body)}`);
  }

  return body;
}

function deletePath({ target, subscriptionId, databaseId }) {
  if (target === "database") {
    return `/fixed/subscriptions/${subscriptionId}/databases/${databaseId}`;
  }
  if (target === "subscription") {
    return `/fixed/subscriptions/${subscriptionId}`;
  }
  throw new Error(`Unsupported --target "${target}". Use "database" or "subscription".`);
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const path = deletePath(args);

  console.log(`Redis Cloud delete target: ${args.target}`);
  console.log(`Subscription ID: ${args.subscriptionId}`);
  if (args.target === "database") console.log(`Database ID: ${args.databaseId}`);
  console.log(`API path: DELETE ${path}`);

  if (!args.execute) {
    console.log("\nDry run only. Re-run with --execute to delete.");
    return;
  }

  const credentials = requireCredentials();
  const task = await redisCloudRequest(path, { ...credentials, method: "DELETE" });
  console.log("\nDelete request submitted.");
  console.log(JSON.stringify(task, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
