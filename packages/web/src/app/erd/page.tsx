"use client";

import { useState } from "react";
import { Table, Relation, generateMermaidErd } from "@/lib/erd";

export default function ErdPage() {
  const [tables] = useState<Table[]>([
    {
      name: "User",
      columns: [
        { name: "id", type: "uuid", isPrimaryKey: true },
        { name: "email", type: "string" },
        { name: "name", type: "string", isNullable: true },
        { name: "createdAt", type: "timestamp" }
      ]
    },
    {
      name: "Project",
      columns: [
        { name: "id", type: "uuid", isPrimaryKey: true },
        { name: "name", type: "string" },
        { name: "ownerId", type: "uuid" },
        { name: "createdAt", type: "timestamp" }
      ]
    },
    {
      name: "Task",
      columns: [
        { name: "id", type: "uuid", isPrimaryKey: true },
        { name: "projectId", type: "uuid" },
        { name: "title", type: "string" },
        { name: "status", type: "string" },
        { name: "dueDate", type: "timestamp", isNullable: true }
      ]
    }
  ]);

  const [relations] = useState<Relation[]>([
    { sourceTable: "User", targetTable: "Project", type: "one-to-many" },
    { sourceTable: "Project", targetTable: "Task", type: "one-to-many" }
  ]);

  const erdCode = generateMermaidErd(tables, relations);

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <h1 className="text-3xl font-bold mb-6">ERD Engineering Tool</h1>
      <p className="text-muted-foreground mb-8">
        Copy the following Mermaid.js code into a markdown file or mermaid live editor:
      </p>

      <pre className="bg-muted p-4 rounded-md overflow-x-auto">
        <code>{erdCode}</code>
      </pre>
    </div>
  );
}
