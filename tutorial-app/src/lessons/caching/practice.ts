import type { Practice } from '../../practice/types';

const NEW_TITLE = 'Caching lab {{RUN}} (new title)';

export const practice: Practice = {
  id: 'caching',
  intro:
    'You will read a product, revalidate it with its ETag and get a 304 with no body, see which responses may be stored and which may not, and then create your own product and edit it the safe way with If-Match, until a stale edit gets a 412.',
  vars: { RUN: 'uuid' },
  steps: [
    {
      kind: 'try',
      title: 'Read one product',
      goal: 'A product response carries a validator (the ETag) and a storage rule (Cache-Control). The lab saves the ETag, as a browser would.',
      request: { method: 'GET', path: '/v1/products/prd_01', as: 'reader' },
      expect: { status: 200, headers: { ETag: '~"prd_01-v', 'Cache-Control': 'private, max-age=60' }, body: { id: 'prd_01' } },
      save: { ETAG: 'header.etag' },
      notice: [
        'The ETag is strong: quotes and no W/ in front. It is the id plus the version, so it changes on every edit.',
        'private means only this client may store it, never a CDN. max-age=60 means it stays fresh for 60 seconds.',
      ],
    },
    {
      kind: 'try',
      title: 'Ask again with If-None-Match',
      goal: 'The copy is stale after 60 seconds, so the client asks again, and sends the ETag it has. Nothing changed, so there is nothing to send.',
      request: { method: 'GET', path: '/v1/products/prd_01', as: 'reader', headers: { 'If-None-Match': '{{ETAG}}' } },
      expect: { status: 304, empty: true, headers: { ETag: '{{ETAG}}', 'Cache-Control': 'private, max-age=60' } },
      notice: [
        '304 Not Modified, and the body is empty: the client keeps using its own copy.',
        'The 304 repeats the ETag and Cache-Control, so the client can restart its 60 fresh seconds.',
        'The lab sends every request with cache: no-store, so this 304 came from the server, not from your browser’s cache.',
      ],
    },
    {
      kind: 'try',
      title: 'A list has a weak ETag',
      goal: 'A page of products has no single version, so the server hashes the body it is about to send and marks the ETag weak.',
      request: { method: 'GET', path: '/v1/products?limit=2', as: 'reader' },
      expect: { status: 200, headers: { ETag: '~W/"', 'Cache-Control': 'private, max-age=30' } },
      save: { LIST_ETAG: 'header.etag' },
      notice: [
        'W/ in front means weak: the same meaning, not a promise of the same bytes.',
        'The value differs on each server, because each one writes the JSON a little differently. Only the server that made it can check it.',
        'max-age is 30 here, half the product’s 60: a list changes whenever any of its products changes.',
      ],
    },
    {
      kind: 'try',
      title: 'Revalidate the list',
      goal: 'Send the list’s ETag back. The first page of the seed list has not changed, so the hash is the same.',
      request: { method: 'GET', path: '/v1/products?limit=2', as: 'reader', headers: { 'If-None-Match': '{{LIST_ETAG}}' } },
      expect: { status: 304, empty: true, headers: { ETag: '{{LIST_ETAG}}' } },
      notice: [
        'A 304 for a list works exactly like one for a product.',
        'The server still read the products and built the body to hash it. A list 304 saves bandwidth, not server work.',
      ],
    },
    {
      kind: 'try',
      title: 'Another query is another answer',
      goal: 'Send the same ETag with limit=3. That is a different body, so it has a different ETag, and the old one cannot match.',
      request: { method: 'GET', path: '/v1/products?limit=3', as: 'reader', headers: { 'If-None-Match': '{{LIST_ETAG}}' } },
      expect: { status: 200, headers: { ETag: '~W/"' }, body: { 'data.length': 3 } },
      notice: [
        'A full 200 with a new ETag. Caches keep one entry per URL, so limit, cursor and tag are all part of the key.',
      ],
    },
    {
      kind: 'try',
      title: 'No-store by default',
      goal: 'Your own account details are not cacheable. Any response that does not choose a rule gets Cache-Control: no-store.',
      request: { method: 'GET', path: '/v1/me', as: 'reader' },
      expect: { status: 200, headers: { 'Cache-Control': 'no-store', ETag: false }, body: { clientId: 'reader' } },
      notice: [
        'no-store: no cache anywhere may keep this response, not even the browser.',
        'There is no ETag either: this endpoint does not offer revalidation. Orders, tokens and errors get no-store too.',
      ],
    },
    {
      kind: 'try',
      title: 'Create your own product to edit',
      goal: 'Edits need a product nobody else is changing. Create one with a fresh title; the 201 already carries its first ETag.',
      request: { method: 'POST', path: '/v1/products', as: 'writer', json: { title: 'Caching lab {{RUN}}', author: 'You', priceCents: 3000, tags: [] } },
      expect: { status: 201, headers: { ETag: '~-v1"', 'Cache-Control': 'no-store' }, body: { version: 1, priceCents: 3000 } },
      save: { PID: 'body.id', ETAG_1: 'header.etag' },
      notice: [
        'Version 1, and the ETag ends in -v1. The lab saved both the id and the ETag.',
        'The 201 itself is no-store: only reads of a product are cacheable here.',
      ],
    },
    {
      kind: 'try',
      title: 'Edit it with If-Match',
      goal: 'Change the price, and say which version you based the change on. It matches the current ETag, so the change is applied.',
      request: { method: 'PATCH', path: '/v1/products/{{PID}}', as: 'writer', headers: { 'If-Match': '{{ETAG_1}}' }, json: { priceCents: 2500 } },
      expect: { status: 200, headers: { ETag: '"{{PID}}-v2"' }, body: { version: 2, priceCents: 2500 } },
      save: { ETAG_2: 'header.etag' },
      notice: [
        'Version 2, with a new ETag in the response. A careful client keeps that ETag for its next edit.',
      ],
    },
    {
      kind: 'try',
      title: 'Misuse: save with a stale ETag',
      goal: 'Play the second editor, who loaded version 1 and never saw the price change. A full PUT from that old page would undo it.',
      request: {
        method: 'PUT',
        path: '/v1/products/{{PID}}',
        as: 'writer',
        headers: { 'If-Match': '{{ETAG_1}}' },
        json: { title: NEW_TITLE, author: 'You', priceCents: 3000, tags: [] },
      },
      expect: { status: 412, body: { type: '/problems/precondition-failed', status: 412 } },
      notice: [
        '412 Precondition Failed: the product is no longer at version 1, so nothing was written.',
        'Without If-Match, this PUT would have put the price back to 3000, and the first edit would be lost with no error.',
      ],
    },
    {
      kind: 'try',
      title: 'Revalidate the stale copy',
      goal: 'The second editor’s page sends its old ETag in If-None-Match. The product changed, so it gets the full new version.',
      request: { method: 'GET', path: '/v1/products/{{PID}}', as: 'writer', headers: { 'If-None-Match': '{{ETAG_1}}' } },
      expect: { status: 200, headers: { ETag: '{{ETAG_2}}' }, body: { version: 2, priceCents: 2500 } },
      notice: [
        'A 200, not a 304: the ETags differ, so the server sends the body.',
        'Still version 2 and 2500 cents: the refused PUT really wrote nothing.',
      ],
    },
    {
      kind: 'try',
      title: 'Retry on top of the current version',
      goal: 'Now the editor applies the title change on top of version 2, keeps the new price, and sends the current ETag.',
      request: {
        method: 'PUT',
        path: '/v1/products/{{PID}}',
        as: 'writer',
        headers: { 'If-Match': '{{ETAG_2}}' },
        json: { title: NEW_TITLE, author: 'You', priceCents: 2500, tags: [] },
      },
      expect: { status: 200, headers: { ETag: '"{{PID}}-v3"' }, body: { version: 3, priceCents: 2500, title: NEW_TITLE } },
      notice: ['Version 3 has both changes: the new price from the first edit and the new title from the second.'],
    },
    {
      kind: 'try',
      title: 'Misuse: a weak ETag in If-Match',
      goal: 'Send the current version’s ETag, but marked weak with W/. If-Match uses the strong comparison, so a weak tag can never match.',
      request: { method: 'PATCH', path: '/v1/products/{{PID}}', as: 'writer', headers: { 'If-Match': 'W/"{{PID}}-v3"' }, json: { priceCents: 1500 } },
      expect: { status: 412, body: { type: '/problems/precondition-failed' } },
      notice: [
        '412, even though the version is right: a weak ETag only promises the same meaning, and a write needs the exact version.',
        'If-None-Match would accept this tag for a 304. Only reads may use the weak comparison.',
      ],
    },
    {
      kind: 'try',
      title: 'No If-Match: the last write wins',
      goal: 'If-Match is optional in this API. Send a PATCH without it, and the server does not check anything.',
      request: { method: 'PATCH', path: '/v1/products/{{PID}}', as: 'writer', json: { priceCents: 1999 } },
      expect: { status: 200, body: { version: 4, priceCents: 1999 } },
      notice: [
        'A 200 and version 4. No precondition was sent, so none was checked.',
        'Stricter APIs require If-Match on writes and answer 428 Precondition Required without it. This API keeps it optional.',
      ],
    },
    {
      kind: 'read',
      title: 'Reads: ETag, Cache-Control and 304',
      goal: 'Both read routes set the validator and the storage rule, then either send the body or a bodiless 304 with the same headers.',
      files: {
        python: { path: 'python-fastapi-aws/app/routes/products.py', lines: [56, 92], note: 'The list renders its body first and hashes it with weak_etag; get_product uses strong_etag, and both return a bare 304 Response with ETag and Cache-Control.' },
        node: { path: 'node-typescript-gcp/src/products/routes.ts', lines: [23, 69], note: 'sendConditional sets ETag and Cache-Control before it decides, so the 304 carries the same headers as the 200.' },
        dotnet: { path: 'dotnet-azure/src/ApiConcepts.Api/Endpoints/ProductEndpoints.cs', lines: [44, 83], note: 'List and Get set the headers on http.Response, then return Results.StatusCode(304) or the body.' },
      },
    },
    {
      kind: 'read',
      title: 'The comparisons: weak for If-None-Match, strong for If-Match',
      goal: 'Two small functions hold the rules of RFC 9110: If-None-Match ignores the W/ prefix, If-Match needs the exact tag, and * matches any current version.',
      files: {
        python: { path: 'python-fastapi-aws/app/web/etag.py', lines: [6, 33], note: 'none_match_hit strips W/ before comparing; if_match_ok compares the exact string, and _check_precondition in routes/products.py calls it before every write.' },
        node: { path: 'node-typescript-gcp/src/http/etag.ts', lines: [4, 29], note: 'noneMatchHits drops W/ with opaque(); ifMatchPasses needs the exact tag, and checkPrecondition in src/products/routes.ts calls it before every write.' },
        dotnet: { path: 'dotnet-azure/src/ApiConcepts.Api/Common/ETags.cs', lines: [9, 47], note: 'RequireIfMatch compares strongly (a W/ tag never matches) and throws PreconditionFailed; the endpoints call it inside repo.Update, so the check and the write happen under one lock.' },
      },
    },
    {
      kind: 'think',
      title: 'Put a CDN in front of the catalog',
      question:
        'Product data is the same for every client, and traffic is growing. You want CloudFront, Cloud CDN or Azure Front Door to serve GET /v1/products/{id} from the edge. What must change in the response headers, and what is the risk?',
      answer:
        'private forbids shared caches, so the response must become public (or add s-maxage for shared caches). A shared cache also will not reuse a response to a request with an Authorization header unless the response explicitly allows it, which is what public does. The risk is that the edge now answers without checking any token, so this only works for data that is truly the same for everyone, and anything tied to a client must stay private or no-store.',
    },
    {
      kind: 'think',
      title: 'What does a list 304 really save?',
      question: 'The product ETag comes from the version, but the list ETag is a hash of the body. What does a 304 save in each case, and how could the list do better?',
      answer:
        'For one product, the server only needs the version to decide, so a 304 skips building and sending the body. For a list, the server must load the page and serialize it before it can hash it, so a 304 saves only the bytes on the wire. A list could do better with a cheap version of its own, such as the latest updatedAt of the collection plus its size, checked before building the body.',
    },
    {
      kind: 'build',
      title: 'Add Last-Modified and If-Modified-Since',
      task: 'ETag is one validator; Last-Modified is the older one, a date. Send Last-Modified on GET /v1/products/{id}, and answer 304 when the client’s If-Modified-Since is not older than the product’s last change.',
      steps: [
        'Open the get-one route: python-fastapi-aws/app/routes/products.py (get_product), node-typescript-gcp/src/products/routes.ts (the GET /:id handler and sendConditional), or dotnet-azure/src/ApiConcepts.Api/Endpoints/ProductEndpoints.cs (Get).',
        'Send Last-Modified with the product’s updatedAt as an HTTP date, for example Thu, 01 Jan 2026 00:00:00 GMT, on both the 200 and the 304.',
        'Read If-Modified-Since. Ignore it when If-None-Match is present (the ETag wins), or when it is not a valid date.',
        'If updatedAt, cut to whole seconds, is at or before that date, answer 304 with no body, and the same ETag, Cache-Control and Last-Modified.',
        'Restart your server (the TypeScript server reloads by itself under npm run dev), then press Check: it asks for prd_01 with If-Modified-Since: Fri, 02 Jan 2026 00:00:00 GMT.',
      ],
      hints: [
        'HTTP dates have whole seconds only. Compare at second precision, or a product changed at 12:00:00.500 will always look newer than the date the client sent back.',
        'Each stack can format and parse HTTP dates: email.utils in Python, toUTCString and Date.parse in TypeScript, the "R" format and DateTimeOffset parsing in C#.',
        'In TypeScript, Express’s res.send can answer 304 by itself once you set Last-Modified (req.fresh), but it skips that check when the request says Cache-Control: no-cache, and the lab’s requests do. Write the comparison yourself, as in the other two stacks.',
      ],
      check: {
        request: { method: 'GET', path: '/v1/products/prd_01', as: 'reader', headers: { 'If-Modified-Since': 'Fri, 02 Jan 2026 00:00:00 GMT' } },
        expect: { status: 304, headers: { 'Last-Modified': 'Thu, 01 Jan 2026 00:00:00 GMT' } },
      },
      command: 'cd contract-tests && ./run.sh python   # or node, dotnet: the contract tests must still pass',
      undo: 'git restore python-fastapi-aws node-typescript-gcp dotnet-azure   (from APIConcepts/), or keep your change on a branch',
    },
  ],
};
