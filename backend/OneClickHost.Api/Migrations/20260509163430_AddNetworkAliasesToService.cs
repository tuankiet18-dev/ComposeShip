using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OneClickHost.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddNetworkAliasesToService : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "NetworkAliases",
                table: "Services",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "NetworkAliases",
                table: "Services");
        }
    }
}
