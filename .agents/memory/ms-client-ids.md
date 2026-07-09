---
name: MS device code client IDs
description: Which Microsoft client IDs are valid public clients for device code flow vs resource/service principal IDs that cannot be used as client_ids.
---

For device code flow, the `client_id` must be a **public client application** registered in AAD — no client secret required. Resource/service principal IDs (e.g. `00000003-0000-0000-c000-000000000000` for Graph API) are NOT client_ids and will fail with `AADSTS7000218: client_assertion or client_secret required`.

**Valid public client IDs in use:**
- Azure CLI: `04b07795-8ddb-461a-bbee-02f9e1bf7b46`
- Azure PowerShell: `1950a258-227b-4e31-a9cf-717495945fc2`
- Microsoft Graph PowerShell: `14d82eec-204b-4c2f-b7e8-296a70dab67e`
- Microsoft Office: `d3590ed6-52b3-4102-aeff-aad2292ab01c`
- Outlook Mobile: `27922004-5251-4030-b22d-91ecd9a37ea4`
- SharePoint Online Management Shell: `9bc3ab49-b65d-410a-85ad-de819febfddc`
- Microsoft Teams: `1fec8e78-bce4-4aaf-ab1b-5451cc387264`

**Why:** The alias map originally conflated resource/service principal IDs with OAuth client app IDs. Only public clients can initiate device code grants without a secret.

**How to apply:** When adding new aliases, verify the `id` field is a public client app ID (not a resource/API service principal). The `resource` field is separate and specifies what API the resulting token will grant access to.
