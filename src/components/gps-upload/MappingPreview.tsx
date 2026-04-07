'use client'

interface MappingPreviewProps {
  headers: string[]
  rows: Record<string, string>[]
  maxRows?: number
}

/** Shows a small preview table of the uploaded CSV (5 rows) */
export default function MappingPreview({ headers, rows, maxRows = 5 }: MappingPreviewProps) {
  if (headers.length === 0) return null

  const preview = rows.slice(0, maxRows)

  return (
    <div style={{ marginTop: '12px', overflow: 'auto', maxHeight: '180px' }}>
      <div style={{
        fontSize: '11px', color: 'var(--gray-400)', fontFamily: 'var(--mono)',
        marginBottom: '6px',
      }}>
        Preview, first {preview.length} rows
      </div>
      <table style={{
        width: '100%', borderCollapse: 'collapse', fontSize: '11px',
        fontFamily: 'var(--mono)', tableLayout: 'auto',
      }}>
        <thead>
          <tr>
            {headers.map(h => (
              <th key={h} style={{
                textAlign: 'left', padding: '4px 8px',
                background: 'var(--gray-50)', border: '1px solid var(--border)',
                color: 'var(--gray-600)', fontWeight: 600,
                whiteSpace: 'nowrap', maxWidth: '160px', overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preview.map((row, i) => (
            <tr key={i}>
              {headers.map(h => (
                <td key={h} style={{
                  padding: '3px 8px', border: '1px solid var(--border)',
                  color: 'var(--gray-700)', whiteSpace: 'nowrap',
                  maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {row[h] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
