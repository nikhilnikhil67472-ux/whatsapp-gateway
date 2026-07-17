"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppGatewayApi = void 0;
class WhatsAppGatewayApi {
    constructor() {
        this.name = 'whatsAppGatewayApi';
        this.displayName = 'WhatsApp Gateway Instance API';
        this.documentationUrl = 'https://github.com/nikhilnikhil67472-ux/whatsapp-gateway';
        this.properties = [
            {
                displayName: 'Gateway Base URL',
                name: 'baseUrl',
                type: 'string',
                default: 'http://54.226.66.175',
                placeholder: 'https://gateway.example.com',
                description: 'Base URL of your WhatsApp AI Gateway, without a trailing slash',
                required: true,
            },
            {
                displayName: 'Instance API Key',
                name: 'apiKey',
                type: 'string',
                typeOptions: { password: true },
                default: '',
                placeholder: 'wag_...',
                description: 'Instance API key shown once when the instance is created or rotated. The global administrator key is also supported.',
                required: true,
            },
        ];
    }
}
exports.WhatsAppGatewayApi = WhatsAppGatewayApi;
