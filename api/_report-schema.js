import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

const schema = JSON.parse(fs.readFileSync(new URL('../docs/schemas/diagnostic_report.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

export function validateReportSnapshot(snapshot) {
  const ok = validate(snapshot);
  return {
    ok,
    errors: (validate.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message}`.trim()),
  };
}
