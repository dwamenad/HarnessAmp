const runTokens = new Set();

export async function handleHarnessAmpRequest(request) {
  const token = request.headers.get('x-harnessamp-run-token') ?? '';
  if (!token) return json({ error: 'missing_run_token', retryable: false }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json', retryable: false }, 400);
  }

  if (body?.preflight === true && body?.type === 'harnessamp_preflight') {
    runTokens.add(token);
    return json({ ok: true, contractVersion: 'harnessamp_http_runner_v1' });
  }

  if (!runTokens.has(token)) return json({ error: 'invalid_run_token', retryable: false }, 403);
  if (!body?.jobId || !body?.pack) return json({ error: 'contract_mismatch', retryable: false }, 400);

  try {
    const outputText = await callAgent(body);
    return json({
      observations: [{
        runId: `${body.jobId}:fetch`,
        taskId: body.pack?.harness?.scenarios?.[0]?.id ?? 'scenario',
        outputText,
        errors: [],
        metadata: { passed: true },
      }],
    });
  } catch {
    return json({ error: 'adapter_error', retryable: true }, 500);
  }
}

async function callAgent(_scenarioRequest) {
  return 'Placeholder agent response.';
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
