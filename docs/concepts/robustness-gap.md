# Robustness Gap

The robustness gap is the difference between expected-condition performance and mutated-condition performance.

```text
robustness_gap = visible_pass_rate - hidden_holdout_pass_rate
```

Visible variants represent expected or reviewable conditions.

Hidden holdouts represent perturbed operating conditions that should not change the task meaning.

## Why This Matters

A system can look strong under visible tests while being fragile under small wrapper changes.

Example:

```text
visible pass rate: 67%
hidden holdout pass rate: 50%
robustness gap: 17 points
```

The task did not become harder. The wrapper changed.

That gap is the signal that the agent may be learning prompt shape, schema order, tool wording, or context pattern instead of the intended job.

## How To Use It

Use the gap as a release decision input:

- small gap and low-severity findings: keep monitoring
- medium gap or repeated family failures: warn and harden
- large gap or critical failure type: block release

The gap should be interpreted with the failure classifier. A small gap with `network_exfiltration_risk` can still be a blocker.
