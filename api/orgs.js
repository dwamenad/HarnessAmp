import { badRequest, methodNotAllowed, readJsonBody, serverError, unauthorized } from './_http.js';
import { readSessionContext } from './_session.js';
import {
  createOrganization,
  deleteOrganization,
  estimateOrganizationRunUsage,
  getOrganization,
  getOrganizationPlan,
  getOrgUsageForPeriod,
  inviteOrganizationMember,
  listOrganizationMembers,
  listOrganizationsForUser,
  removeOrganizationMember,
  updateOrganization,
  updateOrganizationMember,
  updateOrganizationPlan,
} from './_store.js';

export default async function handler(request, response) {
  try {
    const session = await readSessionContext(request);
    if (!session?.user) {
      unauthorized(response);
      return;
    }

    const orgId = typeof request.query?.orgId === 'string' ? request.query.orgId : null;
    const resource = typeof request.query?.resource === 'string' ? request.query.resource : '';
    const memberId = typeof request.query?.memberId === 'string' ? request.query.memberId : null;

    if (!orgId) {
      if (request.method === 'GET') {
        response.status(200).json({ organizations: await listOrganizationsForUser(session.user.id) });
        return;
      }
      if (request.method === 'POST') {
        const body = await readJsonBody(request);
        if (!body.name || typeof body.name !== 'string') {
          badRequest(response, 'Organization name is required');
          return;
        }
        const organization = await createOrganization(session.user.id, body.name.trim(), {
          plan: body.plan,
          status: body.status,
        });
        response.status(200).json({ organization });
        return;
      }
      methodNotAllowed(response, ['GET', 'POST']);
      return;
    }

    if (!resource) {
      if (request.method === 'GET') {
        const organization = await getOrganization({ organizationId: orgId, userId: session.user.id });
        if (!organization) {
          response.status(404).json({ error: 'Organization not found' });
          return;
        }
        response.status(200).json({ organization });
        return;
      }
      if (request.method === 'PATCH') {
        const body = await readJsonBody(request);
        const organization = await updateOrganization({
          organizationId: orgId,
          userId: session.user.id,
          name: body.name,
          status: body.status,
        });
        if (!organization) {
          response.status(404).json({ error: 'Organization not found' });
          return;
        }
        response.status(200).json({ organization });
        return;
      }
      if (request.method === 'DELETE') {
        const organization = await deleteOrganization({ organizationId: orgId, userId: session.user.id });
        if (!organization) {
          response.status(404).json({ error: 'Organization not found' });
          return;
        }
        response.status(200).json({ organization });
        return;
      }
      methodNotAllowed(response, ['GET', 'PATCH', 'DELETE']);
      return;
    }

    if (resource === 'members') {
      if (request.method === 'GET') {
        response.status(200).json({ members: await listOrganizationMembers({ organizationId: orgId, userId: session.user.id }) });
        return;
      }
      if (request.method === 'POST') {
        const body = await readJsonBody(request);
        const member = await inviteOrganizationMember({
          organizationId: orgId,
          userId: session.user.id,
          email: body.email,
          role: body.role ?? 'viewer',
        });
        response.status(200).json({ member });
        return;
      }
      methodNotAllowed(response, ['GET', 'POST']);
      return;
    }

    if (resource === 'member') {
      if (!memberId) {
        badRequest(response, 'Member id is required');
        return;
      }
      if (request.method === 'PATCH') {
        const body = await readJsonBody(request);
        const member = await updateOrganizationMember({
          organizationId: orgId,
          memberId,
          userId: session.user.id,
          role: body.role,
          status: body.status,
        });
        if (!member) {
          response.status(404).json({ error: 'Member not found' });
          return;
        }
        response.status(200).json({ member });
        return;
      }
      if (request.method === 'DELETE') {
        const member = await removeOrganizationMember({ organizationId: orgId, memberId, userId: session.user.id });
        if (!member) {
          response.status(404).json({ error: 'Member not found' });
          return;
        }
        response.status(200).json({ member });
        return;
      }
      methodNotAllowed(response, ['PATCH', 'DELETE']);
      return;
    }

    if (resource === 'usage') {
      if (request.method !== 'GET') {
        methodNotAllowed(response, 'GET');
        return;
      }
      const usage = await getOrgUsageForPeriod({
        organizationId: orgId,
        userId: session.user.id,
        periodStart: request.query?.periodStart,
        periodEnd: request.query?.periodEnd,
      });
      response.status(200).json({ usage });
      return;
    }

    if (resource === 'plan') {
      if (request.method === 'GET') {
        const plan = await getOrganizationPlan({ organizationId: orgId, userId: session.user.id });
        response.status(200).json({ plan });
        return;
      }
      if (request.method === 'PATCH') {
        const body = await readJsonBody(request);
        const plan = await updateOrganizationPlan({ organizationId: orgId, userId: session.user.id, plan: body.plan });
        response.status(200).json({ plan });
        return;
      }
      methodNotAllowed(response, ['GET', 'PATCH']);
      return;
    }

    if (resource === 'estimate-run') {
      if (request.method !== 'POST') {
        methodNotAllowed(response, 'POST');
        return;
      }
      const body = await readJsonBody(request);
      const entitlement = await estimateOrganizationRunUsage({
        organizationId: orgId,
        userId: session.user.id,
        pack: body.pack,
        benchmark: body.benchmark,
        tier: body.tier,
        runMode: body.runMode ?? body.mode ?? 'sample',
        mutationConfig: body.mutationConfig,
        executionTarget: body.executionTarget,
        ciGate: Boolean(body.ciGate),
      });
      response.status(200).json({ entitlement });
      return;
    }

    badRequest(response, 'Unknown organization resource');
  } catch (error) {
    if (error instanceof Error && /permission denied|membership not found|at least one owner/i.test(error.message)) {
      response.status(403).json({ error: error.message });
      return;
    }
    if (error instanceof Error && /required|invalid/i.test(error.message)) {
      badRequest(response, error.message);
      return;
    }
    serverError(response, error);
  }
}
