using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace WinStride_Api.Migrations
{
    /// <inheritdoc />
    public partial class AddNetworkConnectionsTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "WinNetworkConnections",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    MachineName = table.Column<string>(type: "text", nullable: false),
                    ProcessName = table.Column<string>(type: "text", nullable: true),
                    ProcessId = table.Column<int>(type: "integer", nullable: true),
                    BatchId = table.Column<Guid>(type: "uuid", nullable: false),
                    Protocol = table.Column<string>(type: "text", nullable: true),
                    LocalAddress = table.Column<string>(type: "text", nullable: true),
                    LocalPort = table.Column<int>(type: "integer", nullable: true),
                    RemoteAddress = table.Column<string>(type: "text", nullable: true),
                    RemotePort = table.Column<int>(type: "integer", nullable: true),
                    State = table.Column<string>(type: "text", nullable: true),
                    ModuleName = table.Column<string>(type: "text", nullable: true),
                    SentPackets = table.Column<long>(type: "bigint", nullable: false),
                    RecvPackets = table.Column<long>(type: "bigint", nullable: false),
                    SentBytes = table.Column<long>(type: "bigint", nullable: false),
                    RecvBytes = table.Column<long>(type: "bigint", nullable: false),
                    TimeCreated = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WinNetworkConnections", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WinNetworkConnections_BatchId",
                table: "WinNetworkConnections",
                column: "BatchId");

            migrationBuilder.CreateIndex(
                name: "IX_WinNetworkConnections_MachineName_TimeCreated",
                table: "WinNetworkConnections",
                columns: new[] { "MachineName", "TimeCreated" },
                descending: new[] { false, true });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WinNetworkConnections");
        }
    }
}
