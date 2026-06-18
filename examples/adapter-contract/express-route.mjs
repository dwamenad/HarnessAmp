import express from 'express';

const app = express();
const runTokens = new Set();

app.use(express.json({ limit: '1mb' }));

app.post('/api/harnessamp/agent', async (request, response) => {
  const token = request.get('x-harnessamp-run-token') ?? '';
  if (!token) return response.status(401).json({ error: 'missing_run_token', retryable: false });

  const body = request.body;
  if (body?.preflight === true && body?.type === 'harnessamp_preflight') {
    runTokens.add(token);
    return response.json({ ok: true });
  }

  if (!runTokens.has(token)) return response.status(403).json({ error: 'invalid_run_token', retryable: false });
  if (!body?.jobId || !body?.pack) return response.status(400).json({ error: 'contract_mismatch', retryable: false });

  try {
    const outputText = await callAgent(body);
    return response.json({
      observations: [{
        runId: `${body.jobId}:express`,
        taskId: body.pack?.harness?.scenarios?.[0]?.id ?? 'scenario',
        outputText,
        errors: [],
        metadata: { passed: true },
      }],
    });
  } catch {
    return response.status(500).json({ error: 'adapter_error', retryable: true });
  }
});

async function callAgent(_scenarioRequest) {
  return 'Placeholder agent response.';
}

app.listen(process.env.PORT ?? 3000);
