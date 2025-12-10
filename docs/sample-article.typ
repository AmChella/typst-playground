// #set text(font: "CharisSIL-Regular")
// #set text(font: "Suissnord Deux D")
// ============================================================
// ELSEVIER JOURNAL ARTICLE TEMPLATE
// ============================================================
// Usage: Copy this file and modify the configuration below
// ============================================================

#let elsevier-article(
  // Journal Information
  journal: "Journal Name",
  journal-url: "https://www.elsevier.com/locate/journal",
  doi: "10.1016/j.xxx.2025.xxxxxx",
  pii: "S0000-0000(00)00000-0",

  // Article Dates
  received: "DD Month YYYY",
  revised: "DD Month YYYY",
  accepted: "DD Month YYYY",

  // Article Content
  title: "Article Title",
  authors: (),
  affiliations: (:),
  labelAinfo: "Abstract Info",
  abstractLabel: "Abstract",
  abstract: [],
  highlights: (),
  keywords: "",

  // Document body
  body,
) = {
  // Document metadata
  set document(
    title: title,
    author: authors.map(a => a.name),
  )
  // Page setup
  set page(
    paper: "a4",
    margin: (
      top: 2cm,
      bottom: 2.5cm,
      left: 1.5cm,
      right: 1.5cm
    ),
    header: context {
      if counter(page).get().first() > 1 [
        #set text(size: 9pt)
        #authors.first().name.split(" ").last() et al. #h(1fr) #journal
      ]
    },
     // Footer visible ONLY on page 1
    footer: context {
      let pg = counter(page).get().at(0)
      if pg == 1 [
        #set text(size: 9pt)
        #line(length: 10%, stroke: 1pt)
        #align(left)[
        #text(size: 8pt)[
          #let corr-authors = authors.filter(a => a.at("corr", default: false))
          #for (i, author) in corr-authors.enumerate() [
            #if i == 0 [#super[⁎]] else [#super[⁎⁎]] Corresponding author. #author.at("affil-full", default: "") \
          ]
          _E-mail addresses:_ #authors.filter(a => a.at("email", default: none) != none).map(a => [#link("mailto:" + a.email)[#a.email.replace("@", "\\@")] (#a.name.split(" ").last())]).join(", ")
          ]
        ]
      ]
    },
    numbering: "1"
  )

  // Text setup
  set text(font: "CharisSIL-Regular", size: 10pt)
  set par(justify: true, leading: 0.65em)
  set heading(numbering: "1.")

  // Heading styles
  show heading.where(level: 1): it => {
    set text(size: 12pt, weight: "bold")
    block(above: 1.5em, below: 0.8em)[#it]
  }

  show heading.where(level: 2): it => {
    set text(size: 11pt, weight: "bold")
    block(above: 1em, below: 0.3em)[#it]
  }

  line(length: 85%, stroke: 0.1pt)
  grid(
    columns: (20%, 66%, 20%),
    gutter: 0em,
    row-gutter: 0pt,
    // Left column
    [
      #image("0.png", width: 60%)
    ],
    // Middle column with background color
    box(
      fill: luma(245),
      inset: (left: 50pt, top: 5pt, bottom: 5pt, right: 50pt),          // Add padding so text doesn't touch edges
      radius: 0pt    // Optional: rounded corners
    )[
      #align(center)[
        #text("Contents lists available at ")
        #text(fill: blue)[ScienceDirect]
        #v(0.3cm)
        #text(size: 14pt, weight: "bold")[#journal]
        #v(0.3em)
        #link(journal-url)[#journal-url.split("//").at(1)]
      ]
    ],
    // Right column
    [
      #image("1.png", width: 60%)
    ]
  )

  // Journal header


  line(length: 100%, stroke: 2pt)
  v(1em)

  // Title
  align(left)[
    #text(size: 16pt, weight: "bold")[#title]
  ]

  v(1em)

  // Authors
  align(left)[
    #for (i, author) in authors.enumerate() {
      if i > 0 [, ]
        text(size: 12pt)[#author.name]
      if author.at("affils", default: ()).len() > 0 {
        text(fill:blue, size: 12pt)[#super(author.affils.join(","))]
      }
      if author.at("corr", default: false) {
        text(fill:blue, size: 12pt)[#super[⁎]]
      }
    }
  ]

  v(0.8em)

  // Affiliations
  set text(size: 9pt)
  for (key, value) in affiliations [
    #super[#key] #value \
  ]

  v(0.5em)

  set text(size: 10pt)
  v(0.5em)
  line(length: 100%, stroke: 0.5pt)

  // Article info box
  block(
    radius: 0pt,
    width: 100%,
  )[
    #grid(
      columns: (1fr, 2fr),
      gutter: 3em,
      [
        #text(size: 9pt, tracking: 0.3em)[
          #upper[#labelAinfo]
        ] \
        #line(length: 100%, stroke: 0.3pt)
        #text(size: 9pt)[_Keywords:_] \
        #for keyword in keywords [
          #text(size: 8pt)[#keyword] \
        ]
      ],
      [
        #text(size: 9pt, tracking: 0.3em)[
          #upper[#abstractLabel]
        ] \
        #line(length: 100%, stroke: 0.5pt)
        #text(size: 9pt)[#abstract]
      ]
    )
  ]

  // v(1em)
  line(length: 100%, stroke: 0.5pt)
  v(1em)

  // Body content
  body
}

// ============================================================
// EXAMPLE USAGE - Modify below for your article
// ============================================================

#show: elsevier-article.with(
  // Journal Information
  journal: "Ecological Genetics and Genomics",
  journal-url: "https://www.elsevier.com/locate/egg",
  doi: "10.1016/j.egg.2025.100411",
  pii: "S2405-9854(25)00090-4",

  // Dates
  received: "31 July 2025",
  revised: "16 September 2025",
  accepted: "30 September 2025",

  // Title
  title: "Your Article Title: Current Status, Challenges, and Applications",

  // Authors - add/modify as needed
  authors: (
    (
      name: "First Author",
      affils: (" a", "b"),
      corr: true,
      email: "first.author@university.edu",
      affil-full: "Department of Science, University Name, City, Country.",
    ),
    (
      name: "Second Author",
      affils: (" c",),
    ),
    (
      name: "Third Author",
      affils: (" d",),
    ),
    (
      name: "Fourth Author",
      affils: (" e",),
      corr: true,
      email: "fourth.author@university.edu",
      affil-full: "Department of Research, Another University, City, Country.",
      orcid: "0000-0000-0000-0000",
    ),
  ),

  // Affiliations
  affiliations: (
    a: "Department of Science, First University, City, State, 000000, Country",
    b: "School of Research, Second University, City, State, 000000, Country",
    c: "Department of Studies, Third University, City, State, 000000, Country",
    d: "National Institute, City, State, 000000, Country",
    e: "Department of Research, Another University, City, 000000, Country",
  ),

  // Abstract
  abstract: [
    #lorem(100)
  ],
  // Highlights (key points)
  highlights: (
    "First key finding or contribution of the research.",
    "Second important methodological advancement or discovery.",
    "Third significant result with practical implications.",
    "Fourth notable conclusion or future direction.",
  ),

  // Keywords
  keywords: ("Keyword1", "Keyword2", "Keyword3","Keyword4", "Keyword5"),
)

// ============================================================
// MAIN CONTENT - Two column layout
// ============================================================
#columns(2, gutter: 12pt)[

= Introduction

#lorem(300)

= Literature Review
#lorem(100)
== Previous Work
#lorem(100)

== Research Gap

#lorem(200)

= Materials and Methods
#lorem(1000)
== Study Design
#lorem(200)

== Data Collection
#lorem(200)

== Analysis
#lorem(200)

#figure(
  placement: bottom,
  scope: "parent",
  // rect(width: 100%, height: 150pt, fill: luma(230))[
  //   #align(center + horizon)[Figure 1 placeholder: Add your figure here using #raw("#image(\"path/to/image.png\")")]
  // ],
  image("2.jpg", width: 90%),
  caption: [Description of your figure. Explain what the figure shows and its relevance to your findings.],
) <fig1>

= Results
#lorem(200)
== Primary Findings
#lorem(200)
Present your main results here. Reference figures and tables as needed (see #text(fill: blue)[@fig1]).

== Secondary Findings
#lorem(200)
Present additional results and observations.

= Discussion
#lorem(200)
Discuss the implications of your findings in the context of existing literature.

== Interpretation
#lorem(200)
Explain what your results mean and how they advance the field.

== Limitations
#lorem(400)
Acknowledge the limitations of your study.

== Future Directions
#lorem(200)
Suggest directions for future research.

= Conclusions
#lorem(200)
Summarize your key findings and their significance. Restate the main contributions of your work.

= CRediT Authorship Contribution Statement

*First Author:* Writing – review & editing, Writing – original draft, Funding acquisition, Conceptualization. *Second Author:* Writing – review & editing, Writing – original draft. *Third Author:* Methodology, Investigation. *Fourth Author:* Writing – review & editing, Supervision, Funding acquisition, Conceptualization.

= Funding
#lorem(200)
This work was supported by [Funding Agency], [Country], under grant [Grant Number].

= Declaration of Competing Interest
#lorem(200)
The authors declare that they have no known competing financial interests or personal relationships that could have appeared to influence the work reported in this paper.

= Acknowledgments
#lorem(500)
The authors thank [acknowledgments for institutions, colleagues, technical support, etc.].

// ============================================================
// TABLES - Full width section
// ============================================================
// #set page(columns: 1)
#show figure.where(
  kind: table
): set figure.caption(position: top)
#show figure: set block(breakable: true)
#figure(
  table(
    columns: (auto, 1fr, 1fr, 1fr, 1fr),
    inset: 6pt,
    align: left,
    stroke: none,
    table.hline(),
    table.header(
      [*S. No*], [*Description*], [*Parameter 1*], [*Parameter 2*], [*Notes*]
    ),
    table.hline(),
    [1.], [Sample item one], [Value], [Unit], [Additional info],
    [2.], [Sample item two], [Value], [Unit], [Additional info],
    [3.], [Sample item three], [Value], [Unit], [Additional info],
    [4.], [Sample item four], [Value], [Unit], [Additional info],
    [5.], [Sample item five], [Value], [Unit], [Additional info],
    [6.], [Sample item six], [Value], [Unit], [Additional info],
    table.hline(),
  ),
  caption: [Your table caption describing the data presented.],
) <tbl1>

// Switch back to two columns
// #set page(columns: 2)

// Table 3: Long table with automatic continuation across columns
#let table3-header-count = state("table3-header", 0)
#let table3-footer-count = state("table3-footer", 0)

// Label to mark end of table for footer detection
#let table3-end = <table3-end>

#show figure: set block(breakable: true)
#figure(
  {
    table(
      columns: (auto, 1fr, 1fr, 1fr),
      inset: 5pt,
      align: left,
      stroke: none,
      // row-gutter: (2.2pt, auto),

      // Header with automatic "(continued)" on breaks
      table.header(
        table.cell(colspan: 4)[
          #context {
            let count = table3-header-count.get()
            table3-header-count.update(c => c + 1)
            if count > 0 {
              align(left, text(style: "italic", size: 8pt)[(continued)])
            }
          }
        ],
        table.hline(),
        [*ID*], [*Gene Name*], [*Chromosome*], [*Function*],
      ),
      table.hline(),

      // All data in one table - will break automatically across columns/pages
      [1], [BRCA1], [17q21], [DNA repair],
      [2], [BRCA2], [13q13], [DNA repair],
      [3], [TP53], [17p13], [Tumor suppressor],
      [4], [EGFR], [7p12], [Growth factor receptor],
      [5], [KRAS], [12p12], [Signal transduction],
      [6], [MYC], [8q24], [Transcription factor],
      [7], [PTEN], [10q23], [Tumor suppressor],
      [8], [APC], [5q22], [Tumor suppressor],
      [9], [RB1], [13q14], [Tumor suppressor],
      [10], [VHL], [3p25], [Tumor suppressor],
      [11], [NF1], [17q11], [Tumor suppressor],
      [12], [NF2], [22q12], [Tumor suppressor],
      [13], [MLH1], [3p22], [DNA mismatch repair],
      [14], [MSH2], [2p21], [DNA mismatch repair],
      [15], [CDH1], [16q22], [Cell adhesion],
      [16], [STK11], [19p13], [Serine/threonine kinase],

      // Footer with "(to be continued)" - only shown at breaks, not at end
      table.footer(
        table.cell(colspan: 4)[
          #context {
            table3-footer-count.update(c => c + 1)
            let footer-num = table3-footer-count.get()
            let total-headers = table3-header-count.final() - 1
            // Show "to be continued" only if more headers will follow (i.e., table continues)
            if footer-num < total-headers {
              align(right, text(style: "italic", size: 8pt)[(to be continued)])
            }
          }
        ],
      ),
    )
    [#metadata("table3-end") #table3-end]
  },
  caption: [Gene mutations associated with hereditary cancer syndromes.],
) <tbl3>

#v(1em)

// #pagebreak()

// ============================================================
// REFERENCES
// ============================================================
#heading(numbering: none)[References]
#set text(size: 9pt)

#let refs = (
  bib1: "Author A, Author B (2024) Title of the first reference article. Journal Name 10:100-110.",
  bib2: "Author C, Author D, Author E (2023) Title of the second reference. Another Journal 5:50-60.",
  bib3: "Author F et al. (2022) Title of the third reference with multiple authors. Third Journal 15:200-215.",
  bib4: "Author G (2021) Book Title: Subtitle. Publisher Name, City.",
  bib5: "Author H, Author I (2020) Conference paper title. In: Proceedings of Conference Name, City, pp. 100-110.",
)
#for (i, (key, value)) in refs.pairs().enumerate() [
  [#{i + 1}] #value \
]

// Add more references as needed following the same pattern
]

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
// #set page(columns: 1)

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
