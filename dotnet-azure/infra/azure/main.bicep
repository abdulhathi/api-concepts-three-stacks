// Bookshop API on Azure App Service (Linux, .NET 9).
//   Web App  - HTTPS only; TLS ends at the App Service front end and X-Forwarded-Proto tells the app (concept 14)
//   Key Vault - holds JWT_SECRET; the app reads it through a Key Vault reference and its managed identity
//   Application Insights - request telemetry and logs, backed by a Log Analytics workspace

@description('Azure region. Defaults to the resource group location.')
param location string = resourceGroup().location

@description('Base name for the resources. The default adds a stable suffix so the web app host name is unique.')
param appName string = 'bookshop-api-${take(uniqueString(resourceGroup().id), 6)}'

@description('App Service plan SKU. B1 is the cheapest tier with Always On.')
param skuName string = 'B1'

@secure()
@description('HS256 signing key for access tokens (at least 32 bytes). Stored in Key Vault, never in app settings.')
param jwtSecret string

@description('Comma-separated CORS allowlist.')
param corsOrigins string = 'http://localhost:5173'

var keyVaultName = 'kv${uniqueString(resourceGroup().id, appName)}'
var secretName = 'JWT-SECRET'

// Built-in role "Key Vault Secrets User": read secret values, nothing else.
var keyVaultSecretsUser = '4633458b-17de-408a-b874-0445c86b69e6'

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${appName}-logs'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${appName}-insights'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
  }
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
  }
}

resource jwtSecretEntry 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: secretName
  properties: {
    value: jwtSecret
  }
}

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${appName}-plan'
  location: location
  kind: 'linux'
  sku: { name: skuName }
  properties: {
    reserved: true // required for Linux plans
  }
}

resource site 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  kind: 'app,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOTNETCORE|9.0'
      alwaysOn: true
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      http20Enabled: true
      healthCheckPath: '/health'
    }
  }
}

// The app's identity may read secrets. This must exist before the app settings below are applied,
// otherwise the Key Vault reference cannot be resolved on first start.
resource siteCanReadSecrets 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: vault
  name: guid(vault.id, site.id, keyVaultSecretsUser)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUser)
    principalId: site.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource settings 'Microsoft.Web/sites/config@2023-12-01' = {
  parent: site
  name: 'appsettings'
  dependsOn: [siteCanReadSecrets]
  properties: {
    PORT: '8080' // the port App Service Linux forwards to
    JWT_SECRET: '@Microsoft.KeyVault(SecretUri=${jwtSecretEntry.properties.secretUri})'
    CORS_ORIGINS: corsOrigins
    APPLICATIONINSIGHTS_CONNECTION_STRING: insights.properties.ConnectionString
    WEBSITE_RUN_FROM_PACKAGE: '1'
  }
}

output webAppName string = site.name
output url string = 'https://${site.properties.defaultHostName}'
output keyVaultName string = vault.name
