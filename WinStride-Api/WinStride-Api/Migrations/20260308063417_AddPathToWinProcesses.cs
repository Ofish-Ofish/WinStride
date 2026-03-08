using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WinStride_Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPathToWinProcesses : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Path",
                table: "WinProcesses",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Path",
                table: "WinProcesses");
        }
    }
}
