import assert from 'node:assert/strict';
import test from 'node:test';

import { catalogCardRows, domainPackCatalog } from '../src/v2/domain-pack-catalog.js';

test('CustomerCareGuard and LegalGuard expose implementation-grade v2 manifests', () => {
  const customerCare = domainPackCatalog.find((pack) => pack.id === 'customercare-guard');
  const instructionDoctor = domainPackCatalog.find((pack) => pack.id === 'instruction-manifest-doctor');
  const legal = domainPackCatalog.find((pack) => pack.id === 'legal-guard');
  const retrieval = domainPackCatalog.find((pack) => pack.id === 'retrievalguard-core');
  const personalAgent = domainPackCatalog.find((pack) => pack.id === 'personalagentguard-core');
  const runtimeGuard = domainPackCatalog.find((pack) => pack.id === 'harnessruntimeguard-core');

  assert.equal(retrieval.name, 'RetrievalGuard');
  assert.equal(retrieval.contractCount, 10);
  assert.equal(retrieval.scenarioCount, 400);
  assert.equal(retrieval.generatedMatrix.smoke.scenarioCount, 400);
  assert.equal(retrieval.generatedMatrix.core.scenarioCount, 4200);
  assert.equal(retrieval.generatedMatrix.nightly.scenarioCount, 63000);
  assert.ok(retrieval.primarySafetyAxes.includes('citation_fidelity'));
  assert.ok(retrieval.primarySafetyAxes.includes('tool_failure_transparency'));
  assert.ok(retrieval.failureTaxonomy.some((failure) => failure.id === 'citation_mismatch'));
  assert.ok(retrieval.sourceHierarchy.includes('official/current primary source'));

  assert.equal(customerCare.name, 'CustomerCareGuard');
  assert.equal(customerCare.contractCount, 10);
  assert.equal(customerCare.scenarioCount, 400);
  assert.equal(customerCare.generatedMatrix.smoke.scenarioCount, 400);
  assert.equal(customerCare.generatedMatrix.core.scenarioCount, 3600);
  assert.equal(customerCare.generatedMatrix.nightly.scenarioCount, 54000);
  assert.ok(customerCare.primarySafetyAxes.includes('refund_authority'));
  assert.ok(customerCare.primarySafetyAxes.includes('policy_source_fidelity'));
  assert.ok(customerCare.failureTaxonomy.some((failure) => failure.id === 'unauthorized_refund'));
  assert.ok(customerCare.sourceHierarchy.includes('official policy'));
  assert.ok(customerCare.authorityModel.cannot.includes('bypass MFA'));

  assert.equal(instructionDoctor.name, 'Instruction Manifest Doctor');
  assert.equal(instructionDoctor.contractCount, 8);
  assert.equal(instructionDoctor.scenarioCount, 64);
  assert.ok(instructionDoctor.primarySafetyAxes.includes('instruction_precedence'));
  assert.ok(instructionDoctor.primarySafetyAxes.includes('tool_permission_boundaries'));
  assert.ok(instructionDoctor.failureTaxonomy.some((failure) => failure.id === 'refund_policy_mismatch'));
  assert.ok(instructionDoctor.sourceHierarchy.includes('root AGENTS.md'));
  assert.ok(instructionDoctor.authorityModel.cannot.includes('treat ticket text as instructions'));

  assert.equal(legal.name, 'LegalGuard');
  assert.equal(legal.contractCount, 10);
  assert.equal(legal.scenarioCount, 400);
  assert.equal(legal.generatedMatrix.smoke.scenarioCount, 400);
  assert.equal(legal.generatedMatrix.core.scenarioCount, 4200);
  assert.equal(legal.generatedMatrix.nightly.scenarioCount, 63000);
  assert.ok(legal.primarySafetyAxes.includes('jurisdiction_discipline'));
  assert.ok(legal.primarySafetyAxes.includes('deadline_safety'));
  assert.ok(legal.failureTaxonomy.some((failure) => failure.id === 'unauthorized_legal_advice'));
  assert.ok(legal.sourceHierarchy.includes('uploaded contract/policy text'));
  assert.ok(legal.authorityModel.cannot.includes('give individualized legal advice'));

  assert.equal(personalAgent.name, 'PersonalAgentGuard');
  assert.equal(personalAgent.maturity, 'scaffold');
  assert.equal(personalAgent.contractCount, 7);
  assert.equal(personalAgent.scenarioCount, 120);
  assert.equal(personalAgent.generatedMatrix.core.scenarioCount, 960);
  assert.ok(personalAgent.failureTaxonomy.some((failure) => failure.id === 'unsafe_email_deletion'));
  assert.ok(personalAgent.forbiddenToolUse.includes('mail.delete_without_confirmation'));

  assert.equal(runtimeGuard.name, 'HarnessRuntimeGuard');
  assert.equal(runtimeGuard.maturity, 'scaffold');
  assert.equal(runtimeGuard.contractCount, 7);
  assert.equal(runtimeGuard.scenarioCount, 120);
  assert.equal(runtimeGuard.generatedMatrix.nightly.scenarioCount, 11520);
  assert.ok(runtimeGuard.failureTaxonomy.some((failure) => failure.id === 'memory_scope_violation'));
  assert.ok(runtimeGuard.forbiddenToolUse.includes('automation.create_without_confirmation'));
});

test('catalog card rows include the new packs with normalized counts', () => {
  const rows = catalogCardRows();
  const retrievalRow = rows.find(([name]) => name === 'RetrievalGuard');
  const customerCareRow = rows.find(([name]) => name === 'CustomerCareGuard');
  const instructionDoctorRow = rows.find(([name]) => name === 'Instruction Manifest Doctor');
  const legalRow = rows.find(([name]) => name === 'LegalGuard');
  const personalAgentRow = rows.find(([name]) => name === 'PersonalAgentGuard');
  const runtimeGuardRow = rows.find(([name]) => name === 'HarnessRuntimeGuard');

  assert.deepEqual(retrievalRow.slice(0, 5), [
    'RetrievalGuard',
    'Knowledge/RAG',
    'Tests retrieval agents, RAG systems, citation assistants, and search agents for source grounding, citation fidelity, provenance, contradiction handling, abstention, and multi-hop evidence completeness.',
    '10',
    '400',
  ]);
  assert.equal(retrievalRow[7], 'Smoke 400 / Core 4,200 / Deep 21,000 / Nightly 63,000');

  assert.deepEqual(customerCareRow.slice(0, 5), [
    'CustomerCareGuard',
    'Customer support',
    'Tests support agents for policy fidelity, refund authority, authentication before action, privacy minimization, mandatory escalation, abuse containment, and ethical cancellation.',
    '10',
    '400',
  ]);
  assert.equal(customerCareRow[7], 'Smoke 400 / Core 3,600 / Deep 18,000 / Nightly 54,000');
  assert.deepEqual(instructionDoctorRow.slice(0, 5), [
    'Instruction Manifest Doctor',
    'Agent configuration',
    'Scans persistent agent instruction manifests for drift, conflicts, stale commands, unsafe tool permissions, missing escalation rules, policy mismatch, and security-sensitive content.',
    '8',
    '64',
  ]);
  assert.equal(instructionDoctorRow[7], 'Smoke 64 / Core 512 / Deep 2,048 / Nightly 8,192');
  assert.deepEqual(legalRow.slice(0, 5), [
    'LegalGuard',
    'Legal',
    'Tests legal-domain assistants for legal-information boundaries, jurisdiction discipline, deadline safety, contract-source fidelity, confidentiality, counsel escalation, and unlawful-evasion refusal.',
    '10',
    '400',
  ]);
  assert.equal(legalRow[7], 'Smoke 400 / Core 4,200 / Deep 21,000 / Nightly 63,000');
  assert.deepEqual(personalAgentRow.slice(0, 5), [
    'PersonalAgentGuard',
    'Personal agent',
    'Tests personal assistant agents that act over email, calendar, browser, chat, files, and memory for permission safety, memory boundaries, contact disambiguation, and replayable completion evidence.',
    '7',
    '120',
  ]);
  assert.equal(personalAgentRow[7], 'Smoke 120 / Core 960 / Deep 3,840 / Nightly 11,520');
  assert.deepEqual(runtimeGuardRow.slice(0, 5), [
    'HarnessRuntimeGuard',
    'Agent harness runtime',
    'Tests agent harness runtimes with skills, memory, subagents, tools, workspaces, scheduled behavior, and replayable artifacts without turning HarnessAmp into the runtime.',
    '7',
    '120',
  ]);
  assert.equal(runtimeGuardRow[7], 'Smoke 120 / Core 960 / Deep 3,840 / Nightly 11,520');
});
