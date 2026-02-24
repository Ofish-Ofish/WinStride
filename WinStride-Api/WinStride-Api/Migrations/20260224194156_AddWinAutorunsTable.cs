using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace WinStride_Api.Migrations
{
    /// <inheritdoc />
    public partial class AddWinAutorunsTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AutorunViews",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Time = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    EntryLocation = table.Column<string>(type: "text", nullable: false),
                    Entry = table.Column<string>(type: "text", nullable: false),
                    Enabled = table.Column<string>(type: "text", nullable: false),
                    Category = table.Column<string>(type: "text", nullable: false),
                    Profile = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
                    Company = table.Column<string>(type: "text", nullable: false),
                    ImagePath = table.Column<string>(type: "text", nullable: false),
                    Version = table.Column<string>(type: "text", nullable: false),
                    LaunchString = table.Column<string>(type: "text", nullable: false),
                    Md5 = table.Column<string>(type: "text", nullable: false),
                    Sha1 = table.Column<string>(type: "text", nullable: false),
                    PeSha1 = table.Column<string>(type: "text", nullable: false),
                    PeSha256 = table.Column<string>(type: "text", nullable: false),
                    Sha256 = table.Column<string>(type: "text", nullable: false),
                    Imp = table.Column<string>(type: "text", nullable: false),
                    BatchId = table.Column<Guid>(type: "uuid", nullable: false),
                    MachineName = table.Column<string>(type: "text", nullable: false),
                    TimeSynced = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AutorunViews", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AutorunViews_BatchId",
                table: "AutorunViews",
                column: "BatchId");

            migrationBuilder.CreateIndex(
                name: "IX_AutorunViews_Entry",
                table: "AutorunViews",
                column: "Entry");

            migrationBuilder.CreateIndex(
                name: "IX_AutorunViews_MachineName_TimeSynced",
                table: "AutorunViews",
                columns: new[] { "MachineName", "TimeSynced" },
                descending: new[] { false, true });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AutorunViews");
        }
    }
}
