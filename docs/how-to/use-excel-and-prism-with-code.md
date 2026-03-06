# Use Excel and Prism data with /code

You can upload Excel spreadsheets (`.xlsx`, `.xls`) and GraphPad Prism files (`.pzfx`) and analyze them with the `/code` command, just like CSV files. Each sheet (Excel) or table (Prism) becomes its own node, and you can run Python in the browser (Pyodide) with the data pre-loaded as pandas DataFrames.

## Supported formats

- **Excel:** `.xlsx`, `.xls`. One node is created per worksheet. Empty sheets are skipped.
- **Prism:** `.pzfx` (XML format). One node is created per data table in the file. The binary `.pzf` format is not supported; export or save as `.pzfx` from Prism if you need to import.

## Uploading files

1. **Drag and drop** an Excel or Prism file onto the canvas, or
2. Click the **paperclip** (or upload) button and choose a file.

After upload:

- **Excel:** You get one node per sheet (e.g. "data.xlsx — Sheet1", "data.xlsx — Sales"). They are placed in a row.
- **Prism:** You get one node per table (e.g. "experiment.pzfx — Table 1"). They are placed in a row.

Each node shows filename, sheet/table name, row and column counts, and a short markdown preview of the data.

## Using /code with table nodes

1. **Select one or more table nodes** (CSV, Excel, or Prism). Click a node to select it; use `Cmd/Ctrl + Click` to select multiple.
2. Type **`/code`** in the chat input. The slash command menu will show `/code` as available when at least one table node is selected.
3. Press **Enter** (with no extra text) to create a Code node with a starter script and your selected table(s) linked as DataFrames (`df`, or `df1`, `df2`, … if multiple).
4. Optionally type a prompt after `/code` (e.g. `/code plot sales over time`) to generate code with AI.
5. Click **Run** in the Code node to execute. Data is injected as `pd.read_csv(io.StringIO(...))` under the hood, so you use it like any pandas DataFrame.

You can also click **Analyze** on a table node to create a linked Code node for that single node.

## Empty sheets and tables

Empty worksheets (Excel) or tables with no data (Prism) are skipped and do not create nodes. Only sheets/tables that have at least one row of data produce nodes.

## See also

- [Keyboard shortcuts reference](../reference/keyboard-shortcuts.md) — `/code` and other slash commands
- Code execution uses Pyodide in the browser; table nodes expose their data as CSV-shaped strings so the same execution path works for CSV, Excel, and Prism.
