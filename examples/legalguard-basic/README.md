# LegalGuard Basic

Run a small LegalGuard v2 scenario:

```bash
node scripts/harnessamp.mjs run --pack legalguard-core examples/legalguard-basic/scenario.yaml --report markdown
```

Run the generated smoke suite:

```bash
node scripts/harnessamp.mjs run --pack legalguard-core --generated smoke --fail-on high --report markdown
```
