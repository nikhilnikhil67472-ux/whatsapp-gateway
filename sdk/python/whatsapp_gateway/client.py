from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Any

import httpx


class WhatsAppGatewayClient:
    def __init__(self, base_url: str, api_key: str, timeout: float = 20.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    def health(self) -> dict[str, Any]:
        return self._request("GET", "/api/health", authenticated=False)

    def send_text(
        self,
        *,
        instance_id: str,
        text: str,
        phone_number: str | None = None,
        remote_jid: str | None = None,
        quoted_message_id: str | None = None,
    ) -> dict[str, Any]:
        return self._request(
            "POST",
            "/api/whatsapp/send",
            json_body={
                "instanceId": instance_id,
                "phoneNumber": phone_number,
                "remoteJid": remote_jid,
                "type": "text",
                "text": text,
                "quotedMessageId": quoted_message_id,
            },
        )

    def send_media(
        self,
        *,
        instance_id: str,
        media_type: str,
        mime_type: str,
        phone_number: str | None = None,
        remote_jid: str | None = None,
        media_url: str | None = None,
        base64_data: str | None = None,
        file_name: str | None = None,
        caption: str | None = None,
    ) -> dict[str, Any]:
        return self._request(
            "POST",
            "/api/whatsapp/send",
            json_body={
                "instanceId": instance_id,
                "phoneNumber": phone_number,
                "remoteJid": remote_jid,
                "type": "media",
                "mediaType": media_type,
                "mediaUrl": media_url,
                "base64": base64_data,
                "mimeType": mime_type,
                "fileName": file_name,
                "text": caption,
            },
        )

    def send_audio(
        self,
        *,
        instance_id: str,
        phone_number: str | None = None,
        remote_jid: str | None = None,
        audio_url: str | None = None,
        base64_data: str | None = None,
        mime_type: str | None = None,
        quoted_message_id: str | None = None,
    ) -> dict[str, Any]:
        return self._request(
            "POST",
            "/api/whatsapp/send",
            json_body={
                "instanceId": instance_id,
                "phoneNumber": phone_number,
                "remoteJid": remote_jid,
                "type": "audio",
                "mediaUrl": audio_url,
                "base64": base64_data,
                "mimeType": mime_type,
                "quotedMessageId": quoted_message_id,
            },
        )

    def send_location(
        self,
        *,
        instance_id: str,
        latitude: float,
        longitude: float,
        phone_number: str | None = None,
        remote_jid: str | None = None,
        location_name: str | None = None,
        address: str | None = None,
        quoted_message_id: str | None = None,
    ) -> dict[str, Any]:
        return self._request(
            "POST",
            "/api/whatsapp/send",
            json_body={
                "instanceId": instance_id,
                "phoneNumber": phone_number,
                "remoteJid": remote_jid,
                "type": "location",
                "latitude": latitude,
                "longitude": longitude,
                "locationName": location_name,
                "address": address,
                "quotedMessageId": quoted_message_id,
            },
        )

    def send_contact(
        self,
        *,
        instance_id: str,
        contact_name: str,
        vcard: str,
        phone_number: str | None = None,
        remote_jid: str | None = None,
        quoted_message_id: str | None = None,
    ) -> dict[str, Any]:
        return self._request(
            "POST",
            "/api/whatsapp/send",
            json_body={
                "instanceId": instance_id,
                "phoneNumber": phone_number,
                "remoteJid": remote_jid,
                "type": "contact",
                "contactName": contact_name,
                "vcard": vcard,
                "quotedMessageId": quoted_message_id,
            },
        )

    def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        authenticated: bool = True,
    ) -> dict[str, Any]:
        headers = {"Accept": "application/json"}
        if authenticated:
            headers["Authorization"] = f"Bearer {self.api_key}"
        with httpx.Client(timeout=self.timeout) as client:
            response = client.request(
                method,
                f"{self.base_url}{path}",
                headers=headers,
                json=json_body,
            )
        try:
            payload = response.json()
        except json.JSONDecodeError:
            payload = None
        if response.is_error:
            message = payload.get("error") if isinstance(payload, dict) else None
            raise RuntimeError(message or f"Gateway request failed with HTTP {response.status_code}")
        return payload


def verify_webhook_signature(
    *,
    payload: str,
    timestamp: str,
    signature: str,
    secret: str,
    tolerance_seconds: int = 300,
) -> bool:
    try:
        timestamp_value = int(timestamp)
    except ValueError:
        return False
    if abs(time.time() - timestamp_value) > tolerance_seconds:
        return False
    digest = hmac.new(
        secret.encode(),
        f"{timestamp}.{payload}".encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(signature, f"sha256={digest}")
