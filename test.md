# Project Report

## Executive Summary

This report demonstrates **all supported** markdown features including *emphasis*,
[regular links](https://example.com), and `inline code`. The converter handles
everything from simple paragraphs to complex nested structures.

## Code Example

```python
def fibonacci(n):
    """Generate Fibonacci sequence up to n terms."""
    a, b = 0, 1
    for _ in range(n):
        yield a
        a, b = b, a + b

for num in fibonacci(10):
    print(num)
```

## Data Table

| Feature | Status | Priority |
|---------|--------|----------|
| Tables | Done | High |
| Images | Done | High |
| Video links | Done | Medium |
| Footnotes | Done | Low |
| Code blocks | Done | High |

## Media

### Image

![Sample Image](https://via.placeholder.com/600x300/2563eb/ffffff?text=Sample+Image)

### Video References

[Project Demo Video](https://example.com/demo.mp4)

[Tutorial Walkthrough](https://cdn.example.com/tutorial.webm)

> **Note**: Videos appear as clickable cards in the PDF since PDFs cannot play video.

## Detailed Features

### Lists

**Unordered list:**
- First item with some detail
- Second item
  - Nested item A
  - Nested item B
    - Deep nested item
- Third item

**Ordered list:**
1. Step one: Initialize the project
2. Step two: Configure settings
3. Step three: Deploy
   - Sub-task A
   - Sub-task B

### Blockquote

> "The best way to predict the future is to invent it."
> — Alan Kay

### Nested Blockquote

> This is a top-level quote.
>
> > And this is a nested quote inside it.

---

## Footnotes

This document includes footnotes[^1] for additional context[^2].

[^1]: This is the first footnote with detailed explanation.
[^2]: Second footnote providing supplementary information about the topic.
