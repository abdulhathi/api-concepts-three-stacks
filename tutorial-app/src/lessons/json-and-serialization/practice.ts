import type { Practice } from '../../practice/types';

const BOOK = { title: 'JSON in Three Languages', author: 'Lab Learner', priceCents: 2599, tags: ['serialization'] };

export const practice: Practice = {
  id: 'json-and-serialization',
  intro:
    'You will create a product and read it back, then break each JSON rule on purpose: a PascalCase name, a float price, a null in a PATCH, single quotes. Finally you will send one body through all three languages and see where they differ.',
  vars: { BUILD_KEY: 'uuid' },
  steps: [
    {
      kind: 'try',
      title: 'Create a product and look at its JSON',
      goal: 'The server serializes the new product into JSON. Look at the names, the price and the timestamps it chose.',
      request: { method: 'POST', path: '/v1/products', as: 'writer', json: BOOK },
      expect: {
        status: 201,
        body: { id: '~prd_', priceCents: 2599, currency: 'USD', createdAt: '~Z', 'createdAt.length': 24, 'updatedAt.length': 24 },
      },
      save: { PRODUCT_ID: 'body.id', CREATED_AT: 'body.createdAt' },
      notice: [
        'Every name is camelCase: priceCents, createdAt, updatedAt. The same in Python, TypeScript and C#.',
        'priceCents is a whole number: 2599 means 25 dollars and 99 cents, and currency USD travels beside it.',
        'createdAt is exactly 24 characters: the date, a T, the time with three digits after the second, and a Z for UTC.',
      ],
    },
    {
      kind: 'try',
      title: 'Read it back: the round trip',
      goal: 'The server stored the product and now serializes it again. A good wire format comes back exactly as it went out.',
      request: { method: 'GET', path: '/v1/products/{{PRODUCT_ID}}', as: 'reader' },
      expect: { status: 200, body: { id: '{{PRODUCT_ID}}', priceCents: 2599, createdAt: '{{CREATED_AT}}', tags: ['serialization'] } },
      notice: [
        'createdAt is the same string, character for character, as in the create answer.',
        'In between, Python held it as a datetime and C# as a DateTimeOffset. On the wire it is always the same text.',
      ],
    },
    {
      kind: 'try',
      title: 'Not JSON at all: single quotes',
      goal: 'Deserializing has two stages: parse the text, then check the shape. This body fails the first stage, because JSON strings need double quotes.',
      request: {
        method: 'POST',
        path: '/v1/products',
        as: 'writer',
        headers: { 'Content-Type': 'application/json' },
        raw: "{'title': 'Single Quotes', 'author': 'Lab Learner', 'priceCents': 2599}",
      },
      expect: { status: 400, body: { type: '/problems/malformed-json' } },
      notice: [
        'malformed-json means the parser gave up before any field was looked at.',
        'JSON is strict on purpose: double quotes only, no trailing commas, no comments. That is what makes every parser agree.',
      ],
    },
    {
      kind: 'try',
      title: 'Names are case-sensitive',
      goal: 'Send the price the way a C# property is named: PriceCents. JSON names are case-sensitive, so the server does not see a priceCents at all.',
      request: { method: 'POST', path: '/v1/products', as: 'writer', json: { title: 'Pascal Case', author: 'Lab Learner', PriceCents: 2599 } },
      expect: { status: 400, body: { type: '/problems/validation-error', 'errors.0.field': 'priceCents' } },
      notice: [
        'The error names the field the API expects, in camelCase: priceCents.',
        'The message wording differs by stack (Field required, is required, must be an integer…). The status, type and field are the same.',
        'The same goes for snake_case: price_cents is refused too, even by Python, whose code uses that name inside.',
      ],
    },
    {
      kind: 'try',
      title: 'Unknown properties are ignored',
      goal: 'Send two fields the API does not take: color, which it has never heard of, and currency, which it only ever writes itself.',
      request: {
        method: 'POST',
        path: '/v1/products',
        as: 'writer',
        json: { title: 'Extra Fields', author: 'Lab Learner', priceCents: 2599, color: 'red', currency: 'EUR' },
      },
      expect: { status: 201, body: { priceCents: 2599, currency: 'USD' } },
      notice: [
        'A 201: the extra fields did not cause an error.',
        'There is no color in the answer, and currency is still USD. Output-only fields cannot be set by a client.',
        'Ignoring unknown fields lets an older server accept a body from a newer client. The rule is written in SPEC.md, so every stack does the same.',
      ],
    },
    {
      kind: 'try',
      title: 'Money as a float is refused',
      goal: 'Send the price in dollars, as 25.99. The API counts money in integer cents, so a float is a client bug, not a value to round.',
      request: { method: 'POST', path: '/v1/products', as: 'writer', json: { title: 'Float Money', author: 'Lab Learner', priceCents: 25.99 } },
      expect: { status: 400, body: { type: '/problems/validation-error', 'errors.0.field': 'priceCents' } },
      notice: [
        'A 400 on all three stacks. The server does not guess whether you meant 25.99 dollars or 26 cents.',
        'Change 25.99 to "2599", a string, in the curl command: it is refused too. Python is strict, zod wants a number, and C# reads only a JSON number.',
        'One edge where the stacks differ: 2599.0 passes in TypeScript, because JavaScript has no separate integer type, while Python and C# refuse it.',
      ],
    },
    {
      kind: 'try',
      title: 'A nullable field is sent as null',
      goal: 'Ask for the products tagged career. There is only one page, so there is no next cursor. Is nextCursor missing, or null?',
      request: { method: 'GET', path: '/v1/products?tag=career', as: 'reader' },
      expect: { status: 200, body: { 'page.nextCursor': null, 'page.hasMore': false } },
      notice: [
        'nextCursor is present, with the value null. It is never left out.',
        'A client can write while (page.nextCursor !== null) and trust it. If the key were missing, JavaScript would read undefined and the loop would not stop.',
      ],
    },
    {
      kind: 'try',
      title: 'Missing in a PATCH: leave it alone',
      goal: 'In a request, a missing field has its own meaning. PATCH only the title of your product, and leave tags out.',
      request: { method: 'PATCH', path: '/v1/products/{{PRODUCT_ID}}', as: 'writer', json: { title: 'JSON in Three Languages, 2nd Edition' } },
      expect: { status: 200, body: { title: 'JSON in Three Languages, 2nd Edition', tags: ['serialization'] } },
      notice: [
        'The title changed and the tags did not: a field left out of a PATCH means do not touch it.',
        'createdAt is unchanged; updatedAt moved forward, in the same 24-character UTC format.',
      ],
    },
    {
      kind: 'try',
      title: 'null in a PATCH is a value',
      goal: 'Now send tags as null. Unlike a missing field, null is an explicit value, and a product’s tags cannot be null.',
      request: { method: 'PATCH', path: '/v1/products/{{PRODUCT_ID}}', as: 'writer', json: { tags: null } },
      expect: { status: 400, body: { type: '/problems/validation-error', 'errors.0.field': 'tags' } },
      notice: [
        'A 400 that names tags. Missing and null are two different requests.',
        'In JSON Merge Patch (RFC 7396), null means remove the field. This API has no optional product fields to remove, so null is refused.',
      ],
    },
    {
      kind: 'try',
      title: 'One body through three languages',
      goal: 'The echo endpoint deserializes your JSON into its own types and serializes it back. Send a huge integer, a decimal, a null and a timestamp, and see what survives.',
      request: {
        method: 'POST',
        path: '/v1/echo',
        as: 'reader',
        headers: { 'Content-Type': 'application/json' },
        raw: '{"orderId": 9007199254740993, "price": 19.99, "note": null, "when": "2026-01-01T00:00:00.000Z"}',
      },
      expect: { status: 200, body: { 'body.when': '2026-01-01T00:00:00.000Z', 'body.note': null, 'body.price': 19.99, 'body.orderId': '*' } },
      notice: [
        'when comes back as the same string: JSON has no date type, so nothing turned it into a date.',
        'Run the curl command on each server and look at orderId. Python and C# answer 9007199254740993; TypeScript answers 9007199254740992, because a JavaScript number is a 64-bit float.',
        'This lab is JavaScript too, so it shows …992 for every server. That is exactly why large ids belong in strings.',
      ],
    },
    {
      kind: 'read',
      title: 'Input: names and integer cents',
      goal: 'Each stack checks priceCents by its camelCase name and refuses anything that is not a whole number.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/models/products.py',
          lines: [9, 30],
          note: 'PriceCents is a strict int, so 25.99 and "2599" fail instead of being coerced, and ProductCreate is an ApiInput, so the body must use the wire name priceCents, not the Python name price_cents.',
        },
        node: {
          path: 'node-typescript-gcp/src/products/schema.ts',
          lines: [5, 39],
          note: 'priceCents must be a number and an integer; z.object drops keys it does not list, which is how unknown fields are ignored.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/Endpoints/ProductInput.cs',
          lines: [64, 83],
          note: 'Price looks up priceCents by its exact name and accepts only a JSON number that fits an int, from 0 to 10000000.',
        },
      },
    },
    {
      kind: 'read',
      title: 'Output: camelCase and one timestamp format',
      goal: 'Each stack sets the wire format in one place, so no handler formats names or dates by hand.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/models/base.py',
          lines: [1, 32],
          note: 'to_camel renames every field for the wire and UtcTimestamp sends each datetime through format_timestamp; ApiInput turns off snake_case names for request bodies, so price_cents is an unknown property.',
        },
        node: {
          path: 'node-typescript-gcp/src/products/seed.ts',
          lines: [32, 49],
          note: 'The objects are already camelCase, and isoTimestamp wraps toISOString, which always gives three digits and a Z.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/Common/UtcTimestampConverter.cs',
          lines: [1, 17],
          note: 'One converter, registered once in ServiceRegistration.cs, writes every DateTimeOffset as UTC with three digits and a Z.',
        },
      },
    },
    {
      kind: 'think',
      title: 'Converting dollars to cents',
      question:
        'A client stores prices in dollars and converts them for this API with Math.trunc(price * 100). For a price of 4.35 the API receives 434. What happened, and what would you change?',
      answer:
        '4.35 has no exact binary form, so 4.35 * 100 is 434.99999999999994, and truncating drops a cent. Rounding would fix this case, but the real fix is to never hold money as a binary float: keep integer cents from end to end, or use a decimal type, and turn cents into dollars only for display.',
    },
    {
      kind: 'think',
      title: 'Local time for the user?',
      question: 'A product manager asks the API to send timestamps in each user’s local time, so the app does not have to convert. Should it?',
      answer:
        'No. Send UTC with a Z, as this API does. The server often does not know the user’s zone, local times without an offset cannot be compared or sorted, and daylight saving time makes some local times ambiguous. The client knows the user’s zone and converts at the last step, for display.',
    },
    {
      kind: 'build',
      title: 'Add a paidAt timestamp to orders',
      task: 'Orders say whether they are paid, but not when. Add paidAt: null while an order is pending, and the time it was paid once it is paid. The key must be in every order response, never left out.',
      steps: [
        'Find the order shape: python-fastapi-aws/app/models/orders.py, node-typescript-gcp/src/orders/schema.ts or dotnet-azure/src/ApiConcepts.Api/Domain/Order.cs.',
        'Add a nullable timestamp field that reaches the wire as paidAt.',
        'Set it to null where an order is created: python-fastapi-aws/app/services/orders.py, node-typescript-gcp/src/orders/service.ts or dotnet-azure/src/ApiConcepts.Api/Orders/OrderInput.cs.',
        'Set it to the current time where an order is paid: the pay method in the same Python and TypeScript files, or Pay in dotnet-azure/src/ApiConcepts.Api/Endpoints/OrderEndpoints.cs.',
        'Restart your server (the TypeScript server reloads by itself), then press Check: it creates an order and expects paidAt: null in the answer.',
        'Pay that order with curl (POST /v1/orders/<id>/pay as writer) and confirm paidAt is a 24-character UTC string ending in Z.',
      ],
      hints: [
        'Use the timestamp type the other fields use (UtcTimestamp in Python, isoTimestamp in TypeScript, DateTimeOffset in C#), so the shared format applies and nothing is formatted by hand.',
        'In TypeScript, JSON.stringify drops a key whose value is undefined. Write null, not undefined.',
        'In C#, a nullable DateTimeOffset? still goes through the timestamp converter, and System.Text.Json writes null by default unless someone set an ignore condition.',
      ],
      check: {
        request: {
          method: 'POST',
          path: '/v1/orders',
          as: 'writer',
          headers: { 'Idempotency-Key': '{{BUILD_KEY}}' },
          json: { items: [{ productId: 'prd_03', quantity: 1 }] },
        },
        expect: { status: 201, body: { status: 'pending', paidAt: null } },
      },
      command: 'cd contract-tests && ./run.sh python   # or node, dotnet: the contract tests must still pass',
      undo: 'git restore python-fastapi-aws node-typescript-gcp dotnet-azure   (from APIConcepts/), or keep your change on a branch',
    },
  ],
};
