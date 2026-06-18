const runTokens = new Set<string>();

export async function POST(request: Request) {
  const token = request.headers.get('x-harnessamp-run-token') ?? '';
  if (!token) return jsonError('missing_run_token', 401);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonError('invalid_json', 400);
  }

  if (body?.preflight === true && body?.type === 'harnessamp_preflight') {
    runTokens.add(token);
    return Response.json({ ok: true });
  }

  if (!runTokens.has(token)) return jsonError('invalid_run_token', 403);
  if (!body?.jobId || !body?.pack) return jsonError('contract_mismatch', 400);

  try {
    const answer = await callAgent(body);
    return Response.json({
      observations: [{
        runId: `${body.jobId}:doctor`,
        taskId: body.pack?.harness?.scenarios?.[0]?.id ?? 'scenario',
        outputText: answer,
        errors: [],
        metadata: { passed: true },
      }],
    });
  } catch {
    return jsonError('adapter_error', 500);
  }
}

async function callAgent(_request: any) {
  return 'Placeholder agent response.';
}

function jsonError(code: string, status: number) {
  return Response.json({ error: code, code, retryable: status >= 500 }, { status });
}
