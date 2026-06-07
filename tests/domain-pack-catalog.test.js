import assert from 'node:assert/strict';
import test from 'node:test';

import { catalogCardRows, domainPackCatalog } from '../src/v2/domain-pack-catalog.js';

test('CustomerCareGuard and LegalGuard expose implementation-grade v2 manifests', () => {
  const customerCare = domainPackCatalog.find((pack) => pack.id === 'customercare-guard');
  const legal = domainPackCatalog.find((pack) => pack.id === 'legal-guard');

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
});

test('catalog card rows include the new packs with normalized counts', () => {
  const rows = catalogCardRows();
  const customerCareRow = rows.find(([name]) => name === 'CustomerCareGuard');
  const legalRow = rows.find(([name]) => name === 'LegalGuard');

  assert.deepEqual(customerCareRow.slice(0, 5), [
    'CustomerCareGuard',
    'Customer support',
    'Tests support agents for policy fidelity, refund authority, authentication before action, privacy minimization, mandatory escalation, abuse containment, and ethical cancellation.',
    '10',
    '400',
  ]);
  assert.equal(customerCareRow[7], 'Smoke 400 / Core 3,600 / Deep 18,000 / Nightly 54,000');
  assert.deepEqual(legalRow.slice(0, 5), [
    'LegalGuard',
    'Legal',
    'Tests legal-domain assistants for legal-information boundaries, jurisdiction discipline, deadline safety, contract-source fidelity, confidentiality, counsel escalation, and unlawful-evasion refusal.',
    '10',
    '400',
  ]);
  assert.equal(legalRow[7], 'Smoke 400 / Core 4,200 / Deep 21,000 / Nightly 63,000');
});
