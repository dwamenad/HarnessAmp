export const HARNESSAMP_ADAPTER_CONTRACT_VERSION = 'harnessamp_http_runner_v1';
export const HARNESSAMP_RUN_TOKEN_HEADER = 'x-harnessamp-run-token';

/**
 * @typedef {Object} HarnessAmpPreflightRequest
 * @property {'harnessamp_preflight'} type
 * @property {true} preflight
 * @property {'harnessamp_http_runner_v1'} contract
 */

/**
 * @typedef {Object} HarnessAmpPreflightResponse
 * @property {boolean=} ok
 * @property {boolean=} ready
 * @property {Array<Object>=} observations
 */

/**
 * @typedef {Object} HarnessAmpScenarioRequest
 * @property {string} jobId
 * @property {string|null} profile
 * @property {string|null} preset
 * @property {Object} thresholds
 * @property {Object} pack
 */

/**
 * @typedef {Object} HarnessAmpObservationResponse
 * @property {Array<Object>} observations
 */

/**
 * @typedef {Object} HarnessAmpAdapterError
 * @property {string} error
 * @property {string=} code
 * @property {boolean=} retryable
 */

export function buildPreflightRequest() {
  return {
    type: 'harnessamp_preflight',
    preflight: true,
    contract: HARNESSAMP_ADAPTER_CONTRACT_VERSION,
  };
}

export function buildDoctorScenarioRequest() {
  return {
    jobId: 'doctor_contract_check',
    profile: 'doctor',
    preset: 'contract',
    thresholds: {},
    pack: {
      id: 'doctor-contract-pack',
      project: 'HarnessAmp Adapter Doctor',
      version: 1,
      harness: {
        agentName: 'doctor-agent',
        scenarios: [
          {
            id: 'doctor-scenario-001',
            objective: 'Return a safe contract-check response.',
          },
        ],
      },
    },
  };
}

export function validatePreflightRequest(value) {
  const issues = [];
  if (!isObject(value)) return invalid('Preflight request must be a JSON object.');
  if (value.type !== 'harnessamp_preflight') issues.push('Preflight request type must be "harnessamp_preflight".');
  if (value.preflight !== true) issues.push('Preflight request preflight must be true.');
  if (value.contract !== HARNESSAMP_ADAPTER_CONTRACT_VERSION) {
    issues.push(`Preflight request contract must be "${HARNESSAMP_ADAPTER_CONTRACT_VERSION}".`);
  }
  return result(issues);
}

export function validatePreflightResponse(value) {
  const issues = [];
  if (Array.isArray(value)) return result(issues);
  if (!isObject(value)) return invalid('Preflight response must be a JSON object or observation array.');
  if (value.ok === true || value.ready === true || Array.isArray(value.observations)) return result(issues);
  issues.push('Preflight response must include ok: true, ready: true, or observations: [].');
  return result(issues);
}

export function validateScenarioRequest(value) {
  const issues = [];
  if (!isObject(value)) return invalid('Scenario request must be a JSON object.');
  if (!nonEmptyString(value.jobId)) issues.push('Scenario request requires string jobId.');
  if (!isObject(value.thresholds)) issues.push('Scenario request requires thresholds object.');
  if (!isObject(value.pack)) issues.push('Scenario request requires pack object.');
  return result(issues);
}

export function validateObservationResponse(value) {
  const issues = [];
  if (Array.isArray(value)) return result(issues);
  if (!isObject(value)) return invalid('Observation response must be a JSON object.');
  if (!Array.isArray(value.observations)) {
    issues.push('Observation response requires observations array.');
  }
  return result(issues);
}

export function validateAdapterError(value) {
  const issues = [];
  if (!isObject(value)) return invalid('Adapter error response must be a JSON object.');
  if (!nonEmptyString(value.error)) issues.push('Adapter error response requires string error.');
  if (value.code != null && typeof value.code !== 'string') issues.push('Adapter error response code must be a string when provided.');
  if (value.retryable != null && typeof value.retryable !== 'boolean') issues.push('Adapter error response retryable must be boolean when provided.');
  return result(issues);
}

export function summarizeValidation(validation) {
  if (validation.valid) return 'valid';
  return validation.issues.join(' ');
}

function result(issues) {
  return {
    valid: issues.length === 0,
    issues,
  };
}

function invalid(issue) {
  return {
    valid: false,
    issues: [issue],
  };
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
