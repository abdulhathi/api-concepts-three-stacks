// Concepts 2, 3, 5, 16, 18, 19 · Resource routes, HTTP methods, path/query parameters, REST, pagination, caching.
using System.Text.Json;
using ApiConcepts.Api.Common;
using ApiConcepts.Api.Domain;
using ApiConcepts.Api.Storage;

namespace ApiConcepts.Api.Endpoints;

public static class ProductEndpoints
{
    public static void MapProducts(this RouteGroupBuilder v1)
    {
        var products = v1.MapGroup("/products").WithTags("Products");

        products.MapGet("/", List).RequireAuthorization("products:read")
            .WithSummary("List products with cursor pagination")
            .Produces<ProductPage>();
        products.MapGet("/{id}", Get).RequireAuthorization("products:read")
            .WithSummary("Get one product (ETag, 304)")
            .Produces<Product>()
            .Produces(304);
        products.MapPost("/", Create).RequireAuthorization("products:write")
            .WithSummary("Create a product")
            .WithBody<ProductBody>("application/json")
            .Produces<Product>(201);
        products.MapPut("/{id}", Replace).RequireAuthorization("products:write")
            .WithSummary("Replace a product (honors If-Match)")
            .WithBody<ProductBody>("application/json")
            .Produces<Product>();
        products.MapPatch("/{id}", Patch).RequireAuthorization("products:write")
            .WithSummary("Change some fields of a product (honors If-Match)")
            .WithBody<ProductBody>("application/json", "application/merge-patch+json")
            .Produces<Product>();
        products.MapDelete("/{id}", Delete).RequireAuthorization("admin")
            .WithSummary("Delete a product (honors If-Match)")
            .Produces(204);
    }

    // Shapes for the OpenAPI document; the handlers read the raw JSON themselves.
    public sealed record ProductBody(string Title, string Author, int PriceCents, string[]? Tags);

    public sealed record ProductPage(IReadOnlyList<Product> Data, PageInfo Page);

    private static IResult List(HttpContext http, IProductRepository repo, JsonSerializerOptions json)
    {
        var request = PageRequest.From(http.Request);
        var tag = http.Request.Query.TryGetValue("tag", out var t) ? t.ToString() : null;

        var page = repo.List(request.Limit, request.After, tag);
        var info = request.Describe(page, p => new Cursor(p.CreatedAt, p.Id));
        var body = JsonSerializer.SerializeToUtf8Bytes(new ProductPage(page.Items, info), json);
        var etag = ETags.WeakHash(body);

        var response = http.Response;
        response.Headers.ETag = etag;
        response.Headers.CacheControl = "private, max-age=30";
        if (info.NextCursor is not null)
        {
            response.Headers.Link = NextLink(info.Limit, info.NextCursor, tag);
        }

        return ETags.IfNoneMatchHits(http.Request, etag) ? Results.StatusCode(304) : new RawJsonResult(200, body);
    }

    private static string NextLink(int limit, string cursor, string? tag)
    {
        var link = $"</v1/products?limit={limit}&cursor={Uri.EscapeDataString(cursor)}";
        if (tag is not null)
        {
            link += $"&tag={Uri.EscapeDataString(tag)}";
        }

        return link + ">; rel=\"next\"";
    }

    private static IResult Get(string id, HttpContext http, IProductRepository repo)
    {
        var product = repo.Find(id) ?? throw ProblemException.NotFound("Product");
        var etag = ETags.ForProduct(product.Id, product.Version);
        http.Response.Headers.ETag = etag;
        http.Response.Headers.CacheControl = "private, max-age=60";
        return ETags.IfNoneMatchHits(http.Request, etag) ? Results.StatusCode(304) : Results.Ok(product);
    }

    private static async Task<IResult> Create(HttpContext http, IProductRepository repo, TimeProvider time)
    {
        var fields = ProductInput.Parse(JsonBody.Parse(await JsonBody.ReadRawAsync(http.Request)), ProductInputMode.Create);
        var now = time.UtcNowMs();
        var product = repo.Add(new Product(
            Ids.New("prd_"), fields.Title!, fields.Author!, fields.PriceCents!.Value, "USD", fields.Tags!, 1, now, now));

        http.Response.Headers.Location = $"/v1/products/{product.Id}";
        http.Response.Headers.ETag = ETags.ForProduct(product.Id, product.Version);
        return Results.Json(product, statusCode: 201);
    }

    private static Task<IResult> Replace(string id, HttpContext http, IProductRepository repo, TimeProvider time) =>
        Change(id, http, repo, time, ProductInputMode.Replace);

    private static Task<IResult> Patch(string id, HttpContext http, IProductRepository repo, TimeProvider time) =>
        Change(id, http, repo, time, ProductInputMode.Patch);

    private static async Task<IResult> Change(
        string id, HttpContext http, IProductRepository repo, TimeProvider time, ProductInputMode mode)
    {
        var fields = ProductInput.Parse(JsonBody.Parse(await JsonBody.ReadRawAsync(http.Request)), mode);
        var now = time.UtcNowMs();
        var change = repo.Update(id, current =>
        {
            ETags.RequireIfMatch(http.Request, ETags.ForProduct(current.Id, current.Version));
            return current with
            {
                Title = fields.Title ?? current.Title,
                Author = fields.Author ?? current.Author,
                PriceCents = fields.PriceCents ?? current.PriceCents,
                Tags = fields.Tags ?? current.Tags,
                Version = current.Version + 1,
                UpdatedAt = now,
            };
        }) ?? throw ProblemException.NotFound("Product");

        http.Response.Headers.ETag = ETags.ForProduct(change.After.Id, change.After.Version);
        return Results.Ok(change.After);
    }

    private static IResult Delete(string id, HttpContext http, IProductRepository repo)
    {
        var removed = repo.Remove(id, current =>
            ETags.RequireIfMatch(http.Request, ETags.ForProduct(current.Id, current.Version)));
        return removed ? Results.NoContent() : throw ProblemException.NotFound("Product");
    }
}
