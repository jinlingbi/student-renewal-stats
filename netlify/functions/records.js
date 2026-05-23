import { getStore } from "@netlify/blobs";

const STORE_NAME = "student-renewal-records";
const RECORDS_KEY = "records";

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS"
};

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return response(204, {});
  }

  try {
    if (event.httpMethod === "GET") {
      return response(200, { records: await readRecords() });
    }

    if (event.httpMethod === "POST") {
      const payload = parseJson(event.body);
      const records = await readRecords();
      const record = normalizeRecord(payload);
      validateRecord(record);

      const index = records.findIndex((item) => item.id === record.id);
      if (index >= 0) records[index] = record;
      else records.unshift(record);

      await writeRecords(records);
      return response(200, { records });
    }

    if (event.httpMethod === "DELETE") {
      const params = event.queryStringParameters || {};
      if (params.all === "1") {
        await writeRecords([]);
        return response(200, { records: [] });
      }

      if (!params.id) {
        return response(400, { error: "Missing record id" });
      }

      const records = (await readRecords()).filter((item) => item.id !== params.id);
      await writeRecords(records);
      return response(200, { records });
    }

    return response(405, { error: "Method not allowed" });
  } catch (error) {
    return response(error.statusCode || 500, { error: error.message || "Server error" });
  }
};

async function readRecords() {
  const store = getStore(STORE_NAME);
  const text = await store.get(RECORDS_KEY, { type: "text" });
  if (!text) return [];

  try {
    const records = JSON.parse(text);
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

async function writeRecords(records) {
  const store = getStore(STORE_NAME);
  await store.set(RECORDS_KEY, JSON.stringify(records));
}

function normalizeRecord(payload) {
  return {
    id: payload.id || crypto.randomUUID(),
    studentId: clean(payload.studentId),
    lp: clean(payload.lp),
    continent: clean(payload.continent),
    renewType: clean(payload.renewType),
    newPackageTotal: number(payload.newPackageTotal),
    newLessonPrice: number(payload.newLessonPrice),
    newBeans: number(payload.newBeans),
    renewPackageTotal: number(payload.renewPackageTotal),
    renewLessonPrice: number(payload.renewLessonPrice),
    extraGiftLessons: number(payload.extraGiftLessons),
    note: clean(payload.note),
    updatedAt: new Date().toISOString()
  };
}

function validateRecord(record) {
  const required = ["studentId", "lp", "continent", "renewType"];
  const missing = required.filter((key) => !record[key]);
  if (missing.length) {
    const error = new Error(`Missing required fields: ${missing.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }
}

function parseJson(body) {
  try {
    return JSON.parse(body || "{}");
  } catch {
    const error = new Error("Invalid request body");
    error.statusCode = 400;
    throw error;
  }
}

function clean(value) {
  return String(value || "").trim();
}

function number(value) {
  return Number(value || 0);
}

function response(statusCode, body) {
  return {
    statusCode,
    headers,
    body: statusCode === 204 ? "" : JSON.stringify(body)
  };
}
