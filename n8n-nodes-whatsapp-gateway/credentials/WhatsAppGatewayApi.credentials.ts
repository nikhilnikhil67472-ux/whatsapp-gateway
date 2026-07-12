import {
  ICredentialType,
  INodeProperties,
} from 'n8n-workflow';

export class WhatsAppGatewayApi implements ICredentialType {
  name = 'whatsAppGatewayApi';
  displayName = 'WhatsApp Gateway API';
  documentationUrl = 'https://github.com/nikhilnikhil67472-ux/whatsapp-gateway';

  properties: INodeProperties[] = [
    {
      displayName: 'Gateway Base URL',
      name: 'baseUrl',
      type: 'string',
      default: 'http://54.226.66.175',
      placeholder: 'https://gateway.example.com',
      description: 'Base URL of your WhatsApp AI Gateway, without a trailing slash',
      required: true,
    },
  ];
}
