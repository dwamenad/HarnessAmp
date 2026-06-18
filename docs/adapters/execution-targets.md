# Execution Target Control Plane

The Execution Targets console area is the operator-facing workflow for connecting real agents to HarnessAmp. It turns supported backend paths into a guided product flow:

1. Select a benchmark.
2. Select an execution target.
3. Validate the target.
4. Start a worker-backed run.
5. Watch lifecycle and diagnostics.

## Target Types

| Target | Product behavior | Production posture |
| --- | --- | --- |
| Registered runner | Durable reusable endpoint registered to a project | Production-grade |
| Vercel AI SDK route | Deployed adapter-compatible route that owns provider keys | Production-grade when HTTPS and contract-valid |
| Local HTTPS tunnel | Short-lived forwarding URL for a local adapter | Ephemeral local test target, run-scoped, not reusable |
| Hosted BYOK | Project-owned provider key through encrypted secrets | Gated until feature flag and encrypted project secret storage are ready |

Local tunnels must not be treated like durable targets. Completed, expired, or failed local tunnel runs can remain in historical run metadata, but reusable production pickers should prefer registered runners and deployed HTTPS adapter routes.

## Dashboard Validation

Use **Validate endpoint** before launching a real worker-backed run. Validation reuses the adapter doctor and preflight stack. It checks:

- HTTPS requirement for remote targets
- SSRF/private/internal URL blocking
- reachability
- token acceptance
- wrong-token rejection
- JSON validity
- adapter contract shape
- observation contract validity
- scenario id mapping
- timeout behavior
- supported contract version
- safe diagnostics

If an endpoint resolves to a private or internal network address, the console shows:

> This endpoint was blocked because it resolves to a private or internal network address.

## Safe Diagnostics And Audit Events

Validation stores safe `execution_target_validation` events with non-sensitive fields: project id, actor id, target type, phase, status code, duration, failure class, contract version, and timestamp.

Validation events must not store run tokens, nonce values, secrets, authorization headers, raw request bodies, raw response bodies, sensitive URLs, or stack traces.

## Failure Reasons Before Enqueue

Real execution targets should not enqueue when validation fails. Common safe failure classes include:

- `local_tunnel_token_secret_missing`
- `execution_target_invalid`
- `local_tunnel_private_ip_blocked`
- `local_tunnel_unreachable`
- `local_tunnel_timeout`
- `local_tunnel_invalid_json`
- `local_tunnel_contract_mismatch`
- `adapter_contract_version_unsupported`
- `adapter_observation_scenario_mismatch`
- `hosted_provider_disabled`

Seeded demos and local preview data can still run without blocking on external target validation.

## Production Requirements

Production-like environments include `NODE_ENV=production` and `VERCEL_ENV=production`. If local tunnels are enabled there, configure `HARNESSAMP_LOCAL_TUNNEL_TOKEN_SECRET`; otherwise local tunnel token derivation fails closed.

Supported adapter contract versions are centralized. The current version is:

```text
harnessamp_http_runner_v1
```

Preflight must return readiness plus a supported contract version. Unsupported or missing versions fail explicitly as `adapter_contract_version_unsupported`.

Hosted BYOK must stay gated. Use wording such as **Encrypted BYOK gated**, **BYOK for approved projects**, or **Hosted BYOK unavailable until encrypted project secret storage is enabled**.
