const memoryReports = globalThis.__harnessAmpReports ?? new Map();
const memoryEvents = globalThis.__harnessAmpEvents ?? [];

globalThis.__harnessAmpReports = memoryReports;
globalThis.__harnessAmpEvents = memoryEvents;

const kvUrl = process.env.KV_REST_API_URL;
const kvToken = process.env.KV_REST_API_TOKEN;

export async function saveReport(report) {
  const id = report.id ?? createId(report);
  const payload = { ...report, id };

  if (kvUrl && kvToken) {
    await kvRequest(['set', `report:${id}`, JSON.stringify(payload)]);
    return { id, storage: 'kv' };
  }

  memoryReports.set(id, payload);
  return { id, storage: 'memory' };
}

export async function getReport(id) {
  if (kvUrl && kvToken) {
    const value = await kvRequest(['get', `report:${id}`]);
    return typeof value === 'string' ? JSON.parse(value) : value;
  }

  return memoryReports.get(id) ?? null;
}

export async function saveEvent(event) {
  const payload = {
    ...event,
    receivedAt: new Date().toISOString(),
  };

  if (kvUrl && kvToken) {
    const key = `event:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    await kvRequest(['set', key, JSON.stringify(payload)]);
    return { storage: 'kv' };
  }

  memoryEvents.push(payload);
  memoryEvents.splice(0, Math.max(0, memoryEvents.length - 500));
  return { storage: 'memory' };
}

async function kvRequest(command) {
  const response = await fetch(`${kvUrl}/pipeline`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${kvToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify([command]),
  });

  if (!response.ok) {
    throw new Error(`KV request failed with HTTP ${response.status}`);
  }

  const [result] = await response.json();
  if (result.error) throw new Error(result.error);
  return result.result;
}

function createId(report) {
  const source = `${report?.suite?.project ?? 'report'}-${Date.now()}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return `ha-${hash.toString(16)}`;
}
