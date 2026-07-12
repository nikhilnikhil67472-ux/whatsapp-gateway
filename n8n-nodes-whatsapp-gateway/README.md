# n8n WhatsApp Gateway Node

Send WhatsApp messages through the self-hosted WhatsApp AI Gateway.

## Install in self-hosted n8n

From this folder:

```bash
npm install
npm run build
```

Then copy or install this package into your n8n custom extensions directory, depending on your n8n deployment.

## Node Fields

- Gateway Base URL: `http://54.226.66.175` or your domain
- Instance ID: copied from the gateway dashboard URL
- Phone Number: country code included, for example `919876543210`
- Message Type: text, media, or audio
- Message Text: message body or media caption
