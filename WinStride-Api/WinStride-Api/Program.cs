using WinStrideApi.Models;
using WinStrideApi.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.OData;
using Microsoft.OData.ModelBuilder;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseNpgsql(connectionString));

var modelBuilder = new ODataConventionModelBuilder();
modelBuilder.EnableLowerCamelCase();
modelBuilder.EntitySet<WinEvent>("Event");

builder.Services.AddControllers().AddOData(options =>
    options.Select().Filter().OrderBy().Count().SetMaxTop(5000).AddRouteComponents(
        "api",
        modelBuilder.GetEdmModel()));

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.ResolveConflictingActions(apiDescriptions => apiDescriptions.First());
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();   

app.Run();
