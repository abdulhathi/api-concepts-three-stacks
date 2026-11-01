# 18 · Pagination

Pagination splits a long list into pages, and the client asks for the next page with a position marker instead of loading everything at once.

## Why it matters

- Without it, `GET /v1/products` returns every row. Responses grow without limit, and slow clients and servers fall over.
- Offset paging (`?page=3`) skips or repeats items when rows are added or deleted between requests.
- Without a stable order and a cursor that only the server understands, clients start to depend on how ids or pages are built.

## How it works

Keyset (cursor) pagination sorts by a stable key, here `(createdAt, id)`. The server returns the page and an opaque cursor that encodes the last key it returned. The next request means "give me items strictly after this key". Adding new items never shifts earlier pages. To know whether another page exists without counting, the Python and C# servers fetch one extra row (`limit + 1`); the TypeScript server slices its in-memory sorted list, so it can simply look one item further. The client follows the `Link` header (RFC 8288) with `rel="next"` or reads `nextCursor`.

```http
GET /v1/products?limit=2 HTTP/1.1
Authorization: Bearer <token>

HTTP/1.1 200 OK
Link: </v1/products?limit=2&cursor=eyJ0Ijoi...>; rel="next"

{"data":[{"id":"prd_01", ...},{"id":"prd_02", ...}],
 "page":{"limit":2,"nextCursor":"eyJ0Ijoi...","hasMore":true}}
```

## The rule in this repo

- `limit` is 1 to 50 (default 10). Out of range is 400 `validation-error`.
- Products are ordered by `createdAt`, then `id`. New products sort last.
- Body: `{ "data": [...], "page": { "limit", "nextCursor", "hasMore" } }`. `nextCursor` is `null` on the last page.
- When `hasMore`, a `Link: <...>; rel="next"` header repeats `limit` and any `tag` filter.
- Cursors are opaque. One that does not decode is 400 `invalid-cursor`.

## Side by side

### Python · FastAPI
`make_page` receives `limit + 1` rows; the extra row only proves another page exists. The cursor is base64url JSON.

```python
def make_page[T: Keyed](rows: Sequence[T], limit: int) -> Page[T]:
    """`rows` holds up to `limit + 1` items; the extra one only proves there is a next page."""
    items = list(rows[:limit])
    more = len(rows) > limit
    next_cursor = encode_cursor(Cursor(items[-1].created_at, items[-1].id)) if more else None
    return Page(items, limit, next_cursor)
```
[app/web/pagination.py](../../python-fastapi-aws/app/web/pagination.py#L62-L67)

### TypeScript · Express
`paginate` works on an already sorted array and finds the first item after the cursor. This is fine for in-memory data; a database would use a `WHERE` clause on the key.

```typescript
export function paginate<T extends Keyed>(sorted: T[], limit: number, cursor?: string): Page<T> {
    // …
    start = sorted.findIndex((item) => sortKey(item) > after);
    if (start === -1) start = sorted.length;
  }
  const items = sorted.slice(start, start + limit);
  const hasMore = start + limit < sorted.length;
  return { items, hasMore, nextCursor: hasMore ? encodeCursor(items[items.length - 1]!) : null };
```
[src/http/pagination.ts](../../node-typescript-gcp/src/http/pagination.ts#L31-L41)

### C# · ASP.NET Core
`Paging.Take` is a LINQ filter on `(createdAt, id)` that takes `limit + 1` items. It is shared by products and orders.

```csharp
var rest = after is null
    ? ordered
    : ordered.Where(item =>
    {
        var k = key(item);
        var byTime = k.CreatedAt.CompareTo(after.CreatedAt);
        return byTime > 0 || (byTime == 0 && string.CompareOrdinal(k.Id, after.Id) > 0);
    });
```
[src/ApiConcepts.Api/Common/Cursor.cs](../../dotnet-azure/src/ApiConcepts.Api/Common/Cursor.cs#L49-L56)

## Try it

```bash
# Any stack works; 8001 is Python.
TOKEN=$(curl -s -u reader:reader-secret -d grant_type=client_credentials http://localhost:8001/oauth/token | jq -r .access_token)

# First page, then use nextCursor for the second
CURSOR=$(curl -s "http://localhost:8001/v1/products?limit=3" -H "Authorization: Bearer $TOKEN" | jq -r .page.nextCursor)
curl -s "http://localhost:8001/v1/products?limit=3&cursor=$CURSOR" -H "Authorization: Bearer $TOKEN" | jq '.data[].id'

# A bad cursor and a bad limit
curl -s "http://localhost:8001/v1/products?cursor=nope" -H "Authorization: Bearer $TOKEN" | jq .type
curl -s "http://localhost:8001/v1/products?limit=99" -H "Authorization: Bearer $TOKEN" | jq .errors
```

## In the cloud

- **AWS:** DynamoDB returns `LastEvaluatedKey`, which you pass back as `ExclusiveStartKey`. That is a keyset cursor by design.
- **GCP:** Firestore queries use `startAfter` with the last document. Cloud Run needs nothing extra.
- **Azure:** Cosmos DB returns a continuation token. Azure Storage and Search use similar tokens.

## Common mistakes

- **Offset paging on changing data.** Items get skipped or shown twice when rows are inserted or deleted.
- **Unstable sort.** Sorting only by `createdAt` breaks when two rows share a timestamp. Add a tie-breaker such as `id`.
- **Unbounded or untrusted cursors.** Always cap `limit`, and treat a cursor as untrusted input that may not decode.

## Interview questions

<details><summary>Offset vs cursor pagination: when do you pick each?</summary>
Offset is simple and allows jumping to page N, but it gets slow on big tables and drifts when data changes. Cursor (keyset) is stable and fast but only moves forward and back. Use cursors for feeds and large or changing lists.
</details>
<details><summary>Why is the cursor opaque?</summary>
So the server can change how it encodes position without breaking clients. It also stops clients from building or editing cursors by hand.
</details>
<details><summary>How do you know there is a next page without a COUNT query?</summary>
Fetch <code>limit + 1</code> rows. If the extra row comes back, there is another page, and you drop it before responding.
</details>

← [previous](17-graphql.md) · [all concepts](../README.md) · [next](19-caching.md) →
