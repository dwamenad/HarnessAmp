import { badRequest, methodNotAllowed, readJsonBody, serverError, unauthorized } from './_http.js';
import { readSessionContext } from './_session.js';
import {
  createBenchmarkVersion,
  createPromotionCandidate,
  editBenchmarkVersion,
  getBenchmarkPack,
  listBenchmarkPacks,
  promoteBenchmarkCandidate,
  reviewBenchmarkVersion,
} from './_store.js';

export default async function handler(request, response) {
  try {
    const session = await readSessionContext(request);
    if (!session?.user) {
      unauthorized(response);
      return;
    }

    if (request.method === 'GET') {
      const benchmarkId = stringQuery(request.query?.id);
      if (benchmarkId) {
        const detail = await getBenchmarkPack({
          benchmarkId,
          userId: session.user.id,
        });
        if (!detail) {
          response.status(404).json({ error: 'Benchmark pack not found' });
          return;
        }
        response.status(200).json(detail);
        return;
      }

      const projectId = stringQuery(request.query?.projectId);
      if (!projectId) {
        badRequest(response, 'projectId is required');
        return;
      }
      const benchmarks = await listBenchmarkPacks({
        projectId,
        userId: session.user.id,
      });
      response.status(200).json({ benchmarks });
      return;
    }

    if (request.method === 'POST') {
      const action = stringQuery(request.query?.action) || 'create';
      const body = await readJsonBody(request);

      if (action === 'create') {
        const projectId = stringQuery(request.query?.projectId) || stringQuery(body.projectId);
        if (!projectId) {
          badRequest(response, 'projectId is required');
          return;
        }
        if (!body.pack) {
          badRequest(response, 'Benchmark pack payload is required');
          return;
        }
        const result = await createBenchmarkVersion({
          projectId,
          userId: session.user.id,
          benchmarkId: stringQuery(body.benchmarkId) || null,
          pack: body.pack,
          source: body.source || 'manual',
        });
        response.status(200).json(result);
        return;
      }

      if (action === 'review') {
        const versionId = stringQuery(request.query?.versionId) || stringQuery(body.versionId);
        if (!versionId || !body.decision) {
          badRequest(response, 'versionId and decision are required');
          return;
        }
        const result = await reviewBenchmarkVersion({
          versionId,
          userId: session.user.id,
          decision: body.decision,
          comments: body.comments || '',
        });
        response.status(200).json(result);
        return;
      }

      if (action === 'edit') {
        const versionId = stringQuery(request.query?.versionId) || stringQuery(body.versionId);
        if (!versionId || !body.edits) {
          badRequest(response, 'versionId and edits are required');
          return;
        }
        const result = await editBenchmarkVersion({
          versionId,
          userId: session.user.id,
          edits: body.edits,
        });
        response.status(200).json(result);
        return;
      }

      if (action === 'promotion') {
        const versionId = stringQuery(request.query?.versionId) || stringQuery(body.versionId);
        if (!versionId || !body.case) {
          badRequest(response, 'versionId and case are required');
          return;
        }
        const candidate = await createPromotionCandidate({
          versionId,
          userId: session.user.id,
          sourceType: body.sourceType || 'report',
          sourceId: body.sourceId || null,
          caseData: body.case,
          visibility: body.visibility || 'visible',
          notes: body.notes || '',
        });
        response.status(200).json({ candidate });
        return;
      }

      if (action === 'promote') {
        const candidateId = stringQuery(request.query?.candidateId) || stringQuery(body.candidateId);
        if (!candidateId) {
          badRequest(response, 'candidateId is required');
          return;
        }
        const result = await promoteBenchmarkCandidate({
          candidateId,
          userId: session.user.id,
        });
        response.status(200).json(result);
        return;
      }

      badRequest(response, 'Unknown benchmark action');
      return;
    }

    methodNotAllowed(response, ['GET', 'POST']);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid benchmark pack:')) {
      response.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.message.includes('Unknown benchmark review decision')) {
      response.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.message.includes('golden case visibility')) {
      response.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.message.includes('not found')) {
      response.status(404).json({ error: error.message });
      return;
    }
    if (
      error instanceof Error
      && (error.message.includes('Only owners and maintainers') || error.message.includes('membership'))
    ) {
      response.status(403).json({ error: error.message });
      return;
    }
    serverError(response, error);
  }
}

function stringQuery(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}
