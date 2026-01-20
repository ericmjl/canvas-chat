# How to use the matrix evaluation feature

The matrix feature enables systematic cross-product evaluation of items. It creates an interactive table where each cell represents the intersection of a row item and column item, which can be filled with AI-generated evaluations.

## When to use a matrix

Matrices are useful when you need to evaluate combinations systematically:

- Comparing business ideas against evaluation criteria
- Analyzing features across different user segments
- Rating products against multiple attributes
- Evaluating options against decision factors

## Creating a matrix

### Select context nodes

1. Select one or more nodes that contain relevant context for your matrix
2. Type `/matrix` followed by a description of what rows and columns you want:

```text
/matrix evaluate marketing channels (rows) against customer segments (columns)
```

The AI uses your prompt and the content from all selected nodes to extract appropriate row and column items.

### Multiple context nodes

You can select as many nodes as needed to provide context. For example:

1. Select a node with a list of products
2. Also select a node with evaluation criteria
3. Also select a node with background research
4. Run `/matrix compare products against criteria, considering the research context`

All selected nodes become context for the matrix, and edges connect each context node to the resulting matrix.

### Adjusting the matrix before creation

After running the command, a modal appears showing the extracted items:

- **Swap axes**: Click the swap button to flip rows and columns
- **Remove items**: Hover over any item and click the X to remove it
- **Review counts**: The modal shows how many items are in each axis

Click "Create Matrix" when satisfied. The matrix node appears on the canvas, connected to all its source nodes.

## Filling matrix cells

### Fill a single cell

Click the `+` button in any empty cell. The AI evaluates that specific row-column intersection and streams the result into the cell.

### Fill all empty cells

Click "Fill All" at the bottom of the matrix. A confirmation dialog appears showing how many cells will be filled. The AI processes each empty cell sequentially, streaming content as it generates.

### Clear all cells

Click "Clear All" at the bottom of the matrix to remove all cell content. This resets the matrix to its original row/column structure without the evaluations.

## Viewing cell details

Click any filled cell to open the detail modal, which shows:

- The row item name
- The column item name
- The complete evaluation text (cells in the matrix show truncated previews)

## Pinning cells to the canvas

When viewing a cell's details, click "Pin to Canvas" to extract that evaluation as a standalone node. This is useful when:

- You want to reply to or branch from a specific evaluation
- You need to reference a cell in further conversation
- You want to include the evaluation in a different context

Pinned cells appear as dashed-border nodes connected back to the source matrix.

## Practical example

Suppose you're brainstorming business ideas and want to evaluate them:

1. Ask the AI to generate a list of business ideas in one message
2. In another message, list your evaluation criteria (market size, competition, required capital, etc.)
3. Select both nodes
4. Run `/matrix evaluate each business idea against these criteria`
5. Review and adjust the extracted items
6. Create the matrix
7. Click "Fill All" to generate evaluations for every combination
8. Click cells to read full evaluations
9. Pin promising evaluations to the canvas for further exploration

## Limits

- Maximum 10 items per axis (100 cells total)
- Cell content is truncated in the table view (click to see full text)
- Fill All processes cells sequentially, which may take time for large matrices
