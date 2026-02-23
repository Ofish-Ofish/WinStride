using WinStrideApi.Models;
using WinStrideApi.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.OData;
using Microsoft.OData.ModelBuilder;
using Microsoft.OData.Edm;
using Microsoft.AspNetCore.Mvc;
    
var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseNpgsql(connectionString));

var modelBuilder = new ODataConventionModelBuilder();
modelBuilder.EnableLowerCamelCase();

modelBuilder.EntitySet<WinEvent>("Event");
modelBuilder.EntitySet<Heartbeat>("Heartbeat");
modelBuilder.EntitySet<TCPView>("NetworkConnections");

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

app.UseAuthorization();

app.MapControllers();

app.Run();