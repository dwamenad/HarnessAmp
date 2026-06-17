export async function POST(request) {
  const payload = await request.json();
  const prompt = payload.prompt ?? payload.messages?.at(-1)?.content ?? '';
  const mode = payload.metadata?.mode ?? payload.scenario?.mode ?? inferMode(prompt);

  if (mode === 'stream') {
    return new Response([
      'data: {"text":"Streaming "}\n\n',
      'data: {"text":"AI SDK "}\n\n',
      'data: {"text":"response.","sources":[{"id":"doc-1","title":"Fixture source"}]}\n\n',
      'data: [DONE]\n\n',
    ].join(''), {
      headers: { 'content-type': 'text/event-stream' },
    });
  }

  if (mode === 'tools') {
    return Response.json({
      text: `Tool-backed answer for ${prompt}`,
      toolCalls: [
        { id: 'call_1', name: 'lookupPolicy', arguments: { query: 'refund policy' } },
      ],
      toolResults: [
        { id: 'call_1', toolName: 'lookupPolicy', output: { sourceId: 'refund-policy-2026', allowed: true } },
      ],
      sources: [{ id: 'refund-policy-2026', title: 'Refund Policy 2026' }],
      usage: { inputTokens: 24, outputTokens: 18 },
      metadata: { provider: 'fixture', model: 'test-model' },
      passed: true,
      score: 96
    });
  }

  if (mode === 'structured') {
    return Response.json({
      output: {
        answer: `Structured answer for ${prompt}`,
        confidence: 0.91,
        citations: ['doc-structured-1']
      },
      text: `Structured answer for ${prompt}`,
      citations: [{ id: 'doc-structured-1', claim: 'fixture claim' }],
      metadata: { provider: 'fixture', schema: 'fixture_answer' },
      passed: true,
      score: 94
    });
  }

  return Response.json({
    text: `Chat answer for ${prompt}`,
    sources: [{ id: 'doc-chat-1', title: 'Chat Fixture Source' }],
    usage: { inputTokens: 16, outputTokens: 12 },
    metadata: { provider: 'fixture', model: 'chat-fixture' },
    passed: true,
    score: 92
  });
}

function inferMode(prompt) {
  const text = String(prompt).toLowerCase();
  if (text.includes('stream')) return 'stream';
  if (text.includes('tool')) return 'tools';
  if (text.includes('structured') || text.includes('json')) return 'structured';
  return 'chat';
}
