import type { Practice } from '../../practice/types';

export const practice: Practice = {
  id: 'path-and-query-parameters',
  intro:
    'You will read one product by its path, filter and page the list with the query, break the rules on purpose to see the 400s, and watch how special characters survive the trip through a URL.',
  steps: [
    {
      kind: 'try',
      title: 'Get one product by its path',
      goal: 'The id in the path names exactly one resource. The router matches the template /v1/products/{id} and hands the id to the handler.',
      request: { method: 'GET', path: '/v1/products/prd_01', as: 'reader' },
      expect: { status: 200, headers: { ETag: '~prd_01-v' }, body: { id: 'prd_01' } },
      notice: [
        'The id came from the path, not from the query or a body.',
        'The ETag is built from the id and the version: one resource, one tag.',
      ],
    },
    {
      kind: 'try',
      title: 'A path that names nothing',
      goal: 'Ask for an id that does not exist. A path that names nothing is a 404, not an empty 200.',
      request: { method: 'GET', path: '/v1/products/prd_99', as: 'reader' },
      expect: { status: 404, body: { type: '/problems/not-found', instance: '/v1/products/prd_99' } },
      notice: [
        'The answer is a problem details document with the slug not-found.',
        'instance repeats the path, so a log line shows which id was missing. The detail text is worded differently in each stack.',
      ],
    },
    {
      kind: 'try',
      title: 'Filter and page the list with the query',
      goal: 'Same collection, a different view: only books tagged reliability, two at a time.',
      request: { method: 'GET', path: '/v1/products?tag=reliability&limit=2', as: 'reader' },
      expect: {
        status: 200,
        headers: { Link: '~tag=reliability' },
        body: { 'data.0.id': 'prd_08', 'data.1.id': 'prd_09', 'page.limit': 2, 'page.hasMore': true },
      },
      notice: [
        'tag filtered the collection and limit cut the page to two. The path did not change: only the view did.',
        'The Link header points at the next page. The server copied tag into it, so page two keeps the filter.',
      ],
    },
    {
      kind: 'try',
      title: 'Leave the query out: the defaults',
      goal: 'Every query parameter on the list is optional. Send none and see which defaults the server picks.',
      request: { method: 'GET', path: '/v1/products', as: 'reader' },
      expect: { status: 200, body: { 'page.limit': 10, 'data.length': 10, 'data.0.id': 'prd_01' } },
      notice: [
        'limit defaults to 10, no cursor means the first page, and no tag means every product.',
        'Defaults are part of the contract. A client should never have to guess them.',
      ],
    },
    {
      kind: 'try',
      title: 'A limit out of range',
      goal: 'limit must be an integer from 1 to 50. Ask for 0 and the check stops the request before any work happens.',
      request: { method: 'GET', path: '/v1/products?limit=0', as: 'reader' },
      expect: {
        status: 400,
        body: { type: '/problems/validation-error', 'errors.0.field': 'limit', instance: '/v1/products' },
      },
      notice: [
        'The errors array names the field, limit. That name is the contract.',
        'The message is worded by each framework: FastAPI says "Input should be greater than or equal to 1", the other two say "must be between 1 and 50".',
        'instance is the path without the query string.',
      ],
    },
    {
      kind: 'try',
      title: 'Not a number at all',
      goal: 'A lenient parser would read 5abc as 5 and drop the rest. This API parses strictly and refuses the whole value.',
      request: { method: 'GET', path: '/v1/products?limit=5abc', as: 'reader' },
      expect: { status: 400, body: { type: '/problems/validation-error', 'errors.0.field': 'limit' } },
      notice: [
        'All three stacks refuse 5abc, so a client bug shows up at once instead of being hidden.',
        'Where SPEC.md is silent, the stacks differ: Python and TypeScript accept limit=2.0 and C# does not, and an empty limit= is a 400 on two stacks but the default on C#. Send plain integers.',
      ],
    },
    {
      kind: 'try',
      title: 'A cursor the server never issued',
      goal: 'A cursor is an opaque string that only the server can read. One it cannot decode gets its own slug.',
      request: { method: 'GET', path: '/v1/products?cursor=not-a-real-cursor', as: 'reader' },
      expect: { status: 400, body: { type: '/problems/invalid-cursor' } },
      notice: [
        'invalid-cursor is a different slug from validation-error, so a client can tell "start again from page one" apart from "fix your limit".',
        'Each stack encodes its cursors differently. That is fine, because clients must never build or read them.',
      ],
    },
    {
      kind: 'try',
      title: 'A misspelled parameter',
      goal: 'Send limt=2 instead of limit=2. A parameter the server does not know is ignored, not rejected.',
      request: { method: 'GET', path: '/v1/products?limt=2', as: 'reader' },
      expect: { status: 200, body: { 'page.limit': 10 } },
      notice: [
        'The typo fell back to the default of 10, with no error at all.',
        'Ignoring unknown parameters lets older servers accept newer clients, but it hides typos. page.limit in the answer tells you what the server really used.',
      ],
    },
    {
      kind: 'try',
      title: 'An ampersand inside a value, not encoded',
      goal: 'Search for R&D by gluing the text onto the URL. The echo endpoint shows what the server parsed.',
      request: { method: 'GET', path: '/v1/echo?q=R&D', as: 'reader' },
      expect: { status: 200, body: { 'query.q': 'R', 'query.D': '' } },
      notice: [
        'The server split the query at the ampersand: q is just R, and D is a second parameter with an empty value.',
        'Nothing failed. The search is simply wrong, which is what makes this bug hard to find.',
      ],
    },
    {
      kind: 'try',
      title: 'Encode the value',
      goal: 'Percent-encode the ampersand as %26, and use a plus sign for the space, as a URL builder does.',
      request: { method: 'GET', path: '/v1/echo?q=R%26D+books', as: 'reader' },
      expect: { status: 200, body: { 'query.q': 'R&D books' } },
      notice: [
        '%26 became an ampersand and the plus sign became a space. The server decodes the query before your code sees it.',
        'A real plus sign must be sent as %2B. URLSearchParams, urlencode and Uri.EscapeDataString handle all of this for you.',
      ],
    },
    {
      kind: 'try',
      title: 'The same name twice',
      goal: 'A query can repeat a name. SPEC.md says echo reports the first value, which makes the rule visible.',
      request: { method: 'GET', path: '/v1/echo?tag=http&tag=rest', as: 'reader' },
      expect: { status: 200, body: { 'query.tag': 'http' } },
      notice: [
        'Echo kept the first value, http, on every stack.',
        'Frameworks disagree on repeated names: some keep the first, some the last, some build a list. On the product list, a repeated limit is a 400 in TypeScript and C#, while Python uses the last value. Document what your API does.',
      ],
    },
    {
      kind: 'read',
      title: 'Where the parameter rules live',
      goal: 'Each stack declares a type, a range and a default for every parameter, and turns a failed check into a 400 that names the field.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/routes/products.py',
          lines: [56, 92],
          note: 'limit: Annotated[int, Query(ge=1, le=50)] = 10 declares the type, the range and the default in one line, and product_id comes from the path template.',
        },
        node: {
          path: 'node-typescript-gcp/src/http/schemas.ts',
          lines: [4, 16],
          note: 'Query values are always strings, so intInRange uses z.coerce.number and then checks it is a whole number in range; listProductsQuerySchema in src/products/schema.ts uses it.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/Common/PageRequest.cs',
          lines: [8, 28],
          note: 'The C# server reads the raw string and uses int.TryParse with NumberStyles.None, so signs, spaces and decimals are all refused.',
        },
      },
    },
    {
      kind: 'read',
      title: 'The list route: filter, page, and encode the next link',
      goal: 'The route reads the parameters, filters by tag, and builds the Link header with a URL builder instead of gluing strings.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/web/pagination.py',
          lines: [62, 83],
          note: 'next_link builds the query with urlencode, which percent-encodes the cursor and the tag.',
        },
        node: {
          path: 'node-typescript-gcp/src/products/routes.ts',
          lines: [47, 69],
          note: 'parse(listProductsQuerySchema, req.query, \'query\') validates first; URLSearchParams builds the next link.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/Endpoints/ProductEndpoints.cs',
          lines: [44, 83],
          note: 'NextLink encodes each value with Uri.EscapeDataString, and Get receives the path parameter as string id.',
        },
      },
    },
    {
      kind: 'think',
      title: 'Path or query?',
      question:
        'You add two features: list the orders of one customer, and list only paid orders. Where does each value go, and why?',
      answer:
        'The customer is identity: it picks which collection you mean, so it goes in the path, as in /v1/customers/{id}/orders. Paid is a filter on that collection, so it goes in the query, as ?status=paid, optional, with "all" as the default. In this API the token already says who the client is, so GET /v1/orders returns only the caller’s orders and needs no customer id in the path.',
    },
    {
      kind: 'think',
      title: 'A token in the URL',
      question:
        'A partner says their tool cannot set headers, and asks to send the access token as ?access_token=… in the URL. What do you tell them?',
      answer:
        'Push back. URLs are copied into access logs, proxy logs, browser history and Referer headers, so the token leaks to anyone who can read them. Almost every HTTP tool can send Authorization: Bearer. RFC 6750 allows a query token only when the header is impossible; if you must accept it, give it a very short lifetime and a narrow scope, and strip it from your logs.',
    },
    {
      kind: 'build',
      title: 'Add an author filter to the product list',
      task: 'Readers want every book by one author. Add an optional author query parameter to GET /v1/products that keeps only the products by that author, and validate it like the other parameters.',
      steps: [
        'Open the list route in your stack: python-fastapi-aws/app/routes/products.py, node-typescript-gcp/src/products/routes.ts (its query schema is in src/products/schema.ts), or dotnet-azure/src/ApiConcepts.Api/Endpoints/ProductEndpoints.cs.',
        'Declare author as an optional query parameter: trimmed, 1 to 100 characters, like a product’s author field. A blank or too long value is a 400 validation-error with the field author.',
        'Filter where tag is filtered today: in the repository in Python (app/repositories/products.py) and C# (Storage/InMemoryProductRepository.cs and Storage/Repositories.cs), and in the route in TypeScript.',
        'Copy author into the next Link the way tag is copied, so page two keeps the filter. Let the URL builder encode the space in the name.',
        'Restart your server (the TypeScript server reloads by itself under npm run dev), then press Check: it asks for Amira Haddad, sent as Amira%20Haddad, and expects her book, prd_07, first.',
      ],
      hints: [
        'Follow tag through your stack, from where it is read to where it filters, and add author next to it at every step.',
        'The server has already decoded the value: your code sees "Amira Haddad" with a real space, never %20.',
        'Try author= (empty) and an author of 101 characters too. Both should be a 400 that names author, while every other request behaves as before.',
      ],
      check: {
        request: { method: 'GET', path: '/v1/products?author=Amira%20Haddad', as: 'reader' },
        expect: { status: 200, body: { 'data.0.id': 'prd_07', 'data.0.author': 'Amira Haddad' } },
      },
      command: 'cd contract-tests && ./run.sh python   # or node, dotnet: every contract test must still pass',
      undo: 'git restore python-fastapi-aws node-typescript-gcp dotnet-azure   (from APIConcepts/), or keep your change on a branch',
    },
  ],
};
