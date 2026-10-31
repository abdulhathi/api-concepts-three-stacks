// Concept 19 · Caching / Concept 22 · Idempotency: a JSON response whose exact bytes are chosen by the caller,
// so the ETag hash and a stored replay always match what was sent.
namespace ApiConcepts.Api.Common;

public sealed class RawJsonResult(int status, byte[] body, IReadOnlyDictionary<string, string>? headers = null) : IResult
{
    public async Task ExecuteAsync(HttpContext httpContext)
    {
        var response = httpContext.Response;
        response.StatusCode = status;
        response.ContentType = "application/json; charset=utf-8";
        foreach (var (name, value) in headers ?? new Dictionary<string, string>())
        {
            response.Headers[name] = value;
        }

        response.ContentLength = body.Length;
        await response.Body.WriteAsync(body);
    }
}
