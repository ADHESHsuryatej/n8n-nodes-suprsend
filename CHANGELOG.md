# Changelog

## 1.0.0

Added 12 actions. Existing actions and saved workflows are unchanged.

- Workflow: Trigger for List, Cancel
- Event: Send
- Broadcast: Send (credential gets an optional Workspace Key field)
- User: Get Preferences, Update Channel Preference
- List: Remove User, Create, Get Many, Get Users, Sync
- Message: Get Many
- Node version 2: lists, templates, workflows, events and categories are picked from searchable dropdowns (or typed by slug/ID). Nodes saved before 1.0.0 stay on version 1 with plain text boxes.
- Credential gets an optional Service Token field, used only to load the workflow, event and category dropdowns (the workspace is found from the Workspace Key).
- User > Get Preferences now also returns channel preferences.

## 0.1.3

- Moved Tenant ID on User > Update Category Preference into Additional Fields.

## 0.1.2

- Official SuprSend logo as the node icon.

## 0.1.1

- First public release: Workflow Trigger, User Create or Update, User Update Category Preference, List Add User.
