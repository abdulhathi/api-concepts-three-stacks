// The request pipeline. Order matters; each line says why.
using ApiConcepts.Api.Auth;
using ApiConcepts.Api.Common;
using ApiConcepts.Api.Endpoints;
using ApiConcepts.Api.Http;
using Microsoft.AspNetCore.Builder;
using Scalar.AspNetCore;

namespace ApiConcepts.Api.Composition;

public static class PipelineSetup
{
    public static WebApplication UseApiPipeline(this WebApplication app)
    {
        app.UseMiddleware<RequestIdMiddleware>();           // first: every response, even errors, carries an id
        app.UseMiddleware<RequestLogMiddleware>();          // sees the final status of everything below it
        app.UseMiddleware<SecurityHeadersMiddleware>();
        app.UseMiddleware<CacheControlDefaultMiddleware>();
        app.UseMiddleware<VaryOriginMiddleware>();
        app.UseCors();                                      // answers preflights before auth and rate limiting
        app.UseExceptionHandler();
        app.UseStatusCodePages(context =>
            ProblemWriter.WriteAsync(context.HttpContext, ProblemType.FromStatus(context.HttpContext.Response.StatusCode)));
        app.UseRouting();
        app.UseAuthentication();                            // fills HttpContext.User from the bearer token
        app.UseRateLimiter();                               // needs the user (per-client bucket) and the endpoint (policies)
        app.UseAuthorization();
        app.UseRequestTimeouts();                           // after the limiter: time spent queued does not count

        app.MapSystem();
        app.MapOAuth();

        var v1 = app.MapGroup("/v1")
            .RequireAuthorization()
            .AddEndpointFilter<JsonBodyFilter>();
        v1.MapIdentity();
        v1.MapProducts();
        v1.MapOrders();
        v1.MapReports();
        v1.MapDemo();
        v1.MapWebhooks();

        app.MapGraphQL("/graphql").RequireAuthorization("products:read");

        app.MapOpenApi("/openapi.json");
        app.MapScalarApiReference("/docs", options => options
            .WithTitle("Bookshop API")
            .WithOpenApiRoutePattern("/openapi.json"));

        app.MapFallback(IResult (HttpContext context) => throw new ProblemException(
            ProblemType.NotFound, $"No route matches {context.Request.Method} {context.Request.Path}."));
        return app;
    }
}
