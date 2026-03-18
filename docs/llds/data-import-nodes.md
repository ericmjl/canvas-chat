# Data Import Nodes Low-Level Design

**Project:** Canvas-Chat
**Created:** 2026-03-16
**Status:** Implementation
**Related HLD:** `/docs/high-level-design.md`

## Context and Design Philosophy

The data import nodes exist to bridge external tabular data with Canvas-Chat's conversational workflow. Users frequently work with spreadsheet-like data from CSV files, Excel workbooks, and scientific software exports, and need a way to visualize, explore, and analyze this data within their conversations.

The design philosophy centers on three principles:

1. **Seamless import workflow** - Users drag or drop files, and nodes appear automatically. No intermediate steps or configuration dialogs. The system intelligently parses the file format and creates appropriately typed nodes.

2. **One-to-many node creation** - When a file contains multiple logical tables (Excel sheets, Prism tables), the system creates multiple nodes. This preserves the conceptual structure of the data rather than flattening it into a single node.

3. **Code-ready data** - Every imported table exposes its data as a CSV string (`csvData`), enabling immediate analysis via the `/code` feature. This tight coupling between data import and code execution makes iterative analysis frictionless.

This node type directly supports the HLD's "Data" category: "Matrices for evaluation, tables from CSV/Excel."

## Technical Details

### Node Data Structure

All three data import node types share a common structure, with type-specific metadata:

```javascript
{
    id: string,                    // UUID
    type: 'csv' | 'excel' | 'prism', // Node type identifier
    content: string,               // Markdown table preview (first 5 rows)
    csvData: string,               // Full data as CSV string for /code integration
    filename: string,              // Original filename
    columns: string[],             // Column headers
    rowCount: number,              // Total row count
    columnCount: number,           // Total column count

    // Type-specific fields
    // Excel only:
    sheetName: string,             // Sheet name (one node per sheet)

    // Prism only:
    tableTitle: string,            // Table title from .pzfx
    tableIndex: number,            // Zero-based table index

    position: { x: number, y: number },
    width: number,                 // Default: 640
    height: number,                // Default: 480
    created_at: number,
    tags: string[],
    title: string | null,
    summary: string | null,
    model: string | null,
    selection: any,
}
```

### Three-Component Architecture

Each data import type combines three plugin concepts:

1. **Node Protocol** (Level 1): Extends `BaseNode` protocol. Handles rendering, action buttons, and the Analyze workflow. Registered with `NodeRegistry`.

2. **File Upload Handler** (Level 1 extension): Extends `FileUploadHandlerPlugin`. Handles file parsing, multi-node creation, and csvData generation. Registered with `FileUploadRegistry`.

3. **Shared UI Pattern**: All three types render similarly via `renderContent()`, showing metadata header (filename, dimensions, columns) followed by markdown table preview.

This architecture follows the plugin system: node protocols handle rendering, upload handlers handle file processing.

### CSV Handler

#### CSV Parsing Pipeline

The CSV handler uses Papa Parse for robust CSV parsing:

```javascript
// Read file as text
const text = await file.text();

// Parse with Papa Parse
const parseResult = Papa.parse(text, {
    header: true, // First row as column names
    skipEmptyLines: true, // Ignore empty rows
    dynamicTyping: true, // Auto-convert numbers/booleans
});

const data = parseResult.data;
const columns = parseResult.meta.fields;
```

#### CSV Validation

- **File extension**: Must end with `.csv`
- **MIME type**: Must be `text/csv`
- **Size limit**: 10 MB maximum

#### CSV csvData Generation

The raw file text is stored directly as `csvData`:

```javascript
csvData: text; // Store raw CSV string for code execution
```

This preserves the original formatting and lets pandas infer types during parsing in Python.

### Excel Handler

#### Excel Parsing Pipeline

The Excel handler uses SheetJS (XLSX) library:

```javascript
// Read file as ArrayBuffer
const arrayBuffer = await file.arrayBuffer();
const workbook = XLSX.read(arrayBuffer, { type: 'array' });

// Iterate over all sheets
for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];

    // Convert to array-of-arrays (header: 1 means first row as header)
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
}
```

#### Excel Multi-Node Creation

One node is created for each sheet in the workbook:

```javascript
for (const sheetName of workbook.SheetNames) {
    // ... parse sheet data ...

    const excelNode = createNode(NodeType.EXCEL, previewContent, {
        position: nodePosition,
        title: `${file.name} — ${sheetName}`,
        filename: file.name,
        sheetName,
        csvData: csvString,
        columns,
        rowCount,
        columnCount,
    });

    createdNodes.push(excelNode);
    nodePosition = graph.autoPosition(createdNodes.map((n) => n.id));
}
```

Nodes are positioned automatically using `graph.autoPosition()` to avoid overlaps.

#### Excel csvData Generation

Excel data is converted to CSV format with proper escaping:

```javascript
const escapeCsv = (val) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
};

const csvLines = [columns.map(escapeCsv).join(',')];
for (const row of dataRows) {
    csvLines.push(columns.map((_, i) => escapeCsv(row[i])).join(','));
}
const csvString = csvLines.join('\n');
```

#### Excel Validation

- **File extension**: Must end with `.xlsx` or `.xls`
- **MIME types**: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` or `application/vnd.ms-excel`
- **Size limit**: 15 MB maximum
- **Library check**: Validates that `XLSX` is loaded before parsing

### Prism Handler

#### File Format

GraphPad Prism `.pzfx` files are XML documents containing one or more data tables. The structure:

```xml
<GraphPad Prism file>
    <Table Title="Data 1">
        <XColumn>
            <Subcolumn>
                <d>value</d>  <!-- One d per row -->
            </Subcolumn>
        </XColumn>
        <YColumn>
            <Subcolumn>
                <d>value</d>
            </Subcolumn>
        </YColumn>
    </Table>
    <HugeTable Title="Data 2">
        <!-- Alternative table type -->
    </HugeTable>
</GraphPad>
```

Key structural concepts:

- **Table/HugeTable**: Container for one data table
- **XColumn/YColumn**: Data columns (X is typically independent variable)
- **Subcolumn**: Prism allows replicates within a column; each subcolumn is one logical column in the output
- **d elements**: One value per row

#### Prism Parsing Pipeline

The handler uses DOMParser to read the XML:

```javascript
const text = await file.text();
const parser = new DOMParser();
const doc = parser.parseFromString(text, 'text/xml');

// Check for parse errors
const parseError = doc.querySelector('parsererror');
if (parseError) {
    throw new Error('Invalid or unsupported Prism XML.');
}
```

#### Prism Multi-Node Creation

One node is created for each Table or HugeTable element:

```javascript
function parsePzfxTables(doc) {
    const allTables = getByLocalName(doc.documentElement, 'Table');
    const allHuge = getByLocalName(doc.documentElement, 'HugeTable');

    for (const tableEl of [...allTables, ...allHuge]) {
        // Extract column data, handle subcolumns
        // Create table object with rows and columnHeaders
    }
    return tables;
}
```

#### Column Expansion

Prism's subcolumn structure is flattened into standard CSV columns:

```javascript
// Each subcolumn becomes one CSV column
for (const subcolumnValues of subcolumnValuesArray) {
    expandedColumns.push(subcolumnValues);
    const header = subcolumnValues.length === 1 ? colTitle : `${colTitle} (${subcolumnIndex + 1})`;
    columnHeaders.push(header);
}
```

#### Prism csvData Generation

Same CSV escaping pattern as Excel:

```javascript
const escapeCsv = (val) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
};
```

#### Prism Validation

- **File extension**: Must end with `.pzfx`
- **Size limit**: 10 MB maximum
- **XML validation**: Parser must not produce errors

## csvData for /code Integration

### Overview

The `csvData` property is the key integration point between data import nodes and the `/code` feature. It stores the complete table data as a CSV-formatted string, enabling direct analysis without re-parsing.

### Detection Logic

When `/code` is invoked (slash command or Analyze button), the system identifies linked data nodes:

```javascript
const csvNodeIds = selectedIds.filter((id) => {
    const node = graph.getNode(id);
    return node && node.csvData && [NodeType.CSV, NodeType.EXCEL, NodeType.PRISM].includes(node.type);
});
```

### Variable Naming

When multiple data nodes are linked, variables are named systematically:

```javascript
const csvNames = csvNodeIds.length === 1 ? ['df'] : csvNodeIds.map((_, i) => `df${i + 1}`);
// Example: ['df'] or ['df1', 'df2', 'df3']
```

### Code Template Generation

The `/code` feature generates starter code that pre-loads the data:

```javascript
if (csvNodeIds.length > 0) {
    initialCode = `# Available DataFrames: ${csvNames.join(', ')}
# Analyze the data

import pandas as pd

# Example: Display first few rows
${csvNames[0]}.head()
`;
}
```

### Pyodide Execution

When the code runs, the `csvData` is injected into the Pyodide environment:

```javascript
async function run(code, csvDataMap, onInstallProgress) {
    await ensureLoaded();

    // Inject CSV data as DataFrames
    let dataInjection = '';
    for (const [varName, csvString] of Object.entries(csvDataMap)) {
        const escaped = csvString.replace(/\\/g, '\\\\').replace(/"""/g, '\\"""').replace(/\n/g, '\\n');
        dataInjection += `${varName} = pd.read_csv(io.StringIO("""${escaped}"""))\n`;
    }

    // Execute with data injected
    await pyodide.runPythonAsync(`${dataInjection}\n${code}`);
}
```

### Analyze Button Workflow

Each data node type provides an Analyze action that creates a linked Code node:

```javascript
analyze(nodeId, canvas, graph) {
    const dataNode = graph.getNode(nodeId);

    const starterCode = `# Analyzing: ${dataNode.title}
import pandas as pd

# DataFrame is pre-loaded as 'df'
df.head()
`;

    const codeNode = createNode(NodeType.CODE, starterCode, {
        csvNodeIds: [nodeId],  // Link to source data node
    });

    // Create GENERATES edge from data to code
    const edge = createEdge(nodeId, codeNode.id, EdgeType.GENERATES);
}
```

This creates a visual and functional relationship between the data and analysis.

## Extension Hooks

Currently, data import nodes do not emit custom events. Future plugins could hook into:

- `dataimport:before` - Fires before file processing starts
- `dataimport:after` - Fires after nodes are created
- `dataimport:error` - Fires on parsing or validation errors

## Limits and Constraints

| Limit           | Value | Rationale                                                     |
| --------------- | ----- | ------------------------------------------------------------- |
| CSV file size   | 10 MB | Browser memory, Papa Parse performance                        |
| Excel file size | 15 MB | SheetJS overhead, slightly larger limit for multi-sheet files |
| Prism file size | 10 MB | XML parsing memory usage                                      |
| Preview rows    | 5     | Display performance, memory for markdown rendering            |
| Column display  | All   | Scrollable metadata section shows all columns                 |

## Open Questions & Future Decisions

### Resolved (Implementation Complete)

1. **CSV parsing library** - Papa Parse chosen for browser compatibility and dynamic typing
2. **Excel multi-sheet handling** - One node per sheet, positioned automatically
3. **Prism subcolumn expansion** - Each subcolumn becomes one CSV column with indexed header
4. **csvData format** - Raw CSV string chosen over JSON for pandas compatibility

### Deferred / Future Considerations

1. **Large file handling** - Currently limited to 10-15 MB. Future could implement streaming parse for larger files with row sampling in preview.

2. **Column type inference display** - Currently columns are displayed as strings. Future could show detected types (number, date, boolean) in the metadata header.

3. **Data transformation on import** - Users might want to filter rows, rename columns, or pivot during import. Future could add import-time transformation modal.

4. **Multiple file drag-and-drop** - Currently one file at a time. Future could handle multiple files, creating linked nodes.

5. **Export back to original format** - Currently one-way import. Future could allow exporting modified data back to CSV/Excel.

6. **Prism column types** - Prism distinguishes X columns (independent), Y columns (dependent), and row titles. Future could preserve this metadata for specialized analysis.

## References

### High-Level Design

- `/docs/high-level-design.md` - Core canvas-chat architecture, node types, plugin system

### Implementation

**Frontend:**

- `src/canvas_chat/static/js/plugins/csv-node.js` - CSV node protocol and upload handler
- `src/canvas_chat/static/js/plugins/excel-node.js` - Excel node protocol and upload handler
- `src/canvas_chat/static/js/plugins/prism-node.js` - Prism node protocol and upload handler
- `src/canvas_chat/static/js/graph-types.js` - NodeType enum and createNode factory
- `src/canvas_chat/static/js/node-protocols.js` - BaseNode protocol class
- `src/canvas_chat/static/js/plugins/code.js` - /code feature integration with csvData
- `src/canvas_chat/static/js/pyodide-runner.js` - Python execution with CSV injection

**Backend:**

- No backend required - all parsing happens in browser

**Tests:**

- `tests/test_excel_node.js` - Excel handler tests (multi-sheet, csvData)
- `tests/test_prism_node.js` - Prism handler tests (multi-table, csvData)
- `tests/test_code_plugin.js` - /code integration with csvDataMap

### Related Features

- `/code` feature: `src/canvas_chat/static/js/plugins/code.js`
- File upload system: `src/canvas_chat/static/js/file-upload-registry.js`
- Node protocols: `src/canvas_chat/static/js/node-protocols.js`
