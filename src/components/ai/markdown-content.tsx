"use client"

import { cn } from "@/lib/utils"

interface MarkdownContentProps {
  content: string
  className?: string
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  const blocks = parseBlocks(content)

  return (
    <div className={cn("space-y-2", className)}>
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  )
}

// --- Types ---

type BlockType =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }

// --- Parsing ---

function parseBlocks(text: string): BlockType[] {
  const lines = text.split("\n")
  const blocks: BlockType[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Empty line
    if (line.trim() === "") {
      i++
      continue
    }

    // Heading
    const headingMatch = line.match(/^(#{1,4})\s+(.+)/)
    if (headingMatch) {
      blocks.push({ type: "heading", level: headingMatch[1].length, text: headingMatch[2] })
      i++
      continue
    }

    // Table (detect header row with | separators)
    if (line.includes("|") && i + 1 < lines.length && lines[i + 1]?.match(/^\|?[\s-:|]+\|/)) {
      const headerLine = line.trim().replace(/^\||\|$/g, "")
      const headers = headerLine.split("|").map((h) => h.trim())
      i += 2 // skip header + separator
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes("|")) {
        const rowLine = lines[i].trim().replace(/^\||\|$/g, "")
        rows.push(rowLine.split("|").map((c) => c.trim()))
        i++
      }
      blocks.push({ type: "table", headers, rows })
      continue
    }

    // List items (- or * or numbered)
    if (line.match(/^\s*[-*]\s/) || line.match(/^\s*\d+\.\s/)) {
      const items: string[] = []
      while (i < lines.length && (lines[i].match(/^\s*[-*]\s/) || lines[i].match(/^\s*\d+\.\s/))) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, "").replace(/^\s*\d+\.\s+/, ""))
        i++
      }
      blocks.push({ type: "list", items })
      continue
    }

    // Paragraph (collect consecutive non-special lines)
    let para = ""
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].match(/^#{1,4}\s/) &&
      !lines[i].match(/^\s*[-*]\s/) &&
      !lines[i].match(/^\s*\d+\.\s/) &&
      !(lines[i].includes("|") && i + 1 < lines.length && lines[i + 1]?.match(/^\|?[\s-:|]+\|/))
    ) {
      para += (para ? " " : "") + lines[i].trim()
      i++
    }
    if (para) {
      blocks.push({ type: "paragraph", text: para })
    }
  }

  return blocks
}

// --- Rendering ---

function Block({ block }: { block: BlockType }) {
  switch (block.type) {
    case "heading":
      return <Heading level={block.level} text={block.text} />
    case "paragraph":
      return <p className="text-sm leading-relaxed"><InlineText text={block.text} /></p>
    case "list":
      return (
        <ul className="space-y-1 text-sm">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-muted-foreground mt-1.5 shrink-0">&#8226;</span>
              <span className="leading-relaxed"><InlineText text={item} /></span>
            </li>
          ))}
        </ul>
      )
    case "table":
      return (
        <div className="overflow-x-auto rounded-md border text-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                {block.headers.map((h, i) => (
                  <th key={i} className="px-2.5 py-1.5 text-left font-medium text-xs">
                    <InlineText text={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-b last:border-0">
                  {row.map((cell, j) => (
                    <td key={j} className="px-2.5 py-1.5 text-xs">
                      <InlineText text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
  }
}

function Heading({ level, text }: { level: number; text: string }) {
  const styles: Record<number, string> = {
    1: "text-base font-bold",
    2: "text-sm font-bold",
    3: "text-sm font-semibold",
    4: "text-sm font-medium text-muted-foreground",
  }

  return (
    <p className={styles[level] || styles[3]}>
      <InlineText text={text} />
    </p>
  )
}

function InlineText({ text }: { text: string }) {
  // Parse inline markdown: **bold**, *italic*, `code`, $amounts
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\$[\d,.]+)/g)

  return (
    <>
      {parts.map((part, i) => {
        // Bold
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
        }
        // Italic
        if (part.startsWith("*") && part.endsWith("*") && !part.startsWith("**")) {
          return <em key={i}>{part.slice(1, -1)}</em>
        }
        // Code
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code key={i} className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
              {part.slice(1, -1)}
            </code>
          )
        }
        // Dollar amounts - highlight them
        if (part.match(/^\$[\d,.]+$/)) {
          return <span key={i} className="font-semibold tabular-nums">{part}</span>
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}
