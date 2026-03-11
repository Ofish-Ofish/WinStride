using Microsoft.AspNetCore.Authentication.Certificate;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OData;
using Microsoft.AspNetCore.Server.Kestrel.Https;
using Microsoft.EntityFrameworkCore;
using Microsoft.OData.Edm;
using Microsoft.OData.ModelBuilder;
using System.Data;
using System.Security.Cryptography.X509Certificates;
using WinStride_Api.Models;
using WinStrideApi.Data;
using WinStrideApi.Models;

var builder = WebApplication.CreateBuilder(args);

var serverCertThumbprint = builder.Configuration["ServerCertThumbprint"];
var tlsEnabled = !string.IsNullOrWhiteSpace(serverCertThumbprint);
var httpPort = builder.Configuration.GetValue("HttpPort", 5090);
var httpsPort = builder.Configuration.GetValue("HttpsPort", 7097);
var corsOrigins = builder.Configuration.GetSection("CorsOrigins").Get<string[]>()
    ?? ["http://localhost:5173"];

builder.WebHost.ConfigureKestrel(options =>
{
    if (tlsEnabled)
    {
        // Secure mode: HTTPS only with mTLS, no HTTP fallback
        options.ListenAnyIP(httpsPort, listenOptions =>
        {
            listenOptions.UseHttps(httpsOptions =>
            {
                using var store = new X509Store(StoreName.My, StoreLocation.CurrentUser);
                store.Open(OpenFlags.ReadOnly);
                var certs = store.Certificates.Find(
                    X509FindType.FindByThumbprint, serverCertThumbprint!, false);

                if (certs.Count > 0)
                    httpsOptions.ServerCertificate = certs[0];

                httpsOptions.ClientCertificateMode = ClientCertificateMode.RequireCertificate;
            });
        });
    }
    else
    {
        // Lab/dev mode: HTTP only, no TLS
        options.ListenAnyIP(httpPort);
    }
});

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Data Source=winstride.db";
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlite(connectionString));

var modelBuilder = new ODataConventionModelBuilder();
modelBuilder.EnableLowerCamelCase();

modelBuilder.EntitySet<WinEvent>("Event");
modelBuilder.EntitySet<Heartbeat>("Heartbeat");
modelBuilder.EntitySet<TCPView>("NetworkConnections");
modelBuilder.EntitySet<AutorunView>("Autoruns");
modelBuilder.EntitySet<WinProcess>("WinProcesses");

if (tlsEnabled)
{
    builder.Services.AddAuthentication(CertificateAuthenticationDefaults.AuthenticationScheme)
        .AddCertificate(options =>
        {
            options.AllowedCertificateTypes = CertificateTypes.All;

            options.Events = new CertificateAuthenticationEvents
            {
                OnCertificateValidated = context =>
                {
                    context.Success();
                    return Task.CompletedTask;
                },
                OnAuthenticationFailed = context =>
                {
                    context.Fail("Certificate failed validation or was not provided.");
                    return Task.CompletedTask;
                }
            };
        });
    builder.Services.AddAuthorization();
}
else
{
    builder.Services.AddAuthorization(options =>
    {
        options.FallbackPolicy = null;
        options.DefaultPolicy = new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder()
            .RequireAssertion(_ => true)
            .Build();
    });
}

builder.Services.AddControllers().AddNewtonsoftJson().AddOData(options =>
    options.Select().Filter().OrderBy().Count().SetMaxTop(5000).AddRouteComponents(
        "api",
        modelBuilder.GetEdmModel()));

builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.ResolveConflictingActions(apiDescriptions => apiDescriptions.First());
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReactUI",
        policy =>
        {
            policy.WithOrigins(corsOrigins)
                  .AllowAnyHeader()
                  .AllowAnyMethod();
        });
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    db.Database.EnsureCreated();
    EnsureSqliteCompatibility(db);
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseResponseCompression();
app.UseCors("AllowReactUI");

if (tlsEnabled)
{
    app.UseAuthentication();
}

app.UseAuthorization();

app.MapControllers();

app.Run();

static void EnsureSqliteCompatibility(ApplicationDbContext db)
{
    if (!db.Database.IsSqlite())
    {
        return;
    }

    var connection = db.Database.GetDbConnection();
    var openedHere = connection.State != ConnectionState.Open;

    if (openedHere)
    {
        connection.Open();
    }

    try
    {
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM pragma_table_info('WinProcesses') WHERE name = 'VerificationStatus';";

        var hasVerificationStatus = Convert.ToInt32(command.ExecuteScalar()) > 0;
        if (!hasVerificationStatus)
        {
            db.Database.ExecuteSqlRaw(@"ALTER TABLE ""WinProcesses"" ADD COLUMN ""VerificationStatus"" TEXT NULL;");
        }
    }
    finally
    {
        if (openedHere)
        {
            connection.Close();
        }
    }
}
