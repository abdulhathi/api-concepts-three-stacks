// Concept 8 · API schemas: describe request bodies in the OpenAPI document.
// Minimal API's Accepts<T>() would also change routing (an unmatched Content-Type becomes a 404 here, not our 415),
// and the handlers read raw bytes themselves, so the body schema is added to the document directly.
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi.Any;
using Microsoft.OpenApi.Models;

namespace ApiConcepts.Api.Endpoints;

public static class OpenApiBody
{
    /// <summary>Marks the endpoint's body type; <see cref="AddRequestBody"/> writes it into the document.</summary>
    public static RouteHandlerBuilder WithBody<T>(this RouteHandlerBuilder builder, params string[] contentTypes) =>
        builder.WithMetadata(new BodyMetadata(typeof(T), contentTypes.Length > 0 ? contentTypes : ["application/json"]));

    /// <summary>An operation transformer for AddOpenApi: the request body of every endpoint marked with WithBody.</summary>
    public static Task AddRequestBody(OpenApiOperation operation, OpenApiOperationTransformerContext context, CancellationToken _)
    {
        if (context.Description.ActionDescriptor.EndpointMetadata.OfType<BodyMetadata>().LastOrDefault() is { } body)
        {
            var schema = SchemaFor(body.Type);
            operation.RequestBody = new OpenApiRequestBody
            {
                Required = true,
                Content = body.ContentTypes.ToDictionary(type => type, _ => new OpenApiMediaType { Schema = schema }),
            };
        }

        return Task.CompletedTask;
    }

    private sealed record BodyMetadata(Type Type, string[] ContentTypes);

    private static OpenApiSchema SchemaFor(Type type)
    {
        type = Nullable.GetUnderlyingType(type) ?? type;
        if (type == typeof(string)) return new OpenApiSchema { Type = "string" };
        if (type == typeof(int)) return new OpenApiSchema { Type = "integer", Format = "int32" };
        if (type == typeof(bool)) return new OpenApiSchema { Type = "boolean" };
        if (type.IsArray) return new OpenApiSchema { Type = "array", Items = SchemaFor(type.GetElementType()!) };

        var nullability = new NullabilityInfoContext();
        var schema = new OpenApiSchema { Type = "object" };
        foreach (var property in type.GetProperties(BindingFlags.Public | BindingFlags.Instance))
        {
            var name = property.GetCustomAttribute<JsonPropertyNameAttribute>()?.Name
                       ?? JsonNamingPolicy.CamelCase.ConvertName(property.Name);
            schema.Properties[name] = SchemaFor(property.PropertyType);
            if (nullability.Create(property).WriteState != NullabilityState.Nullable)
            {
                schema.Required.Add(name);
            }
        }

        return schema;
    }
}
