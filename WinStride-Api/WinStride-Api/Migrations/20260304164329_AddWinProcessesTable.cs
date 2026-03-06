using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace WinStride_Api.Migrations
{
    /// <inheritdoc />
    public partial class AddWinProcessesTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "WinProcesses",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    MachineName = table.Column<string>(type: "text", nullable: false),
                    BatchId = table.Column<Guid>(type: "uuid", nullable: false),
                    TimeSynced = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ImageName = table.Column<string>(type: "text", nullable: false),
                    Pid = table.Column<int>(type: "integer", nullable: false),
                    ParentPid = table.Column<int>(type: "integer", nullable: true),
                    SessionId = table.Column<int>(type: "integer", nullable: false),
                    WorkingSetSize = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WinProcesses", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WinProcesses_MachineName_BatchId",
                table: "WinProcesses",
                columns: new[] { "MachineName", "BatchId" });

            migrationBuilder.CreateIndex(
                name: "IX_WinProcesses_Pid",
                table: "WinProcesses",
                column: "Pid");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WinProcesses");
        }
    }
}
