import dns from "dns";
import fs from "fs";
import path from "path";
import os from "os";

// Configure DNS resolution for Windows Node.js network stability
dns.setDefaultResultOrder("ipv4first");

// Read firebase-applet-config.json
const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
let config: any = {};
if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

// Read CLI access token from configstore
const cliConfigPath = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
if (!fs.existsSync(cliConfigPath)) {
  console.error("Firebase CLI config not found at:", cliConfigPath);
  process.exit(1);
}
const cliConfig = JSON.parse(fs.readFileSync(cliConfigPath, "utf-8"));
const accessToken = cliConfig.tokens?.access_token;

if (!accessToken) {
  console.error("No access token found in firebase-tools.json");
  process.exit(1);
}

const projectId = config.projectId || "gen-lang-client-0731527386";
const databaseId = config.firestoreDatabaseId || "ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa";
const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;

const PRESERVED_EMAIL = "developertesting336@gmail.com";

const COLLECTIONS_TO_PURGE = [
  "clients",
  "schedules",
  "studios",
  "networks",
  "franchises",
  "sessions",
  "exerciseLogs",
  "auditLogs",
  "announcements",
  "backfill_review",
];

async function fetchWithRetry(url: string, options: any, retries = 10, delayMs = 1000): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429 || res.status >= 500) {
        if (attempt === retries) return res;
        await new Promise((r) => setTimeout(r, delayMs * attempt));
        continue;
      }
      return res;
    } catch (err: any) {
      if (attempt === retries) throw err;
      console.warn(`  [Network Warning] ${err.code || err.message || err}. Retrying (${attempt}/${retries})...`);
      await new Promise((r) => setTimeout(r, delayMs * attempt));
    }
  }
  throw new Error(`Failed request after ${retries} attempts to ${url}`);
}

async function listDocuments(collectionName: string) {
  let documents: any[] = [];
  let pageToken = "";

  do {
    const url = `${baseUrl}/${collectionName}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const res = await fetchWithRetry(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      // If collection doesn't exist or is empty, REST API may return 404
      if (res.status === 404) {
        return [];
      }
      throw new Error(`Failed to list ${collectionName}: ${res.status} ${errText}`);
    }

    const data = await res.json();
    if (data.documents && Array.isArray(data.documents)) {
      documents = documents.concat(data.documents);
    }
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return documents;
}

async function deleteDocumentByName(docName: string) {
  const url = `https://firestore.googleapis.com/v1/${docName}`;
  const res = await fetchWithRetry(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok && res.status !== 404) {
    const errText = await res.text();
    console.error(`Failed to delete document ${docName}: ${res.status} ${errText}`);
  }
  await new Promise((r) => setTimeout(r, 10));
}

async function purgeCollection(collectionName: string) {
  console.log(`Checking collection: "${collectionName}"...`);
  const docs = await listDocuments(collectionName);
  if (docs.length === 0) {
    console.log(`Collection "${collectionName}" is empty.`);
    return;
  }

  console.log(`Found ${docs.length} documents in "${collectionName}". Purging...`);
  let count = 0;
  for (const doc of docs) {
    await deleteDocumentByName(doc.name);
    count++;
    if (count % 20 === 0 || count === docs.length) {
      console.log(`  Purged ${count}/${docs.length} documents from "${collectionName}"`);
    }
  }
  console.log(`Successfully purged collection: "${collectionName}"`);
}

async function purgeTrainersExceptAdmin() {
  console.log("Checking trainers collection...");
  const docs = await listDocuments("trainers");
  if (docs.length === 0) {
    console.log("Trainers collection is empty.");
    return;
  }

  let deletedCount = 0;
  let preservedCount = 0;

  for (const doc of docs) {
    const fields = doc.fields || {};
    const emailField = fields.email?.stringValue || fields.email?.value || "";
    const email = emailField.toLowerCase().trim();
    const fullName = fields.fullName?.stringValue || fields.name?.stringValue || "Unknown";
    const docId = doc.name.split("/").pop();

    if (email === PRESERVED_EMAIL.toLowerCase()) {
      console.log(`PRESERVING Admin Trainer Document: ID ${docId} (Email: ${emailField}, Name: ${fullName})`);
      preservedCount++;
      continue;
    }

    console.log(`Deleting Trainer Document: ID ${docId} (Email: ${emailField || "N/A"}, Name: ${fullName})`);
    await deleteDocumentByName(doc.name);
    deletedCount++;
  }

  console.log(`Trainers purge summary: Deleted ${deletedCount}, Preserved ${preservedCount} (${PRESERVED_EMAIL}).`);
}

async function main() {
  console.log("=== STARTING JOURNEY SYSTEM DATABASE PURGE ===");
  console.log(`Preserved Administrator Email: ${PRESERVED_EMAIL}`);
  console.log(`Database ID: ${databaseId}`);

  try {
    for (const col of COLLECTIONS_TO_PURGE) {
      await purgeCollection(col);
    }
    await purgeTrainersExceptAdmin();
    console.log("\n=== DATABASE PURGE COMPLETE ===");
  } catch (error) {
    console.error("Database purge failed:", error);
    process.exit(1);
  }
  process.exit(0);
}

main();
