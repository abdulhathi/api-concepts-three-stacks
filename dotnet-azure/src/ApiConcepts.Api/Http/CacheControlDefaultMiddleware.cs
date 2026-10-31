// Concept 19 · Caching: API responses are not cacheable unless an endpoint says otherwise.
namespace ApiConcepts.Api.Http;

public sealed class CacheControlDefaultMiddleware(RequestDelegate next)
{
    private static readonly string[] Prefixes = ["/v1", "/graphql", "/oauth"];

    public Task InvokeAsync(HttpContext context)
    {
        if (Prefixes.Any(p => context.Request.Path.StartsWithSegments(p)))
        {
            context.Response.OnStarting(() =>
            {
                var headers = context.Response.Headers;
                // The exception handler middleware stamps "no-cache,no-store" + Pragma + Expires on its error
                // responses; the contract wants the plain default.
                if (!headers.ContainsKey("Cache-Control") || headers.CacheControl == "no-cache,no-store")
                {
                    headers.CacheControl = "no-store";
                    headers.Remove("Pragma");
                    headers.Remove("Expires");
                }

                return Task.CompletedTask;
            });
        }

        return next(context);
    }
}
