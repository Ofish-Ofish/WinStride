using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WinStride_Api.Migrations
{
    /// <inheritdoc />
    public partial class AddVerificationToWinProcess : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "VerificationStatus",
                table: "WinProcesses",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "VerificationStatus",
                table: "WinProcesses");
        }
    }
}
