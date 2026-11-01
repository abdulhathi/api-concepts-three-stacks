import type { Practice } from '../../practice/types';

const JSON_TYPE = { 'Content-Type': 'application/json' };

export const practice: Practice = {
  id: 'request-bodies',
  intro:
    'You will create a product with a JSON body, then break the body on purpose: missing fields, wrong types, broken JSON, the wrong Content-Type and unknown fields. Each mistake earns its own answer, and you will see which one.',
  steps: [
    {
      kind: 'try',
      title: 'Create a product with a JSON body',
      goal: 'A POST carries the new product in its body. The title has extra spaces and there are no tags, on purpose.',
      request: { method: 'POST', path: '/v1/products', as: 'writer', json: { title: '  Request Bodies 101  ', author: 'You', priceCents: 2500 } },
      expect: {
        status: 201,
        headers: { Location: '~/v1/products/prd_' },
        body: { title: 'Request Bodies 101', tags: [], version: 1 },
      },
      save: { PRODUCT_ID: 'body.id' },
      notice: [
        'The title came back trimmed, and tags defaulted to an empty list.',
        'The id, version, currency and timestamps were not in the body: the server set them. The lab saved the id for later steps.',
      ],
    },
    {
      kind: 'try',
      title: 'Missing fields: one 400 lists them all',
      goal: 'Send an empty object. Three required fields are missing, and a good API says so in one answer.',
      request: { method: 'POST', path: '/v1/products', as: 'writer', json: {} },
      expect: {
        status: 400,
        body: {
          type: '/problems/validation-error',
          'errors.length': 3,
          'errors.0.field': 'title',
          'errors.1.field': 'author',
          'errors.2.field': 'priceCents',
        },
      },
      notice: [
        'One entry per missing field, in one round trip.',
        'tags is not in the list: it is optional on POST.',
      ],
    },
    {
      kind: 'try',
      title: 'Wrong values: every field in one answer',
      goal: 'An empty title, a number for the author, a price with a fraction and a tag with capitals and a space. Four mistakes.',
      request: {
        method: 'POST',
        path: '/v1/products',
        as: 'writer',
        json: { title: '', author: 42, priceCents: 12.5, tags: ['Not Lower'] },
      },
      expect: {
        status: 400,
        body: { type: '/problems/validation-error', 'errors.length': 4, 'errors.0.field': 'title', 'errors.1.field': 'author', 'errors.2.field': 'priceCents' },
      },
      notice: [
        'priceCents 12.5 is refused, not rounded: money is a whole number of cents.',
        'The fourth error is about the tag, but its field name differs by stack: tags.0 in Python, tags[0] in TypeScript, tags in C#. SPEC.md does not say how to name a field inside a list.',
        'The messages are worded by each framework. Compare them across the three servers.',
      ],
    },
    {
      kind: 'try',
      title: 'Malformed: the body is not JSON',
      goal: 'Leave off the closing brace. The parser gives up before any rule can run.',
      request: { method: 'POST', path: '/v1/products', as: 'writer', headers: JSON_TYPE, raw: '{"title": "oops"' },
      expect: { status: 400, body: { type: '/problems/malformed-json' } },
      notice: [
        'A different slug from validation-error: malformed-json.',
        'There is no errors array, because the server never got far enough to see any fields.',
      ],
    },
    {
      kind: 'try',
      title: 'Invalid: valid JSON, but not an object',
      goal: 'An empty array is perfectly valid JSON. It parses, and then fails the rules, because a product must be an object.',
      request: { method: 'POST', path: '/v1/products', as: 'writer', json: [] },
      expect: { status: 400, body: { type: '/problems/validation-error', 'errors.0.field': 'body' } },
      notice: [
        'It parsed, so this is validation-error, not malformed-json.',
        'All three stacks name the field body, because the problem is the whole body, not one property.',
      ],
    },
    {
      kind: 'try',
      title: 'The body must say it is JSON',
      goal: 'Send a perfectly good product, but label it text/plain. The server checks the label before it parses anything.',
      request: {
        method: 'POST',
        path: '/v1/products',
        as: 'writer',
        headers: { 'Content-Type': 'text/plain' },
        raw: '{"title":"Plain","author":"You","priceCents":100}',
      },
      expect: { status: 415, body: { type: '/problems/unsupported-media-type' } },
      notice: [
        '415 Unsupported Media Type: the body was never parsed, even though it was valid JSON.',
        'Headers are concept 4. Here the point is the order: the media type is checked before the JSON.',
      ],
    },
    {
      kind: 'try',
      title: 'The token comes before the body',
      goal: 'Send broken JSON as reader, a client without products:write. Which check answers first?',
      request: { method: 'POST', path: '/v1/products', as: 'reader', headers: JSON_TYPE, raw: '{oops' },
      expect: { status: 403, body: { type: '/problems/forbidden' } },
      notice: [
        '403, not 400: the scope check runs before the body is read, on every stack.',
        'Without any token the answer would be 401. A caller you will reject learns nothing about how you parse bodies.',
      ],
    },
    {
      kind: 'try',
      title: 'Unknown fields are ignored',
      goal: 'Add fields the product does not have, and try to choose the id and the version yourself.',
      request: {
        method: 'POST',
        path: '/v1/products',
        as: 'writer',
        json: { title: 'Unknown Fields', author: 'You', priceCents: 1500, color: 'blue', id: 'prd_mine', version: 99 },
      },
      expect: { status: 201, body: { title: 'Unknown Fields', version: 1 } },
      notice: [
        'A 201, not a 400: color was dropped without an error.',
        'version is 1 and the id is a new random one, not prd_mine. Fields the server owns can never come from the body.',
      ],
    },
    {
      kind: 'try',
      title: 'PATCH: an explicit null is refused',
      goal: 'PATCH takes any subset of fields, but a field you send must be valid. Try to set the price to null.',
      request: { method: 'PATCH', path: '/v1/products/{{PRODUCT_ID}}', as: 'writer', json: { priceCents: null } },
      expect: { status: 400, body: { type: '/problems/validation-error', 'errors.0.field': 'priceCents' } },
      notice: [
        'Leaving priceCents out means "do not change it". Sending null would mean "erase it", and a product must have a price.',
        'The product was not changed.',
      ],
    },
    {
      kind: 'try',
      title: 'PATCH with a typo changes nothing',
      goal: 'Misspell title as titel. The unknown field is ignored, so the PATCH succeeds and changes nothing.',
      request: { method: 'PATCH', path: '/v1/products/{{PRODUCT_ID}}', as: 'writer', json: { titel: 'A Better Title' } },
      expect: { status: 200, body: { title: 'Request Bodies 101' } },
      notice: [
        'A 200 with the old title: this is the price of ignoring unknown fields.',
        'The stacks differ on the version here: Python keeps it when nothing changed, TypeScript and C# add one anyway. SPEC.md does not say.',
      ],
    },
    {
      kind: 'try',
      title: 'PUT needs the whole product',
      goal: 'PUT replaces the product, so every field is required, tags included.',
      request: {
        method: 'PUT',
        path: '/v1/products/{{PRODUCT_ID}}',
        as: 'writer',
        json: { title: 'Request Bodies 101', author: 'You', priceCents: 2500 },
      },
      expect: { status: 400, body: { type: '/problems/validation-error', 'errors.length': 1, 'errors.0.field': 'tags' } },
      notice: [
        'The same body was fine for POST, where tags has a default. On PUT, leaving tags out would silently erase them, so it is refused.',
        'The method decides which fields are required: POST three, PUT four, PATCH none.',
      ],
    },
    {
      kind: 'read',
      title: 'Reading the body, in the right order',
      goal: 'Each stack reads the raw bytes itself, after authentication, then checks the media type, then parses. Each step has its own problem.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/web/body.py',
          lines: [21, 51],
          note: 'read_json checks the Content-Type, then json.loads; json_body runs as a dependency, so the token is checked first.',
        },
        node: {
          path: 'node-typescript-gcp/src/http/body.ts',
          lines: [5, 37],
          note: 'Three middlewares in a row: the 415 check, express.raw with its 256 KB limit, and JSON.parse that turns a failure into malformed-json.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/Common/JsonBody.cs',
          lines: [6, 43],
          note: 'ReadRawAsync copies the bytes, Parse turns a JsonException into malformed-json, and RequireObject rejects anything that is not an object. The 415 check is in Http/JsonBodyFilter.cs.',
        },
      },
    },
    {
      kind: 'read',
      title: 'Every rule, every error',
      goal: 'The product rules, written three ways. Look for how each stack collects all the errors instead of stopping at the first.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/models/products.py',
          lines: [9, 55],
          note: 'Pydantic models: strict=True on PriceCents refuses 12.5 and "12", and a before-validator refuses null on PATCH.',
        },
        node: {
          path: 'node-typescript-gcp/src/products/schema.ts',
          lines: [5, 39],
          note: 'zod schemas: patchProductSchema is replaceProductSchema.partial(), and safeParse in src/http/validate.ts reports every issue at once.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/Endpoints/ProductInput.cs',
          lines: [17, 83],
          note: 'Hand-written checks that add to one errors list and throw only at the end, so every bad field is reported.',
        },
      },
    },
    {
      kind: 'think',
      title: '400 or 422?',
      question: 'A teammate wants every validation failure to be 422 Unprocessable Content instead of 400. What do you say?',
      answer:
        'Both are used, and both can be defended. RFC 9110 defines 422 for a request whose syntax is fine but whose content cannot be processed, so some APIs use it for validation. This API uses 400 for anything that breaks the schema and keeps 422 for business rules, such as an order for a product that does not exist. Pick one rule, write it in the contract, and use it everywhere.',
    },
    {
      kind: 'think',
      title: 'Should unknown fields be rejected?',
      question: 'To catch typos like titel, a teammate proposes rejecting any unknown field with a 400. What do you gain, and what do you lose?',
      answer:
        'You catch typos at once. You lose forward compatibility: a newer client that sends a new optional field breaks against every server that has not been upgraded yet, and during a rolling deploy some servers always lag behind. A common middle ground is to ignore unknown fields in production, log them, and be strict in tests and in your own client library.',
    },
    {
      kind: 'build',
      title: 'Cap the body size with a real 413',
      task: 'Limit every request body to 64 KB. A bigger body gets 413 Content Too Large, as problem details with the slug content-too-large, instead of being read and parsed.',
      steps: [
        'Add the slug content-too-large with status 413 and a title such as "The request body is too large" to your problem list: python-fastapi-aws/app/web/problems.py, node-typescript-gcp/src/http/problem.ts (the ProblemSlug type and its table), or dotnet-azure/src/ApiConcepts.Api/Common/ProblemTypes.cs.',
        'Python: refuse a body over 65,536 bytes in read_json in app/web/body.py, which every JSON route and echo use.',
        'TypeScript: lower the express.raw limit in src/http/body.ts to 64kb, and in src/http/errors.ts turn the entity.too.large error into the new problem instead of validation-error.',
        'C#: set Kestrel’s MaxRequestBodySize in Program.cs, or count the bytes in JsonBody.ReadRawAsync. Make sure the error becomes your 413 problem: today a body over Kestrel’s limit escapes as a 500 internal-error.',
        'Restart your server (the TypeScript server reloads by itself under npm run dev), then press Check: it posts a 70 KB body to the echo endpoint and expects 413.',
      ],
      hints: [
        'Look at Content-Length first: it costs nothing and stops most big bodies before you read a byte. A chunked body has no Content-Length, so count the bytes while reading as well.',
        'In C#, Kestrel throws BadHttpRequestException with StatusCode 413 when its limit is hit. ApiExceptionHandler is the one place that decides what every exception becomes.',
        'Decide where the check runs. A check on Content-Length before authentication would answer strangers about their bodies; a check in your body reader runs after it, like the other body checks. Send a big body with no token and see which answer you get.',
      ],
      check: {
        request: { method: 'POST', path: '/v1/echo', as: 'reader', json: { notes: 'x'.repeat(70_000) } },
        expect: { status: 413, body: { type: '/problems/content-too-large' } },
      },
      command: 'cd contract-tests && ./run.sh python   # or node, dotnet: every contract test must still pass',
      undo: 'git restore python-fastapi-aws node-typescript-gcp dotnet-azure   (from APIConcepts/), or keep your change on a branch',
    },
  ],
};
