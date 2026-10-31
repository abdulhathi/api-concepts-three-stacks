// Concept 4 · Headers: X-Request-Id is echoed when well formed, generated otherwise, and sent on every response.
using System.Text.RegularExpressions;

namespace ApiConcepts.Api.Http;

public sealed partial class RequestIdMiddleware(RequestDelegate next)
{
    public const string HeaderName = "X-Request-Id";

    [GeneratedRegex("^[A-Za-z0-9._-]{1,128}$")]
    private static partial Regex Valid();

    public Task InvokeAsync(HttpContext context)
    {
        var incoming = context.Request.Headers[HeaderName].ToString();
        var id = Valid().IsMatch(incoming) ? incoming : Guid.NewGuid().ToString();
        context.TraceIdentifier = id;

        // OnStarting rather than a plain assignment: the exception handler clears headers before it writes.
        context.Response.OnStarting(() =>
        {
            context.Response.Headers[HeaderName] = id;
            return Task.CompletedTask;
        });
        return next(context);
    }
}
