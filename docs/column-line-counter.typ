// ACTUAL TEXT LINE COUNTER
// Counts real rendered text lines (not paragraphs) per page

#let y-positions = state("y-positions", ())

// Insert tracking marker at text level
#let line-probe = {
  context {
    let pos = here().position()
    let pg = counter(page).get().first()
    y-positions.update(arr => {
      arr.push((page: pg, y: pos.y, x: pos.x))
      arr
    })
  }
}

// Track every word to get line positions
#let track-text-lines(body) = {
  // Insert probe after spaces (roughly per word)
  show regex("\\s"): it => {
    it
    line-probe
  }
  body
}

// Count actual lines from Y positions
#let show-actual-lines() = {
  context {
    let data = y-positions.final()

    if data.len() == 0 {
      [No tracking data. Enable with `#show: track-text-lines`]
      return
    }

    // Group by page
    let by-page = (:)
    for item in data {
      let pg = str(item.page)
      if pg not in by-page {
        by-page.insert(pg, ())
      }
      by-page.at(pg).push(item.y)
    }

    // Count unique Y values per page (each unique Y = one line)
    let y-threshold = 2pt  // Y values within 2pt are same line

    let count-lines(y-list) = {
      if y-list.len() == 0 { return 0 }
      let sorted = y-list.sorted()
      let unique-ys = (sorted.first(),)

      for y in sorted {
        let is-new = true
        for uy in unique-ys {
          if calc.abs(y - uy) < y-threshold {
            is-new = false
            break
          }
        }
        if is-new {
          unique-ys.push(y)
        }
      }
      unique-ys.len()
    }

    [= Actual Text Line Count Per Page]
    v(0.5em)

    table(
      columns: (auto, auto, auto),
      inset: 10pt,
      align: center,
      stroke: 0.5pt,

      [*Page*], [*Lines*], [*Probes*],

      ..{
        let rows = ()
        let total-lines = 0
        let total-probes = 0

        for (pg, ys) in by-page.pairs().sorted(key: p => int(p.first())) {
          let lines = count-lines(ys)
          total-lines += lines
          total-probes += ys.len()

          rows.push([#pg])
          rows.push([#lines])
          rows.push([#ys.len()])
        }

        rows.push(table.cell(fill: luma(230))[*Total*])
        rows.push(table.cell(fill: luma(230))[*#total-lines*])
        rows.push(table.cell(fill: luma(230))[*#total-probes*])

        rows
      }
    )

    v(0.5em)
    [_Probes = word markers, Lines = unique Y positions_]
  }
}

// ============================================================
// TWO-COLUMN VERSION
// ============================================================

#let col-y-positions = state("col-y-positions", ())

#let col-line-probe = {
  context {
    let pos = here().position()
    let pg = counter(page).get().first()
    let col = if pos.x < page.width / 2 { 1 } else { 2 }
    col-y-positions.update(arr => {
      arr.push((page: pg, col: col, y: pos.y))
      arr
    })
  }
}

#let track-column-text-lines(body) = {
  show regex("\\s"): it => {
    it
    col-line-probe
  }
  body
}

#let show-column-lines() = {
  context {
    let data = col-y-positions.final()

    if data.len() == 0 {
      [No data. Use `#show: track-column-text-lines`]
      return
    }

    // Group by page and column
    let by-page-col = (:)
    for item in data {
      let pg = str(item.page)
      if pg not in by-page-col {
        by-page-col.insert(pg, (col1: (), col2: ()))
      }
      if item.col == 1 {
        by-page-col.at(pg).col1.push(item.y)
      } else {
        by-page-col.at(pg).col2.push(item.y)
      }
    }

    let y-threshold = 2pt

    let count-lines(y-list) = {
      if y-list.len() == 0 { return 0 }
      let sorted = y-list.sorted()
      let unique-ys = (sorted.first(),)
      for y in sorted {
        let is-new = true
        for uy in unique-ys {
          if calc.abs(y - uy) < y-threshold {
            is-new = false
            break
          }
        }
        if is-new { unique-ys.push(y) }
      }
      unique-ys.len()
    }

    [= Lines Per Column Per Page]
    v(0.5em)

    table(
      columns: (auto, auto, auto, auto),
      inset: 10pt,
      align: center,
      stroke: 0.5pt,

      [*Page*], [*Col 1*], [*Col 2*], [*Total*],

      ..{
        let rows = ()
        let t1 = 0
        let t2 = 0

        for (pg, cols) in by-page-col.pairs().sorted(key: p => int(p.first())) {
          let c1 = count-lines(cols.col1)
          let c2 = count-lines(cols.col2)
          t1 += c1
          t2 += c2

          rows.push([#pg])
          rows.push([#c1])
          rows.push([#c2])
          rows.push([#(c1 + c2)])
        }

        rows.push(table.cell(fill: luma(230))[*Total*])
        rows.push(table.cell(fill: luma(230))[*#t1*])
        rows.push(table.cell(fill: luma(230))[*#t2*])
        rows.push(table.cell(fill: luma(230))[*#(t1 + t2)*])

        rows
      }
    )
  }
}

// ============================================================
// DEMO - Single Column
// ============================================================

#set page(paper: "a4", margin: 2cm, numbering: "1")
#set text(size: 10pt)
#set par(leading: 0.65em, justify: true)

= Text Line Counter Demo

This counts *actual text lines* rendered in the PDF by tracking word positions and counting unique Y-coordinates.

#show: track-text-lines

#lorem(100)

#lorem(80)

#lorem(120)

#pagebreak()

#lorem(150)

#lorem(100)

// Disable tracking before showing results
#show regex("\\s"): it => it

#v(2em)
#show-actual-lines()

#pagebreak()

// ============================================================
// DEMO - Two Columns
// ============================================================

= Two-Column Line Count

#show: track-column-text-lines

#columns(2, gutter: 12pt)[
  == Introduction
  #lorem(80)

  == Methods
  #lorem(100)

  == Results
  #lorem(120)

  == Discussion
  #lorem(90)
]

// Disable tracking
#show regex("\\s"): it => it

#v(2em)
#show-column-lines()

#pagebreak()

= How It Works

```typst
// 1. Enable tracking (inserts probe after each space/word)
#show: track-text-lines

// 2. Your content - lines are tracked automatically
#lorem(100)
// ... more content ...

// 3. Disable tracking before showing results
#show regex("\\s"): it => it

// 4. Show the line counts
#show-actual-lines()
```

*Method:*
- Inserts invisible marker after each whitespace (word boundary)
- Records actual Y-position in rendered PDF
- Counts *unique* Y-positions per page
- Each unique Y = one actual text line
