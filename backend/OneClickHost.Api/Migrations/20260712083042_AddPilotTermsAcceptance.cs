using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OneClickHost.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPilotTermsAcceptance : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "PilotTermsAcceptedAt",
                table: "Users",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PilotTermsAcceptedAt",
                table: "Users");
        }
    }
}
