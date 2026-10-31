using ApiConcepts.Api.Composition;

var builder = WebApplication.CreateBuilder(args);

// PORT overrides the default; tests host the app in memory and ignore this.
builder.WebHost.UseUrls($"http://*:{builder.Configuration["PORT"] ?? "8003"}");

// JSON lines on stdout, so logs are machine-readable in App Service log streams and Application Insights.
builder.Logging.ClearProviders();
builder.Logging.AddJsonConsole();
builder.Logging.AddFilter("Microsoft", LogLevel.Warning);
builder.Logging.AddFilter("Microsoft.Hosting.Lifetime", LogLevel.Information);
// ProblemExceptions are normal control flow, so the middleware's blanket "unhandled exception" log is noise.
// ApiExceptionHandler logs the genuinely unexpected ones, with the request id.
builder.Logging.AddFilter("Microsoft.AspNetCore.Diagnostics.ExceptionHandlerMiddleware", LogLevel.None);

builder.Services.AddApi();

var app = builder.Build();
app.UseApiPipeline();
app.Run();

// Lets WebApplicationFactory<Program> in the test project reach the entry point.
public partial class Program;
