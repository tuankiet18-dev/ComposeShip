# ASP.NET Core Dockerfile Template
FROM mcr.microsoft.com/dotnet/sdk:{{DOTNET_VERSION}} AS build
WORKDIR /src

# Copy project file(s) and restore
COPY *.csproj ./
RUN dotnet restore

# Copy everything and publish
COPY . .
RUN rm -rf bin obj && dotnet publish -c Release -o /app/publish

# Runtime
FROM mcr.microsoft.com/dotnet/aspnet:{{DOTNET_VERSION}}
WORKDIR /app
COPY --from=build /app/publish .
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080
ENTRYPOINT ["sh", "-c", "APP_DLL=$(find . -maxdepth 1 -name '*.runtimeconfig.json' | sed 's#^./##;s#.runtimeconfig.json$#.dll#' | head -n 1); dotnet \"$APP_DLL\""]
