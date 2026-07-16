'use client';

import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';

export default function SwaggerDocs() {
  return (
    <SwaggerUI
      url="/api/openapi"
      deepLinking
      displayRequestDuration
      persistAuthorization
      tryItOutEnabled
      docExpansion="list"
    />
  );
}
