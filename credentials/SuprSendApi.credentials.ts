import type {
	ICredentialDataDecryptedObject,
	IHttpRequestOptions,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class SuprSendApi implements ICredentialType {
	name = 'suprSendApi';

	displayName = 'SuprSend API';

	icon: Icon = {
		light: 'file:../nodes/SuprSend/suprsend.svg',
		dark: 'file:../nodes/SuprSend/suprsend.dark.svg',
	};

	documentationUrl = 'https://github.com/ADHESHsuryatej/n8n-nodes-suprsend?tab=readme-ov-file#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'In the SuprSend dashboard, go to Developers > API Keys and copy a key for the workspace you want to use',
		},
		{
			displayName: 'Workspace Key',
			name: 'workspaceKey',
			type: 'string',
			default: '',
			description:
				'Needed for broadcasts and for the workflow, event and category dropdowns. In the SuprSend dashboard, go to Developers > API Keys and copy the Workspace Key.',
		},
		{
			displayName: 'Service Token',
			name: 'serviceToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'Optional. Together with the Workspace Key, lets you pick workflows, events and categories from a dropdown. In the SuprSend dashboard, go to Account Settings > Service Tokens and create one.',
		},
	];

	// SuprSend's management API (used only for dropdowns) takes the Service Token; everything else takes the API key.
	async authenticate(
		credentials: ICredentialDataDecryptedObject,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		// Some callers (like n8n's HTTP Request node) pass the address as `uri` instead of baseURL + url.
		const { uri } = requestOptions as IHttpRequestOptions & { uri?: string };
		const isManagement = `${requestOptions.baseURL ?? ''}${requestOptions.url ?? ''}${uri ?? ''}`.includes(
			'management-api.suprsend.com',
		);
		requestOptions.headers = {
			...requestOptions.headers,
			Authorization: isManagement ? `ServiceToken ${credentials.serviceToken}` : `Bearer ${credentials.apiKey}`,
		};
		return requestOptions;
	}

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://hub.suprsend.com',
			url: '/v1/subscriber_list/',
			qs: { limit: 1 },
		},
	};
}
