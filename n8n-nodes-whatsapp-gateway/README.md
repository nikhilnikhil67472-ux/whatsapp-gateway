# n8n Nodes WhatsApp AI Gateway

Send WhatsApp text, media, and audio messages from n8n through your self-hosted WhatsApp AI Gateway.

## Install

In n8n, go to:

```text
Settings -> Community Nodes -> Install
```

Package name:

```text
n8n-nodes-whatsapp-ai-gateway
```

Or install from the command line:

```bash
npm install n8n-nodes-whatsapp-ai-gateway
```

## Local Development

From this package folder:

```bash
npm install
npm run build
npm pack
```

This creates a `.tgz` package that can be installed in a self-hosted n8n instance.

## Credentials

Create **WhatsApp Gateway API** credentials:

- **Gateway Base URL**: your gateway URL, for example `http://54.226.66.175` or your production domain.

## Node Fields

- **Instance ID**: copied from the WhatsApp AI Gateway dashboard URL. The gateway also accepts the exact instance name on newer gateway versions.
- **Recipient Type**: phone number or WhatsApp JID.
- **Phone Number**: country code included, for example `919876543210`.
- **Message Type**: text, media, or audio.
- **Message Text**: message body or media caption.
- **Media URL**: public URL for images, videos, documents, or audio.

## Example: Google Sheets Follow-Up

Flow:

```text
Google Sheets -> WhatsApp Gateway
```

Use expressions:

```text
Phone Number: {{$json.phone}}
Message Text: Hi {{$json.name}}, this is a follow-up message.
```

The node queues the message in your gateway. The gateway worker sends it through the connected WhatsApp instance.
