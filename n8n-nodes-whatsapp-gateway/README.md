# n8n Nodes WhatsApp AI Gateway

Send text, media, audio/voice notes, locations, and contacts through your self-hosted WhatsApp AI Gateway. The node can also check whether an authenticated instance is connected.

## Install

In n8n, go to:

```text
Settings -> Community Nodes -> Install
```

Package name:

```text
n8n-nodes-whatsapp-ai-gateway
```

Or install it from the command line:

```bash
npm install n8n-nodes-whatsapp-ai-gateway
```

## Credentials

Create **WhatsApp Gateway Instance API** credentials:

- **Gateway Base URL**: your gateway URL, for example `http://54.226.66.175` or your production domain.
- **Instance API Key**: the `wag_...` key shown once when the instance is created or rotated.

Store the key in n8n Credentials. Do not place it directly in workflow fields or webhook URLs. The gateway global administrator key remains supported for existing workflows.

## Operations

- **Send Message**: queue text, image, video, document, audio/voice note, location, or contact messages.
- **Get Instance Status**: verify the key and return the current connection state without sending a message.

The **Instance ID or Name** field accepts the UUID from the dashboard URL or the exact instance name.

## Media Sources

- **URL**: send a public media URL.
- **Base64**: send an expression containing Base64 data.
- **n8n Binary Property**: read a binary field such as `data`; MIME type and filename are inferred when available.

You can override the MIME type and filename, add a media caption, or provide a quoted WhatsApp message ID to send a reply.

## Example: Google Sheets Follow-Up

```text
Google Sheets -> WhatsApp Gateway
```

Use expressions:

```text
Phone Number: {{$json.phone}}
Message Text: Hi {{$json.name}}, this is a follow-up message.
```

The node returns the gateway queue ID and status. The gateway worker then sends the message through the connected WhatsApp instance.

## Local Development

```bash
npm install
npm run build
npm pack
```
