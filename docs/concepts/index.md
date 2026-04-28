# Concepts

HarnessAmp is easier to reason about when the system is split into stable contract layers and mutable operating layers.

- [Wrapper](wrapper.md)
- [Trust Boundaries](trust-boundaries.md)
- [Robustness Gap](robustness-gap.md)

The short version:

1. The `intent`, `contract`, and `benchmark` describe what should stay true.
2. The `wrapper` describes the prompts, tools, schemas, runtime rules, and context that can drift.
3. HarnessAmp mutates the wrapper and reports where behavior changes.
