import type {
	IDataObject,
	IExecuteSingleFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IN8nHttpFullResponse,
	INodeExecutionData,
	INodeListSearchResult,
	INodeProperties,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

// Request shapes match the SuprSend Zapier and Make apps (docs.suprsend.com/reference, 2026-10-30).
// 1.0.0 actions and dropdowns checked against docs.suprsend.com/reference on 2026-11-14.
//
// Node version 2 turns slug/ID text boxes into dropdowns (resource locators).
// Version 1 keeps plain text boxes so workflows saved before 1.0.0 keep working unchanged.

const BASE_URL = 'https://hub.suprsend.com';
const MANAGEMENT_URL = 'https://management-api.suprsend.com';
const splitList = '={{ $value.split(",").map((s) => s.trim()).filter((s) => s) }}';
const parseJson = '={{ typeof $value === "string" ? JSON.parse($value) : $value }}';
const toIsoDate = '={{ new Date($value).toISOString() }}';
// Works for both versions: a v1 text value or a v2 dropdown value.
const rlValue = '={{ typeof $value === "object" ? $value.value : $value }}';
const param = (name: string) =>
	`encodeURIComponent(typeof $parameter.${name} === "object" ? $parameter.${name}.value : $parameter.${name})`;
const resultsAsItems = { postReceive: [{ type: 'rootProperty' as const, properties: { property: 'results' } }] };
// Some endpoints answer with plain text ("OK"); turn it into a proper item instead of one field per letter.
const textAsStatus = {
	postReceive: [
		async function (
			this: IExecuteSingleFunctions,
			items: INodeExecutionData[],
			response: IN8nHttpFullResponse,
		): Promise<INodeExecutionData[]> {
			return typeof response.body === 'string' ? [{ json: { status: response.body } }] : items;
		},
	],
};

const channelOptions = [
	{ name: 'Android Push', value: 'androidpush' },
	{ name: 'Email', value: 'email' },
	{ name: 'In-App Inbox', value: 'inbox' },
	{ name: 'iOS Push', value: 'iospush' },
	{ name: 'Microsoft Teams', value: 'ms_teams' },
	{ name: 'Slack', value: 'slack' },
	{ name: 'SMS', value: 'sms' },
	{ name: 'Web Push', value: 'webpush' },
	{ name: 'WhatsApp', value: 'whatsapp' },
];

// One field, two versions: a text box in v1, a searchable dropdown (with "By Slug" fallback) in v2.
const picker = (field: INodeProperties, searchListMethod: string, thing: string): INodeProperties[] => {
	const show = field.displayOptions?.show ?? {};
	return [
		{ ...field, displayOptions: { show: { ...show, '@version': [1] } } },
		{
			...field,
			type: 'resourceLocator',
			default: { mode: 'list', value: '' },
			displayOptions: { show: { ...show, '@version': [2] } },
			modes: [
				{
					displayName: 'From List',
					name: 'list',
					type: 'list',
					placeholder: `Select a ${thing}...`,
					typeOptions: { searchListMethod, searchable: true },
				},
				{ displayName: 'By Slug or ID', name: 'id', type: 'string', placeholder: field.placeholder ?? '' },
			],
		},
	];
};

const distinctId = (resource: string, operation: string[]): INodeProperties => ({
	displayName: 'Distinct ID',
	name: 'distinctId',
	type: 'string',
	required: true,
	default: '',
	description: 'Unique ID of the user in your system',
	displayOptions: { show: { resource: [resource], operation } },
});

const listId = (resource: string, operation: string[]): INodeProperties => ({
	displayName: 'List',
	name: 'listId',
	type: 'string',
	required: true,
	default: '',
	placeholder: 'my_list',
	description: 'The SuprSend list',
	displayOptions: { show: { resource: [resource], operation } },
});

const workflowSlug = (operation: string[]): INodeProperties => ({
	displayName: 'Workflow',
	name: 'workflow',
	type: 'string',
	required: true,
	default: '',
	placeholder: 'welcome-email',
	description: 'The SuprSend workflow (its slug)',
	displayOptions: { show: { resource: ['workflow'], operation } },
	routing: { send: { type: 'body', property: 'workflow', value: rlValue } },
});

const limit = (resource: string, operation: string[], max: number): INodeProperties => ({
	displayName: 'Limit',
	name: 'limit',
	type: 'number',
	typeOptions: { minValue: 1, maxValue: max },
	default: 50,
	description: 'Max number of results to return',
	displayOptions: { show: { resource: [resource], operation } },
	routing: { send: { type: 'query', property: 'limit' } },
});

const dataField: INodeProperties = {
	displayName: 'Data (JSON)',
	name: 'data',
	type: 'json',
	default: '{}',
	description: 'Variables used in the templates',
	routing: { send: { type: 'body', property: 'data', value: parseJson } },
};

const tenantBody: INodeProperties = {
	displayName: 'Tenant ID',
	name: 'tenantId',
	type: 'string',
	default: '',
	routing: { send: { type: 'body', property: 'tenant_id' } },
};

const workflowFields: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['workflow'] } },
		options: [
			{
				name: 'Cancel',
				value: 'cancel',
				action: 'Cancel a workflow for a user',
				description: 'Stop a running workflow for a user, for example reminders that are no longer needed',
				routing: { request: { method: 'POST', url: '/v1/workflow_run/cancel/' } },
			},
			{
				name: 'Trigger',
				value: 'trigger',
				action: 'Trigger a workflow',
				description: 'Trigger a SuprSend workflow for a user',
				routing: { request: { method: 'POST', url: '/trigger/' } },
			},
			{
				name: 'Trigger for List',
				value: 'triggerList',
				action: 'Trigger a workflow for a list',
				description: 'Trigger a SuprSend workflow for every user in a list',
				routing: { request: { method: 'POST', url: '/trigger/list/' } },
			},
		],
		default: 'trigger',
	},
	...picker(workflowSlug(['trigger', 'triggerList', 'cancel']), 'searchWorkflows', 'workflow'),
	{
		...distinctId('workflow', ['trigger']),
		routing: { send: { type: 'body', property: 'recipients[0].distinct_id' } },
	},
	{
		...distinctId('workflow', ['cancel']),
		description: 'User whose running workflow should be stopped',
		routing: { send: { type: 'body', property: 'recipients', value: '={{ [$value] }}' } },
	},
	...picker(
		{ ...listId('workflow', ['triggerList']), routing: { send: { type: 'body', property: 'list_id', value: rlValue } } },
		'searchLists',
		'list',
	),
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['workflow'], operation: ['trigger'] } },
		options: [
			{ ...dataField, description: 'Variables used in the workflow templates' },
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
			tenantBody,
		],
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['workflow'], operation: ['triggerList'] } },
		options: [{ ...dataField, description: 'Variables used in the workflow templates' }, tenantBody],
	},
];

const eventFields: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['event'] } },
		options: [
			{
				name: 'Send',
				value: 'send',
				action: 'Send an event',
				description: 'Tell SuprSend something happened. Every workflow set up for this event runs.',
				routing: { request: { method: 'POST', url: '/event/' }, output: textAsStatus },
			},
		],
		default: 'send',
	},
	...picker(
		{
			displayName: 'Event',
			name: 'event',
			type: 'string',
			required: true,
			default: '',
			placeholder: 'payment_failed',
			description: 'Name of the event, as set up in SuprSend',
			displayOptions: { show: { resource: ['event'], operation: ['send'] } },
			routing: { send: { type: 'body', property: 'event', value: rlValue } },
		},
		'searchEvents',
		'event',
	),
	{
		...distinctId('event', ['send']),
		description: 'User who did the action',
		routing: { send: { type: 'body', property: 'distinct_id' } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['event'], operation: ['send'] } },
		options: [
			{
				displayName: 'Properties (JSON)',
				name: 'properties',
				type: 'json',
				default: '{}',
				description: 'Event details, usable as variables in templates',
				routing: { send: { type: 'body', property: 'properties', value: parseJson } },
			},
			tenantBody,
		],
	},
];

const broadcastFields: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['broadcast'] } },
		options: [
			{
				name: 'Send',
				value: 'send',
				action: 'Send a broadcast to a list',
				description: 'Send one announcement to every user in a list',
				routing: {
					request: { method: 'POST' },
					send: {
						preSend: [
							async function (this: IExecuteSingleFunctions, requestOptions: IHttpRequestOptions) {
								const { workspaceKey } = await this.getCredentials('suprSendApi');
								if (!workspaceKey) {
									throw new NodeOperationError(
										this.getNode(),
										'Broadcasts need your Workspace Key. Add it to your SuprSend credential (Developers > API Keys in the SuprSend dashboard).',
									);
								}
								requestOptions.url = `/${encodeURIComponent(workspaceKey as string)}/broadcast/`;
								return requestOptions;
							},
						],
					},
					output: textAsStatus,
				},
			},
		],
		default: 'send',
	},
	...picker(
		{ ...listId('broadcast', ['send']), routing: { send: { type: 'body', property: 'list_id', value: rlValue } } },
		'searchLists',
		'list',
	),
	...picker(
		{
			displayName: 'Template',
			name: 'template',
			type: 'string',
			required: true,
			default: '',
			placeholder: 'product-launch',
			description: 'The SuprSend template (its slug)',
			displayOptions: { show: { resource: ['broadcast'], operation: ['send'] } },
			routing: { send: { type: 'body', property: 'template', value: rlValue } },
		},
		'searchTemplates',
		'template',
	),
	...picker(
		{
			displayName: 'Notification Category',
			name: 'notificationCategory',
			type: 'string',
			required: true,
			default: '',
			placeholder: 'product-updates',
			description: 'The notification category (its slug)',
			displayOptions: { show: { resource: ['broadcast'], operation: ['send'] } },
			routing: { send: { type: 'body', property: 'notification_category', value: rlValue } },
		},
		'searchCategories',
		'category',
	),
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['broadcast'], operation: ['send'] } },
		options: [
			{
				displayName: 'Channels',
				name: 'channels',
				type: 'multiOptions',
				options: channelOptions,
				default: [],
				description: 'Send only on these channels. Leave empty to use every channel the user has.',
				routing: { send: { type: 'body', property: 'channels' } },
			},
			dataField,
			{
				displayName: 'Send At',
				name: 'triggerAt',
				type: 'dateTime',
				default: '',
				description: 'Schedule the broadcast for later. Leave empty to send now.',
				routing: { send: { type: 'body', property: 'trigger_at', value: toIsoDate } },
			},
			tenantBody,
		],
	},
];

const userUrl = `/v1/user/{{encodeURIComponent($parameter.distinctId)}}`;

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
				routing: { request: { method: 'POST', url: `=${userUrl}/` } },
			},
			{
				name: 'Get Preferences',
				value: 'getPreferences',
				action: 'Get a user preferences',
				description: 'See which categories and channels a user has opted into',
				routing: {
					request: { method: 'GET', url: `=${userUrl}/preference/` },
					output: {
						postReceive: [
							// The full-preference call leaves channel_preferences empty, so fill it from the channel call.
							async function (this: IExecuteSingleFunctions, items: INodeExecutionData[]) {
								const id = encodeURIComponent(this.getNodeParameter('distinctId') as string);
								const tenantId = this.getNodeParameter('additionalFields.tenantId', '') as string;
								const channels = (await this.helpers.httpRequestWithAuthentication.call(this, 'suprSendApi', {
									method: 'GET',
									baseURL: BASE_URL,
									url: `/v1/user/${id}/preference/channel_preference/`,
									qs: tenantId ? { tenant_id: tenantId } : {},
									json: true,
								})) as IDataObject;
								return items.map((item) => ({
									json: { ...item.json, channel_preferences: channels.channel_preferences },
								}));
							},
						],
					},
				},
			},
			{
				name: 'Update Category Preference',
				value: 'updatePreference',
				action: 'Update a user category preference',
				description: 'Opt a user in or out of a notification category',
				routing: {
					request: { method: 'PATCH', url: `=${userUrl}/preference/category/{{${param('category')}}}/` },
				},
			},
			{
				name: 'Update Channel Preference',
				value: 'updateChannelPreference',
				action: 'Update a user channel preference',
				description: 'Turn a channel (for example SMS) on or off for a user',
				routing: { request: { method: 'PATCH', url: `=${userUrl}/preference/channel_preference/` } },
			},
		],
		default: 'upsert',
	},
	distinctId('user', ['upsert', 'updatePreference', 'updateChannelPreference', 'getPreferences']),
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
	...picker(
		{
			displayName: 'Category',
			name: 'category',
			type: 'string',
			required: true,
			default: '',
			placeholder: 'product-updates',
			description: 'The notification category (its slug)',
			displayOptions: { show: { resource: ['user'], operation: ['updatePreference'] } },
		},
		'searchCategories',
		'category',
	),
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
		displayName: 'Channel',
		name: 'channel',
		type: 'options',
		required: true,
		default: 'sms',
		options: channelOptions,
		displayOptions: { show: { resource: ['user'], operation: ['updateChannelPreference'] } },
		routing: {
			send: {
				type: 'body',
				property: 'channel_preferences',
				value: '={{ [{ channel: $value, is_restricted: $parameter.channelPreference === "off" }] }}',
			},
		},
	},
	{
		displayName: 'Channel Preference',
		name: 'channelPreference',
		type: 'options',
		required: true,
		default: 'off',
		options: [
			{ name: 'On', value: 'on', description: 'User gets all notifications on this channel' },
			{
				name: 'Off',
				value: 'off',
				description: 'User only gets must-send notifications (categories they cannot opt out of) on this channel',
			},
		],
		displayOptions: { show: { resource: ['user'], operation: ['updateChannelPreference'] } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: { resource: ['user'], operation: ['updatePreference', 'updateChannelPreference', 'getPreferences'] },
		},
		options: [
			{
				displayName: 'Tenant ID',
				name: 'tenantId',
				type: 'string',
				default: '',
				description: 'Use the preferences for this tenant only',
				routing: { send: { type: 'query', property: 'tenant_id' } },
			},
		],
	},
];

const listUrl = `/v1/subscriber_list/{{${param('listId')}}}`;

async function parseDistinctIds(this: IExecuteSingleFunctions): Promise<string[]> {
	const raw = this.getNodeParameter('distinctIds') as string | string[];
	const ids = (Array.isArray(raw) ? raw : String(raw).split(',')).map((s) => String(s).trim()).filter((s) => s);
	return [...new Set(ids)];
}

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
				routing: { request: { method: 'POST', url: `=${listUrl}/subscriber/add/` } },
			},
			{
				name: 'Create',
				value: 'create',
				action: 'Create a list',
				description: 'Create a new SuprSend list',
				routing: { request: { method: 'POST', url: '/v1/subscriber_list/' } },
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many lists',
				description: 'Get the lists in your workspace',
				routing: { request: { method: 'GET', url: '/v1/subscriber_list/' }, output: resultsAsItems },
			},
			{
				name: 'Get Users',
				value: 'getUsers',
				action: 'Get users in a list',
				description: 'Get the users in a SuprSend list',
				routing: { request: { method: 'GET', url: `=${listUrl}/subscriber/` }, output: resultsAsItems },
			},
			{
				name: 'Remove User',
				value: 'removeUser',
				action: 'Remove a user from a list',
				description: 'Remove a user from a SuprSend list',
				routing: { request: { method: 'POST', url: `=${listUrl}/subscriber/remove/` } },
			},
			{
				name: 'Sync',
				value: 'sync',
				action: 'Replace all users in a list',
				description:
					'Make a list contain exactly these users: adds new ones and removes everyone else (for example to mirror a CRM segment)',
				routing: {
					request: { method: 'POST', url: `=${listUrl}/start_sync/` },
					send: {
						preSend: [
							async function (this: IExecuteSingleFunctions, requestOptions: IHttpRequestOptions) {
								// Guard: an empty sync would wipe the whole list.
								if ((await parseDistinctIds.call(this)).length === 0) {
									throw new NodeOperationError(this.getNode(), 'Add at least one Distinct ID to sync');
								}
								return requestOptions;
							},
						],
					},
					output: {
						postReceive: [
							// Start sync made a draft list; fill it, then make it live.
							// ponytail: if a step fails, the draft is left behind (the live list is untouched); delete it in SuprSend if needed
							async function (
								this: IExecuteSingleFunctions,
								_items: INodeExecutionData[],
								response: IN8nHttpFullResponse,
							): Promise<INodeExecutionData[]> {
								const versionId = (response.body as IDataObject).version_id as string;
								const list = this.getNodeParameter('listId', '', { extractValue: true }) as string;
								const base = `/v1/subscriber_list/${encodeURIComponent(list)}/version/${encodeURIComponent(versionId)}`;
								const ids = await parseDistinctIds.call(this);
								const request = (method: 'POST' | 'PATCH', url: string, body: IDataObject = {}) =>
									this.helpers.httpRequestWithAuthentication.call(this, 'suprSendApi', {
										method,
										baseURL: BASE_URL,
										url,
										body,
										json: true,
									});
								for (let i = 0; i < ids.length; i += 500) {
									await request('POST', `${base}/subscriber/add/`, { distinct_ids: ids.slice(i, i + 500) });
								}
								const result = (await request('PATCH', `${base}/finish_sync/`)) as IDataObject;
								return [{ json: { ...result, users_synced: ids.length } }];
							},
						],
					},
				},
			},
		],
		default: 'addUser',
	},
	...picker(listId('list', ['addUser', 'removeUser', 'getUsers', 'sync']), 'searchLists', 'list'),
	{
		...listId('list', ['create']),
		displayName: 'List ID',
		description: 'ID for the new list. Use lowercase letters, numbers, - and _.',
		routing: { send: { type: 'body', property: 'list_id' } },
	},
	{
		...distinctId('list', ['addUser', 'removeUser']),
		routing: { send: { type: 'body', property: 'distinct_ids', value: '={{ [$value] }}' } },
	},
	{
		displayName: 'Distinct IDs',
		name: 'distinctIds',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'user_1, user_2, user_3',
		description:
			'Everyone who should be in the list, comma-separated or as an array. Users not in here are removed. Users must already exist in SuprSend (create them first with User > Create or Update); unknown IDs are skipped. Tip: use an Aggregate node first to collect all users into one item.',
		displayOptions: { show: { resource: ['list'], operation: ['sync'] } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['list'], operation: ['create'] } },
		options: [
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				default: '',
				routing: { send: { type: 'body', property: 'list_description' } },
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				routing: { send: { type: 'body', property: 'list_name' } },
			},
		],
	},
	limit('list', ['getAll', 'getUsers'], 1000),
];

const messageFields: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['message'] } },
		options: [
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many messages',
				description: 'Get the log of sent messages, newest first',
				routing: { request: { method: 'GET', url: '/v1/message/' }, output: resultsAsItems },
			},
		],
		default: 'getAll',
	},
	limit('message', ['getAll'], 1000),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['message'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'Channel',
				name: 'channel',
				type: 'options',
				options: channelOptions,
				default: 'email',
				routing: { send: { type: 'query', property: 'channel' } },
			},
			{
				displayName: 'Sent After',
				name: 'createdAfter',
				type: 'dateTime',
				default: '',
				routing: { send: { type: 'query', property: 'created_at_gte', value: toIsoDate } },
			},
			{
				displayName: 'Sent Before',
				name: 'createdBefore',
				type: 'dateTime',
				default: '',
				routing: { send: { type: 'query', property: 'created_at_lte', value: toIsoDate } },
			},
			{
				displayName: 'Tenant ID',
				name: 'tenantId',
				type: 'string',
				default: '',
				routing: { send: { type: 'query', property: 'tenant_id' } },
			},
			{
				displayName: 'Workflow Slug',
				name: 'workflowSlug',
				type: 'string',
				default: '',
				routing: { send: { type: 'query', property: 'workflow_slug' } },
			},
		],
	},
];

// ---- Dropdown data ----

type Option = { name: string; value: string };

const matches = (options: Option[], filter?: string): INodeListSearchResult => {
	const f = (filter ?? '').toLowerCase();
	return { results: options.filter((o) => !f || `${o.name} ${o.value}`.toLowerCase().includes(f)) };
};

// Pages through a SuprSend list endpoint (limit/offset + meta.count).
// ponytail: loads everything (capped at 1000 items) and filters locally; fine for lists, templates, workflows and events in one workspace
async function fetchAll(
	this: ILoadOptionsFunctions,
	baseURL: string,
	url: string,
	pageSize: number,
	qs: IDataObject = {},
): Promise<IDataObject[]> {
	const all: IDataObject[] = [];
	for (let offset = 0; offset < 1000; offset += pageSize) {
		const page = (await this.helpers.httpRequestWithAuthentication.call(this, 'suprSendApi', {
			method: 'GET',
			baseURL,
			url,
			qs: { ...qs, limit: pageSize, offset },
			json: true,
		})) as IDataObject;
		const results = (page.results as IDataObject[]) ?? [];
		all.push(...results);
		const count = ((page.meta as IDataObject)?.count as number) ?? 0;
		if (results.length < pageSize || all.length >= count) break;
	}
	return all;
}

// Workflows, events and categories only come from SuprSend's management API, which needs a Service Token.
// The token covers the whole account, so find the workspace whose keys include this credential's Workspace Key.
async function managementPath(this: ILoadOptionsFunctions, path: string): Promise<string> {
	const { serviceToken, workspaceKey } = await this.getCredentials('suprSendApi');
	if (!serviceToken || !workspaceKey) {
		throw new NodeOperationError(
			this.getNode(),
			'To pick from a list, add a Service Token and your Workspace Key to your SuprSend credential. Or switch to "By ID" and type it.',
		);
	}
	const workspaces = await fetchAll.call(this, MANAGEMENT_URL, '/v1/workspace/', 10);
	for (const workspace of workspaces) {
		const slug = encodeURIComponent(workspace.slug as string);
		const keys = await fetchAll.call(this, MANAGEMENT_URL, `/v1/${slug}/ws_key/`, 50);
		if (keys.some((k) => k.key === workspaceKey)) return `/v1/${slug}${path}`;
	}
	throw new NodeOperationError(
		this.getNode(),
		'No workspace in this SuprSend account has that Workspace Key. Check the Workspace Key in your SuprSend credential.',
	);
}

export class SuprSend implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SuprSend',
		name: 'suprSend',
		icon: { light: 'file:suprsend.svg', dark: 'file:suprsend.dark.svg' },
		group: ['output'],
		version: [1, 2],
		defaultVersion: 2,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Send notifications, broadcasts and events, and manage users, preferences and lists in SuprSend',
		defaults: { name: 'SuprSend' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'suprSendApi', required: true }],
		requestDefaults: {
			baseURL: BASE_URL,
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
					{ name: 'Broadcast', value: 'broadcast' },
					{ name: 'Event', value: 'event' },
					{ name: 'List', value: 'list' },
					{ name: 'Message', value: 'message' },
					{ name: 'User', value: 'user' },
					{ name: 'Workflow', value: 'workflow' },
				],
				default: 'workflow',
			},
			...workflowFields,
			...eventFields,
			...broadcastFields,
			...userFields,
			...listFields,
			...messageFields,
		],
	};

	methods = {
		listSearch: {
			async searchLists(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
				const lists = await fetchAll.call(this, BASE_URL, '/v1/subscriber_list/', 100);
				return matches(
					lists.map((l) => ({ name: (l.list_name as string) || (l.list_id as string), value: l.list_id as string })),
					filter,
				);
			},
			async searchTemplates(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
				const templates = await fetchAll.call(this, BASE_URL, '/v1/template/', 100);
				return matches(
					templates.map((t) => ({ name: (t.name as string) || (t.slug as string), value: t.slug as string })),
					filter,
				);
			},
			async searchWorkflows(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
				const url = await managementPath.call(this, '/workflow/');
				const workflows = await fetchAll.call(this, MANAGEMENT_URL, url, 50, { mode: 'live' });
				return matches(
					workflows.map((w) => ({ name: (w.name as string) || (w.slug as string), value: w.slug as string })),
					filter,
				);
			},
			async searchEvents(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
				const url = await managementPath.call(this, '/event/');
				const events = await fetchAll.call(this, MANAGEMENT_URL, url, 100);
				return matches(
					events.map((e) => ({ name: e.name as string, value: e.name as string })),
					filter,
				);
			},
			async searchCategories(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
				const url = await managementPath.call(this, '/preference_category/');
				const body = (await this.helpers.httpRequestWithAuthentication.call(this, 'suprSendApi', {
					method: 'GET',
					baseURL: MANAGEMENT_URL,
					url,
					qs: { mode: 'live' },
					json: true,
				})) as { root_categories?: Array<{ sections?: Array<{ categories?: IDataObject[] }> }> };
				const options: Option[] = [];
				for (const root of body.root_categories ?? []) {
					for (const section of root.sections ?? []) {
						for (const c of section.categories ?? []) {
							options.push({ name: (c.name as string) || (c.category as string), value: c.category as string });
						}
					}
				}
				return matches(options, filter);
			},
		},
	};
}
