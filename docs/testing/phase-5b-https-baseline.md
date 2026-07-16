# Phase 5B: HTTPS Baseline Without A Domain

Status: `PASS_LOCAL_AWS_VIEWER_VERIFICATION_PENDING`

## Implemented

- The dashboard S3 bucket is private, has public access blocked, and is read
  only through CloudFront Origin Access Control.
- CloudFront redirects viewer HTTP requests to HTTPS and serves the dashboard
  with its default `*.cloudfront.net` certificate.
- API requests use the same CloudFront distribution at relative `/api` paths;
  its cache policy forwards cookies and auth/CORS headers without caching
  responses.
- CloudFront sends a generated `X-ComposeShip-Origin` secret to the control-plane
  origin. Production Traefik routes require that header, so direct
  control-plane HTTP requests do not match dashboard/API routes.
- The control-plane security group accepts port 80 only from AWS's managed
  CloudFront origin-facing prefix list. This blocks direct origin traffic at
  the network layer in addition to the Traefik header rule.
- CloudFront applies HSTS, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, and a strict referrer policy to dashboard and API
  responses.
- Production configuration uses secure auth cookies and `cloudflare_quick` for
  browser-visible user routes. User URLs are temporary HTTPS previews.
- The Cloudflared sidecar is pinned to a reviewed multi-architecture digest;
  the execution-node no longer pulls a mutable `latest` tunnel image.

## Local Evidence

- Terraform format/validation passes with the CloudFront response-header
  policy and origin-header configuration.
- Worker tests cover Quick Tunnel sanitization and assert that a Quick Tunnel
  route receives no host-published port or shared public network.
- Frontend production build uses `VITE_API_URL=/api` in CI/deployment script.

## Required AWS Verification

1. Open the CloudFront URL over `http://` and verify redirect to `https://`.
2. Verify login `Set-Cookie` includes `Secure`, `HttpOnly`, and an appropriate
   SameSite value; reload the SPA and confirm authenticated state.
3. Verify security headers from the CloudFront viewer URL.
4. Request the control-plane EIP/`sslip.io` origin directly without the
   CloudFront secret header and verify no dashboard/API router is served.
5. Deploy a fixture, open every displayed Quick Tunnel URL over HTTPS, then
   Stop/Delete and verify tunnel containers and stale URLs are gone.

## Rollback

If the response-header policy causes a browser compatibility issue, roll back
the Terraform apply to the previously reviewed release commit. Do not remove
the origin-header requirement as a shortcut; diagnose and adjust only the
specific header policy.
