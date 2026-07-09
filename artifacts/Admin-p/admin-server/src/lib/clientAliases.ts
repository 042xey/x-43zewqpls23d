export const CLIENT_ALIAS_MAP: Record<
  string,
  { id: string; name: string; resource: string }
> = {
  "azure-cli": {
    id: "04b07795-8ddb-461a-bbee-02f9e1bf7b46",
    name: "Azure CLI",
    resource: "https://graph.microsoft.com",
  },
  "azure-powershell": {
    id: "1950a258-227b-4e31-a9cf-717495945fc2",
    name: "Azure PowerShell",
    resource: "https://graph.microsoft.com",
  },
  msgraph: {
    id: "14d82eec-204b-4c2f-b7e8-296a70dab67e",
    name: "Microsoft Graph PowerShell",
    resource: "https://graph.microsoft.com",
  },
  office365: {
    id: "d3590ed6-52b3-4102-aeff-aad2292ab01c",
    name: "Microsoft Office",
    resource: "https://manage.office.com",
  },
  exchange: {
    id: "27922004-5251-4030-b22d-91ecd9a37ea4",
    name: "Outlook Mobile",
    resource: "https://outlook.office365.com",
  },
  sharepoint: {
    id: "9bc3ab49-b65d-410a-85ad-de819febfddc",
    name: "SharePoint Online Management Shell",
    resource: "https://sharepoint.com",
  },
  msteams: {
    id: "1fec8e78-bce4-4aaf-ab1b-5451cc387264",
    name: "Microsoft Teams",
    resource: "https://api.spaces.skype.com",
  },
};

