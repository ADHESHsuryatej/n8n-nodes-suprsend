# n8n-nodes-suprsend

This is an n8n community node for [SuprSend](https://www.suprsend.com), the notification infrastructure for product teams. Use it to trigger multi-channel notification workflows (email, SMS, push, in-app inbox, WhatsApp, Slack) and to manage users, preferences and lists from your n8n workflows.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation and install `n8n-nodes-suprsend`.

## Operations

| Resource | Operation | What it does |
|---|---|---|
| Workflow | Trigger | Triggers a SuprSend workflow for a user, with optional emails, phone numbers, tenant and template data |
| User | Create or Update | Creates a user, or updates them if the Distinct ID already exists |
| User | Update Category Preference | Opts a user in or out of a notification category |
| List | Add User | Adds a user to a SuprSend list |

The node can also be used as a tool by n8n AI agents.

## Credentials

1. Log in to the [SuprSend dashboard](https://app.suprsend.com).
2. Pick the workspace you want to use (for example Staging or Production).
3. Go to **Developers > API Keys** and copy an API key.
4. In n8n, create a **SuprSend API** credential and paste the key.

Each API key belongs to one workspace, so create one credential per workspace.

## Usage

**Send a welcome notification when someone signs up**

1. Add your sign-up trigger (for example a Webhook or Form node).
2. Add **SuprSend > User > Create or Update** with the user's ID, name and email.
3. Add **SuprSend > Workflow > Trigger** with your workflow slug (for example `welcome-email`) and the same Distinct ID. Put template variables in **Additional Fields > Data**, for example `{"first_name": "Jane"}`.

## Compatibility

Tested with n8n 2.x.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [SuprSend API reference](https://docs.suprsend.com/reference)
- [SuprSend workflows](https://docs.suprsend.com/docs/workflows)

## License

[MIT](LICENSE)
