export function sanitizeReportValue(value) {
  if (typeof value === 'string') return sanitizeReportText(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeReportValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeReportValue(item)]),
    );
  }
  return value;
}

export function sanitizeReportText(text) {
  return String(text)
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]')
    .replace(/\b\d{13,19}\b/g, '[REDACTED_ACCOUNT]')
    .replace(/\bMRN[-:\s]*[A-Z0-9-]+\b/gi, 'MRN [REDACTED]')
    .replace(/\bINS[-:\s]*[A-Z0-9-]+\b/gi, 'INS [REDACTED]')
    .replace(/\bDOB[:\s]*(?:\d{1,2}[/-]){2}\d{2,4}\b/gi, 'DOB [REDACTED]')
    .replace(/\b(?:\d{1,2}[/-]){2}\d{2,4}\b/g, '[REDACTED_DATE]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]')
    .replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, '[REDACTED_PHONE]');
}

export function containsSensitiveIdentifier(text) {
  return /\b\d{3}-\d{2}-\d{4}\b|\b\d{13,19}\b|\bMRN[-:\s]*[A-Z0-9-]+\b|\bINS[-:\s]*[A-Z0-9-]+\b|\bDOB[:\s]*(?:\d{1,2}[/-]){2}\d{2,4}\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/i.test(String(text));
}
