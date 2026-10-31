// Concept 6 · Request bodies: read the raw bytes once, then parse; bad JSON becomes a 400 problem.
using System.Text.Json;

namespace ApiConcepts.Api.Common;

public static class JsonBody
{
    public static async Task<byte[]> ReadRawAsync(HttpRequest request)
    {
        using var buffer = new MemoryStream();
        await request.Body.CopyToAsync(buffer, request.HttpContext.RequestAborted);
        return buffer.ToArray();
    }

    /// <summary>Parses the bytes; returns null for an empty body.</summary>
    public static JsonElement? Parse(byte[] raw)
    {
        if (raw.Length == 0)
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(raw);
            return document.RootElement.Clone();
        }
        catch (JsonException)
        {
            throw new ProblemException(ProblemType.MalformedJson, "The request body is not valid JSON.");
        }
    }

    public static JsonElement RequireObject(JsonElement? body)
    {
        if (body is not { ValueKind: JsonValueKind.Object } json)
        {
            throw ProblemException.Validation("body", "must be a JSON object");
        }

        return json;
    }
}
