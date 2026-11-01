import type { Practice } from '../../practice/types';

export const practice: Practice = {
  id: 'pagination',
  intro:
    'You will page through the product list with a cursor, break the rules on purpose (a huge limit, a cursor the server never made, a filter you forget), and read the code that builds each page. New products always sort last, so the first pages of the seed list stay the same however many products other labs create.',
  steps: [
    {
      kind: 'try',
      title: 'Ask for the list with no limit',
      goal: 'A client that asks for "all products" still gets one page. The server picks a default size, so no response can grow with the data.',
      request: { method: 'GET', path: '/v1/products', as: 'reader' },
      expect: { status: 200, body: { 'data.length': 10, 'page.limit': 10, 'page.hasMore': true } },
      notice: [
        'Ten products, and page.limit says 10: that is the default.',
        'page.hasMore is true. There are more products, but the server will not send them until you ask.',
      ],
    },
    {
      kind: 'try',
      title: 'The first page of three',
      goal: 'Choose the page size with limit. The answer has the items in data, and a page object that says how to continue.',
      request: { method: 'GET', path: '/v1/products?limit=3', as: 'reader' },
      expect: {
        status: 200,
        headers: { Link: '~rel="next"' },
        body: { 'data.length': 3, 'data.0.id': 'prd_01', 'data.2.id': 'prd_03', 'page.limit': 3, 'page.hasMore': true, 'page.nextCursor': '*' },
      },
      save: { CURSOR: 'body.page.nextCursor' },
      notice: [
        'Products 1 to 3, in creation order. The lab saved page.nextCursor for the next step.',
        'The Link header holds the same cursor inside a ready-made URL, with rel="next" and the limit repeated.',
        'The cursor differs on each server. Each stack encodes the position its own way, which is why clients must treat it as opaque.',
      ],
    },
    {
      kind: 'try',
      title: 'The next page, with the cursor',
      goal: 'Send the cursor back, unchanged, with the same limit. The server continues strictly after the last item of page one.',
      request: { method: 'GET', path: '/v1/products?limit=3&cursor={{CURSOR}}', as: 'reader' },
      expect: { status: 200, body: { 'data.0.id': 'prd_04', 'data.2.id': 'prd_06', 'page.limit': 3, 'page.hasMore': true } },
      notice: [
        'Products 4 to 6: no item repeated and none skipped.',
        'Curious? Paste the cursor into a base64 decoder. Python shows JSON, TypeScript shows v1|time|id, and C# shows ticks:id. Then forget what you saw: clients must not depend on it.',
      ],
    },
    {
      kind: 'try',
      title: 'Misuse: ask for 500 at once',
      goal: 'The server caps the page size at 50. A larger limit is not quietly cut down; it is refused, so the client learns the rule.',
      request: { method: 'GET', path: '/v1/products?limit=500', as: 'reader' },
      expect: { status: 400, body: { type: '/problems/validation-error', 'errors.0.field': 'limit' } },
      notice: [
        '400 with problem details, and errors names the field: limit.',
        'The message differs by stack (Python uses its validation library’s wording), but the type and the field are the same everywhere.',
      ],
    },
    {
      kind: 'try',
      title: 'Misuse: a cursor the server never made',
      goal: 'Build a cursor by hand. The server cannot decode it, so it refuses instead of guessing a position.',
      request: { method: 'GET', path: '/v1/products?limit=3&cursor=nope', as: 'reader' },
      expect: { status: 400, body: { type: '/problems/invalid-cursor', status: 400 } },
      notice: [
        'invalid-cursor is its own problem type, so a client can react to it: drop the cursor and start again from page one.',
        'A cursor comes from the client, so the server treats it as untrusted input and decodes it carefully.',
      ],
    },
    {
      kind: 'try',
      title: 'Filter with a tag',
      goal: 'Ask for only the reliability books, two per page. The filter is applied before the page is cut.',
      request: { method: 'GET', path: '/v1/products?tag=reliability&limit=2', as: 'reader' },
      expect: { status: 200, headers: { Link: '~tag=reliability' }, body: { 'data.0.id': 'prd_08', 'data.1.id': 'prd_09', 'page.hasMore': true } },
      save: { TAG_CURSOR: 'body.page.nextCursor' },
      notice: [
        'Products 8 and 9, the first two with the tag reliability.',
        'Look at the Link header: it repeats both limit=2 and tag=reliability next to the cursor.',
      ],
    },
    {
      kind: 'try',
      title: 'The next page, with the same filter',
      goal: 'Send the cursor and the tag again. This is exactly the URL the Link header gave you.',
      request: { method: 'GET', path: '/v1/products?tag=reliability&limit=2&cursor={{TAG_CURSOR}}', as: 'reader' },
      expect: { status: 200, body: { 'data.0.id': 'prd_13', 'data.1.id': 'prd_23' } },
      notice: [
        'Products 13 and 23: still only reliability books.',
        'Products that other labs created with this tag come later, because new products sort last.',
      ],
    },
    {
      kind: 'try',
      title: 'Misuse: forget the filter on the next page',
      goal: 'A client builds the next URL itself and keeps the cursor, but drops the tag. Watch what the server returns.',
      request: { method: 'GET', path: '/v1/products?limit=2&cursor={{TAG_CURSOR}}', as: 'reader' },
      expect: { status: 200, body: { 'data.0.id': 'prd_10', 'data.1.id': 'prd_11' } },
      notice: [
        'A 200 with products 10 and 11, which are not reliability books. No error at all.',
        'The cursor only holds a position: after product 9. The filter lives in the URL, so the client must send it with every page. Following the Link header does that for you.',
      ],
    },
    {
      kind: 'try',
      title: 'The last page',
      goal: 'Only one seed product has the tag career, so its first page is also its last. See how the server says "no more".',
      request: { method: 'GET', path: '/v1/products?tag=career&limit=10', as: 'reader' },
      expect: { status: 200, headers: { Link: false }, body: { 'data.0.id': 'prd_25', 'page.hasMore': false, 'page.nextCursor': null } },
      notice: [
        'hasMore is false and nextCursor is null: the client stops here.',
        'There is no Link header at all, because there is no next page to link to.',
      ],
    },
    {
      kind: 'read',
      title: 'The opaque cursor',
      goal: 'Each stack turns the last item’s (createdAt, id) into a string and back. Decoding failures become invalid-cursor, never a crash and never a guess.',
      files: {
        python: { path: 'python-fastapi-aws/app/web/pagination.py', lines: [23, 67], note: 'encode_cursor writes base64url JSON; make_page gets limit + 1 rows, and the extra row only sets the next cursor.' },
        node: { path: 'node-typescript-gcp/src/http/pagination.ts', lines: [9, 42], note: 'decodeCursor checks the decoded text against a strict pattern; paginate finds the first item whose sort key is after the cursor.' },
        dotnet: { path: 'dotnet-azure/src/ApiConcepts.Api/Common/Cursor.cs', lines: [8, 59], note: 'Cursor.Parse turns any decoding error into InvalidCursor; Paging.Take filters strictly after (createdAt, id) and takes limit + 1.' },
      },
    },
    {
      kind: 'read',
      title: 'The list route: filter, page, Link',
      goal: 'The route applies the tag, cuts one page, and adds a Link header that repeats limit and tag.',
      files: {
        python: { path: 'python-fastapi-aws/app/routes/products.py', lines: [56, 80], note: 'The repository is asked for limit + 1 rows with the tag; next_link adds the tag next to the cursor.' },
        node: { path: 'node-typescript-gcp/src/products/routes.ts', lines: [47, 62], note: 'The tag filter runs before paginate, and URLSearchParams encodes the cursor and tag into the Link.' },
        dotnet: { path: 'dotnet-azure/src/ApiConcepts.Api/Endpoints/ProductEndpoints.cs', lines: [44, 74], note: 'repo.List filters by tag and pages; NextLink escapes the cursor and appends the tag.' },
      },
    },
    {
      kind: 'think',
      title: 'Page numbers or a cursor?',
      question:
        'Your team wants page numbers (1, 2, 3 … 40) under an internal admin table of 2,000 products, and infinite scroll through millions of customer orders. Which pagination would you use for each, and why?',
      answer:
        'Offset for the admin table: it is small, people want to jump to a page, and an occasional skipped row in an internal tool is acceptable. A cursor for the orders feed: it is huge and always changing, users only move forward, and keyset paging never skips or repeats rows while every page costs about the same.',
    },
    {
      kind: 'think',
      title: 'Can we add a total count?',
      question: 'A client asks you to add "total": the number of matching products, on every page. What does that cost, and what would you offer instead?',
      answer:
        'A total means counting every matching row on every request, which gets slower as the table grows, and the number is out of date a moment later anyway. hasMore, from one extra row, answers what most screens need: is there more? If a total is truly needed, offer it separately (a count endpoint, or an estimate) so normal paging stays cheap.',
    },
    {
      kind: 'build',
      title: 'Add a price filter that survives paging',
      task: 'Add an optional maxPriceCents query parameter to GET /v1/products: only products that cost at most that many cents. It must work with the cursor, and the Link header must carry it to the next page, just like tag.',
      steps: [
        'Open the list route: python-fastapi-aws/app/routes/products.py (list_products), node-typescript-gcp/src/products/routes.ts (the GET / handler and listProductsQuerySchema in src/products/schema.ts), or dotnet-azure/src/ApiConcepts.Api/Endpoints/ProductEndpoints.cs (List).',
        'Read maxPriceCents as an integer from 0 to 10000000. Anything else is a 400 validation-error that names the field, like limit.',
        'Filter before the page is cut, in the same place as tag: python-fastapi-aws/app/repositories/products.py, the filter before paginate in TypeScript, or dotnet-azure/src/ApiConcepts.Api/Storage/InMemoryProductRepository.cs.',
        'Add maxPriceCents to the Link header when it was sent, next to limit, cursor and tag.',
        'Restart your server (the TypeScript server reloads by itself under npm run dev), then press Check: it asks for products up to 3000 cents, two per page.',
      ],
      hints: [
        'The cursor does not change. It still holds only (createdAt, id); the filter travels in the URL, which is why the Link header must repeat it.',
        'Filtering after taking limit + 1 rows is the classic bug: pages come back short, or hasMore lies. Filter first, then take.',
        'Seed products under 30 dollars start with prd_03 (2599) and prd_08 (2899), so the first page of the check should be exactly those two.',
      ],
      check: {
        request: { method: 'GET', path: '/v1/products?maxPriceCents=3000&limit=2', as: 'reader' },
        expect: { status: 200, headers: { Link: '~maxPriceCents=3000' }, body: { 'data.0.id': 'prd_03', 'data.1.id': 'prd_08' } },
      },
      command: 'cd contract-tests && ./run.sh python   # or node, dotnet: the contract tests must still pass',
      undo: 'git restore python-fastapi-aws node-typescript-gcp dotnet-azure   (from APIConcepts/), or keep your change on a branch',
    },
  ],
};
