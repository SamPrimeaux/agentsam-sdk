# Web/Application Fundamentals — Jr Dev Reference

Use this reference when teaching web application architecture. Adapt it to the
actual repository instead of assuming every project uses these exact directory
names.

## HTTP

HTTP is a request/response protocol: one program sends a structured request to
another program, and the receiving program sends a structured response back.

A simplified exchange:

```text
browser/client                         server/backend
      |                                      |
      | GET /api/models                      |
      |------------------------------------->|
      |                                      | find/compute result
      | 200 OK                               |
      | { "models": [...] }                 |
      |<-------------------------------------|
```

An HTTP request commonly contains:

- method (`GET`, `POST`, `PATCH`, `DELETE`, ...),
- URL/path,
- headers,
- optional body.

A response commonly contains:

- status (`200`, `201`, `400`, `401`, `403`, `404`, `500`, ...),
- headers,
- optional body.

The method is a convention about intent, not magic business logic:

- `GET` usually reads,
- `POST` usually creates or starts an action,
- `PUT` usually replaces,
- `PATCH` usually changes part,
- `DELETE` usually removes.

The backend still decides what is valid and authorized.

## API

An API is an interface another program can use. An HTTP API defines routes and
message shapes such as:

```text
POST /api/runs
GET  /api/runs/:id
POST /api/runs/:id/cancel
```

The route is the door. The business logic behind the door is the important part.

## Frontend

The frontend/client is the code responsible for what the user directly
interacts with in their browser/app process.

Typical responsibilities:

- rendering UI,
- handling clicks/typing/navigation,
- temporary UI state,
- requesting trusted operations from the backend,
- presenting loading/success/error states.

A frontend should not be trusted with server secrets merely because JavaScript
can technically contain them. Browser code is delivered to the user's machine
and can be inspected or modified by that user.

## Backend

The backend/server is the trusted application runtime for operations that need a
controlled authority.

Typical responsibilities:

- request validation,
- authorization,
- secrets/provider credentials,
- database writes,
- trusted model/provider calls,
- filesystem/Git/cloud operations,
- durable business rules,
- rate limits and policy.

A backend may run in a traditional server, serverless function, Worker, container,
VM, local process, or another runtime. "Backend" describes responsibility more
than hosting technology.

## Shared/contracts

Frontend and backend often need the same definition of an object or event.
Shared code should usually contain contracts that are safe on both sides:

```ts
interface CreateRunRequest {
  goal: string;
  mode: "ask" | "plan" | "agent" | "debug" | "multitask";
}

interface CreateRunResponse {
  id: string;
  status: "queued" | "running";
}
```

Shared code is usually a bad home for server secrets, database connections, or
privileged runtime objects.

## Server/worker entrypoints

A runtime entrypoint is the first code the host invokes. A Worker might expose:

```js
export default {
  fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  }
};
```

A maintainable architecture often keeps that adapter thin:

```text
runtime/worker entrypoint
        -> application router
        -> use case/business logic
        -> database/provider adapters
```

The entrypoint connects the host runtime to the application. It does not need to
contain the entire application.

## Database and persistence

State has to live somewhere. Ask how long it must survive and who must share it.

Examples:

```text
React component state   survives a render/session as designed
localStorage            stays in one browser/profile
SQLite                   durable local process/application state
Postgres/D1              shared durable application state
object storage           files/blobs/large artifacts
Git                      source-control history
Merkle snapshots         evidence of filesystem state
```

Do not add a database if browser-local state satisfies the actual requirement.
Do not use browser-local state for data that must be authoritative across users
or machines.

## Authentication vs authorization

Authentication asks:

> Who are you?

Authorization asks:

> Are you allowed to do this?

A verified user ID on the backend is evidence for authentication. A policy or
ownership check deciding whether that user can edit a project is authorization.

Never trust a browser-supplied `user_id` merely because it is present in JSON.

## WebSocket

HTTP is naturally request/response. A WebSocket keeps a two-way connection open,
which is useful for terminals, streaming events, multiplayer state, and other
interactive flows.

```text
client <==========================> server
       commands / output / events
```

Use it when the interaction actually benefits from a persistent two-way channel;
do not reach for it when a normal HTTP request is simpler.

## Service and microservice

A service is a capability that runs behind an interface.

A microservice is typically a relatively small service that can be deployed and
operated independently. A folder called `services/` does not automatically make
something a microservice.

Before calling something a microservice, look for evidence such as:

- independent runtime/process,
- explicit network or message interface,
- separate deployment lifecycle,
- clear ownership boundary.

## Package vs app vs service

A useful distinction:

```text
package/library
  reusable code imported by other code

app/product
  complete user-facing or operator-facing composition

service
  independently running capability accessed through an interface
```

A monorepo can contain all three.

## End-to-end example

Suppose the user clicks "Start agent":

```text
1. frontend button receives click
2. frontend validates obvious input
3. frontend POSTs /api/runs
4. backend authenticates/authorizes request
5. backend validates CreateRunRequest
6. backend creates the authoritative run
7. backend starts/schedules model/tool work
8. backend returns run ID/status
9. frontend subscribes/polls for updates
10. UI renders running/completed/error state
```

The feature is not complete merely because step 1 and a spinner exist.
