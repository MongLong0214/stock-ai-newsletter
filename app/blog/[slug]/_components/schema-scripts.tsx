interface SchemaScriptsProps {
  schemas: Array<{ id: string; data: object }>;
}

export function SchemaScripts({ schemas }: SchemaScriptsProps) {
  return (
    <>
      {schemas.map(({ id, data }) => (
        <script
          key={id}
          id={id}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
        />
      ))}
    </>
  );
}
