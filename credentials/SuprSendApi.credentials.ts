import type {
	IAuthenticateGeneric,
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
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://hub.suprsend.com',
			url: '/v1/subscriber_list/',
			qs: { limit: 1 },
		},
	};
}
