// Dependency injection wiring, grouped by concern so Program.cs reads as a table of contents.
using System.Text.Json;
using ApiConcepts.Api.Auth;
using ApiConcepts.Api.Common;
using ApiConcepts.Api.Endpoints;
using ApiConcepts.Api.GraphQl;
using ApiConcepts.Api.Http;
using ApiConcepts.Api.Orders;
using ApiConcepts.Api.RateLimiting;
using ApiConcepts.Api.Storage;
using ApiConcepts.Api.Webhooks;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.AspNetCore.Http.Timeouts;
using Microsoft.Extensions.Options;
using Microsoft.OpenApi.Models;

namespace ApiConcepts.Api.Composition;

public static class ServiceRegistration
{
    public static IServiceCollection AddApi(this IServiceCollection services)
    {
        services.AddSingleton(sp => AppSettings.From(sp.GetRequiredService<IConfiguration>()));
        services.AddSingleton(TimeProvider.System);

        services.AddApiJson().AddStorage().AddWebhooks().AddApiErrors().AddApiCors().AddApiTimeouts();
        services.AddApiAuth().AddApiRateLimiting();
        services.AddApiDocs();
        services.AddGraphQl();
        return services;
    }

    // Concept 7 · JSON: camelCase (the web default) plus the timestamp converter.
    private static IServiceCollection AddApiJson(this IServiceCollection services)
    {
        services.ConfigureHttpJsonOptions(options =>
            options.SerializerOptions.Converters.Add(new UtcTimestampConverter()));
        services.AddSingleton(sp => sp.GetRequiredService<IOptions<JsonOptions>>().Value.SerializerOptions);
        return services;
    }

    private static IServiceCollection AddStorage(this IServiceCollection services)
    {
        services.AddSingleton<IProductRepository>(_ => new InMemoryProductRepository(SeedData.Products()));
        services.AddSingleton<IOrderRepository, InMemoryOrderRepository>();
        services.AddSingleton<IWebhookRepository, InMemoryWebhookRepository>();
        services.AddSingleton<IIdempotencyStore, InMemoryIdempotencyStore>();
        services.AddSingleton<IRequestLogSink, ConsoleRequestLogSink>();
        return services;
    }

    private static IServiceCollection AddWebhooks(this IServiceCollection services)
    {
        services.AddSingleton<WebhookService>();
        services.AddSingleton<IWebhookPublisher>(sp => sp.GetRequiredService<WebhookService>());
        services.AddHostedService<WebhookWorker>();
        services.AddHttpClient(WebhookWorker.HttpClientName, client => client.Timeout = TimeSpan.FromSeconds(5));
        return services;
    }

    private static IServiceCollection AddApiErrors(this IServiceCollection services)
    {
        services.AddProblemDetails();
        services.AddExceptionHandler<ApiExceptionHandler>();
        return services;
    }

    // Concept 15 · CORS: an allowlist of origins, no credentials, preflight cached for 10 minutes.
    private static IServiceCollection AddApiCors(this IServiceCollection services)
    {
        services.AddCors();
        services.AddOptions<CorsOptions>().Configure<AppSettings>((options, settings) =>
            options.AddDefaultPolicy(policy => policy
                .WithOrigins([.. settings.CorsOrigins])
                .WithMethods("GET", "POST", "PUT", "PATCH", "DELETE")
                .WithHeaders("Authorization", "Content-Type", "Idempotency-Key", "If-Match", "If-None-Match", "X-Request-Id")
                .WithExposedHeaders(
                    "ETag", "Link", "Location", "Retry-After", "RateLimit-Limit", "RateLimit-Remaining",
                    "RateLimit-Reset", "X-Request-Id", "Idempotent-Replayed")
                .SetPreflightMaxAge(TimeSpan.FromMinutes(10))));
        return services;
    }

    // Concept 24 · Timeouts: the report endpoint is cancelled after REQUEST_TIMEOUT_MS and answers 504.
    private static IServiceCollection AddApiTimeouts(this IServiceCollection services)
    {
        services.AddRequestTimeouts();
        services.AddOptions<RequestTimeoutOptions>().Configure<AppSettings>((options, settings) =>
            options.AddPolicy(ReportEndpoints.TimeoutPolicy, new RequestTimeoutPolicy
            {
                Timeout = settings.RequestTimeout,
                TimeoutStatusCode = StatusCodes.Status504GatewayTimeout,
                WriteTimeoutResponse = context => ProblemWriter.WriteAsync(
                    context,
                    ProblemType.Timeout,
                    $"The report took longer than {settings.RequestTimeout.TotalMilliseconds:0} ms."),
            }));
        return services;
    }

    // Concept 8 · API schemas: OpenAPI generated from the endpoints, rendered by Scalar.
    private static IServiceCollection AddApiDocs(this IServiceCollection services)
    {
        services.AddOpenApi(options => options.AddDocumentTransformer((document, _, _) =>
        {
            document.Info = new OpenApiInfo
            {
                Title = "Bookshop API",
                Version = "1.0.0",
                Description = "One contract implemented in three stacks. Get a token from POST /oauth/token.",
            };
            var bearer = new OpenApiSecurityScheme
            {
                Type = SecuritySchemeType.Http,
                Scheme = "bearer",
                BearerFormat = "JWT",
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "bearerAuth" },
            };
            document.Components ??= new OpenApiComponents();
            document.Components.SecuritySchemes["bearerAuth"] = bearer;
            document.SecurityRequirements.Add(new OpenApiSecurityRequirement { [bearer] = [] });
            return Task.CompletedTask;
        }).AddOperationTransformer(OpenApiBody.AddRequestBody));
        return services;
    }

    private static IServiceCollection AddGraphQl(this IServiceCollection services)
    {
        services.AddGraphQLServer()
            .AddQueryType<Query>()
            .ModifyRequestOptions(options => options.IncludeExceptionDetails = false);
        return services;
    }
}
