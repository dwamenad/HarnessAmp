# Mutation examples

This directory stores static examples of mutation-suite output.

Generate a fresh suite with:

```bash
node scripts/harnessamp.mjs mutate examples/demo-bundle.json --max-mutations 20
```

Generated v1 suites use the same mutation record shape at larger scale:

```bash
node scripts/harnessamp.mjs mutate examples/demo-bundle.json --generated smoke
node scripts/harnessamp.mjs mutate examples/demo-bundle.json --generated nightly --max-generated 500
node scripts/harnessamp.mjs mutate examples/demo-bundle.json --generated nightly --shard 2/10
node scripts/harnessamp.mjs mutate examples/demo-bundle.json --generated core --severity critical,high --surface permission,network
```

- `smoke`: 400 generated tests
- `core`: 3,400 generated tests
- `deep`: 17,000 generated tests
- `nightly`: 51,000 generated tests

Generated suites are risk-prioritized by default and can be sharded for parallel CI. Diagnosis reports cluster repeated failures and rank base mutations by unique failure yield.

The committed fixtures should stay small. Full customer mutation suites belong in private run artifacts, not the public example tree.
