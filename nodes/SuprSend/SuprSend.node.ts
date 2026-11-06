import type { INodeProperties, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

// Request shapes match the SuprSend Zapier and Make apps (docs.suprsend.com/reference, 2026-10-30).

const splitList = '={{ $value.split(",").map((s) => s.trim()).filter((s) => s) }}';
const parseJson = '={{ typeof $value === "string" ? JSON.parse($value) : $value }}';

const distinctId = (resource: string, operation: string[]): INodeProperties => ({
	displayName: 'Distinct ID',
	name: 'distinctId',
	type: 'string',
	required: true,
	default: '',
	description: 'Unique ID of the user in your system',
	displayOptions: { show: { resource: [resource], operation } },
});

const workflowFields: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['workflow'] } },
		options: [
			{
				name: 'Trigger',
				value: 'trigger',
				action: 'Trigger a workflow',
				description: 'Trigger a SuprSend workflow for a user',
				routing: { request: { method: 'POST', url: '/trigger/' } },
			},
		],
		default: 'trigger',
	},
	{
		displayName: 'Workflow Slug',
		name: 'workflow',
		type: 'string',
		required: true,
		default: '',
		description: 'Slug of the workflow, from the SuprSend Workflows page',
		displayOptions: { show: { resource: ['workflow'], operation: ['trigger'] } },
		routing: { send: { type: 'body', property: 'workflow' } },
	},
	{
		...distinctId('workflow', ['trigger']),
		routing: { send: { type: 'body', property: 'recipients[0].distinct_id' } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['workflow'], operation: ['trigger'] } },
		options: [
			{
				displayName: 'Data (JSON)',
				name: 'data',
				type: 'json',
				default: '{}',
				description: 'Variables used in the workflow templates',
				routing: { send: { type: 'body', property: 'data', value: parseJson } },
			},
			{
				displayName: 'Emails',
				name: 'email',
				type: 'string',
				default: '',
				placeholder: 'name@email.com',
				description: 'Comma-separated email addresses of the recipient',
				routing: { send: { type: 'body', property: 'recipients[0].$email', value: splitList } },
			},
			{
				displayName: 'Phone Numbers',
				name: 'phone',
				type: 'string',
				default: '',
				description: 'Comma-separated phone numbers in international format, e.g. +14155550123',
				routing: { send: { type: 'body', property: 'recipients[0].$sms', value: splitList } },
			},
			{
				displayName: 'Tenant ID',
				name: 'tenantId',
				type: 'string',
				default: '',
				routing: { send: { type: 'body', property: 'tenant_id' } },
			},
		],
	},
];

const userFields: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['user'] } },
		options: [
			{
				name: 'Create or Update',
				value: 'upsert',
				action: 'Create or update a user',
				description: 'Create a new record, or update the current one if it already exists (upsert)',
				routing: {
					request: { method: 'POST', url: '=/v1/user/{{encodeURIComponent($parameter.distinctId)}}/' },
				},
			},
			{
				name: 'Update Category Preference',
				value: 'updatePreference',
				action: 'Update a user category preference',
				description: 'Opt a user in or out of a notification category',
				routing: {
					request: {
						method: 'PATCH',
						url: '=/v1/user/{{encodeURIComponent($parameter.distinctId)}}/preference/category/{{encodeURIComponent($parameter.category)}}/',
					},
				},
			},
		],
		default: 'upsert',
	},
	distinctId('user', ['upsert', 'updatePreference']),
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['user'], operation: ['upsert'] } },
		options: [
			{
				displayName: 'Custom Properties (JSON)',
				name: 'properties',
				type: 'json',
				default: '{}',
				description: 'Extra user properties to store',
				// ponytail: merged into the body root; send keys that don't clash with the fields above
				routing: {
					send: {
						preSend: [
							async function (this, requestOptions) {
								const raw = this.getNodeParameter('additionalFields.properties', '{}');
								const props = typeof raw === 'string' ? JSON.parse(raw) : raw;
								requestOptions.body = Object.assign({}, props, requestOptions.body);
								return requestOptions;
							},
						],
					},
				},
			},
			{
				displayName: 'Emails',
				name: 'email',
				type: 'string',
				default: '',
				placeholder: 'name@email.com',
				description: 'Comma-separated email addresses',
				routing: { send: { type: 'body', property: '$email', value: splitList } },
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				routing: { send: { type: 'body', property: 'name' } },
			},
			{
				displayName: 'Phone Numbers',
				name: 'phone',
				type: 'string',
				default: '',
				description: 'Comma-separated phone numbers in international format, e.g. +14155550123',
				routing: { send: { type: 'body', property: '$sms', value: splitList } },
			},
			{
				displayName: 'Timezone',
				name: 'timezone',
				type: 'string',
				default: '',
				placeholder: 'America/New_York',
				description: 'IANA timezone name',
				routing: { send: { type: 'body', property: '$timezone' } },
			},
		],
	},
	{
		displayName: 'Category Slug',
		name: 'category',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'product-updates',
		description: 'Slug of the notification category',
		displayOptions: { show: { resource: ['user'], operation: ['updatePreference'] } },
	},
	{
		displayName: 'Preference',
		name: 'preference',
		type: 'options',
		required: true,
		default: 'opt_in',
		options: [
			{ name: 'Opt In', value: 'opt_in' },
			{ name: 'Opt Out', value: 'opt_out' },
		],
		displayOptions: { show: { resource: ['user'], operation: ['updatePreference'] } },
		routing: { send: { type: 'body', property: 'preference' } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['user'], operation: ['updatePreference'] } },
		options: [
			{
				displayName: 'Tenant ID',
				name: 'tenantId',
				type: 'string',
				default: '',
				description: 'Set the preference for this tenant only',
				routing: { send: { type: 'query', property: 'tenant_id' } },
			},
		],
	},
];

const listFields: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['list'] } },
		options: [
			{
				name: 'Add User',
				value: 'addUser',
				action: 'Add a user to a list',
				description: 'Add a user to a SuprSend list',
				routing: {
					request: {
						method: 'POST',
						url: '=/v1/subscriber_list/{{encodeURIComponent($parameter.listId)}}/subscriber/add/',
					},
				},
			},
		],
		default: 'addUser',
	},
	{
		displayName: 'List ID',
		name: 'listId',
		type: 'string',
		required: true,
		default: '',
		description: 'ID of the list, from the SuprSend Lists page',
		displayOptions: { show: { resource: ['list'], operation: ['addUser'] } },
	},
	{
		...distinctId('list', ['addUser']),
		routing: { send: { type: 'body', property: 'distinct_ids', value: '={{ [$value] }}' } },
	},
];

export class SuprSend implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SuprSend',
		name: 'suprSend',
		icon: { light: 'file:suprsend.svg', dark: 'file:suprsend.dark.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Trigger notification workflows and manage users, preferences and lists in SuprSend',
		defaults: { name: 'SuprSend' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'suprSendApi', required: true }],
		requestDefaults: {
			baseURL: 'https://hub.suprsend.com',
			headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
			json: true,
		},
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'List', value: 'list' },
					{ name: 'User', value: 'user' },
					{ name: 'Workflow', value: 'workflow' },
				],
				default: 'workflow',
			},
			...workflowFields,
			...userFields,
			...listFields,
		],
	};
}
