// Concept 1 · Requests and responses: one structured JSON line per request. Never logs tokens or bodies.
using System.Diagnostics;
using System.Text.Json;

namespace ApiConcepts.Api.Http;

public interface IRequestLogSink
{
    void Write(string line);
}

public sealed class ConsoleRequestLogSink : IRequestLogSink
{
    public void Write(string line) => Console.Out.WriteLine(line);
}

public sealed class RequestLogMiddleware(RequestDelegate next, IRequestLogSink sink, TimeProvider time)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var started = Stopwatch.GetTimestamp();
        try
        {
            await next(context);
        }
        finally
        {
            var status = context.Response.StatusCode;
            var line = new Dictionary<string, object?>
            {
                ["ts"] = time.GetUtcNow().UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'"),
                ["level"] = status >= 500 ? "error" : status >= 400 ? "warn" : "info",
                ["requestId"] = context.TraceIdentifier,
                ["method"] = context.Request.Method,
                ["path"] = context.Request.Path.Value,
                ["status"] = status,
                ["durationMs"] = Math.Round(Stopwatch.GetElapsedTime(started).TotalMilliseconds, 1),
                ["clientId"] = context.User.FindFirst("sub")?.Value,
            };
            sink.Write(JsonSerializer.Serialize(line));
        }
    }
}
