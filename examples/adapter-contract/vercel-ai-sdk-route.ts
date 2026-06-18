import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const runTokens = new Set<string>();

export async function POST(request: Request) {
  const token = request.headers.get('x-harnessamp-run-token') ?? '';
  if (!token) return Response.json({ error: 'missing_run_token', retryable: false }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json', retryable: false }, { status: 400 });
  }

  if (body?.preflight === true && body?.type === 'harnessamp_preflight') {
    runTokens.add(token);
    return Response.json({ ok: true });
  }

  if (!runTokens.has(token)) return Response.json({ error: 'invalid_run_token', retryable: false }, { status: 403 });
  if (!body?.jobId || !body?.pack) return Response.json({ error: 'contract_mismatch', retryable: false }, { status: 400 });

  try {
    const scenario = body.pack?.harness?.scenarios?.[0] ?? {};
    const result = await generateText({
      model: openai('gpt-4.1-mini'),
      prompt: scenario.objective ?? 'Respond safely.',
    });
    return Response.json({
      observations: [{
        runId: `${body.jobId}:ai-sdk`,
        taskId: scenario.id ?? 'scenario',
        outputText: result.text,
        errors: [],
        metadata: {
          passed: true,
          model: 'gpt-4.1-mini',
        },
      }],
    });
  } catch {
    return Response.json({ error: 'adapter_error', retryable: true }, { status: 500 });
  }
}
