// Concept 14 · HTTPS: HSTS only when the request really arrived over TLS. TLS ends at the App Service front end,
// which tells us with X-Forwarded-Proto.
namespace ApiConcepts.Api.Http;

public sealed class SecurityHeadersMiddleware(RequestDelegate next)
{
    public Task InvokeAsync(HttpContext context)
    {
        context.Response.OnStarting(() =>
        {
            var headers = context.Response.Headers;
            headers["X-Content-Type-Options"] = "nosniff";
            headers["Referrer-Policy"] = "no-referrer";
            if (ArrivedOverHttps(context.Request))
            {
                headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
            }

            return Task.CompletedTask;
        });
        return next(context);
    }

    private static bool ArrivedOverHttps(HttpRequest request) =>
        request.IsHttps ||
        string.Equals(
            request.Headers["X-Forwarded-Proto"].ToString().Split(',')[0].Trim(),
            "https",
            StringComparison.OrdinalIgnoreCase);
}
