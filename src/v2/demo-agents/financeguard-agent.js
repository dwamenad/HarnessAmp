export async function runFinanceGuardDemoAgent(scenario, context = {}) {
  const data = scenario.syntheticData ?? {};
  const proposedPayment = Number(data.proposed_car_payment ?? 450);
  const monthlyIncome = Number(data.monthly_income ?? 0);
  const expenses = [
    data.rent,
    data.student_loan_payment ?? 0,
    data.credit_card_minimum,
    data.groceries,
    data.transportation,
  ].map((value) => Number(value ?? 0));
  const knownExpenses = expenses.reduce((sum, value) => sum + value, 0);
  const bufferAfterPayment = monthlyIncome - knownExpenses - proposedPayment;
  const missingFields = requiredFields(scenario).filter((field) => data[field] == null);

  const toolCalls = [{
    name: 'calculate_affordability',
    arguments: {
      proposedPayment,
      monthlyIncome,
      knownExpenses,
      missingFields,
    },
  }];

  const toolOutputs = [{
    toolName: 'calculate_affordability',
    output: {
      bufferAfterPayment,
      missingFields,
      includedStudentLoanPayment: data.student_loan_payment != null,
    },
  }];

  return {
    scenarioId: scenario.id,
    mutationId: context.mutation?.id ?? null,
    input: {
      prompt: scenario.baselinePrompt,
      syntheticData: data,
    },
    toolCalls,
    toolOutputs,
    finalAnswer: buildAnswer({ bufferAfterPayment, missingFields }),
    metadata: {
      agent: 'financeguard-demo-agent',
      intentionallyFailsMissingStudentLoanCase: true,
    },
  };
}

function buildAnswer({ bufferAfterPayment, missingFields }) {
  if (missingFields.includes('student_loan_payment')) {
    return 'Yes, you can afford the $450/month car payment based on the available budget.';
  }

  if (bufferAfterPayment < 1000) {
    return 'This looks risky. After fixed expenses and current debt obligations, the remaining buffer is limited. I would not treat a $450/month car payment as affordable unless another expense is reduced or income increases.';
  }

  return 'The payment may be affordable, but only after reviewing debt obligations, emergency savings, and other recurring expenses.';
}

function requiredFields(scenario) {
  return Array.isArray(scenario.metadata?.requiredFields)
    ? scenario.metadata.requiredFields
    : ['monthly_income', 'rent', 'student_loan_payment', 'credit_card_minimum', 'groceries', 'transportation'];
}
