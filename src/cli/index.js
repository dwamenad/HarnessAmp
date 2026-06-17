export const CLI_COMMANDS = [
  {
    name: 'validate',
    description: 'Validate a harness bundle before mutation or diagnosis.',
  },
  {
    name: 'mutate',
    description: 'Generate deterministic mutated harnesses from selected mutation packs.',
  },
  {
    name: 'run',
    description: 'Run baseline analysis for a harness bundle.',
  },
  {
    name: 'diagnose',
    description: 'Run validation, mutation, execution, delta analysis, classification, and report generation.',
  },
  {
    name: 'report',
    description: 'Render a stored diagnostic report.',
  },
  {
    name: 'worker',
    description: 'Poll the local HarnessAmp API for queued runner jobs and execute them.',
  },
  {
    name: 'secrets',
    description: 'Manage encrypted project provider secrets for hosted BYOK execution targets.',
  },
  {
    name: 'benchmark',
    description: 'Validate, import, edit, review, diff, and export benchmark lifecycle files.',
  },
];

export function listCliCommands() {
  return CLI_COMMANDS.map((command) => ({ ...command }));
}
