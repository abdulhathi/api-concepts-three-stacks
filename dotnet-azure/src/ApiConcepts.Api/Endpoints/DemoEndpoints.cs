// Concepts 23, 25, 27 · Retries, backoff and error handling: endpoints that fail on purpose.
using System.Collections.Concurrent;
using System.Globalization;
using ApiConcepts.Api.Common;

namespace ApiConcepts.Api.Endpoints;

public static class DemoEndpoints
{
    public static void MapDemo(this RouteGroupBuilder v1)
    {
        var demo = v1.MapGroup("/demo").WithTags("Demo");
        var calls = new ConcurrentDictionary<string, int>();

        demo.MapGet("/flaky", (HttpContext http) => Flaky(http, calls))
            .WithSummary("Fails with 503 the first failTimes calls per key, then succeeds");
        demo.MapGet("/crash", IResult () => throw new InvalidOperationException("Deliberate crash for the demo."))
            .WithSummary("Always an unhandled exception, rendered as a safe 500");
    }

    private static IResult Flaky(HttpContext http, ConcurrentDictionary<string, int> calls)
    {
        var query = http.Request.Query;
        var key = query["key"].ToString();
        if (key.Length is < 1 or > 64)
        {
            throw ProblemException.Validation("key", "must be 1 to 64 characters");
        }

        var rawFail = query["failTimes"].ToString();
        var failTimes = 2;
        if (rawFail.Length > 0 &&
            (!int.TryParse(rawFail, NumberStyles.None, CultureInfo.InvariantCulture, out failTimes) || failTimes > 10))
        {
            throw ProblemException.Validation("failTimes", "must be between 0 and 10");
        }

        var attempts = calls.AddOrUpdate(key, 1, (_, count) => count + 1);
        return attempts <= failTimes
            ? throw new ProblemException(ProblemType.ServiceUnavailable, $"Failing on purpose: call {attempts} of {failTimes}.")
            : Results.Ok(new { key, attempts });
    }
}
