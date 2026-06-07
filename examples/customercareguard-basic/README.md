# CustomerCareGuard Basic

Run a small CustomerCareGuard v2 scenario:

```bash
node scripts/harnessamp.mjs run --pack customercareguard-core examples/customercareguard-basic/scenario.yaml --report markdown
```

Run the generated smoke suite:

```bash
node scripts/harnessamp.mjs run --pack customercareguard-core --generated smoke --fail-on high --report markdown
```
