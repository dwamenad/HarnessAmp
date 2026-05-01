# Runner Contract

An external runner accepts a mutation pack and returns observations.

Expected inputs:

- profile id
- preset id
- thresholds
- pack payload

Expected outputs:

- `variantId`
- `passed`
- `score`
- `latencyMs`
- `notes`

HarnessAmp is the control plane. Customer workloads stay on the registered runner.
