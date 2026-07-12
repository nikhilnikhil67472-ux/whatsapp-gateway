"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppGatewayApi = void 0;
class WhatsAppGatewayApi {
    constructor() {
        this.name = 'whatsAppGatewayApi';
        this.displayName = 'WhatsApp Gateway API';
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
        ];
    }
}
exports.WhatsAppGatewayApi = WhatsAppGatewayApi;
