import SwaggerDocs from './SwaggerDocs';

export const dynamic = 'force-dynamic';

export default function DocsPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#ffffff' }}>
      <SwaggerDocs />
    </main>
  );
}
