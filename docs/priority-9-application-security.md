# Priority 9 Application Security

## Headers and Worker behavior

Both Express services emit CSP, HSTS in production, frame protection,
`nosniff`, referrer policy, and a restrictive permissions policy. The generated
Worker removes origin-host security headers that are invalid on the Worker host,
then replaces them with Worker-compatible `frame-ancestors`, `object-src`,
`base-uri`, frame, content-type, and referrer protections. This is intentional:
the upstream page cannot dictate the public Worker origin policy.

## Admin exposure

The admin service is intended to be reachable through its configured protected
route and should not receive a public Railway domain. Verify the deployment has
no public admin domain, use private service networking where available, and
allow only the API proxy or an approved operator network. `/api/healthz` and
`/api/readyz` remain public only when required by the platform health checker;
all administrative routes require a session and CSRF token.

## Input and errors

Express body parsers cap payloads at 32 KiB, and a shared guard rejects oversized
query, parameter, and body strings. Route schemas add field-specific validation.
Errors returned to clients use stable generic messages; provider and database
details are logged server-side without request secrets.

## Cookies and rate limits

Session cookies are HTTP-only, Secure in production, SameSite Strict, scoped to
`/`, and paired with a non-HTTP-only CSRF cookie. This supports the API proxy and
admin panel on the same deployment origin without sending sessions to unrelated
domains. Login and bootstrap use dedicated limits; every authenticated mutating
admin action also has a per-user/per-route rate limit.

## Independent review

Before production launch, commission an external penetration test covering the
Worker route, API proxy, admin route, authentication/CSRF, deployment actions,
Cloudflare integration, SSRF through proxy configuration, and token lifecycle.
Provide the reviewer a staging environment with disposable credentials, retain
the report and remediation evidence, and repeat the review after material auth,
proxy, or deployment changes. CI's local checks are not a substitute for this
external assessment.
