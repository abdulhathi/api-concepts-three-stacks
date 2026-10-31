// Concept 4 · Headers: a request body on /v1 must declare itself as JSON, otherwise 415.
using ApiConcepts.Api.Common;
using Microsoft.Net.Http.Headers;

namespace ApiConcepts.Api.Http;

public sealed class JsonBodyFilter : IEndpointFilter
{
    private static readonly string[] BodyMethods = ["POST", "PUT", "PATCH"];

    public ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var request = context.HttpContext.Request;
        if (BodyMethods.Contains(request.Method) && HasBody(request) && !IsAcceptable(request))
        {
            throw new ProblemException(
                ProblemType.UnsupportedMediaType,
                "Content-Type must be application/json.");
        }

        return next(context);
    }

    private static bool HasBody(HttpRequest request) =>
        request.ContentLength > 0 || request.Headers.TransferEncoding.Count > 0;

    private static bool IsAcceptable(HttpRequest request)
    {
        if (!MediaTypeHeaderValue.TryParse(request.ContentType, out var type))
        {
            return false;
        }

        return type.MediaType.Equals("application/json", StringComparison.OrdinalIgnoreCase) ||
               (request.Method == "PATCH" &&
                type.MediaType.Equals("application/merge-patch+json", StringComparison.OrdinalIgnoreCase));
    }
}
