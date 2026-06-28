import { describe, it, expect } from 'vitest';
import { generateMermaidErd, Table, Relation } from './erd';

describe('generateMermaidErd', () => {
  it('generates correct mermaid ERD string for given tables', () => {
    const tables: Table[] = [
      {
        name: 'USER',
        columns: [
          { name: 'id', type: 'string', isPrimaryKey: true },
          { name: 'email', type: 'string', isNullable: true }
        ]
      },
      {
        name: 'POST',
        columns: [
          { name: 'id', type: 'string', isPrimaryKey: true },
          { name: 'title', type: 'string' }
        ]
      }
    ];

    const expected =
`erDiagram
  USER {
    string id PK
    string email "nullable"
  }
  POST {
    string id PK
    string title
  }
`;
    expect(generateMermaidErd(tables)).toBe(expected);
  });

  it('handles empty tables array', () => {
    expect(generateMermaidErd([])).toBe('erDiagram\n');
  });

  it('handles relations', () => {
    const tables: Table[] = [
      {
        name: 'USER',
        columns: []
      },
      {
        name: 'POST',
        columns: []
      }
    ];
    const relations: Relation[] = [
      { sourceTable: 'USER', targetTable: 'POST', type: 'one-to-many' },
      { sourceTable: 'USER', targetTable: 'PROFILE', type: 'one-to-one' },
      { sourceTable: 'USER', targetTable: 'ROLE', type: 'many-to-many' }
    ];

    const expected =
`erDiagram
  USER {
  }
  POST {
  }
  USER ||--|{ POST : ""
  USER ||--|| PROFILE : ""
  USER }o--o{ ROLE : ""
`;
    expect(generateMermaidErd(tables, relations)).toBe(expected);
  });
});
