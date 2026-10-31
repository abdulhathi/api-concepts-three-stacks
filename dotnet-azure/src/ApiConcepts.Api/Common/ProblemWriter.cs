// Concept 27 · Error handling: RFC 9457 application/problem+json with a requestId on every error.
using System.Text.Json;
using HttpJsonOptions = Microsoft.AspNetCore.Http.Json.JsonOptions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace ApiConcepts.Api.Common;

public static class ProblemWriter
{
    public static async Task WriteAsync(
        HttpContext context,
        ProblemType type,
        string? detail = null,
        IReadOnlyList<FieldIssue>? errors = null,
        IReadOnlyDictionary<string, string>? headers = null)
    {
        var problem = new ProblemDetails
        {
            Type = $"/problems/{type.Slug}",
            Title = type.Title,
            Status = type.Status,
            Detail = detail,
            // Path only: query strings can carry data we do not want echoed back.
            Instance = context.Request.Path.Value,
        };
        problem.Extensions["requestId"] = context.TraceIdentifier;
        if (errors is not null)
        {
            problem.Extensions["errors"] = errors;
        }

        var response = context.Response;
        response.StatusCode = type.Status;
        foreach (var (name, value) in headers ?? new Dictionary<string, string>())
        {
            response.Headers[name] = value;
        }

        var json = context.RequestServices.GetRequiredService<IOptions<HttpJsonOptions>>().Value.SerializerOptions;
        await response.WriteAsJsonAsync(problem, json, "application/problem+json");
    }
}
