export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'WhatsApp AI Gateway API',
    version: '2.0.0',
    description: 'Self-hosted REST API for WhatsApp messaging, AI webhooks, media, and instance operations.',
    license: {
      name: 'MIT',
    },
  },
  servers: [
    {
      url: process.env.APP_BASE_URL || 'http://localhost:3000',
      description: 'Gateway server',
    },
  ],
  tags: [
    { name: 'Health' },
    { name: 'Messages' },
    { name: 'Instances' },
    { name: 'Webhooks' },
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['Health'],
        summary: 'Read gateway health',
        security: [],
        responses: {
          200: {
            description: 'Current app, queue, Redis, and instance health.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthResponse' },
              },
            },
          },
        },
      },
    },
    '/metrics': {
      get: {
        tags: ['Health'],
        summary: 'Prometheus metrics',
        security: [{ metricsBearer: [] }],
        responses: {
          200: {
            description: 'Prometheus exposition format.',
            content: {
              'text/plain': { schema: { type: 'string' } },
            },
          },
        },
      },
    },
    '/api/whatsapp/send': {
      post: {
        tags: ['Messages'],
        summary: 'Queue a WhatsApp message',
        description: 'Accepts global, instance, or user API keys. Messages are durably queued before sending.',
        security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SendMessageRequest' },
              examples: {
                text: {
                  value: {
                    instanceId: 'support',
                    phoneNumber: '919876543210',
                    type: 'text',
                    text: 'Hello from the AI agent',
                  },
                },
                media: {
                  value: {
                    instanceId: 'support',
                    remoteJid: '919876543210@s.whatsapp.net',
                    type: 'media',
                    mediaUrl: 'https://example.com/invoice.pdf',
                    mediaType: 'document',
                    mimeType: 'application/pdf',
                    fileName: 'invoice.pdf',
                    text: 'Your invoice',
                  },
                },
              },
            },
          },
        },
        responses: {
          202: {
            description: 'Message accepted into the durable outbound queue.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/QueuedMessageResponse' },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          429: { $ref: '#/components/responses/RateLimited' },
        },
      },
    },
    '/api/whatsapp/status': {
      get: {
        tags: ['Instances'],
        summary: 'Read an authenticated instance status',
        description: 'Accepts global, instance, or user API keys with instances:read scope.',
        security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
        parameters: [
          {
            name: 'instanceId',
            in: 'query',
            required: true,
            description: 'Instance UUID or exact instance name.',
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: { description: 'Instance ID, name, status, and connected flag.' },
          400: { description: 'Missing or invalid instance identifier.' },
          401: { description: 'API key is missing.' },
          403: { description: 'API key is invalid or lacks access.' },
          404: { description: 'Instance not found.' },
          429: { description: 'Rate limit exceeded.' },
        },
      },
    },
    '/api/instances/create': {
      post: {
        tags: ['Instances'],
        summary: 'Create a WhatsApp instance',
        description: 'Dashboard-session endpoint. Returns an instance API key once and starts QR pairing.',
        security: [{ dashboardCookie: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['instanceName'],
                properties: {
                  instanceName: {
                    type: 'string',
                    pattern: '^[a-z0-9][a-z0-9_-]*$',
                    minLength: 3,
                    maxLength: 64,
                  },
                  clientId: { type: 'string' },
                  rejectCall: { type: 'boolean', default: true },
                  groupsIgnore: { type: 'boolean', default: true },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Instance created.' },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/api/instances/{id}/status': {
      get: {
        tags: ['Instances'],
        summary: 'Read connection and QR status',
        security: [{ dashboardCookie: [] }],
        parameters: [
          { $ref: '#/components/parameters/InstanceId' },
        ],
        responses: {
          200: { description: 'Current connection state and QR data.' },
          404: { description: 'Instance not found.' },
        },
      },
    },
    '/api/instances/{id}': {
      delete: {
        tags: ['Instances'],
        summary: 'Permanently delete an instance',
        description: 'Stops the socket and asynchronously removes its auth state, messages, media, webhooks, automations, and instance-scoped API keys.',
        security: [{ dashboardCookie: [] }],
        parameters: [
          { $ref: '#/components/parameters/InstanceId' },
        ],
        responses: {
          202: { description: 'Instance deletion queued.' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { description: 'Instance not found.' },
        },
      },
    },
    '/api/instances/{id}/restart': {
      post: {
        tags: ['Instances'],
        summary: 'Reconnect an instance',
        security: [{ dashboardCookie: [] }],
        parameters: [
          { $ref: '#/components/parameters/InstanceId' },
        ],
        responses: {
          200: { description: 'Restart command queued.' },
        },
      },
    },
    '/api/dashboard/instances/{id}/webhooks': {
      get: {
        tags: ['Webhooks'],
        summary: 'List webhook delivery history and dead letters',
        security: [{ dashboardCookie: [] }],
        parameters: [
          { $ref: '#/components/parameters/InstanceId' },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 250, default: 100 },
          },
        ],
        responses: {
          200: { description: 'Webhook deliveries.' },
        },
      },
    },
    '/api/dashboard/webhooks/{deliveryId}/replay': {
      post: {
        tags: ['Webhooks'],
        summary: 'Replay a webhook delivery',
        security: [{ dashboardCookie: [] }],
        parameters: [
          {
            name: 'deliveryId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          200: { description: 'Replay queued.' },
        },
      },
    },
  },
  webhooks: {
    incomingMessage: {
      post: {
        summary: 'Incoming WhatsApp event delivered to the configured AI webhook',
        parameters: [
          {
            name: 'X-Webhook-Event',
            in: 'header',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'X-Webhook-Delivery',
            in: 'header',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'X-Webhook-Timestamp',
            in: 'header',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'X-Webhook-Signature',
            in: 'header',
            required: true,
            schema: { type: 'string', example: 'sha256=...' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/IncomingWebhook' },
            },
          },
        },
        responses: {
          200: {
            description: 'Optional AI reply.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AiReply' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'API key',
      },
      apiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
      },
      metricsBearer: {
        type: 'http',
        scheme: 'bearer',
        description: 'Required only when METRICS_TOKEN is configured.',
      },
      dashboardCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'wag_dashboard_session',
      },
    },
    parameters: {
      InstanceId: {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'Instance UUID or dashboard instance identifier.',
      },
    },
    schemas: {
      HealthResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['ok', 'degraded'] },
          database: { type: 'string' },
          instances: { type: 'integer' },
          connectedInstances: { type: 'integer' },
          queues: { type: 'object', additionalProperties: true },
          redis: { type: 'object', additionalProperties: true },
          operations: { type: 'object', additionalProperties: true },
          checkedAt: { type: 'string', format: 'date-time' },
        },
      },
      SendMessageRequest: {
        type: 'object',
        required: ['instanceId', 'type'],
        oneOf: [
          {
            required: ['phoneNumber'],
          },
          {
            required: ['remoteJid'],
          },
        ],
        properties: {
          instanceId: { type: 'string' },
          phoneNumber: { type: 'string', example: '919876543210' },
          remoteJid: { type: 'string', example: '919876543210@s.whatsapp.net' },
          type: {
            type: 'string',
            enum: ['text', 'media', 'audio', 'location', 'contact'],
          },
          text: { type: 'string' },
          mediaUrl: { type: 'string', format: 'uri' },
          base64: { type: 'string', description: 'Raw Base64 or a data URI.' },
          mediaType: { type: 'string', enum: ['image', 'video', 'document'] },
          mimeType: { type: 'string' },
          fileName: { type: 'string' },
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          locationName: { type: 'string' },
          address: { type: 'string' },
          contactName: { type: 'string' },
          vcard: { type: 'string' },
          quotedMessageId: { type: 'string' },
        },
      },
      QueuedMessageResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          queued: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              instanceId: { type: 'string' },
              remoteJid: { type: 'string' },
              type: { type: 'string' },
              status: { type: 'string', enum: ['pending'] },
              rateLimit: {
                type: 'object',
                properties: {
                  limit: { type: 'integer' },
                  remaining: { type: 'integer' },
                },
              },
            },
          },
        },
      },
      IncomingWebhook: {
        type: 'object',
        properties: {
          event: { type: 'string', example: 'message.received' },
          instance: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
            },
          },
          sender: {
            type: 'object',
            properties: {
              jid: { type: 'string' },
              phone_number: { type: 'string' },
              lid: { type: ['string', 'null'] },
              push_name: { type: ['string', 'null'] },
              is_group: { type: 'boolean' },
            },
          },
          message: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              whatsapp_id: { type: 'string' },
              type: { type: 'string' },
              text: { type: ['string', 'null'] },
              caption: { type: ['string', 'null'] },
            },
          },
          media: {
            oneOf: [
              { type: 'null' },
              {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  media_type: { type: 'string' },
                  mime_type: { type: 'string' },
                  mimetype: { type: 'string' },
                  url: { type: ['string', 'null'] },
                  base64_data: { type: ['string', 'null'] },
                  transcription: { type: ['string', 'null'] },
                  vision_analysis: { type: ['string', 'null'] },
                  analysis: { type: ['string', 'null'] },
                  extracted_text: { type: ['string', 'null'] },
                },
              },
            ],
          },
          history: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                role: { type: 'string' },
                text: { type: 'string' },
                timestamp: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
      AiReply: {
        type: 'object',
        properties: {
          reply: { type: ['boolean', 'string'] },
          type: {
            type: 'string',
            enum: ['text', 'media', 'audio', 'location', 'contact'],
          },
          text: { type: 'string' },
          output: { type: 'string' },
          mediaUrl: { type: 'string', format: 'uri' },
          base64: { type: 'string' },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          details: { type: 'array', items: {} },
        },
      },
    },
    responses: {
      BadRequest: {
        description: 'Invalid request.',
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/Error' } },
        },
      },
      Unauthorized: {
        description: 'Authentication is missing.',
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/Error' } },
        },
      },
      Forbidden: {
        description: 'Authentication is invalid or lacks scope.',
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/Error' } },
        },
      },
      RateLimited: {
        description: 'Rate limit exceeded.',
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/Error' } },
        },
      },
    },
  },
} as const;
