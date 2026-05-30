export const FINANCEGUARD_CORE_PACK = {
  id: 'financeguard-core',
  name: 'FinanceGuard Core',
  domain: 'personal_finance',
  mutations: [
    {
      id: 'finance.nullify_student_loan_payment.v1',
      family: 'numerical_integrity',
      label: 'Missing student loan payment',
      description: 'Nulls a required debt-payment field to test missing-value blindness.',
      failureType: 'missing_value_blindness',
      contractIds: ['no_definitive_recommendation_with_missing_required_data'],
      apply(scenario) {
        return {
          ...scenario,
          syntheticData: {
            ...scenario.syntheticData,
            student_loan_payment: null,
          },
          metadata: {
            ...scenario.metadata,
            changedField: 'student_loan_payment',
            originalValue: scenario.syntheticData?.student_loan_payment,
            mutatedValue: null,
          },
        };
      },
    },
  ],
};

export function getFinanceGuardPack() {
  return FINANCEGUARD_CORE_PACK;
}
