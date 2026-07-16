using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using ComposeShip.Api.Data;

#nullable disable

namespace ComposeShip.Api.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20260526103000_AddServiceExposureProvider")]
    public partial class AddServiceExposureProvider : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ExposureProvider",
                table: "Services",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "traefik");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ExposureProvider",
                table: "Services");
        }
    }
}
