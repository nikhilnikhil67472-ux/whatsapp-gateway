"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppGateway = void 0;
const n8n_workflow_1 = require("n8n-workflow");
class WhatsAppGateway {
    constructor() {
        this.description = {
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
    }
    async execute() {
        var _a, _b, _c, _d, _e, _f;
        const items = this.getInputData();
        const credentials = await this.getCredentials('whatsAppGatewayApi');
        const returnData = [];
        for (let i = 0; i < items.length; i++) {
            const instanceId = this.getNodeParameter('instanceId', i);
            const recipientType = this.getNodeParameter('recipientType', i);
            const type = this.getNodeParameter('type', i);
            const text = this.getNodeParameter('text', i, '');
            const mediaUrl = this.getNodeParameter('mediaUrl', i, '');
            const mediaType = this.getNodeParameter('mediaType', i, '');
            const mimeType = this.getNodeParameter('mimeType', i, '');
            const body = {
                instanceId,
                type,
                text,
            };
            if (recipientType === 'phoneNumber') {
                body.phoneNumber = this.getNodeParameter('phoneNumber', i);
            }
            else {
                body.remoteJid = this.getNodeParameter('remoteJid', i);
            }
            if (type === 'media' || type === 'audio') {
                body.mediaUrl = mediaUrl;
            }
            if (type === 'media') {
                body.mediaType = mediaType;
                body.mimeType = mimeType;
            }
            const options = {
                method: 'POST',
                url: `${credentials.baseUrl.replace(/\/$/, '')}/api/whatsapp/send`,
                headers: {
                    Accept: 'application/json',
                },
                body,
                json: true,
            };
            let responseData;
            try {
                responseData = await this.helpers.httpRequest(options);
            }
            catch (error) {
                const responseBody = ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.data) || ((_c = (_b = error === null || error === void 0 ? void 0 : error.cause) === null || _b === void 0 ? void 0 : _b.response) === null || _c === void 0 ? void 0 : _c.data);
                const statusCode = ((_d = error === null || error === void 0 ? void 0 : error.response) === null || _d === void 0 ? void 0 : _d.status) || ((_f = (_e = error === null || error === void 0 ? void 0 : error.cause) === null || _e === void 0 ? void 0 : _e.response) === null || _f === void 0 ? void 0 : _f.status);
                throw new n8n_workflow_1.NodeApiError(this.getNode(), error, {
                    message: (responseBody === null || responseBody === void 0 ? void 0 : responseBody.error) || error.message || 'WhatsApp Gateway request failed',
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
exports.WhatsAppGateway = WhatsAppGateway;
