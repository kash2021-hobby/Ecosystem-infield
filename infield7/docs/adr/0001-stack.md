# ADR-001 — Stack and local runtime

## Context

InField 7 phase 0 needs a sign-in, a workspace, and a roster. The technology blueprint already chose the production stack. This machine does not have Docker installed, so the first running database cannot depend on a container.

## Decision

- Mobile, later: Expo / React Native. Not in this slice.
- Web: Next.js (App Router) and React.
- API: one TypeScript Fastify service.
- Database: PostgreSQL. Local development connects to a PostgreSQL server on localhost through `DATABASE_URL`. PostGIS and pgvector are not required yet.
- Auth: phone OTP, JWT session row, roles `admin`, `manager`, `employee`.
- SMS: `SMS_PROVIDER=stub` logs the code and returns it to the web app. MSG91 is the production provider and is not wired until credentials exist.
- Hosting target: one server in India. Not provisioned in this slice.

## Alternatives rejected

Flutter and a second native codebase. Google Maps. A separate auth vendor.

## Cost implication

Local development has no hosted infrastructure cost. Stub SMS sends nothing.

## Consequences

Schema SQL stays plain Postgres so it can move onto a Postgres 16 service without a rewrite. Redis, background jobs, and the map stay out of phase 0.
