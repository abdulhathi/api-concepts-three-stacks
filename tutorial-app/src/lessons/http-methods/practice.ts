import type { Practice } from '../../practice/types';

const NEW_BOOK = { title: 'Methods in Practice', author: 'You', priceCents: 1500, tags: ['methods-lab'] };
const SECOND_EDITION = { title: 'Methods in Practice, 2nd Edition', author: 'You', priceCents: 1700, tags: ['methods-lab'] };

export const practice: Practice = {
  id: 'http-methods',
  intro:
    'You will create your own product, then read, replace, patch and delete it, sending each request twice where it matters to see which methods are idempotent. Then you will try HEAD and OPTIONS, and read the code that gives each method its rules.',
  steps: [
    {
      kind: 'try',
      title: 'POST creates a product',
      goal: 'POST to the products collection asks the server to create one. The client sends the data; the server picks the id.',
      request: { method: 'POST', path: '/v1/products', as: 'writer', json: NEW_BOOK },
      expect: { status: 201, headers: { Location: '~/v1/products/prd_' }, body: { id: '*', title: NEW_BOOK.title, version: 1 } },
      save: { PRODUCT_ID: 'body.id' },
      notice: [
        '201 Created, with a Location header that points at the new product. The lab saved its id for the next steps.',
        'The id starts with prd_ and was chosen by the server, not by you.',
        'version is 1. Every change from now on adds 1 to it.',
      ],
    },
    {
      kind: 'try',
      title: 'GET is safe: read it twice',
      goal: 'GET only reads. Send it twice and check that nothing on the server changed.',
      request: { method: 'GET', path: '/v1/products/{{PRODUCT_ID}}', as: 'reader', times: 2 },
      expect: { statuses: { 200: 2 }, headers: { ETag: '"{{PRODUCT_ID}}-v1"' }, body: { id: '{{PRODUCT_ID}}', version: 1 } },
      notice: [
        'Both answers are the same, and version is still 1: reading changed nothing.',
        'The reader client can do this. It has products:read, but not products:write.',
        'Because GET is safe, caches may keep the answer and clients may retry it freely.',
      ],
    },
    {
      kind: 'try',
      title: 'PUT replaces it: send it twice',
      goal: 'PUT sends the whole product, every field, and the server replaces what it had. Send the same PUT twice, the way a client retries after a lost answer.',
      request: { method: 'PUT', path: '/v1/products/{{PRODUCT_ID}}', as: 'writer', json: SECOND_EDITION, times: 2 },
      expect: {
        statuses: { 200: 2 },
        body: { title: SECOND_EDITION.title, priceCents: 1700, tags: ['methods-lab'], version: 3 },
      },
      notice: [
        'After the second PUT the product has exactly the fields you sent, the same as after the first. That is idempotent.',
        'version went from 1 to 3, because this API counts every write. That is bookkeeping, not the change you asked for.',
      ],
    },
    {
      kind: 'try',
      title: 'PUT with a missing field',
      goal: 'PUT means replace, so this API needs every field. Send only a new price and see what happens.',
      request: { method: 'PUT', path: '/v1/products/{{PRODUCT_ID}}', as: 'writer', json: { priceCents: 999 } },
      expect: { status: 400, body: { type: '/problems/validation-error', 'errors.length': 3 } },
      notice: [
        'A 400 validation error with three entries: title, author and tags are required.',
        'tags is required here even though POST let you leave it out. A full replace has no defaults.',
        'The server did not guess or wipe anything. The product is unchanged.',
      ],
    },
    {
      kind: 'try',
      title: 'PATCH changes one field',
      goal: 'PATCH sends only the fields that change. Change the price and leave the rest alone.',
      request: { method: 'PATCH', path: '/v1/products/{{PRODUCT_ID}}', as: 'writer', json: { priceCents: 1999 } },
      expect: { status: 200, body: { priceCents: 1999, title: SECOND_EDITION.title, author: 'You', version: 4 } },
      notice: [
        'Only the price changed. The title and author came through untouched.',
        'PATCH also accepts Content-Type: application/merge-patch+json, a format made for partial updates.',
        'Setting a price is idempotent. A PATCH that added to a counter would not be: PATCH is not idempotent by definition.',
      ],
    },
    {
      kind: 'try',
      title: 'POST is not idempotent: send it twice',
      goal: 'Send the same create twice. Each POST is a new create, so you get two products.',
      request: { method: 'POST', path: '/v1/products', as: 'writer', json: NEW_BOOK, times: 2 },
      expect: { statuses: { 201: 2 }, headers: { Location: '~/v1/products/prd_' }, body: { title: NEW_BOOK.title, version: 1 } },
      save: { COPY_ID: 'body.id' },
      notice: [
        'Two 201s with two different ids and two Location headers: the same request made two products.',
        'This is why a client must not blindly retry a POST after a timeout. Orders use an Idempotency-Key for this (lesson 22).',
        'The lab saved the second id. The build step at the end uses it.',
      ],
    },
    {
      kind: 'try',
      title: 'DELETE needs the admin scope',
      goal: 'Each method can need a different permission. writer may create and change products, but not delete them.',
      request: { method: 'DELETE', path: '/v1/products/{{PRODUCT_ID}}', as: 'writer' },
      expect: { status: 403, headers: { 'WWW-Authenticate': '~insufficient_scope' }, body: { type: '/problems/forbidden' } },
      notice: [
        '403 Forbidden: the token is valid, but it lacks the admin scope.',
        'The WWW-Authenticate header names the scope that is missing.',
      ],
    },
    {
      kind: 'try',
      title: 'DELETE is idempotent: send it twice',
      goal: 'Now delete it as admin, twice. The answers differ, but the state on the server does not.',
      request: { method: 'DELETE', path: '/v1/products/{{PRODUCT_ID}}', as: 'admin', times: 2 },
      expect: { statuses: { 204: 1, 404: 1 }, body: { type: '/problems/not-found' } },
      notice: [
        'The first DELETE answered 204 No Content: done, and nothing to send back.',
        'The second answered 404, because nothing was left. The product is gone either way, so DELETE is still idempotent.',
      ],
    },
    {
      kind: 'try',
      title: 'HEAD: the headers without the body',
      goal: 'HEAD asks for the status and headers a GET would send, with no body. Send it to a seed product and compare the stacks.',
      request: { method: 'HEAD', path: '/v1/products/prd_01', as: 'reader' },
      expect: { empty: true, headers: { 'X-Request-Id': true } },
      notice: [
        'The stacks differ here. TypeScript answers 200 with the ETag and Content-Length a GET would send, because Express answers HEAD for every GET route.',
        'Python answers 405 method-not-allowed with Allow: GET, and C# answers 404. FastAPI and ASP.NET Core do not add HEAD for you, and SPEC.md allows either answer for a method a path does not serve.',
        'Every stack sends no body, and every answer still carries an X-Request-Id.',
      ],
    },
    {
      kind: 'try',
      title: 'OPTIONS: a browser preflight',
      goal: 'A web page on another origin wants to DELETE a product. Its browser first asks with OPTIONS. Send that preflight yourself.',
      request: {
        method: 'OPTIONS',
        path: '/v1/products/prd_01',
        headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'DELETE' },
      },
      expect: { headers: { 'Access-Control-Allow-Origin': 'http://localhost:5173', 'Access-Control-Allow-Methods': '~DELETE', 'Access-Control-Max-Age': '600' } },
      notice: [
        'No token was needed: preflights skip authentication and rate limiting.',
        'The answer lists the allowed methods, and Max-Age lets the browser remember it for 600 seconds.',
        'Python answers 200 and the others 204; SPEC.md allows either. The CORS lesson covers the rest.',
      ],
    },
    {
      kind: 'read',
      title: 'One route per method',
      goal: 'Each stack binds each method to its own handler, with its own scope. Look at how the routes differ only in method, body model and scope.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/routes/products.py',
          lines: [110, 161],
          note: 'replace_product takes a ProductReplace body, patch_product a ProductPatch body that also documents merge patch JSON, and delete_product needs Admin and returns a bare 204.',
        },
        node: {
          path: 'node-typescript-gcp/src/products/routes.ts',
          lines: [87, 117],
          note: 'router.put parses replaceProductSchema, router.patch parses patchProductSchema, and router.delete requires admin and ends with 204.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/Endpoints/ProductEndpoints.cs',
          lines: [22, 36],
          note: 'MapPost, MapPut, MapPatch and MapDelete each bind one handler and one scope; only PATCH lists merge patch JSON.',
        },
      },
    },
    {
      kind: 'read',
      title: 'Replace versus patch: one rule in the schema',
      goal: 'The difference between PUT and PATCH is small in code: which fields are required, and which fields are copied onto the product.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/services/products.py',
          lines: [31, 43],
          note: 'replace dumps every field; patch dumps only the fields the client set (exclude_unset) and skips the write when there are none; _update adds 1 to version.',
        },
        node: {
          path: 'node-typescript-gcp/src/products/schema.ts',
          lines: [33, 39],
          note: 'replaceProductSchema requires all four fields; patchProductSchema is the same schema with .partial(), so each one becomes optional.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/Endpoints/ProductInput.cs',
          lines: [17, 33],
          note: 'One parser, three modes: fields are required unless the mode is Patch, and tags are required only for Replace.',
        },
      },
    },
    {
      kind: 'think',
      title: 'A delete link',
      question:
        'A teammate adds GET /v1/products/{id}/delete so an admin page can use plain links. It works in testing. What goes wrong in production, and what do you suggest instead?',
      answer:
        'GET is supposed to be safe, so software calls it without asking: browsers prefetch links, crawlers and link checkers follow them, and proxies may repeat them. Any of these can delete products nobody chose to delete. Use DELETE /v1/products/{id} from a button that sends the request with the token, and keep every GET free of changes.',
    },
    {
      kind: 'think',
      title: 'Is PUT still idempotent here?',
      question:
        'In this API, sending the same PUT twice moves version from 2 to 3. An interviewer says that means PUT is not idempotent here. How do you answer?',
      answer:
        'Idempotent is about the intended effect: after one PUT or two, the product has exactly the fields the client sent. The version and updatedAt are the server’s own bookkeeping, like a log line, and RFC 9110 allows side effects the client did not ask for. One catch: a retried PUT that carries If-Match gets 412, because the first PUT already changed the ETag, so the client should read the product again before deciding.',
    },
    {
      kind: 'build',
      title: 'Accept JSON Patch on PATCH',
      task: 'PATCH accepts JSON and merge patch JSON today. Add a third patch format, JSON Patch (RFC 6902, Content-Type: application/json-patch+json): a list of operations such as { "op": "replace", "path": "/priceCents", "value": 1234 }. Support replace on the four product fields, and add with the path /tags/- to append a tag.',
      steps: [
        'Let the content type through, for PATCH only: python-fastapi-aws/app/web/body.py, node-typescript-gcp/src/http/body.ts, or dotnet-azure/src/ApiConcepts.Api/Http/JsonBodyFilter.cs.',
        'In the PATCH handler, branch on the Content-Type: python-fastapi-aws/app/routes/products.py, node-typescript-gcp/src/products/routes.ts, or the Patch handler in dotnet-azure/src/ApiConcepts.Api/Endpoints/ProductEndpoints.cs.',
        'For JSON Patch, copy the product’s title, author, priceCents and tags, apply each operation to the copy in order, and answer 400 validation-error for an unknown op or path.',
        'Validate the result with the same rules as PUT, then save it with version + 1, exactly as a normal PATCH does.',
        'Restart your server (the TypeScript server reloads by itself under npm run dev), then press Check: it sets the price of the product you created twice in step 6.',
      ],
      hints: [
        'Plain JSON and merge patch keep working exactly as before, so the contract tests still pass.',
        'Apply the operations to a plain object or dictionary first, and only then run the full validation, so a half-applied patch is never saved.',
        'Try the add operation twice with the same tag: the second one fails, because tags must be unique. That is PATCH not being idempotent, in practice.',
      ],
      check: {
        request: {
          method: 'PATCH',
          path: '/v1/products/{{COPY_ID}}',
          as: 'writer',
          headers: { 'Content-Type': 'application/json-patch+json' },
          json: [{ op: 'replace', path: '/priceCents', value: 1234 }],
        },
        expect: { status: 200, body: { priceCents: 1234 } },
      },
      command: 'cd contract-tests && ./run.sh python   # or node, dotnet: every contract test must still pass',
      undo: 'git restore python-fastapi-aws node-typescript-gcp dotnet-azure   (from APIConcepts/), or keep your change on a branch',
    },
  ],
};
