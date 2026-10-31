// Concept 15 · CORS: responses differ per Origin, so shared caches must be told. The built-in CORS middleware
// does not add Vary when the policy lists specific origins.
namespace ApiConcepts.Api.Http;

public sealed class VaryOriginMiddleware(RequestDelegate next)
{
    public Task InvokeAsync(HttpContext context)
    {
        context.Response.OnStarting(() =>
        {
            context.Response.Headers.Append("Vary", "Origin");
            return Task.CompletedTask;
        });
        return next(context);
    }
}
