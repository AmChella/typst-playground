// ============================================================
// LONG TABLE - Spanning across columns with continuation markers
// ============================================================

// Long table data
#let long-table-data = (
  ([1], [Alpha amino acid], [Alanine], [Ala], [A], [Non-polar]),
  ([2], [Alpha amino acid], [Arginine], [Arg], [R], [Polar, basic]),
  ([3], [Alpha amino acid], [Asparagine], [Asn], [N], [Polar, neutral]),
  ([4], [Alpha amino acid], [Aspartic acid], [Asp], [D], [Polar, acidic]),
  ([5], [Alpha amino acid], [Cysteine], [Cys], [C], [Polar, neutral]),
  ([6], [Alpha amino acid], [Glutamic acid], [Glu], [E], [Polar, acidic]),
  ([7], [Alpha amino acid], [Glutamine], [Gln], [Q], [Polar, neutral]),
  ([8], [Alpha amino acid], [Glycine], [Gly], [G], [Non-polar]),
  ([9], [Alpha amino acid], [Histidine], [His], [H], [Polar, basic]),
  ([10], [Alpha amino acid], [Isoleucine], [Ile], [I], [Non-polar]),
  ([11], [Alpha amino acid], [Leucine], [Leu], [L], [Non-polar]),
  ([12], [Alpha amino acid], [Lysine], [Lys], [K], [Polar, basic]),
  ([13], [Alpha amino acid], [Methionine], [Met], [M], [Non-polar]),
  ([14], [Alpha amino acid], [Phenylalanine], [Phe], [F], [Non-polar]),
  ([15], [Alpha amino acid], [Proline], [Pro], [P], [Non-polar]),
  ([16], [Alpha amino acid], [Serine], [Ser], [S], [Polar, neutral]),
  ([17], [Alpha amino acid], [Threonine], [Thr], [T], [Polar, neutral]),
  ([18], [Alpha amino acid], [Tryptophan], [Trp], [W], [Non-polar]),
  ([19], [Alpha amino acid], [Tyrosine], [Tyr], [Y], [Polar, neutral]),
  ([20], [Alpha amino acid], [Valine], [Val], [V], [Non-polar]),
  ([21], [Modified amino acid], [Selenocysteine], [Sec], [U], [Special]),
  ([22], [Modified amino acid], [Pyrrolysine], [Pyl], [O], [Special]),
  ([23], [Alpha amino acid], [Threonine], [Thr], [T], [Polar, neutral]),
  ([24], [Alpha amino acid], [Tryptophan], [Trp], [W], [Non-polar]),
  ([25], [Alpha amino acid], [Tyrosine], [Tyr], [Y], [Polar, neutral]),
  ([26], [Alpha amino acid], [Valine], [Val], [V], [Non-polar]),
  ([27], [Modified amino acid], [Selenocysteine], [Sec], [U], [Special]),
  ([28], [Modified amino acid], [Pyrrolysine], [Pyl], [O], [Special]),
  ([29], [Alpha amino acid], [Threonine], [Thr], [T], [Polar, neutral]),
  ([30], [Alpha amino acid], [Tryptophan], [Trp], [W], [Non-polar]),
  ([31], [Alpha amino acid], [Tyrosine], [Tyr], [Y], [Polar, neutral]),
  ([32], [Alpha amino acid], [Valine], [Val], [V], [Non-polar]),
  ([33], [Modified amino acid], [Selenocysteine], [Sec], [U], [Special]),
  ([34], [Modified amino acid], [Pyrrolysine], [Pyl], [O], [Special]),
  ([35], [Alpha amino acid], [Threonine], [Thr], [T], [Polar, neutral]),
  ([36], [Alpha amino acid], [Tryptophan], [Trp], [W], [Non-polar]),
  ([37], [Alpha amino acid], [Tyrosine], [Tyr], [Y], [Polar, neutral]),
  ([38], [Alpha amino acid], [Valine], [Val], [V], [Non-polar]),
  ([39], [Modified amino acid], [Selenocysteine], [Sec], [U], [Special]),
  ([40], [Modified amino acid], [Pyrrolysine], [Pyl], [O], [Special]),
)

// Table 2: Full-width breakable table
// Switch to single column for full-width table
#set page(columns: 1)

#let table2-header-count = state("table2-header", 0)
#let table2-footer-count = state("table2-footer", 0)
#show figure: set block(breakable: true)
#figure(
  // scope: "parent",
  // placement: top,
  table(
    columns: (auto, 1fr, 1fr, auto, auto, 1fr),
    inset: 8pt,
    align: left,
    stroke: none,

    // Header with automatic "(continued)" on breaks
    table.header(
      table.cell(colspan: 6)[
        #context {
          let count = table2-header-count.get()
          table2-header-count.update(c => c + 1)
          if count > 0 {
            align(right, text(style: "italic", size: 8pt)[(continued)])
          }
        }
      ],
      table.hline(),
      [*No.*], [*Category*], [*Name*], [*3-Letter*], [*1-Letter*], [*Properties*],
      table.hline(),
    ),

    // Table data
    ..long-table-data.flatten(),

    // Footer with "(to be continued)"
    table.footer(
      table.cell(colspan: 6)[
        #context {
          table2-footer-count.update(c => c + 1)
          let footer-num = table2-footer-count.get()
          let total-headers = table2-header-count.final()
          if footer-num < total-headers {
            align(right, text(style: "italic", size: 8pt)[(to be continued)])
          }
        }
      ],
    ),

    // Final row
    table.hline(),
  ),
  caption: [Complete list of amino acids with their abbreviations and properties.],
) <tbl2>
// #set page(column: 2)