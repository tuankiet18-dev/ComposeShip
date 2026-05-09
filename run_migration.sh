#!/bin/bash
rm -rf bin/ obj/
dotnet tool install --global dotnet-ef
export PATH="$PATH:/root/.dotnet/tools"
dotnet restore
dotnet ef migrations add AddNetworkAliasesToService
