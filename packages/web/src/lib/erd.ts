export interface Column {
  name: string;
  type: string;
  isPrimaryKey?: boolean;
  isNullable?: boolean;
}

export interface Relation {
  sourceTable: string;
  targetTable: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

export interface Table {
  name: string;
  columns: Column[];
}

export function generateMermaidErd(tables: Table[], relations: Relation[] = []): string {
  let erd = "erDiagram\n";

  for (const table of tables) {
    erd += `  ${table.name} {\n`;
    for (const col of table.columns) {
      const pkMarker = col.isPrimaryKey ? " PK" : "";
      const nullableMarker = col.isNullable ? " \"nullable\"" : "";
      erd += `    ${col.type} ${col.name}${pkMarker}${nullableMarker}\n`;
    }
    erd += `  }\n`;
  }

  for (const rel of relations) {
    let relString = "";
    if (rel.type === 'one-to-one') {
      relString = "||--||";
    } else if (rel.type === 'one-to-many') {
      relString = "||--|{";
    } else if (rel.type === 'many-to-many') {
      relString = "}o--o{";
    }
    erd += `  ${rel.sourceTable} ${relString} ${rel.targetTable} : ""\n`;
  }

  return erd;
}
