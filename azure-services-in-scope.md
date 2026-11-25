# DP-800: Azure and Microsoft services in scope

Exam: **Microsoft DP-800: Developing AI-Enabled Database Solutions**

Sources:
- The [official study guide](https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/dp-800) (skills outline as of March 12, 2026)
- A count of how often each name appears in this site's 909-question bank. Counts are approximate (keyword matches).

Exam domains:
1. Design and develop database solutions (35–40%)
2. Secure, optimize, and deploy database solutions (35–40%)
3. Implement AI capabilities in database solutions (25–30%)

---

## Tier 1: named in the official skills outline

Study these properly.

### Where the database runs

| Service | What to know |
|---|---|
| **Azure SQL Database** | The main platform. Most scenarios use it. |
| **Azure SQL Managed Instance** | Covered under "Azure SQL". Know how it differs from SQL Database. |
| **SQL Server (2025)** | On-premises or on a VM. Same engine features. |
| **SQL database in Microsoft Fabric** (plus Fabric lakehouse) | Named in the audience profile and in the MCP skill. About 60 mentions in the bank. |

### Domain 1: AI-assisted development

| Service | Skill |
|---|---|
| **GitHub Copilot** | Turn it on, write instruction files, choose models and MCP tools in a chat session |
| **Copilot in Fabric** | Turn it on and configure chat sessions |
| **MCP servers** (Model Context Protocol) | Connect to SQL Server and Fabric lakehouse endpoints |

### Domain 2: integrate, secure, monitor and deploy

| Service | Skill |
|---|---|
| **Data API builder (DAB)** | Config files, REST and GraphQL entities and relationships, deployment, securing endpoints |
| **Azure Functions** (SQL trigger binding) | React to data changes |
| **Azure Logic Apps** | React to data changes |
| **Azure Monitor**, with **Application Insights** and **Log Analytics** | Recommend a monitoring setup |
| **Managed Identity** (Microsoft Entra ID) | Passwordless access, securing model endpoints |
| **Query Store / Query Performance Insight** | Performance troubleshooting, alongside execution plans and DMVs |
| **SQL Database Projects + GitHub (CI/CD)** | Build and validate (SDK-style projects), source control, schema drift detection, deployment |

### Domain 3: AI

| Service | Skill |
|---|---|
| **Microsoft Foundry** (formerly Azure AI Foundry) | Model hosting, and one way to keep embeddings up to date |
| **Azure Functions / Logic Apps** | Also ways to keep embeddings up to date (with table triggers, Change Tracking, CDC and CES) |

---

## Tier 2: not named in the outline, but common in the question bank

| Service | Mentions | Why it comes up |
|---|---|---|
| **Azure OpenAI** | ~45 | The model behind `CREATE EXTERNAL MODEL`, `AI_GENERATE_EMBEDDINGS`, and chat completions in RAG. Treat it as core even though the outline doesn't name it. |
| **Azure Key Vault** | ~43 | Always Encrypted keys, TDE with your own key, storing secrets |
| **Microsoft Entra ID** (old name: Azure AD) | ~30 | Sign-in, managed identity, database users |
| **Azure Container Apps** | ~19 | Hosting DAB |
| **GitHub Actions** | ~17 | Running the CI/CD pipeline for SQL Database Projects |
| **Azure AI Search** | ~12 | Usually a wrong answer next to in-database vector search |
| **Azure App Service / Azure Static Web Apps** | ~10 / ~6 | Other places to host DAB |
| **Azure Event Hubs** | ~6 | Where change event streaming (CES) sends changes |

---

## Tier 3: rare, so recognize the name and move on

These appear in fewer than 10 questions each, mostly as context or wrong answers:

- Azure Blob Storage
- Azure Service Bus
- Azure Data Factory
- Azure Cosmos DB
- Azure DevOps
- Azure Virtual Machines
- Azure CLI

---

## SQL engine features in the outline (not Azure services)

Your T-SQL study covers these, but here they are so the list is complete:

- **Objects:** columnstore indexes; in-memory, temporal, external, ledger and graph tables; JSON columns; sequences; partitioning
- **Programmability:** views, scalar and table-valued functions, stored procedures, triggers
- **Advanced T-SQL:** CTEs, window functions, JSON functions (`JSON_OBJECT`, `JSON_ARRAY`, `JSON_ARRAYAGG`, `JSON_CONTAINS`, `OPENJSON`, `JSON_VALUE`), regex (`REGEXP_LIKE`, `REGEXP_REPLACE`, `REGEXP_SUBSTR`, `REGEXP_INSTR`, `REGEXP_COUNT`, `REGEXP_MATCHES`, `REGEXP_SPLIT_TO_TABLE`), fuzzy matching (`EDIT_DISTANCE`, `EDIT_DISTANCE_SIMILARITY`, `JARO_WINKLER_DISTANCE`), graph `MATCH`
- **Security:** Always Encrypted, column-level encryption, Dynamic Data Masking, Row-Level Security, object-level permissions, auditing, passwordless access
- **Performance:** isolation levels, DMVs, blocking and deadlocks
- **Change handling:** change event streaming (CES), change data capture (CDC), Change Tracking
- **AI search:** `VECTOR` data type, `VECTOR_NORMALIZE`, `VECTOR_DISTANCE`, `VECTORPROPERTY`, `VECTOR_SEARCH`, ANN and ENN, vector indexes, full-text search, hybrid search, reciprocal rank fusion (RRF)
- **RAG:** `sp_invoke_external_rest_endpoint` to build and send prompts

---

## Suggested study order after T-SQL

1. **Azure OpenAI with Foundry:** embeddings, `CREATE EXTERNAL MODEL`, RAG, `sp_invoke_external_rest_endpoint`, managed identity for model calls. Covers most of Domain 3.
2. **Data API builder:** `dab-config.json`, REST and GraphQL, roles and permissions, hosting on Container Apps, App Service or Static Web Apps.
3. **SQL Database Projects with GitHub Actions:** `.dacpac`, SqlPackage, schema drift, deployment pipelines.
4. **Entra ID, managed identity and Key Vault:** passwordless access and key management.
5. **Lighter topics:** Azure Functions and Logic Apps for change handling, Azure Monitor (Application Insights, Log Analytics) for monitoring, GitHub Copilot, Copilot in Fabric and MCP.
