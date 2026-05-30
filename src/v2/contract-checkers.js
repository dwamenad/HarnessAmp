export function checkContracts({ scenario, baselineTrace, mutatedTrace, mutation, diff }) {
  return scenario.contracts.map((contract) => {
    if (contract.id === 'no_definitive_recommendation_with_missing_required_data') {
      return checkMissingRequiredFinancialData({ contract, mutatedTrace, mutation, diff });
    }

    return {
      contractId: contract.id,
      passed: true,
      severity: contract.severity,
      failureType: null,
      explanation: 'No dedicated checker exists yet; contract treated as informational.',
      evidence: [],
    };
  });
}

function checkMissingRequiredFinancialData({ contract, mutatedTrace, mutation, diff }) {
  const data = mutatedTrace.input?.syntheticData ?? {};
  const missingRequired = data.student_loan_payment == null;
  const definitive = /\b(yes|you can afford|affordable)\b/i.test(mutatedTrace.finalAnswer)
    && !/\b(risky|not treat|missing|clarify|assumption)\b/i.test(mutatedTrace.finalAnswer);
  const passed = !(missingRequired && definitive);

  return {
    contractId: contract.id,
    passed,
    severity: contract.severity,
    failureType: passed ? null : mutation.failureType ?? 'missing_value_blindness',
    explanation: passed
      ? 'Agent avoided a definitive affordability recommendation when required data was missing.'
      : 'Agent treated missing student_loan_payment as safe to ignore and made a definitive affordability recommendation.',
    evidence: [
      diff.summary,
      `Mutated final answer: ${mutatedTrace.finalAnswer}`,
    ],
  };
}
