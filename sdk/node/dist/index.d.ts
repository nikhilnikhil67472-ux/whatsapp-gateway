export type GatewayClientOptions = {
    baseUrl: string;
    apiKey: string;
    timeoutMs?: number;
};
export type SendTarget = {
    instanceId: string;
    phoneNumber?: string;
    remoteJid?: string;
};
export type SendTextInput = SendTarget & {
    text: string;
    quotedMessageId?: string;
};
export type SendMediaInput = SendTarget & {
    mediaUrl?: string;
    base64?: string;
    mediaType: 'image' | 'video' | 'document';
    mimeType: string;
    fileName?: string;
    caption?: string;
    quotedMessageId?: string;
};
export type SendAudioInput = SendTarget & {
    audioUrl?: string;
    base64?: string;
    mimeType?: string;
    quotedMessageId?: string;
};
export type SendLocationInput = SendTarget & {
    latitude: number;
    longitude: number;
    locationName?: string;
    address?: string;
    quotedMessageId?: string;
};
export type SendContactInput = SendTarget & {
    contactName: string;
    vcard: string;
    quotedMessageId?: string;
};
export declare class WhatsAppGatewayClient {
    private readonly baseUrl;
    private readonly apiKey;
    private readonly timeoutMs;
    constructor(options: GatewayClientOptions);
    health(): Promise<any>;
    sendText(input: SendTextInput): Promise<any>;
    sendMedia(input: SendMediaInput): Promise<any>;
    sendAudio(input: SendAudioInput): Promise<any>;
    sendLocation(input: SendLocationInput): Promise<any>;
    sendContact(input: SendContactInput): Promise<any>;
    private request;
}
export declare function verifyWebhookSignature(params: {
    payload: string;
    timestamp: string;
    signature: string;
    secret: string;
    toleranceSeconds?: number;
}): boolean;
