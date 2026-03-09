using Microsoft.AspNetCore.Authentication.Certificate;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OData;
using Microsoft.AspNetCore.Server.Kestrel.Https;
using Microsoft.EntityFrameworkCore;
using Microsoft.OData.Edm;
using Microsoft.OData.ModelBuilder;
using System.Security.Cryptography.X509Certificates;
using WinStride_Api.Models;
using WinStrideApi.Data;
using WinStrideApi.Models;

var builder = WebApplication.CreateBuilder(args);

var serverCertThumbprint = builder.Configuration["ServerCertThumbprint"];

builder.WebHost.ConfigureKestrel(options =>
{
    options.ListenAnyIP(7097, listenOptions =>
    {
        listenOptions.UseHttps(httpsOptions =>
        {
            if (!string.IsNullOrWhiteSpace(serverCertThumbprint))
            {
                using var store = new X509Store(StoreName.My, StoreLocation.CurrentUser);
                store.Open(OpenFlags.ReadOnly);
                var certs = store.Certificates.Find(
                    X509FindType.FindByThumbprint, serverCertThumbprint, false);

                if (certs.Count > 0)
                    httpsOptions.ServerCertificate = certs[0];
            }

            httpsOptions.ClientCertificateMode = ClientCertificateMode.RequireCertificate;
        });
    });
});

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseNpgsql(connectionString));

var modelBuilder = new ODataConventionModelBuilder();
modelBuilder.EnableLowerCamelCase();

modelBuilder.EntitySet<WinEvent>("Event");
modelBuilder.EntitySet<Heartbeat>("Heartbeat");
modelBuilder.EntitySet<TCPView>("NetworkConnections");
modelBuilder.EntitySet<AutorunView>("Autoruns");
modelBuilder.EntitySet<WinProcess>("WinProcesses");

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

builder.Services.AddControllers().AddNewtonsoftJson().AddOData(options =>
    options.Select().Filter().OrderBy().Count().SetMaxTop(5000).AddRouteComponents(
        "api",
        modelBuilder.GetEdmModel()));

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
            policy.WithOrigins("http://localhost:5173")
                  .AllowAnyHeader()
                  .AllowAnyMethod();
        });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AllowReactUI");

app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();