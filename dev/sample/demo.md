# docu.md in a dsh right sidebar

This file is the harness fixture: it exercises the surfaces the plugin has to
get right — headings, tables, code, diagrams, math and a workspace-relative
image — without needing a dsh session.

| surface | expected |
| --- | --- |
| Markdown | rendered by the docu.md engine |
| code | highlighted, fenced with its language |
| Mermaid | drawn in the render iframe |
| KaTeX | typeset inline |
| relative image | fetched through `/docu-preview/api/asset` |

## Code

```ts
export function classify(path: string): 'viewer' | 'native' | 'unsupported' {
  if (/\.md$/.test(path)) return 'viewer'
  if (/\.pdf$/.test(path)) return 'native'
  return 'unsupported'
}
```

## Diagram

```mermaid
flowchart LR
  tab[sidebar tab] --> session[POST /api/session]
  session --> token[per-tab token]
  token --> viewer[docu.md viewer iframe]
  viewer -->|scroll / theme| host[host bridge]
```

## Math

Inline: $E = mc^2$, and a block:

$$
\sum_{k=1}^{n} k = \frac{n(n+1)}{2}
$$

## Relative image

![pixel](./pixel.svg)

## Navigation

An in-document anchor to [the code section](#code), and an outbound
[link](https://docu.md/).
