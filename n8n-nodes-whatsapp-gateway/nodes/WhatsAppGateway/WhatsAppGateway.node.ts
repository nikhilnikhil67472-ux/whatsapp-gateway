import {
  IExecuteFunctions,
  IHttpRequestOptions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';

export class WhatsAppGateway implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'WhatsApp Gateway',
    name: 'whatsAppGateway',
    icon: 'file:whatsappGateway.svg',
    group: ['output'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: 'Send WhatsApp messages through your self-hosted WhatsApp AI Gateway',
    defaults: {
      name: 'WhatsApp Gateway',
    },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      {
        name: 'whatsAppGatewayApi',
        required: true,
      },
    ],
    properties: [
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        options: [
          {
            name: 'Send Message',
            value: 'sendMessage',
            description: 'Queue a WhatsApp message for sending',
            action: 'Send a WhatsApp message',
          },
        ],
        default: 'sendMessage',
        noDataExpression: true,
      },
      {
        displayName: 'Instance ID',
        name: 'instanceId',
        type: 'string',
        default: '',
        required: true,
        description: 'Gateway instance ID from the dashboard URL',
      },
      {
        displayName: 'Recipient Type',
        name: 'recipientType',
        type: 'options',
        options: [
          {
            name: 'Phone Number',
            value: 'phoneNumber',
          },
          {
            name: 'WhatsApp JID',
            value: 'remoteJid',
          },
        ],
        default: 'phoneNumber',
      },
      {
        displayName: 'Phone Number',
        name: 'phoneNumber',
        type: 'string',
        default: '',
        placeholder: '919876543210',
        description: 'Country code ke saath number, plus sign optional',
        displayOptions: {
          show: {
            recipientType: ['phoneNumber'],
          },
        },
        required: true,
      },
      {
        displayName: 'WhatsApp JID',
        name: 'remoteJid',
        type: 'string',
        default: '',
        placeholder: '919876543210@s.whatsapp.net',
        displayOptions: {
          show: {
            recipientType: ['remoteJid'],
          },
        },
        required: true,
      },
      {
        displayName: 'Message Type',
        name: 'type',
        type: 'options',
        options: [
          {
            name: 'Text',
            value: 'text',
          },
          {
            name: 'Media',
            value: 'media',
          },
          {
            name: 'Audio',
            value: 'audio',
          },
        ],
        default: 'text',
      },
      {
        displayName: 'Message Text',
        name: 'text',
        type: 'string',
        typeOptions: {
          rows: 4,
        },
        default: '',
        description: 'Text message or media caption',
      },
      {
        displayName: 'Media URL',
        name: 'mediaUrl',
        type: 'string',
        default: '',
        placeholder: 'https://example.com/file.jpg',
        displayOptions: {
          show: {
            type: ['media', 'audio'],
          },
        },
      },
      {
        displayName: 'Media Type',
        name: 'mediaType',
        type: 'options',
        options: [
          {
            name: 'Image',
            value: 'image',
          },
          {
            name: 'Video',
            value: 'video',
          },
          {
            name: 'Document',
            value: 'document',
          },
        ],
        default: 'image',
        displayOptions: {
          show: {
            type: ['media'],
          },
        },
      },
      {
        displayName: 'MIME Type',
        name: 'mimeType',
        type: 'string',
        default: 'image/jpeg',
        placeholder: 'image/jpeg',
        displayOptions: {
          show: {
            type: ['media'],
          },
        },
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const credentials = await this.getCredentials('whatsAppGatewayApi') as { baseUrl: string };
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const instanceId = this.getNodeParameter('instanceId', i) as string;
      const recipientType = this.getNodeParameter('recipientType', i) as string;
      const type = this.getNodeParameter('type', i) as string;
      const text = this.getNodeParameter('text', i, '') as string;
      const mediaUrl = this.getNodeParameter('mediaUrl', i, '') as string;
      const mediaType = this.getNodeParameter('mediaType', i, '') as string;
      const mimeType = this.getNodeParameter('mimeType', i, '') as string;

      const body: Record<string, unknown> = {
        instanceId,
        type,
        text,
      };

      if (recipientType === 'phoneNumber') {
        body.phoneNumber = this.getNodeParameter('phoneNumber', i) as string;
      } else {
        body.remoteJid = this.getNodeParameter('remoteJid', i) as string;
      }

      if (type === 'media' || type === 'audio') {
        body.mediaUrl = mediaUrl;
      }
      if (type === 'media') {
        body.mediaType = mediaType;
        body.mimeType = mimeType;
      }

      const options: IHttpRequestOptions = {
        method: 'POST',
        url: `${credentials.baseUrl.replace(/\/$/, '')}/api/whatsapp/send`,
        headers: {
          Accept: 'application/json',
        },
        body,
        json: true,
      };

      const responseData = await this.helpers.httpRequest(options);
      returnData.push({
        json: responseData,
        pairedItem: { item: i },
      });
    }

    return [returnData];
  }
}
