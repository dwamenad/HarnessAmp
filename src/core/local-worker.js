export async function runLocalApiWorker(options = {}) {
  const {
    apiUrl = 'http://127.0.0.1:3000',
    projectId,
    workerId = `harnessamp-worker-${process.pid ?? 'local'}`,
    once = false,
    intervalMs = 2000,
    maxJobs = Infinity,
    workerToken = process.env.WORKER_SERVICE_TOKEN,
    fetchImpl = globalThis.fetch,
    log = () => {},
    sleep = defaultSleep,
  } = options;

  if (!projectId) throw new Error('harnessamp worker requires --project-id.');
  if (typeof fetchImpl !== 'function') throw new Error('harnessamp worker requires fetch support.');

  let processed = 0;
  let polls = 0;

  while (processed < maxJobs) {
    polls += 1;
    const jobs = await listClaimableJobs({ apiUrl, projectId, workerToken, fetchImpl });
    if (!jobs.length) {
      if (once) break;
      await sleep(intervalMs);
      continue;
    }

    for (const job of jobs) {
      if (processed >= maxJobs) break;
      const result = await runJob({ apiUrl, projectId, jobId: job.id, workerId, workerToken, fetchImpl });
      processed += 1;
      log(`job ${result.id} ${result.status}${result.reportId ? ` report=${result.reportId}` : ''}`);
    }

    if (once) break;
  }

  return { processed, polls };
}

async function listClaimableJobs({ apiUrl, projectId, workerToken, fetchImpl }) {
  const url = new URL('/api/jobs', normalizeApiUrl(apiUrl));
  url.searchParams.set('projectId', projectId);
  url.searchParams.set('status', 'queued,retrying');
  const response = await fetchWorkerUrl(fetchImpl, url, `Worker job poll failed for ${url.origin}`, {
    headers: workerHeaders(workerToken),
  });
  if (!response.ok) {
    throw new Error(`Worker job poll failed with HTTP ${response.status}`);
  }
  const payload = await response.json();
  return Array.isArray(payload.jobs) ? payload.jobs : [];
}

async function runJob({ apiUrl, projectId, jobId, workerId, workerToken, fetchImpl }) {
  const url = new URL(`/api/jobs/${encodeURIComponent(jobId)}`, normalizeApiUrl(apiUrl));
  url.searchParams.set('action', 'run');
  const response = await fetchWorkerUrl(fetchImpl, url, `Worker job run failed for ${jobId}`, {
    method: 'POST',
    headers: workerHeaders(workerToken, { 'content-type': 'application/json' }),
    body: JSON.stringify({ projectId, workerId }),
  });
  if (!response.ok) {
    throw new Error(`Worker job run failed for ${jobId} with HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchWorkerUrl(fetchImpl, url, context, init = undefined) {
  try {
    return await fetchImpl(url, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${context}: ${message}`);
  }
}

function workerHeaders(workerToken, headers = {}) {
  const normalized = typeof workerToken === 'string' && workerToken.trim() ? workerToken.trim() : null;
  return {
    ...headers,
    ...(normalized ? { authorization: `Bearer ${normalized}` } : {}),
  };
}

function normalizeApiUrl(value) {
  const text = String(value || '').trim();
  return text.endsWith('/') ? text : `${text}/`;
}

function defaultSleep(intervalMs) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(intervalMs) || 0)));
}
