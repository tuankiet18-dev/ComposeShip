using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OneClickHost.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddComposeProjectDeployments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Branch",
                table: "Projects",
                type: "character varying(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "main");

            migrationBuilder.AddColumn<bool>(
                name: "ComposeDeleteVolumesOnDelete",
                table: "Projects",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "ComposeEnvJson",
                table: "Projects",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ComposeFile",
                table: "Projects",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ComposeLiveUrlsJson",
                table: "Projects",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ComposePostStartCommands",
                table: "Projects",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ComposeProjectName",
                table: "Projects",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ComposeRoutesJson",
                table: "Projects",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeploymentMode",
                table: "Projects",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "services");

            migrationBuilder.AddColumn<string>(
                name: "RepoUrl",
                table: "Projects",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Subfolder",
                table: "Projects",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ProjectDeployments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ComposeProjectName = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    PublicUrlsJson = table.Column<string>(type: "text", nullable: true),
                    ErrorMessage = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    BuildLogs = table.Column<string>(type: "text", nullable: true),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    StartedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CompletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectDeployments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectDeployments_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectDeployments_ProjectId",
                table: "ProjectDeployments",
                column: "ProjectId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ProjectDeployments");

            migrationBuilder.DropColumn(
                name: "Branch",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "ComposeDeleteVolumesOnDelete",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "ComposeEnvJson",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "ComposeFile",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "ComposeLiveUrlsJson",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "ComposePostStartCommands",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "ComposeProjectName",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "ComposeRoutesJson",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "DeploymentMode",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "RepoUrl",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "Subfolder",
                table: "Projects");
        }
    }
}
