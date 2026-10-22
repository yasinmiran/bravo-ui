import type { ReactNode } from 'react'

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'code'; text: string }

/** Enough markdown for a handover document: headings, paragraphs, lists, fenced code. */
function parse(source: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  let list: Extract<Block, { kind: 'list' }> | null = null
  let fence: string[] | null = null

  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') })
    paragraph = []
    if (list) blocks.push(list)
    list = null
  }

  for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
    if (fence) {
      if (line.trimStart().startsWith('```')) {
        blocks.push({ kind: 'code', text: fence.join('\n') })
        fence = null
      } else fence.push(line)
      continue
    }
    if (line.trimStart().startsWith('```')) {
      flush()
      fence = []
      continue
    }
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (heading) {
      flush()
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] })
      continue
    }
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line)
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    const item = bullet ?? numbered
    if (item) {
      if (paragraph.length) {
        blocks.push({ kind: 'paragraph', text: paragraph.join(' ') })
        paragraph = []
      }
      const ordered = !bullet
      if (!list || list.ordered !== ordered) {
        if (list) blocks.push(list)
        list = { kind: 'list', ordered, items: [] }
      }
      list.items.push(item[1])
      continue
    }
    if (!line.trim()) {
      flush()
      continue
    }
    if (list) list.items[list.items.length - 1] += ` ${line.trim()}`
    else paragraph.push(line.trim())
  }
  if (fence) blocks.push({ kind: 'code', text: fence.join('\n') })
  flush()
  return blocks
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
      return (
        <code key={i} className="rounded-sm bg-muted px-1 font-mono text-[0.875em]">
          {part.slice(1, -1)}
        </code>
      )
    return part
  })
}

export function Markdown({ source }: { source: string }) {
  return (
    <div className="max-w-[68ch] text-base leading-6 text-foreground">
      {parse(source).map((block, i) => {
        switch (block.kind) {
          case 'heading':
            return block.level === 1 ? (
              <h1 key={i} className="mb-3 text-lg font-extrabold first:mt-0">
                {inline(block.text)}
              </h1>
            ) : (
              <h2 key={i} className="mt-7 mb-2 text-md font-bold first:mt-0">
                {inline(block.text)}
              </h2>
            )
          case 'paragraph':
            return (
              <p key={i} className="mt-3 first:mt-0">
                {inline(block.text)}
              </p>
            )
          case 'list': {
            const List = block.ordered ? 'ol' : 'ul'
            return (
              <List key={i} className={`mt-3 grid gap-1.5 pl-5 ${block.ordered ? 'list-decimal' : 'list-disc'} marker:text-muted-foreground`}>
                {block.items.map((item, j) => (
                  <li key={j}>{inline(item)}</li>
                ))}
              </List>
            )
          }
          case 'code':
            return (
              <pre key={i} className="mt-3 overflow-x-auto rounded-sm bg-muted p-3 font-mono text-xs leading-5">
                {block.text}
              </pre>
            )
        }
      })}
    </div>
  )
}
