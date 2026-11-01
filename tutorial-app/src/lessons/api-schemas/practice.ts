import type { Practice } from '../../practice/types';

export const practice: Practice = {
  id: 'api-schemas',
  intro:
    'You will fetch the OpenAPI document from your server and read it the way a tool does: paths, operations, components and references. Then you will check that the server really keeps the promises the document makes, and read the code that generates it in each stack.',
  steps: [
    {
      kind: 'try',
      title: 'Find the contract',
      goal: 'The API’s front door tells a client where its schema and its docs page live. No token is needed.',
      request: { method: 'GET', path: '/' },
      expect: { status: 200, body: { name: 'Bookshop API', openapi: '/openapi.json', docs: '/docs' } },
      notice: [
        'Two links: openapi.json for programs, and the docs page for people.',
        'Open the docs page in your browser now (http://localhost:<port>/docs). Python and TypeScript show Swagger UI; C# redirects to /docs/ and shows Scalar.',
      ],
    },
    {
      kind: 'try',
      title: 'Fetch the OpenAPI document',
      goal: 'The whole contract is one JSON document, and anyone may read it, even though the API itself needs a token.',
      request: { method: 'GET', path: '/openapi.json' },
      expect: {
        status: 200,
        headers: { 'Content-Type': '~application/json' },
        body: { openapi: '~3.', 'info.title': 'Bookshop API', 'info.version': '1.0.0', paths: '*', components: '*' },
      },
      notice: [
        'The openapi key is the version of the format. Python and TypeScript say 3.1.0; the C# generator says 3.0.4. Both are OpenAPI 3.',
        'info.version is the version of the API, 1.0.0. It is not the same thing as the format version.',
        'The document is long: tens of kilobytes. In a terminal, curl -s <url> | jq ".paths | keys" lists just the paths.',
      ],
    },
    {
      kind: 'try',
      title: 'Paths and their operations',
      goal: 'Under paths, each URL template has one entry per HTTP method. Check that the products path has both GET and POST, and that orders can be created.',
      request: { method: 'GET', path: '/openapi.json' },
      expect: {
        status: 200,
        body: {
          'paths./v1/products.get': '*',
          'paths./v1/products.post.summary': '~create',
          'paths./v1/products.post.responses.201': '*',
          'paths./v1/orders.post': '*',
        },
      },
      notice: [
        'Each operation has a summary, the title the docs page shows, and a responses map keyed by status code.',
        'Find the path for one product. Python names its parameter {product_id}, TypeScript and C# use {id}. The name is the implementation’s choice; the URL on the wire is the same.',
        'Look for operationId on the POST: Python makes a long one from the function name, TypeScript and C# send none. The build step fixes that.',
      ],
    },
    {
      kind: 'try',
      title: 'Components: the Product schema',
      goal: 'Shared shapes live under components.schemas. The Product schema should state the JSON rules from concept 7: integer cents and string timestamps.',
      request: { method: 'GET', path: '/openapi.json' },
      expect: {
        status: 200,
        body: {
          'components.schemas.Product.type': 'object',
          'components.schemas.Product.properties.priceCents.type': 'integer',
          'components.schemas.Product.properties.createdAt.type': 'string',
          'components.schemas.Product.properties.tags.type': 'array',
        },
      },
      notice: [
        'priceCents is integer, not number: a generated client gets a whole-number type, and a float is a contract violation.',
        'createdAt is a string. TypeScript and C# add format: date-time, so tools know it is a timestamp; the Python document leaves the format out. Generators differ in detail.',
        'Under components.securitySchemes, all three name the scheme bearerAuth: HTTP bearer, with bearerFormat JWT.',
      ],
    },
    {
      kind: 'try',
      title: 'A reference to a shared shape',
      goal: 'The 201 answer of the create operation does not repeat the product’s fields. It points at the one Product schema with $ref.',
      request: { method: 'GET', path: '/openapi.json' },
      expect: { status: 200, body: { 'paths./v1/products.post.responses.201.content.application/json.schema.$ref': '#/components/schemas/Product' } },
      notice: [
        '#/components/schemas/Product is a JSON Pointer into the same document.',
        'GET one, PUT and PATCH point at the same schema, so a field added to Product shows up in every operation at once.',
      ],
    },
    {
      kind: 'try',
      title: 'The document says bearer; try without one',
      goal: 'The document is public, but the security scheme says every products call needs a bearer token. Call the API without one.',
      request: { method: 'GET', path: '/v1/products' },
      expect: { status: 401, headers: { 'WWW-Authenticate': '~Bearer' }, body: { type: '/problems/unauthorized' } },
      notice: [
        'A 401 with WWW-Authenticate: Bearer, exactly what the security scheme promised.',
        'The docs page uses the same scheme: its Authorize button asks for a bearer token and sends it on every Try it out.',
      ],
    },
    {
      kind: 'try',
      title: 'A promise in the schema: limit is at most 50',
      goal: 'The list operation documents a limit parameter with a maximum of 50. A contract is only worth something if the server keeps it.',
      request: { method: 'GET', path: '/v1/products?limit=51', as: 'reader' },
      expect: { status: 400, body: { type: '/problems/validation-error', 'errors.0.field': 'limit' } },
      notice: [
        'The server refuses 51 with a 400 that names the field.',
        'Find limit under paths./v1/products.get.parameters in the document, with maximum: 50. Not every generator lists query parameters; the server enforces the rule either way.',
      ],
    },
    {
      kind: 'try',
      title: 'A body the schema does not allow',
      goal: 'The create schema lists author as required. Leave it out.',
      request: { method: 'POST', path: '/v1/products', as: 'writer', json: { title: 'Schemas First, Again', priceCents: 3399 } },
      expect: { status: 400, body: { type: '/problems/validation-error', 'errors.0.field': 'author' } },
      notice: [
        'A 400 that names author. Compare it with the required list of the create schema: CreateProduct in TypeScript, ProductCreate in Python, and an inline schema under the POST’s requestBody in C#.',
        'In TypeScript, the same zod schema produced both this error and that part of the document, so the two cannot disagree.',
      ],
    },
    {
      kind: 'read',
      title: 'Where each document comes from',
      goal: 'Each stack builds its OpenAPI document in its own way. Find where the schemas, the security scheme and the info block come from.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/web/docs.py',
          lines: [17, 45],
          note: 'Routes read bodies by hand, so request_body registers each Pydantic model, and build adds their schemas to what get_openapi generates.',
        },
        node: {
          path: 'node-typescript-gcp/src/openapi/document.ts',
          lines: [77, 113],
          note: 'operation registers one path by hand, adds the bearer requirement and the shared 401, 403 and 429 problems, and bodyOf reuses a zod schema.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/Composition/ServiceRegistration.cs',
          lines: [102, 126],
          note: 'AddOpenApi generates the document from the endpoints; the document transformer sets info and the bearer security scheme, and the operation transformer from OpenApiBody.cs adds the request bodies.',
        },
      },
    },
    {
      kind: 'read',
      title: 'One operation in each stack',
      goal: 'Find how creating a product is described: its summary, its body, its 201 response.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/routes/products.py',
          lines: [95, 107],
          note: 'status_code, response_model and openapi_extra describe the 201, the Product response and the ProductCreate body.',
        },
        node: {
          path: 'node-typescript-gcp/src/openapi/document.ts',
          lines: [143, 169],
          note: 'Each call names the method, the path, the scope, the request (query, params or body) and every response, each with a zod schema.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/Endpoints/ProductEndpoints.cs',
          lines: [11, 40],
          note: 'WithSummary and Produces are metadata the generator reads; the handlers read the body as raw bytes, so WithBody (in OpenApiBody.cs) marks its type and an operation transformer writes the requestBody.',
        },
      },
    },
    {
      kind: 'think',
      title: 'Do passing tests prove the document is right?',
      question:
        'The contract tests pass on all three servers. Open the three documents and compare paths./v1/products.post in each. Do the passing tests prove the documents are correct and complete?',
      answer:
        'No. The contract tests check behavior over HTTP; they read openapi.json only to check its version and a few paths. Compare the documents and you find real differences: the TypeScript and Python documents list the error responses of the POST, while the C# document lists only the 201. To guard the document too, lint it (for example with Spectral), diff it in code review, or run a schema-driven tool such as Schemathesis that sends requests built from the document and checks that the answers match it.',
    },
    {
      kind: 'think',
      title: 'Code-first or contract-first?',
      question:
        'Your company is starting a public API that a mobile team and two partners will use while your team builds it. Would you go code-first, like this repo, or contract-first?',
      answer:
        'Contract-first fits: write the OpenAPI document, review it with the people who will call it, and publish a mock server so the mobile team and partners can start at once. Then build the server and check it against the reviewed document in CI, with contract tests or a document diff. Code-first is fine for an internal API with one team, where speed matters more than early agreement.',
    },
    {
      kind: 'build',
      title: 'Give the product operations real operationIds',
      task: 'Client generators turn each operationId into a method name. Today Python sends long ids such as create_product_v1_products_post, and TypeScript and C# send none. Give the six product operations short, stable ids: listProducts, getProduct, createProduct, replaceProduct, patchProduct, deleteProduct.',
      steps: [
        'Python: in python-fastapi-aws/app/routes/products.py, give each of the six route decorators an operation id.',
        'TypeScript: in node-typescript-gcp/src/openapi/document.ts, let operation() take an operationId, pass it to registry.registerPath, and set it on the six product calls.',
        'C#: in dotnet-azure/src/ApiConcepts.Api/Endpoints/ProductEndpoints.cs, name each of the six endpoints.',
        'Restart your server (Python builds the document once and caches it; the TypeScript server reloads by itself), then press Check.',
        'Optional: run npx openapi-typescript http://localhost:<port>/openapi.json -o bookshop.d.ts and find createProduct under operations in the generated file.',
      ],
      hints: [
        'FastAPI route decorators take an operation_id argument.',
        'In ASP.NET Core, the endpoint name set with WithName becomes the operationId in the generated document. Endpoint names must be unique in the whole app.',
        'operationIds must be unique in the document. Pick names a client developer would type: listProducts, not getAllProductsHandler.',
      ],
      check: {
        request: { method: 'GET', path: '/openapi.json' },
        expect: {
          status: 200,
          body: { 'paths./v1/products.post.operationId': 'createProduct', 'paths./v1/products.get.operationId': 'listProducts' },
        },
      },
      command: 'cd contract-tests && ./run.sh python   # or node, dotnet: the contract tests must still pass',
    },
  ],
};
