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
    description: 'Send messages and inspect instances through your self-hosted WhatsApp AI Gateway',
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
          {
            name: 'Get Instance Status',
            value: 'getInstanceStatus',
            description: 'Check whether an instance is connected',
            action: 'Get instance status',
          },
        ],
        default: 'sendMessage',
        noDataExpression: true,
      },
      {
        displayName: 'Instance ID or Name',
        name: 'instanceId',
        type: 'string',
        default: '',
        required: true,
        description: 'Instance UUID from the dashboard URL, or its exact instance name',
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
        displayOptions: { show: { operation: ['sendMessage'] } },
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
            operation: ['sendMessage'],
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
            operation: ['sendMessage'],
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
        displayOptions: { show: { operation: ['sendMessage'] } },
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
        displayOptions: { show: { operation: ['sendMessage'] } },
      },
      {
        displayName: 'Media Source',
        name: 'mediaSource',
        type: 'options',
        options: [
          { name: 'URL', value: 'url' },
          { name: 'Base64', value: 'base64' },
          { name: 'n8n Binary Property', value: 'binary' },
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
        displayName: 'Input Binary Field',
        name: 'binaryPropertyName',
        type: 'string',
        default: 'data',
        description: 'Name of the incoming n8n binary property',
        displayOptions: {
          show: {
            type: ['media', 'audio'],
            mediaSource: ['binary'],
          },
        },
        required: true,
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
        default: '',
        placeholder: 'image/jpeg',
        description: 'Leave empty to infer it from binary metadata or the selected message type',
        displayOptions: {
          show: {
            type: ['media', 'audio'],
          },
        },
      },
      {
        displayName: 'File Name',
        name: 'fileName',
        type: 'string',
        default: '',
        placeholder: 'invoice.pdf',
        description: 'Optional file name; binary metadata is used when available',
        displayOptions: { show: { type: ['media'] } },
      },
      {
        displayName: 'Quoted Message ID',
        name: 'quotedMessageId',
        type: 'string',
        default: '',
        description: 'Optional WhatsApp message ID to reply to',
        displayOptions: { show: { operation: ['sendMessage'] } },
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const credentials = await this.getCredentials('whatsAppGatewayApi') as { baseUrl: string; apiKey: string };
    const baseUrl = credentials.baseUrl.replace(/\/+$/, '');
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const operation = this.getNodeParameter('operation', i) as string;
        const instanceId = this.getNodeParameter('instanceId', i) as string;
        const headers = {
          Accept: 'application/json',
          Authorization: `Bearer ${credentials.apiKey}`,
        };
        let options: IHttpRequestOptions;

        if (operation === 'getInstanceStatus') {
          options = {
            method: 'GET',
            url: `${baseUrl}/api/whatsapp/status`,
            headers,
            qs: { instanceId },
            json: true,
          };
        } else {
          const recipientType = this.getNodeParameter('recipientType', i) as string;
          const type = this.getNodeParameter('type', i) as string;
          const body: Record<string, unknown> = { instanceId, type };

          if (recipientType === 'phoneNumber') {
            body.phoneNumber = this.getNodeParameter('phoneNumber', i) as string;
          } else {
            body.remoteJid = this.getNodeParameter('remoteJid', i) as string;
          }

          if (type === 'text' || type === 'media') {
            const text = this.getNodeParameter('text', i, '') as string;
            if (text) body.text = text;
          }

          if (type === 'media' || type === 'audio') {
            const mediaSource = this.getNodeParameter('mediaSource', i, 'url') as string;
            let binaryMimeType = '';
            let binaryFileName = '';

            if (mediaSource === 'url') {
              body.mediaUrl = this.getNodeParameter('mediaUrl', i) as string;
            } else if (mediaSource === 'base64') {
              body.base64 = this.getNodeParameter('base64', i) as string;
            } else {
              const propertyName = this.getNodeParameter('binaryPropertyName', i, 'data') as string;
              const binary = items[i].binary?.[propertyName];
              if (!binary) {
                throw new Error(`Input item does not contain binary property "${propertyName}"`);
              }
              const buffer = await this.helpers.getBinaryDataBuffer(i, propertyName);
              body.base64 = buffer.toString('base64');
              binaryMimeType = binary.mimeType || '';
              binaryFileName = binary.fileName || '';
            }

            const configuredMimeType = this.getNodeParameter('mimeType', i, '') as string;
            const mediaType = type === 'media'
              ? this.getNodeParameter('mediaType', i) as string
              : '';
            const defaultMimeType = type === 'audio'
              ? 'audio/ogg; codecs=opus'
              : mediaType === 'video'
                ? 'video/mp4'
                : mediaType === 'document'
                  ? 'application/octet-stream'
                  : 'image/jpeg';
            body.mimeType = configuredMimeType || binaryMimeType || defaultMimeType;

            if (type === 'media') {
              body.mediaType = mediaType;
              const configuredFileName = this.getNodeParameter('fileName', i, '') as string;
              if (configuredFileName || binaryFileName) {
                body.fileName = configuredFileName || binaryFileName;
              }
            }
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

          const quotedMessageId = this.getNodeParameter('quotedMessageId', i, '') as string;
          if (quotedMessageId) body.quotedMessageId = quotedMessageId;

          options = {
            method: 'POST',
            url: `${baseUrl}/api/whatsapp/send`,
            headers,
            body,
            json: true,
          };
        }

        const responseData = await this.helpers.httpRequest(options);
        returnData.push({
          json: responseData,
          pairedItem: { item: i },
        });
      } catch (error: any) {
        const responseBody = error?.response?.data || error?.cause?.response?.data;
        const statusCode = error?.response?.status || error?.cause?.response?.status;
        const message = responseBody?.error || error.message || 'WhatsApp Gateway request failed';

        if (this.continueOnFail()) {
          returnData.push({
            json: {
              success: false,
              error: message,
              statusCode: statusCode || null,
              details: responseBody || null,
            },
            pairedItem: { item: i },
          });
          continue;
        }

        throw new NodeApiError(this.getNode(), error, {
          message,
          description: responseBody
            ? JSON.stringify(responseBody)
            : `Gateway returned HTTP ${statusCode || 'error'}`,
        });
      }
    }

    return [returnData];
  }
}
