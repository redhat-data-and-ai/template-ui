import './rich-content.css';
import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';

export interface CustomDataRendererProps {
  data: Record<string, unknown>;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function PrettyJsonBlock({ value }: { value: unknown }) {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return (
    <pre className="app-jsonblock">
      {text}
    </pre>
  );
}

export function CustomDataRenderer({ data }: CustomDataRendererProps) {
  const type = data.type;

  if (type === 'table' && Array.isArray(data.headers) && Array.isArray(data.rows)) {
    const headers = data.headers.filter(isNonEmptyString) as string[];
    const rows = data.rows as unknown[];
    if (headers.length === 0) {
      return <PrettyJsonBlock value={data} />;
    }
    return (
      <div className="app-datatable">
        <Table aria-label="Structured data table" borders>
          <Thead>
            <Tr>
              {headers.map((h) => (
                <Th key={h} modifier="wrap">
                  {h}
                </Th>
              ))}
            </Tr>
          </Thead>
          <Tbody>
            {rows.map((row, ri) => {
              const cells = Array.isArray(row) ? row : [row];
              return (
                <Tr key={`row-${ri}`}>
                  {headers.map((_, ci) => (
                    <Td key={`cell-${ri}-${ci}`} dataLabel={headers[ci]}>
                      {cells[ci] != null && typeof cells[ci] === 'object' ? (
                        <code>{JSON.stringify(cells[ci])}</code>
                      ) : (
                        String(cells[ci] ?? '')
                      )}
                    </Td>
                  ))}
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </div>
    );
  }

  if (type === 'json') {
    const payload = 'value' in data ? data.value : data;
    return <PrettyJsonBlock value={payload} />;
  }

  if (type === 'list' && Array.isArray(data.items)) {
    const items = data.items;
    return (
      <ul className="app-datalist">
        {items.map((item, i) => (
          <li key={`item-${i}`}>{typeof item === 'object' ? JSON.stringify(item) : String(item)}</li>
        ))}
      </ul>
    );
  }

  return <PrettyJsonBlock value={data} />;
}
