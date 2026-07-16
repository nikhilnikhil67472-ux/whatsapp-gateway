import {
  IExecuteFunctions,
  IHttpRequestOptions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeApiError,
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
          {
            name: 'Location',
            value: 'location',
          },
          {
            name: 'Contact',
            value: 'contact',
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
        displayName: 'Media Source',
        name: 'mediaSource',
        type: 'options',
        options: [
          { name: 'URL', value: 'url' },
          { name: 'Base64', value: 'base64' },
        ],
        default: 'url',
        displayOptions: {
          show: {
            type: ['media', 'audio'],
          },
        },
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
            mediaSource: ['url'],
          },
        },
      },
      {
        displayName: 'Base64 Data',
        name: 'base64',
        type: 'string',
        typeOptions: { rows: 3 },
        default: '',
        displayOptions: {
          show: {
            type: ['media', 'audio'],
            mediaSource: ['base64'],
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
        displayName: 'Latitude',
        name: 'latitude',
        type: 'number',
        default: 0,
        displayOptions: { show: { type: ['location'] } },
      },
      {
        displayName: 'Longitude',
        name: 'longitude',
        type: 'number',
        default: 0,
        displayOptions: { show: { type: ['location'] } },
      },
      {
        displayName: 'Location Name',
        name: 'locationName',
        type: 'string',
        default: '',
        displayOptions: { show: { type: ['location'] } },
      },
      {
        displayName: 'Address',
        name: 'address',
        type: 'string',
        default: '',
        displayOptions: { show: { type: ['location'] } },
      },
      {
        displayName: 'Contact Name',
        name: 'contactName',
        type: 'string',
        default: '',
        displayOptions: { show: { type: ['contact'] } },
        required: true,
      },
      {
        displayName: 'vCard',
        name: 'vcard',
        type: 'string',
        typeOptions: { rows: 6 },
        default: '',
        displayOptions: { show: { type: ['contact'] } },
        required: true,
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
    const credentials = await this.getCredentials('whatsAppGatewayApi') as { baseUrl: string; apiKey: string };
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const instanceId = this.getNodeParameter('instanceId', i) as string;
      const recipientType = this.getNodeParameter('recipientType', i) as string;
      const type = this.getNodeParameter('type', i) as string;
      const text = this.getNodeParameter('text', i, '') as string;
      const mediaUrl = this.getNodeParameter('mediaUrl', i, '') as string;
      const mediaSource = this.getNodeParameter('mediaSource', i, 'url') as string;
      const base64 = this.getNodeParameter('base64', i, '') as string;
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
        if (mediaSource === 'base64') body.base64 = base64;
        else body.mediaUrl = mediaUrl;
      }
      if (type === 'media') {
        body.mediaType = mediaType;
        body.mimeType = mimeType;
      }
      if (type === 'location') {
        body.latitude = this.getNodeParameter('latitude', i) as number;
        body.longitude = this.getNodeParameter('longitude', i) as number;
        body.locationName = this.getNodeParameter('locationName', i, '') as string;
        body.address = this.getNodeParameter('address', i, '') as string;
      }
      if (type === 'contact') {
        body.contactName = this.getNodeParameter('contactName', i) as string;
        body.vcard = this.getNodeParameter('vcard', i) as string;
      }

      const options: IHttpRequestOptions = {
        method: 'POST',
        url: `${credentials.baseUrl.replace(/\/$/, '')}/api/whatsapp/send`,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${credentials.apiKey}`,
        },
        body,
        json: true,
      };

      let responseData;
      try {
        responseData = await this.helpers.httpRequest(options);
      } catch (error: any) {
        const responseBody = error?.response?.data || error?.cause?.response?.data;
        const statusCode = error?.response?.status || error?.cause?.response?.status;
        throw new NodeApiError(this.getNode(), error, {
          message: responseBody?.error || error.message || 'WhatsApp Gateway request failed',
          description: responseBody
            ? JSON.stringify(responseBody)
            : `Gateway returned HTTP ${statusCode || 'error'}`,
        });
      }

      returnData.push({
        json: responseData,
        pairedItem: { item: i },
      });
    }

    return [returnData];
  }
}
