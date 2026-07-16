# Invite-Only Pilot Policies

Status: `REVIEW_REQUIRED_BEFORE_RELEASE`

These policies describe the ComposeShip invite-only pilot. They are a product
baseline, not legal advice. The operator must have counsel review them and
replace `ABUSE_CONTACT_EMAIL` with a monitored mailbox before issuing the
first external invite.

Effective date: set at first production release.

## Terms Of Pilot Use

- Access is invitation-only, personal to the invited account, and may be
  suspended or withdrawn to protect the service, users, or infrastructure.
- The pilot is experimental. Preview URLs, deployment availability, data
  retention, and supported container images are not guaranteed.
- Users are responsible for code, images, repositories, configuration, and
  content that they deploy. They must have permission to use them.
- The operator may stop workloads, remove routes, or delete a project when it
  exceeds the published quota, threatens availability, or violates these
  policies. Where practical, the operator will notify the affected account.
- This pilot is not for regulated, production-critical, or sensitive workloads
  unless the operator has explicitly agreed in writing.

## Acceptable Use

Users must not deploy or attempt to deploy workloads that:

- violate applicable law or another party's rights;
- distribute malware, credential theft, phishing, spam, denial-of-service,
  unauthorized scanning, cryptomining, or evasion tools;
- attempt to access host, Docker, cloud metadata, control-plane services,
  other users' workloads, or credentials;
- consume resources beyond the account/project limits or bypass platform
  controls; or
- process highly sensitive personal, financial, health, authentication, or
  regulated data during this MVP pilot.

## Privacy Notice

The service stores account name and email, password hashes, project and
repository metadata, encrypted environment-variable values, deployment status,
execution-node identifiers, route metadata, and operational logs needed to run
and secure the pilot. Operators may inspect operational logs and metadata to
investigate abuse, reliability, and security incidents.

Users should not place secrets in repositories or deployment logs. Secrets
entered as environment values are encrypted at rest by the application, but no
MVP system should be treated as a suitable storage system for highly sensitive
data.

Project deletion is asynchronous: the project remains visible until the worker
confirms cleanup. An account-deletion request, access request, or privacy
question must be sent to `ABUSE_CONTACT_EMAIL`; the operator must define and
document the applicable retention/deletion response time before release.

## Abuse And Security Reporting

Report abuse, a suspected compromise, prohibited content, or a privacy request
to `ABUSE_CONTACT_EMAIL`. Include the affected project name, timestamp, and
safe reproduction details; never send passwords, tokens, or secret values in
email. The operator should acknowledge reports and use the incident runbooks
in [Incident Runbooks](incident-runbooks.md) for infrastructure response.

## Release Checklist

Before first external invitation:

1. Replace `ABUSE_CONTACT_EMAIL` with a monitored mailbox.
2. Set the effective date and have an authorized operator approve this text.
3. Publish the approved policy link in the registration/invite flow. The
   dashboard has a public `/pilot-policies` route, registration requires an
   explicit checkbox, and its acceptance timestamp is recorded on the account.
   The CloudFront publish script requires `ABUSE_CONTACT_EMAIL` to populate
   the abuse-reporting contact.
4. Record the approval and contact in `docs/release-evidence.md` without
   committing private credentials.
