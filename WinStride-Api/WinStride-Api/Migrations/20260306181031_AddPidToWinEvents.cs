using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WinStride_Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPidToWinEvents : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Pid",
                table: "WinEvents",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Pid",
                table: "WinEvents");
        }
    }
}
