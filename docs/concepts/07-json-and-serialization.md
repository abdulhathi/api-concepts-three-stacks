# 07 · JSON and serialization

Serialization turns your in-memory objects into JSON text for the wire, and deserialization turns JSON text back into objects.

## Why it matters

- Every client must read your JSON the same way. Mixed naming, float money and local-time dates cause bugs that only show up in production.
- Each language has its own defaults (snake_case in Python, PascalCase in C#). Without a fixed wire format, each server leaks its own accent.
- Money as a float, such as `19.99`, drifts when added up. Integers do not.

## How it works

JSON (RFC 8259) has only objects, arrays, strings, numbers, booleans and `null`. It has no date type and no money type, so the API fixes conventions on top. The three servers are written in three languages, yet the same request returns the same shape.

```http
GET /v1/products/prd_01 HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

```http
HTTP/1.1 200 OK
Content-Type: application/json
ETag: "prd_01-v1"

{"id":"prd_01","title":"HTTP from the Ground Up","author":"Maya Chen","priceCents":3499,"currency":"USD","tags":["http","basics"],"version":1,"createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"}
```

## The rule in this repo

- Property names are camelCase (`priceCents`, `createdAt`). Unknown request properties are ignored.
- Money is an integer number of cents, and `currency` is always `"USD"` in output.
- Timestamps follow RFC 3339: UTC, a `Z` suffix and exactly three fractional digits, for example `2026-01-01T00:00:00.000Z`.
- A nullable field is present with `null`. It is never left out (for example `"nextCursor": null` on the last page).

## Side by side

### Python · FastAPI
Pydantic models use a camelCase alias generator, so Python code keeps snake_case while the wire stays camelCase. Timestamps go through `format_timestamp` in `app/timefmt.py`.

```python
UtcTimestamp = Annotated[datetime, PlainSerializer(format_timestamp, return_type=str)]


class ApiModel(BaseModel):
    # Unknown request properties are ignored (spec); output always uses the camelCase alias.
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, serialize_by_alias=True, extra="ignore"
    )

    def to_json(self) -> dict[str, Any]:
        return self.model_dump(mode="json", by_alias=True)
```
[`app/models/base.py` lines 11-21](../../python-fastapi-aws/app/models/base.py#L11-L21)

### TypeScript · Express
Plain objects are already camelCase. `isoTimestamp` wraps `Date.toISOString()`, which has exactly the right format. Here is the seed data that builds products.

```ts
export function seedProducts(): Product[] {
  return SEED.map(([title, author, priceCents, tags], index) => {
    const at = isoTimestamp(EPOCH + index * 60_000);
    return {
      id: `prd_${String(index + 1).padStart(2, '0')}`,
      title,
      author,
      priceCents,
      currency: 'USD',
      tags,
      version: 1,
      createdAt: at,
      updatedAt: at,
    };
  });
```
[`src/products/seed.ts` lines 34-48](../../node-typescript-gcp/src/products/seed.ts#L34-L48)

### C# · ASP.NET Core
ASP.NET's web defaults use camelCase. A custom converter forces the timestamp format, and it is registered once in `ServiceRegistration.cs` (line 38).

```csharp
public sealed class UtcTimestampConverter : JsonConverter<DateTimeOffset>
{
    private const string Format = "yyyy-MM-dd'T'HH:mm:ss.fff'Z'";

    public override DateTimeOffset Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        DateTimeOffset.Parse(reader.GetString()!, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal);

    public override void Write(Utf8JsonWriter writer, DateTimeOffset value, JsonSerializerOptions options) =>
        writer.WriteStringValue(value.UtcDateTime.ToString(Format, CultureInfo.InvariantCulture));
```
[`src/ApiConcepts.Api/Common/UtcTimestampConverter.cs` lines 8-16](../../dotnet-azure/src/ApiConcepts.Api/Common/UtcTimestampConverter.cs#L8-L16)

## Try it

Any stack works; these commands use the Python server on port 8001.

```bash
TOKEN=$(curl -s -u reader:reader-secret -d grant_type=client_credentials http://localhost:8001/oauth/token | jq -r .access_token)
curl -s localhost:8001/v1/products/prd_01 -H "Authorization: Bearer $TOKEN" | jq
curl -s 'localhost:8001/v1/products?limit=50' -H "Authorization: Bearer $TOKEN" | jq .page   # nextCursor is null, not missing
```

## In the cloud

- **AWS:** nothing extra needed. API Gateway passes the body through. REST APIs can transform bodies with mapping templates, but this repo does not.
- **GCP:** nothing extra needed. Cloud Run passes bytes through.
- **Azure:** nothing extra needed. API Management can rewrite JSON with policies if you add it.

## Common mistakes

- Sending money as a float or a string with a currency symbol. Pick integer minor units.
- Emitting local times without an offset. Use UTC with `Z`, and let the client format it.
- Omitting a field when it is empty. A client cannot tell "no value" from "the server forgot".

## Interview questions

<details><summary>Why store money as integer cents?</summary>Binary floats cannot represent most decimals exactly, so `0.1 + 0.2` is not `0.3`. Integers add exactly. The currency (and its minor unit) travels beside the number.</details>
<details><summary>Which date format should an API use?</summary>RFC 3339 (a profile of ISO 8601) in UTC, such as `2026-01-01T00:00:00.000Z`. It sorts as text, parses everywhere and has no timezone ambiguity.</details>
<details><summary>Why return null instead of leaving a field out?</summary>A stable shape means clients and generated types can rely on every key being there. Absent then only means "this version of the API does not have it".</details>

← [previous](06-request-bodies.md) · [all concepts](../README.md) · [next](08-api-schemas.md) →
