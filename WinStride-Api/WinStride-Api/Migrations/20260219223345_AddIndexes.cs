using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WinStride_Api.Migrations
{
    /// <inheritdoc />
    public partial class AddIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "Level",
                table: "WinEvents",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.CreateIndex(
                name: "IX_WinEvents_EventId",
                table: "WinEvents",
                column: "EventId");

            migrationBuilder.CreateIndex(
                name: "IX_WinEvents_LogName_TimeCreated",
                table: "WinEvents",
                columns: new[] { "LogName", "TimeCreated" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "IX_WinEvents_TimeCreated",
                table: "WinEvents",
                column: "TimeCreated",
                descending: new bool[0]);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_WinEvents_EventId",
                table: "WinEvents");

            migrationBuilder.DropIndex(
                name: "IX_WinEvents_LogName_TimeCreated",
                table: "WinEvents");

            migrationBuilder.DropIndex(
                name: "IX_WinEvents_TimeCreated",
                table: "WinEvents");

            migrationBuilder.AlterColumn<string>(
                name: "Level",
                table: "WinEvents",
                type: "text",
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);
        }
    }
}
